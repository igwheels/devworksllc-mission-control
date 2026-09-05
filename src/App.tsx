import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SANS } from './theme';
import { buildBoard, type RawBoard } from './board';
import { fetchBoard, describeLoadError, isAuthError, type LoadErrorInfo } from './api';
import { Header } from './components/Header';
import { ProjectCard } from './components/ProjectCard';
import { Drilldown } from './components/Drilldown';
import { BoardSkeleton } from './components/BoardSkeleton';
import { LoadError } from './components/LoadError';

// Kept under the server's SOFT_TTL_MS (functions/api/board.ts) so a lone
// client's repeat polls land inside the cache window instead of forcing a
// live Linear fetch + KV write every time (DEV-66).
const POLL_MS = 60_000;
// On a sync failure, back off instead of hammering a down Linear at full
// cadence: double the interval each consecutive failure up to this ceiling,
// then snap straight back to POLL_MS the moment a sync succeeds (DEV-67).
// The ceiling doesn't interact with the server's cache TTLs — a failed sync
// never populates the KV cache (functions/api/board.ts), so slowing down here
// only cuts wasted Worker invocations and Linear round trips during an
// outage, not anything the 110s soft / 120s hard TTL are protecting.
const MAX_BACKOFF_MS = 300_000;

function nextPollDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_MS;
  return Math.min(POLL_MS * 2 ** consecutiveFailures, MAX_BACKOFF_MS);
}

export default function App() {
  const [raw, setRaw] = useState<RawBoard | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const [lastSync, setLastSync] = useState(() => Date.now());
  const [stale, setStale] = useState(false);
  const [syncError, setSyncError] = useState<string | undefined>(undefined);
  const [loadError, setLoadError] = useState<LoadErrorInfo | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const hasBoardRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Self-rescheduling rather than setInterval so the delay before the next
  // poll can vary (see nextPollDelay) — a fixed interval can't back off.
  const poll = useCallback(async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { board, stale: isStale, syncError: err } = await fetchBoard(ac.signal);
      setRaw(board);
      hasBoardRef.current = true;
      setStale(isStale);
      setSyncError(err);
      setLoadError(null);
      setLastSync(isStale && board.fetchedAt ? board.fetchedAt : Date.now());
      consecutiveFailuresRef.current = isStale ? consecutiveFailuresRef.current + 1 : 0;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // unmounting — don't reschedule
      if (isAuthError(e)) {
        // A session that's expired or was never established won't fix
        // itself by retrying with backoff. Force a real navigation so the
        // middleware's redirect to /login.html actually shows on an
        // unattended screen, rather than the display quietly sitting on
        // stale data behind a small banner nobody's there to read (DEV-68).
        window.location.reload();
        return;
      }
      // Keep whatever board is already on screen; only surface a hard error
      // if we have never loaded anything.
      setStale(true);
      setSyncError((e as Error).message);
      if (!hasBoardRef.current) setLoadError(describeLoadError(e));
      consecutiveFailuresRef.current += 1;
    }
    timeoutRef.current = setTimeout(() => void poll(), nextPollDelay(consecutiveFailuresRef.current));
  }, []);

  useEffect(() => {
    void poll();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, [poll]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const board = useMemo(() => (raw ? buildBoard(raw) : null), [raw]);

  const clockStr = new Date(now).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const syncedSecs = Math.max(0, Math.floor((now - lastSync) / 1000));
  const syncedAgo = syncedSecs < 1 ? 'now' : `${syncedSecs}s ago`;

  const selectedProject =
    board && selectedProjectId
      ? (board.projects.find((p) => p.id === selectedProjectId) ?? null)
      : null;

  const selectProject = (id: string) => {
    setSelectedProjectId(id);
    setExpandedIssueId(null);
  };
  // Return to the overview grid — shared by the drill-down back link and the
  // "MISSION CONTROL" header home link. A no-op when already on the overview.
  const goHome = () => {
    setSelectedProjectId(null);
    setExpandedIssueId(null);
  };
  const toggleIssue = (id: string) => setExpandedIssueId((cur) => (cur === id ? null : id));

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0B0F14',
        color: '#E7E9EE',
        fontFamily: SANS,
        padding: '28px 36px 40px',
      }}
    >
      <Header
        stats={board?.headerStats ?? { projectCount: 0, open: 0, inProgress: 0, atRisk: 0 }}
        syncedAgo={syncedAgo}
        clockStr={clockStr}
        stale={stale}
        onHome={goHome}
      />

      {stale && board && (
        <div
          style={{
            marginTop: '16px',
            padding: '8px 14px',
            borderRadius: '8px',
            background: 'rgba(242,136,74,.12)',
            border: '1px solid rgba(242,136,74,.3)',
            color: '#F2884B',
            fontSize: '12px',
          }}
        >
          Last known data — sync failed {syncedAgo}
          {syncError ? ` (${syncError})` : ''}
        </div>
      )}

      {!board && !loadError && <BoardSkeleton />}

      {!board && loadError && <LoadError error={loadError} />}

      {board && !selectedProject && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
            gap: '16px',
            marginTop: '22px',
          }}
        >
          {board.projects.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={() => selectProject(p.id)} />
          ))}
        </div>
      )}

      {board && selectedProject && (
        <Drilldown
          project={selectedProject}
          onClose={goHome}
          expandedIssueId={expandedIssueId}
          onToggleIssue={toggleIssue}
        />
      )}
    </div>
  );
}
