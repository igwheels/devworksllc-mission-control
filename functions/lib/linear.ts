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
  // No `active`/status field here on purpose (DEV-79): whether a project is
  // active is derived client-side from `issues` (src/board.ts's
  // isProjectActive), not sourced from Linear's own project status field —
  // that field takes no part in the determination at all, in either
  // direction, by design. Canceled projects are still dropped outright
  // below; that's a separate, unrelated mechanism (follow-up to DEV-77).
}
export interface RawBoard {
  fetchedAt: number;
  projects: RawProject[];
  stale?: boolean;
  syncError?: string;
}

// ---- GraphQL --------------------------------------------------------------

// Linear enforces a GraphQL complexity budget (~10k). A single query that nests
// projects -> issues (let alone -> children) multiplies past it — two earlier
// fixes (see git history on this file) already hit that wall and backed out
// of it — so we run two flat queries and stitch them in `mapResponse`:
//   1. projects  — scalar fields only, no nested issues
//   2. issues    — every project-attached issue flat, each carrying `project`
//                  and `parent` refs; the parent/child tree is rebuilt locally.
// Both are flat top-level connections, so `pageInfo`/`after` below add
// negligible complexity (~1) per page — they don't reintroduce the nesting
// that caused the original "query too complex" errors. Page sizes (50 / 250)
// are unchanged from the last fix, which measured their per-page cost at
// ~450 / ~1500 — comfortably under the cap with room to spare; DEV-58 is
// about *paging past* a page, not about changing what fits in one.
export const PROJECTS_QUERY = /* GraphQL */ `
  query MissionControlProjects($after: String) {
    projects(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
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
  query MissionControlIssues($after: String) {
    issues(first: 250, after: $after, filter: { project: { null: false } }) {
      pageInfo { hasNextPage endCursor }
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

// Hard ceiling on how many pages either connection will follow in one poll.
// This bounds two things the KV-write-budget work made us pay attention to:
// wall-clock latency (each page is a sequential round-trip to Linear, since
// a cursor isn't known until the previous page returns) and outbound
// subrequest count (a Workers-plan limit, not just a cost concern). At 50
// projects / 250 issues per page, 20 pages is up to 1,000 projects or 5,000
// issues — far beyond anything this workspace is near, while still capping a
// pathological workspace at ~20 sequential Linear round-trips instead of an
// unbounded fan-out. If a workspace ever genuinely exceeds this, fetchAllNodes
// throws rather than quietly returning a truncated page-20 board — the same
// "fail visibly" call made for the KV cache.
export const MAX_PAGES = 20;

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
interface GqlPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
export interface GqlProjectsResponse {
  data?: { projects?: { nodes: GqlProject[]; pageInfo?: GqlPageInfo } };
  errors?: Array<{ message: string }>;
}
export interface GqlIssuesResponse {
  data?: { issues?: { nodes: GqlIssue[]; pageInfo?: GqlPageInfo } };
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

// Canceled projects are dropped entirely, same as every project was before
// DEV-77 — they must never appear regardless of "Include Inactive" toggle
// state, so there's no reason to ship them to the client at all. Completed
// projects, by contrast, stay in the payload: whether a project counts as
// active is now derived client-side from its issues (src/board.ts's
// isProjectActive, DEV-79), not from this field, so the client needs a
// completed project's issues to make that call — dropping it here would
// break that. (Filtering here rather than by "active" also means the
// server doesn't need to compute an active/inactive concept at all
// anymore — that job moved to the client entirely.)
const CANCELED_PROJECT_STATE = 'canceled';

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
    .filter((p) => p.status?.type !== CANCELED_PROJECT_STATE)
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

async function gql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(token),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Linear API ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as T;
}

/**
 * Follows a Relay-style cursor connection to completion, running requests
 * strictly in sequence (a page's cursor isn't known until the previous page
 * returns). Throws — rather than returning whatever was fetched so far — on
 * a GraphQL error partway through, or if the connection still reports more
 * pages after MAX_PAGES: a board silently missing the tail end of a
 * workspace is worse than one visible sync failure (DEV-58), matching the
 * same call made for the KV cache in functions/api/board.ts.
 */
async function fetchAllNodes<TNode, TResponse extends { errors?: Array<{ message: string }> }>(
  token: string,
  query: string,
  resourceName: string,
  getConnection: (res: TResponse) => { nodes: TNode[]; pageInfo?: GqlPageInfo } | undefined,
): Promise<TNode[]> {
  const nodes: TNode[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await gql<TResponse>(token, query, { after });
    if (res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join('; '));
    }
    const connection = getConnection(res);
    nodes.push(...(connection?.nodes ?? []));

    const pageInfo = connection?.pageInfo;
    if (!pageInfo?.hasNextPage) return nodes;
    if (!pageInfo.endCursor) {
      throw new Error(`Linear reported more ${resourceName} but returned no cursor to continue paging.`);
    }
    after = pageInfo.endCursor;
  }

  throw new Error(
    `Linear has more ${resourceName} than this dashboard will page through (capped at ${MAX_PAGES} pages) — refusing to render a silently truncated board.`,
  );
}

export async function fetchLinearBoard(token: string, now: number = Date.now()): Promise<RawBoard> {
  const [projectNodes, issueNodes] = await Promise.all([
    fetchAllNodes<GqlProject, GqlProjectsResponse>(
      token,
      PROJECTS_QUERY,
      'projects',
      (res) => res.data?.projects,
    ),
    fetchAllNodes<GqlIssue, GqlIssuesResponse>(token, ISSUES_QUERY, 'issues', (res) => res.data?.issues),
  ]);
  return mapResponse({ data: { projects: { nodes: projectNodes } } }, { data: { issues: { nodes: issueNodes } } }, now);
}
