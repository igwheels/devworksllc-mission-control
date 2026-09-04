import { fetchLinearBoard, type RawBoard } from '../lib/linear';

interface Env {
  MC_CACHE: KVNamespace;
  LINEAR_TOKEN?: string;
}

const CACHE_KEY = 'board';
// Serve the cached board without touching Linear for this long after a fetch.
// Must stay >= the client's poll interval (src/App.tsx POLL_MS) — otherwise a
// single client's own polls always land past this window and every poll turns
// into a live Linear fetch + KV write, defeating the cache entirely (DEV-66).
const SOFT_TTL_MS = 110_000;
// KV hard expiry (KV minimum is 60s). This is the real floor on write volume:
// once an entry physically expires, a miss is forced regardless of the soft
// TTL above, so a single always-on poller writes at least once per HARD_TTL_S.
// 120s keeps that floor (~720 writes/day) under the KV free plan's 1,000/day
// write cap; 60s alone floors at ~1,440/day, which blows through it (DEV-66).
const HARD_TTL_S = 120;

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
