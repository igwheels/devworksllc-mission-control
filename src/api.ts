import type { RawBoard } from './board';

export interface FetchResult {
  board: RawBoard;
  /** Server served a cached board because the live Linear fetch failed. */
  stale: boolean;
  syncError?: string;
}

/**
 * GET /api/board — always resolves when the server responds (the API returns
 * 200 with `stale: true` on Linear errors so an unattended display keeps its
 * last-known board). Throws only on transport / non-200 failures.
 */
export async function fetchBoard(signal?: AbortSignal): Promise<FetchResult> {
  const res = await fetch('/api/board', { signal, headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`/api/board responded ${res.status}`);
  }
  const board = (await res.json()) as RawBoard;
  return { board, stale: board.stale === true, syncError: board.syncError };
}
