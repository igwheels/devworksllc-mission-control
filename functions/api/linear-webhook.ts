import { isFreshDelivery, verifyLinearSignature } from '../lib/webhook';

interface Env {
  MC_CACHE: KVNamespace;
  LINEAR_WEBHOOK_SECRET?: string;
}

// Must match CACHE_KEY in functions/api/board.ts.
const CACHE_KEY = 'board';

// Resource types whose create/update should refresh the dashboard. Anything
// else Linear sends (comments, reactions, ...) is acknowledged and ignored.
const REFRESH_TYPES = new Set(['Issue', 'Project']);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * POST /api/linear-webhook — Linear posts here on issue/project changes.
 * Verifies the signature and timestamp, then drops the cached board so the
 * next dashboard poll fetches fresh data from Linear. Exempt from the session
 * gate in `_middleware.ts`; authentication is the signature itself.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.LINEAR_WEBHOOK_SECRET) {
    return json({ error: 'LINEAR_WEBHOOK_SECRET is not configured.' }, 503);
  }

  const rawBody = await request.text();
  const signature = request.headers.get('linear-signature');
  if (!(await verifyLinearSignature(rawBody, signature, env.LINEAR_WEBHOOK_SECRET))) {
    return json({ error: 'Invalid signature.' }, 401);
  }

  let payload: { type?: unknown; webhookTimestamp?: unknown };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }
  if (!isFreshDelivery(payload.webhookTimestamp, Date.now())) {
    return json({ error: 'Stale or missing webhookTimestamp.' }, 401);
  }

  if (typeof payload.type === 'string' && REFRESH_TYPES.has(payload.type)) {
    await env.MC_CACHE.delete(CACHE_KEY);
    return json({ ok: true, refreshed: true });
  }
  return json({ ok: true, refreshed: false });
};
