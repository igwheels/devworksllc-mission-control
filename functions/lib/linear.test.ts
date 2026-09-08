import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mapStatus,
  mapPriority,
  initials,
  formatTarget,
  deriveHealth,
  mapResponse,
  authHeader,
  fetchLinearBoard,
  MAX_PAGES,
  type GqlProjectsResponse,
  type GqlIssuesResponse,
} from './linear';

describe('mapStatus', () => {
  it('maps Linear workflow state types to the 5 board columns', () => {
    expect(mapStatus('backlog')).toBe('backlog');
    expect(mapStatus('unstarted')).toBe('todo');
    expect(mapStatus('started')).toBe('in_progress');
    expect(mapStatus('completed')).toBe('done');
    expect(mapStatus('canceled')).toBe('canceled');
    expect(mapStatus('triage')).toBe('backlog');
    expect(mapStatus(null)).toBe('backlog');
  });
});

describe('mapPriority', () => {
  it('maps 0..4 to labels', () => {
    expect(mapPriority(1)).toBe('urgent');
    expect(mapPriority(2)).toBe('high');
    expect(mapPriority(3)).toBe('medium');
    expect(mapPriority(4)).toBe('low');
    expect(mapPriority(0)).toBe('none');
    expect(mapPriority(null)).toBe('none');
  });
});

describe('initials', () => {
  it('derives up to two uppercase letters', () => {
    expect(initials({ displayName: 'ian@devworksllc.com' })).toBe('IA');
    expect(initials({ displayName: 'Ada Lovelace' })).toBe('AL');
    expect(initials({ name: 'grace-hopper' })).toBe('GH');
    expect(initials({ displayName: 'Cher' })).toBe('CH');
    expect(initials(null)).toBe('');
    expect(initials({})).toBe('');
  });
});

describe('formatTarget', () => {
  it('formats a timeless date, tolerates null', () => {
    expect(formatTarget('2025-10-12')).toBe('Oct 12');
    expect(formatTarget('2025-01-03')).toBe('Jan 3');
    expect(formatTarget(null)).toBe('');
    expect(formatTarget('not-a-date')).toBe('');
  });
});

describe('deriveHealth', () => {
  const NOW = Date.parse('2026-09-02T00:00:00Z');

  it('prefers a Linear health value', () => {
    expect(deriveHealth('atRisk', null, 10, [], NOW)).toEqual({
      health: 'at_risk',
      source: 'linear',
    });
  });

  it('done at 100%', () => {
    expect(deriveHealth(null, null, 100, [], NOW).health).toBe('done');
  });

  it('off_track when past target with open work', () => {
    const issues = [
      {
        id: 'a',
        title: 'x',
        status: 'in_progress' as const,
        priority: 'none' as const,
        assignee: '',
        code: 'DEV-1',
        url: '',
        subtasks: [],
      },
    ];
    expect(deriveHealth(null, '2026-08-01', 40, issues, NOW).health).toBe('off_track');
  });

  it('at_risk when target is near and progress is low', () => {
    expect(deriveHealth(null, '2026-09-06', 20, [], NOW).health).toBe('at_risk');
  });

  it('on_track otherwise', () => {
    expect(deriveHealth(null, '2026-12-01', 20, [], NOW).health).toBe('on_track');
    expect(deriveHealth(null, null, 20, [], NOW).health).toBe('on_track');
  });
});

describe('authHeader', () => {
  it('bearer-wraps OAuth tokens, passes API keys bare', () => {
    expect(authHeader('abc123')).toBe('Bearer abc123');
    expect(authHeader('lin_api_deadbeef')).toBe('lin_api_deadbeef');
    expect(authHeader('Bearer already')).toBe('Bearer already');
  });
});

