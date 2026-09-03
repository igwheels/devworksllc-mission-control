// HTTP Basic Auth on every route (static assets and /api alike).
// Credentials come from Cloudflare secrets; there is no in-repo fallback.

interface Env {
  MC_BASIC_USER?: string;
  MC_BASIC_PASS?: string;
}

const UNAUTHORIZED = () =>
  new Response('Authentication required.', {
    status: 401,
    headers: {
      'www-authenticate': 'Basic realm="Mission Control", charset="UTF-8"',
      'cache-control': 'no-store',
    },
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

function parseBasic(header: string | null): { user: string; pass: string } | null {
  if (!header || !/^basic\s/i.test(header)) return null;
  const b64 = header.replace(/^basic\s+/i, '').trim();
  let decoded: string;
  try {
    decoded = atob(b64);
  } catch {
    return null;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return null;
  return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const expectedUser = env.MC_BASIC_USER;
  const expectedPass = env.MC_BASIC_PASS;

  // Fail closed: if the gate isn't configured, let nothing through.
  if (!expectedUser || !expectedPass) {
    return new Response('Site auth is not configured.', {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const creds = parseBasic(request.headers.get('authorization'));
  if (!creds) return UNAUTHORIZED();

  const ok = safeEqual(creds.user, expectedUser) && safeEqual(creds.pass, expectedPass);
  if (!ok) return UNAUTHORIZED();

  return next();
};
