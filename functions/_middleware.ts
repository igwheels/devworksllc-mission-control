// Session-cookie auth on every route (static assets and /api alike),
// replacing HTTP Basic Auth (DEV-68). Login credentials are still
// MC_BASIC_USER/MC_BASIC_PASS — same secrets, same values, so cutover is
// "sign in with what you already use" — but the check now happens against a
// real form POST to /api/login, never client-side, and a successful login
// gets a signed, HttpOnly session cookie instead of a browser-cached
// Authorization header.

interface Env {
  MC_BASIC_USER?: string;
  MC_BASIC_PASS?: string;
  MC_SESSION_SECRET?: string;
  MC_CACHE: KVNamespace;
}

const SESSION_COOKIE = 'mc_session';
// Absolute, non-sliding expiry: a wall display shouldn't need weekly
// re-auth, but an unbounded session is strictly weaker than what Basic Auth
// effectively gave you (a credential that lives only as long as the browser
// keeps it cached). 30 days bounds how long a leaked cookie stays valid
// while still being "sign in roughly monthly" in practice, not weekly.
const SESSION_TTL_S = 60 * 60 * 24 * 30;

// Rate limiting: 5 failed attempts per IP locks that IP out for 15 minutes,
// via the existing MC_CACHE KV binding (no new namespace). The TTL is
// refreshed on every failure rather than tracking a fixed window start, so a
// sustained attacker keeps extending their own lockout instead of getting a
// clean slate every 15 minutes — simpler to implement correctly with KV's
// put-replaces-TTL semantics than a fixed window, and arguably the more
// defensible choice anyway.
//
// Known limitation, not papered over: KV is a get-then-put, not an atomic
// increment, so concurrent requests from the same IP hitting different edge
// PoPs can undercount by a request or two. That's an accepted tradeoff for a
// login-abuse throttle (a precise counter would need Durable Objects) — it
// still bounds a brute force to a handful of guesses per ~15 minutes, which
// is what matters here, not perfect precision.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_S = 15 * 60;

// Both forms of the login path are exempt: Cloudflare Pages' own "clean
// URLs" redirect turns a request for /login.html into a 308 to /login before
// this middleware sees it again — exempting only one of the two forms is a
// real infinite-redirect loop (found by testing this end to end, not
// assumed): unauthenticated / -> /login.html -> (platform 308) -> /login ->
// (middleware, not exempt, no session) -> /login.html -> ... forever.
const PUBLIC_STATIC_PATHS = new Set(['/sw.js', '/manifest.webmanifest', '/login', '/login.html']);

const json = (body: unknown, status = 200, extraHeaders?: HeadersInit): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });

/** Constant-time-ish string compare that doesn't short-circuit on the first
 *  differing byte. Length is not itself a secret here (the expected values are
 *  operator-chosen), but we still avoid an early return. */
function safeEqual(actual: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(actual);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a[i] ?? 0) ^ b[i];
  }
  return diff === 0;
}

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signSession(secret: string, expSec: number): Promise<string> {
  const payload = toB64Url(new TextEncoder().encode(JSON.stringify({ exp: expSec })));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${toB64Url(new Uint8Array(sig))}`;
}

/** Verifies the HMAC (via crypto.subtle.verify, which compares in constant
 *  time internally) before trusting anything decoded from the payload. */
async function verifySession(secret: string, cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 0) return false;
  const payloadB64 = cookieValue.slice(0, dot);
  const sigB64 = cookieValue.slice(dot + 1);

  let sigBytes: Uint8Array;
  try {
    sigBytes = fromB64Url(sigB64);
  } catch {
    return false;
  }

  const key = await hmacKey(secret);
  const validSig = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payloadB64));
  if (!validSig) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(payloadB64))) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

async function handleLogin(request: Request, env: Env, secret: string): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `login_fail:${ip}`;
  const priorCount = Number((await env.MC_CACHE.get(rateKey)) ?? '0') || 0;
  if (priorCount >= LOGIN_MAX_ATTEMPTS) {
    return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
  }

  let body: { user?: unknown; pass?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const user = typeof body.user === 'string' ? body.user : '';
  const pass = typeof body.pass === 'string' ? body.pass : '';

  // Both comparisons always run, regardless of the first result — combining
  // with && after the fact (rather than in the expression itself) avoids a
  // short-circuit that would make a wrong username measurably faster than a
  // wrong password, which would leak which field was wrong via timing.
  const userOk = safeEqual(user, env.MC_BASIC_USER!);
  const passOk = safeEqual(pass, env.MC_BASIC_PASS!);

  if (!(userOk && passOk)) {
    await env.MC_CACHE.put(rateKey, String(priorCount + 1), { expirationTtl: LOGIN_WINDOW_S });
    return json({ error: 'Invalid credentials.' }, 401);
  }

  const expSec = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const cookieValue = await signSession(secret, expSec);
  const cookie = [
    `${SESSION_COOKIE}=${cookieValue}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_S}`,
    'Secure',
    'HttpOnly',
    'SameSite=Strict',
  ].join('; ');

  return json({ ok: true }, 200, { 'set-cookie': cookie });
}

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const path = new URL(request.url).pathname;

  // The browser's own internal fetches for the service-worker script and the
  // web app manifest don't carry the page's cached auth — tested directly
  // against this gate in DEV-69, not assumed. Neither file has anything
  // sensitive in it. The login page is likewise public by definition; it's
  // the only page reachable pre-auth.
  if (PUBLIC_STATIC_PATHS.has(path)) return next();

  // Fail closed: if any required secret isn't configured, let nothing
  // through. In particular, never fall back to an unsigned or default-keyed
  // session cookie if MC_SESSION_SECRET is missing.
  if (!env.MC_BASIC_USER || !env.MC_BASIC_PASS || !env.MC_SESSION_SECRET) {
    return new Response('Site auth is not configured.', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }

  if (path === '/api/login') return handleLogin(request, env, env.MC_SESSION_SECRET);

  const cookies = parseCookies(request.headers.get('cookie'));
  const authed = await verifySession(env.MC_SESSION_SECRET, cookies[SESSION_COOKIE]);
  if (authed) return next();

  // /api/* is fetched by the app's own JS (see src/api.ts), which expects
  // JSON back — never redirect it, or a background poll would silently
  // "succeed" by fetching the login page's HTML instead of board data.
  // Everything else (the document itself, and any static asset request that
  // isn't one of the exemptions above) sends the browser to the login page.
  if (path.startsWith('/api/')) {
    return json({ error: 'Session expired or not signed in.' }, 401);
  }
  return Response.redirect(new URL('/login', request.url).toString(), 302);
};