describe('mapResponse', () => {
  const NOW = Date.parse('2026-09-02T00:00:00Z');

  const projectsRes: GqlProjectsResponse = {
    data: {
      projects: {
        nodes: [
          {
            id: 'proj-live',
            name: 'Student Driver Log',
            progress: 0.42,
            health: null,
            targetDate: null,
            status: { type: 'backlog', name: 'Backlog' },
            lead: null,
          },
          {
            id: 'proj-old',
            name: 'Archived thing',
            progress: 1,
            health: null,
            targetDate: null,
            status: { type: 'completed', name: 'Completed' },
            lead: null,
          },
        ],
      },
    },
  };

  // Flat issue list across all projects; each carries `project` and `parent`.
  const issuesRes: GqlIssuesResponse = {
    data: {
      issues: {
        nodes: [
          {
            id: 'DEV-7',
            identifier: 'DEV-7',
            url: 'https://linear.app/devworks/issue/DEV-7',
            title: 'Phase 3 — Capacitor wrapper',
            priority: 2,
            completedAt: null,
            state: { type: 'started' },
            assignee: { displayName: 'ian' },
            parent: null,
            project: { id: 'proj-live' },
          },
          {
            id: 'DEV-8',
            identifier: 'DEV-8',
            url: 'https://linear.app/devworks/issue/DEV-8',
            title: 'Phase 4 — Biometric login',
            priority: 0,
            completedAt: null,
            state: { type: 'backlog' },
            assignee: null,
            parent: null,
            project: { id: 'proj-live' },
          },
          {
            id: 'DEV-19',
            identifier: 'DEV-19',
            url: 'https://linear.app/devworks/issue/DEV-19',
            title: 'Step 8',
            priority: 0,
            completedAt: '2026-09-02T05:04:38Z',
            state: { type: 'completed' },
            assignee: null,
            parent: { id: 'DEV-7' },
            project: { id: 'proj-live' },
          },
          {
            id: 'DEV-23',
            identifier: 'DEV-23',
            url: 'https://linear.app/devworks/issue/DEV-23',
            title: 'Step 10',
            priority: 0,
            completedAt: null,
            state: { type: 'backlog' },
            assignee: null,
            parent: { id: 'DEV-7' },
            project: { id: 'proj-live' },
          },
          {
            // grandchild — attaches to DEV-23 (a non-top-level issue) and
            // must therefore not surface anywhere
            id: 'DEV-40',
            identifier: 'DEV-40',
            url: 'https://linear.app/devworks/issue/DEV-40',
            title: 'Sub-step',
            priority: 0,
            completedAt: null,
            state: { type: 'backlog' },
            assignee: null,
            parent: { id: 'DEV-23' },
            project: { id: 'proj-live' },
          },
          {
            // belongs to the hidden project — must not appear
            id: 'DEV-99',
            identifier: 'DEV-99',
            url: 'https://linear.app/devworks/issue/DEV-99',
            title: 'Old issue',
            priority: 0,
            completedAt: null,
            state: { type: 'backlog' },
            assignee: null,
            parent: null,
            project: { id: 'proj-old' },
          },
        ],
      },
    },
  };

  const board = mapResponse(projectsRes, issuesRes, NOW);

  it('tags completed/canceled projects as inactive rather than dropping them (DEV-77)', () => {
    expect(board.projects.map((p) => p.id)).toEqual(['proj-live', 'proj-old']);
    expect(board.projects.find((p) => p.id === 'proj-live')?.active).toBe(true);
    expect(board.projects.find((p) => p.id === 'proj-old')?.active).toBe(false);
  });

  it('keeps only top-level issues as kanban cards', () => {
    expect(board.projects[0].issues.map((i) => i.id)).toEqual(['DEV-7', 'DEV-8']);
  });

  it('maps children to subtasks with done state', () => {
    const dev7 = board.projects[0].issues[0];
    expect(dev7.status).toBe('in_progress');
    expect(dev7.priority).toBe('high');
    expect(dev7.assignee).toBe('IA');
    expect(dev7.subtasks).toEqual([
      {
        title: 'Step 8',
        done: true,
        code: 'DEV-19',
        url: 'https://linear.app/devworks/issue/DEV-19',
      },
      {
        title: 'Step 10',
        done: false,
        code: 'DEV-23',
        url: 'https://linear.app/devworks/issue/DEV-23',
      },
    ]);
  });

  it('carries the Linear identifier and url onto issues and subtasks', () => {
    const dev7 = board.projects[0].issues[0];
    expect(dev7.code).toBe('DEV-7');
    expect(dev7.url).toBe('https://linear.app/devworks/issue/DEV-7');
    expect(dev7.subtasks[0].code).toBe('DEV-19');
    expect(dev7.subtasks[0].url).toBe('https://linear.app/devworks/issue/DEV-19');
  });

  it('falls back to an empty url when Linear omits it', () => {
    const res: GqlIssuesResponse = {
      data: {
        issues: {
          nodes: [
            {
              id: 'x1',
              identifier: 'DEV-1',
              url: null,
              title: 'No url',
              priority: 0,
              completedAt: null,
              state: { type: 'backlog' },
              assignee: null,
              parent: null,
              project: { id: 'proj-live' },
            },
          ],
        },
      },
    };
    const b = mapResponse(projectsRes, res, NOW);
    expect(b.projects[0].issues[0]).toMatchObject({ code: 'DEV-1', url: '' });
  });

  it('uses Linear project.progress when present', () => {
    expect(board.projects[0].progressPct).toBe(42);
  });

  it('derives health and records the source', () => {
    expect(board.projects[0].healthSource).toBe('derived');
    expect(board.projects[0].health).toBe('on_track');
  });

  it('still includes issues belonging to an inactive project (DEV-77)', () => {
    const oldProject = board.projects.find((p) => p.id === 'proj-old');
    expect(oldProject?.issues.map((i) => i.id)).toEqual(['DEV-99']);
  });

  it('throws on a GraphQL error in either response', () => {
    expect(() => mapResponse({ errors: [{ message: 'boom' }] }, { data: { issues: { nodes: [] } } })).toThrow(
      'boom',
    );
    expect(() =>
      mapResponse({ data: { projects: { nodes: [] } } }, { errors: [{ message: 'kaboom' }] }),
    ).toThrow('kaboom');
  });
});

