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
  code: string; // Linear identifier, e.g. 'DEV-25'
  url: string; // link to the issue in Linear ('' when unavailable)
}
export interface RawIssue {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  assignee: string;
  code: string; // Linear identifier, e.g. 'DEV-25'
  url: string; // link to the issue in Linear ('' when unavailable)
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

// Linear enforces a GraphQL complexity budget (~10k). A single query that nests
// projects -> issues (let alone -> children) multiplies past it, so we run two
// flat queries and stitch them in `mapResponse`:
//   1. projects  — scalar fields only, no nested issues
//   2. issues    — every project-attached issue flat, each carrying `project`
//                  and `parent` refs; the parent/child tree is rebuilt locally.
export const PROJECTS_QUERY = /* GraphQL */ `
  query MissionControlProjects {
    projects(first: 50) {
      nodes {
        id
        name
        progress
        health
        targetDate
        status { type name }
        lead { displayName name }
      }
    }
  }
`;

export const ISSUES_QUERY = /* GraphQL */ `
  query MissionControlIssues {
    issues(first: 250, filter: { project: { null: false } }) {
      nodes {
        id
        identifier
        url
        title
        priority
        completedAt
        state { type name }
        assignee { displayName name }
        parent { id }
        project { id }
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
interface GqlIssue {
  id: string;
  identifier: string;
  url: string | null;
  title: string;
  priority: number | null;
  completedAt: string | null;
  state: GqlState | null;
  assignee: GqlUser | null;
  parent: { id: string } | null;
  project: { id: string } | null;
}
interface GqlProject {
  id: string;
  name: string;
  progress: number | null;
  health: string | null;
  targetDate: string | null;
  status: GqlState | null;
  lead: GqlUser | null;
}
export interface GqlProjectsResponse {
  data?: { projects?: { nodes: GqlProject[] } };
  errors?: Array<{ message: string }>;
}
export interface GqlIssuesResponse {
  data?: { issues?: { nodes: GqlIssue[] } };
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

export function mapResponse(
  projectsRes: GqlProjectsResponse,
  issuesRes: GqlIssuesResponse,
  now: number = Date.now(),
): RawBoard {
  for (const res of [projectsRes, issuesRes]) {
    if (res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join('; '));
    }
  }
  const projectNodes = projectsRes.data?.projects?.nodes ?? [];
  const issueNodes = issuesRes.data?.issues?.nodes ?? [];

  // Bucket every issue by its project.
  const issuesByProject = new Map<string, GqlIssue[]>();
  for (const i of issueNodes) {
    const pid = i.project?.id;
    if (!pid) continue;
    const arr = issuesByProject.get(pid);
    if (arr) arr.push(i);
    else issuesByProject.set(pid, [i]);
  }

  const projects: RawProject[] = projectNodes
    .filter((p) => !HIDDEN_PROJECT_STATES.has(p.status?.type ?? ''))
    .map((p) => {
      const allIssues = issuesByProject.get(p.id) ?? [];

      // Rebuild the parent -> direct-children map from the flat list.
      const childrenByParent = new Map<string, GqlIssue[]>();
      for (const i of allIssues) {
        const pid = i.parent?.id;
        if (!pid) continue;
        const arr = childrenByParent.get(pid);
        if (arr) arr.push(i);
        else childrenByParent.set(pid, [i]);
      }

      // Kanban cards = top-level issues; their direct children become the
      // sub-task checkboxes. Deeper nesting is intentionally collapsed
      // (a grandchild attaches to its own parent, which is never rendered).
      const issues: RawIssue[] = allIssues
        .filter((i) => !i.parent)
        .map((i) => ({
          id: i.id,
          title: i.title,
          status: mapStatus(i.state?.type),
          priority: mapPriority(i.priority),
          assignee: initials(i.assignee),
          code: i.identifier,
          url: i.url ?? '',
          subtasks: (childrenByParent.get(i.id) ?? []).map((c) => ({
            title: c.title,
            done: c.completedAt != null || c.state?.type === 'completed',
            code: c.identifier,
            url: c.url ?? '',
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

async function gql<T>(token: string, query: string): Promise<T> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(token),
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Linear API ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as T;
}

export async function fetchLinearBoard(token: string, now: number = Date.now()): Promise<RawBoard> {
  const [projectsRes, issuesRes] = await Promise.all([
    gql<GqlProjectsResponse>(token, PROJECTS_QUERY),
    gql<GqlIssuesResponse>(token, ISSUES_QUERY),
  ]);
  return mapResponse(projectsRes, issuesRes, now);
}
