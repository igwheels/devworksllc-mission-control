import type { RawBoard } from './board';

export interface FetchResult {
  board: RawBoard;
  /** Server served a cached board because the live Linear fetch failed. */
  stale: boolean;
  syncError?: string;
}

/** A non-200 response from /api/board, carrying the status so callers can
 * classify it (auth vs. server config vs. Linear itself) instead of just
 * showing the raw message. */
export class BoardFetchError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'BoardFetchError';
    this.status = status;
  }
}

/**
 * GET /api/board — always resolves when the server responds (the API returns
 * 200 with `stale: true` on Linear errors so an unattended display keeps its
 * last-known board). Throws only on transport / non-200 failures.
 */
export async function fetchBoard(signal?: AbortSignal): Promise<FetchResult> {
  const res = await fetch('/api/board', { signal, headers: { accept: 'application/json' } });
  if (!res.ok) {
    const detail = await res.json().then(
      (body: { error?: string }) => body.error,
      () => undefined,
    );
    throw new BoardFetchError(res.status, detail ?? `/api/board responded ${res.status}`);
  }
  const board = (await res.json()) as RawBoard;
  return { board, stale: board.stale === true, syncError: board.syncError };
}

export interface LoadErrorInfo {
  headline: string;
  detail?: string;
}

/**
 * Classify a first-load failure for whoever's standing in front of the wall
 * display — "Linear is down" and "this screen's credentials are broken" call
 * for different reactions than a raw error string does.
 */
/** True for a response that means "your session is gone," as opposed to
 * Linear or the server itself being unhappy. */
export function isAuthError(e: unknown): boolean {
  return e instanceof BoardFetchError && (e.status === 401 || e.status === 403);
}

export function describeLoadError(e: unknown): LoadErrorInfo {
  if (e instanceof BoardFetchError) {
    if (e.status === 401 || e.status === 403) {
      return {
        headline: 'Not signed in',
        detail: "This screen's session has expired or was never established — signing in again.",
      };
    }
    if (e.status === 500) {
      return { headline: 'Server not configured', detail: e.message };
    }
    if (e.status >= 502) {
      return { headline: 'Linear is unreachable', detail: e.message };
    }
    return { headline: 'Could not load the board', detail: e.message };
  }
  if (e instanceof Error) {
    return { headline: "Can't reach the server", detail: e.message };
  }
  return { headline: "Can't reach the server" };
}