describe('fetchLinearBoard pagination', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  type FetchCall = [string, { body: string }];

  function isProjectsCall(call: FetchCall): boolean {
    return JSON.parse(call[1].body).query.includes('MissionControlProjects');
  }

  /** Queues per-connection page responses and routes each `fetch` call to the
   * right queue by inspecting the query text — same trick used to keep the
   * two real connections independent in production. */
  function mockFetch(pages: { projectPages: GqlProjectsResponse[]; issuePages: GqlIssuesResponse[] }) {
    let projectCall = 0;
    let issueCall = 0;
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const call: FetchCall = [_url, init];
      const page = isProjectsCall(call) ? pages.projectPages[projectCall++] : pages.issuePages[issueCall++];
      if (!page) throw new Error('mock fetch called more times than pages were queued for it');
      return { ok: true, json: async () => page } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const project = (id: string) => ({
    id,
    name: id,
    progress: null,
    health: null,
    targetDate: null,
    status: { type: 'started' },
    lead: null,
  });
  const issue = (id: string, projectId: string) => ({
    id,
    identifier: id,
    url: null,
    title: id,
    priority: 0,
    completedAt: null,
    state: { type: 'backlog' },
    assignee: null,
    parent: null,
    project: { id: projectId },
  });

  it('single page each: unchanged behavior from before pagination existed', async () => {
    mockFetch({
      projectPages: [{ data: { projects: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [project('p1')] } } }],
      issuePages: [{ data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [issue('i1', 'p1')] } } }],
    });

    const board = await fetchLinearBoard('token', Date.parse('2026-09-05T00:00:00Z'));
    expect(board.projects.map((p) => p.id)).toEqual(['p1']);
    expect(board.projects[0].issues.map((i) => i.id)).toEqual(['i1']);
  });

  it('follows cursors across multiple pages and merges every page', async () => {
    mockFetch({
      projectPages: [{ data: { projects: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [project('p1')] } } }],
      issuePages: [
        { data: { issues: { pageInfo: { hasNextPage: true, endCursor: 'cursor-1' }, nodes: [issue('i1', 'p1')] } } },
        { data: { issues: { pageInfo: { hasNextPage: true, endCursor: 'cursor-2' }, nodes: [issue('i2', 'p1')] } } },
        { data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [issue('i3', 'p1')] } } },
      ],
    });

    const board = await fetchLinearBoard('token');
    expect(board.projects[0].issues.map((i) => i.id).sort()).toEqual(['i1', 'i2', 'i3']);
  });

  it("passes the previous page's endCursor as the next page's `after` variable", async () => {
    const fetchMock = mockFetch({
      projectPages: [{ data: { projects: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }],
      issuePages: [
        { data: { issues: { pageInfo: { hasNextPage: true, endCursor: 'abc' }, nodes: [] } } },
        { data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } },
      ],
    });

    await fetchLinearBoard('token');

    const issueCalls = fetchMock.mock.calls.filter((c) => !isProjectsCall(c as FetchCall));
    expect(JSON.parse((issueCalls[0][1] as { body: string }).body).variables).toEqual({ after: undefined });
    expect(JSON.parse((issueCalls[1][1] as { body: string }).body).variables).toEqual({ after: 'abc' });
  });

  it('handles an empty workspace (zero projects, zero issues) without erroring', async () => {
    mockFetch({
      projectPages: [{ data: { projects: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }],
      issuePages: [{ data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }],
    });
    const board = await fetchLinearBoard('token');
    expect(board.projects).toEqual([]);
  });

  it('throws rather than returning a partial board if a later page errors', async () => {
    mockFetch({
      projectPages: [{ data: { projects: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }],
      issuePages: [
        { data: { issues: { pageInfo: { hasNextPage: true, endCursor: 'abc' }, nodes: [issue('i1', 'p1')] } } },
        { errors: [{ message: 'Linear had a bad day' }] },
      ],
    });
    await expect(fetchLinearBoard('token')).rejects.toThrow('Linear had a bad day');
  });

  it('throws instead of looping forever if a connection never reports hasNextPage: false', async () => {
    const issuePages: GqlIssuesResponse[] = Array.from({ length: MAX_PAGES }, () => ({
      data: { issues: { pageInfo: { hasNextPage: true, endCursor: 'always-more' }, nodes: [] } },
    }));
    const fetchMock = mockFetch({
      projectPages: [{ data: { projects: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }],
      issuePages,
    });

    await expect(fetchLinearBoard('token')).rejects.toThrow(/capped at 20 pages/);
    expect(fetchMock.mock.calls.filter((c) => !isProjectsCall(c as FetchCall))).toHaveLength(MAX_PAGES);
  });

  it('throws if Linear reports another page but omits the cursor to fetch it', async () => {
    mockFetch({
      projectPages: [{ data: { projects: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }],
      issuePages: [{ data: { issues: { pageInfo: { hasNextPage: true, endCursor: null }, nodes: [] } } }],
    });
    await expect(fetchLinearBoard('token')).rejects.toThrow(/returned no cursor/);
  });
});
