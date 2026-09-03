import { fetchLinearBoard, type RawBoard } from '../lib/linear';

interface Env {
  MC_CACHE: KVNamespace;
  LINEAR_TOKEN?: string;
}

const CACHE_KEY = 'board';
// Serve the cached board without touching Linear for this long after a fetch.
const SOFT_TTL_MS = 15_000;
// KV hard expiry (KV minimum is 60s).
const HARD_TTL_S = 60;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.LINEAR_TOKEN) {
    return json(
      { error: 'LINEAR_TOKEN is not configured. Set it with `wrangler pages secret put LINEAR_TOKEN`.' },
      500,
    );
  }

  const cached = (await env.MC_CACHE.get(CACHE_KEY, { type: 'json' })) as RawBoard | null;
  if (cached && Date.now() - cached.fetchedAt < SOFT_TTL_MS) {
    return json(cached);
  }

  try {
    const fresh = await fetchLinearBoard(env.LINEAR_TOKEN);
    await env.MC_CACHE.put(CACHE_KEY, JSON.stringify(fresh), { expirationTtl: HARD_TTL_S });
    return json(fresh);
  } catch (e) {
    const syncError = e instanceof Error ? e.message : String(e);
    if (cached) {
      // Keep the display alive on its last-known board.
      return json({ ...cached, stale: true, syncError });
    }
    return json({ error: `Linear sync failed and no cached board is available: ${syncError}` }, 503);
  }
};
