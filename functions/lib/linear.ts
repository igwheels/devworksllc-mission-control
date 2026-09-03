// Linear GraphQL query + response -> wire-shape mapper.
// Pure (no Cloudflare bindings) so it can be unit-tested from Node.
//
// Wire types below MUST stay in sync with `src/board.ts`.

export type Status = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled';
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type Health = 'on_track' | 'at_risk' | 'off_track' | 'done';

export interface RawSubtask {
  title: string;
  done: boolean;
}
export interface RawIssue {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  assignee: string;
  subtasks: RawSubtask[];
}
export interface RawProject {
  id: string;
  name: string;
  health: Health;
  healthSource: 'linear' | 'derived';
  lead: string;
  target: string;
  progressPct: number;
  issues: RawIssue[];
}
export interface RawBoard {
  fetchedAt: number;
  projects: RawProject[];
  stale?: boolean;
  syncError?: string;
}

// ---- GraphQL --------------------------------------------------------------

export const BOARD_QUERY = /* GraphQL */ `
  query MissionControl {
    projects(first: 50) {
      nodes {
        id
        name
        progress
        health
        targetDate
        status { type name }
        lead { displayName name }
        issues(first: 250) {
          nodes {
            id
            identifier
            title
            priority
            state { type name }
            assignee { displayName name }
            parent { id }
            children(first: 100) {
              nodes {
                id
                title
                completedAt
                state { type }
              }
            }
          }
        }
      }
    }
  }
`;

// ---- Raw response shapes (only the fields we ask for) --------------------

interface GqlState {
  type: string | null;
  name?: string | null;
}
interface GqlUser {
  displayName?: string | null;
  name?: string | null;
}
interface GqlChild {
  id: string;
  title: string;
  completedAt: string | null;
  state: GqlState | null;
}
interface GqlIssue {
  id: string;
  identifier: string;
  title: string;
  priority: number | null;
  state: GqlState | null;
  assignee: GqlUser | null;
  parent: { id: string } | null;
  children: { nodes: GqlChild[] } | null;
}
interface GqlProject {
  id: string;
  name: string;
  progress: number | null;
  health: string | null;
  targetDate: string | null;
  status: GqlState | null;
  lead: GqlUser | null;
  issues: { nodes: GqlIssue[] } | null;
}
export interface GqlResponse {
  data?: { projects?: { nodes: GqlProject[] } };
  errors?: Array<{ message: string }>;
}

// ---- Mapping helpers ----------------------------------------------------

export function mapStatus(stateType: string | null | undefined): Status {
  switch (stateType) {
    case 'unstarted':
      return 'todo';
    case 'started':
      return 'in_progress';
    case 'completed':
      return 'done';
    case 'canceled':
      return 'canceled';
    case 'backlog':
    case 'triage':
    default:
      return 'backlog';
  }
}

export function mapPriority(p: number | null | undefined): Priority {
  switch (p) {
    case 1:
      return 'urgent';
    case 2:
      return 'high';
    case 3:
      return 'medium';
    case 4:
      return 'low';
    default:
      return 'none';
  }
}

export function initials(user: GqlUser | null | undefined): string {
  const raw = (user?.displayName || user?.name || '').trim();
  if (!raw) return '';
  const base = raw.includes('@') ? raw.slice(0, raw.indexOf('@')) : raw;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : base.replace(/[^a-z0-9]/gi, '').slice(0, 2);
  return letters.toUpperCase();
}

export function formatTarget(targetDate: string | null | undefined): string {
  if (!targetDate) return '';
  const d = new Date(targetDate + (targetDate.length === 10 ? 'T00:00:00Z' : ''));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const LINEAR_HEALTH: Record<string, Health> = {
  onTrack: 'on_track',
  atRisk: 'at_risk',
  offTrack: 'off_track',
};

export function deriveHealth(
  linearHealth: string | null | undefined,
  targetDate: string | null | undefined,
  progressPct: number,
  issues: RawIssue[],
  now: number,
): { health: Health; source: 'linear' | 'derived' } {
  if (linearHealth && LINEAR_HEALTH[linearHealth]) {
    return { health: LINEAR_HEALTH[linearHealth], source: 'linear' };
  }
  if (progressPct >= 100) return { health: 'done', source: 'derived' };

  const hasOpen = issues.some((i) => i.status !== 'done' && i.status !== 'canceled');
  if (targetDate) {
    const t = new Date(targetDate + (targetDate.length === 10 ? 'T00:00:00Z' : '')).getTime();
    if (!Number.isNaN(t)) {
      const days = (t - now) / 86_400_000;
      if (days < 0 && hasOpen) return { health: 'off_track', source: 'derived' };
      if (days <= 7 && progressPct < 60) return { health: 'at_risk', source: 'derived' };
    }
  }
  return { health: 'on_track', source: 'derived' };
}

// ---- Top-level mapper --------------------------------------------------

const HIDDEN_PROJECT_STATES = new Set(['completed', 'canceled']);

export function mapResponse(res: GqlResponse, now: number = Date.now()): RawBoard {
  if (res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join('; '));
  }
  const nodes = res.data?.projects?.nodes ?? [];

  const projects: RawProject[] = nodes
    .filter((p) => !HIDDEN_PROJECT_STATES.has(p.status?.type ?? ''))
    .map((p) => {
      const allIssues = p.issues?.nodes ?? [];

      // Kanban cards = top-level issues; their direct children become the
      // sub-task checkboxes. Deeper nesting is intentionally collapsed.
      const issues: RawIssue[] = allIssues
        .filter((i) => !i.parent)
        .map((i) => ({
          id: i.id,
          title: i.title,
          status: mapStatus(i.state?.type),
          priority: mapPriority(i.priority),
          assignee: initials(i.assignee),
          subtasks: (i.children?.nodes ?? []).map((c) => ({
            title: c.title,
            done: c.completedAt != null || c.state?.type === 'completed',
          })),
        }));

      const counted = issues.filter((i) => i.status !== 'canceled');
      const done = counted.filter((i) => i.status === 'done').length;
      const progressPct =
        p.progress != null
          ? Math.round(p.progress * 100)
          : counted.length
            ? Math.round((done / counted.length) * 100)
            : 0;

      const { health, source } = deriveHealth(p.health, p.targetDate, progressPct, issues, now);

      return {
        id: p.id,
        name: p.name,
        health,
        healthSource: source,
        lead: initials(p.lead),
        target: formatTarget(p.targetDate),
        progressPct,
        issues,
      };
    });

  return { fetchedAt: now, projects };
}

// ---- Network ---------------------------------------------------------

/**
 * Linear wants OAuth access tokens as `Authorization: Bearer <token>` but
 * personal API keys (`lin_api_…`) as the bare value. Accept either; a value
 * that already carries a scheme ("Bearer …") is passed through untouched.
 */
export function authHeader(token: string): string {
  const t = token.trim();
  if (/^bearer\s/i.test(t)) return t;
  if (t.startsWith('lin_api_')) return t;
  return `Bearer ${t}`;
}

export async function fetchLinearBoard(token: string, now: number = Date.now()): Promise<RawBoard> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(token),
    },
    body: JSON.stringify({ query: BOARD_QUERY }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Linear API ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const json = (await res.json()) as GqlResponse;
  return mapResponse(json, now);
}
