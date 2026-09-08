import { describe, it, expect } from 'vitest';
import {
  buildBoard,
  dotColor,
  subtaskStyle,
  subtaskProgress,
  isProjectActive,
  type RawBoard,
  type RawIssue,
} from './board';
import { GREEN, YELLOW, RED } from './theme';

const fixture: RawBoard = {
  fetchedAt: 1_756_000_000_000,
  projects: [
    {
      id: 'proj-live',
      name: 'Student Driver Log',
      health: 'on_track',
      healthSource: 'derived',
      lead: '',
      target: '',
      progressPct: 17.4,
      issues: [
        {
          id: 'DEV-5',
          title: 'Phase 1 — Zero-cost, zero-lead-time',
          status: 'done',
          priority: 'none',
          assignee: '',
          code: 'DEV-5',
          url: 'https://linear.app/devworks/issue/DEV-5',
          subtasks: [
            { title: 'a', done: true, code: 'DEV-51', url: 'https://linear.app/devworks/issue/DEV-51' },
            { title: 'b', done: true, code: 'DEV-52', url: 'https://linear.app/devworks/issue/DEV-52' },
          ],
        },
        {
          id: 'DEV-7',
          title: 'Phase 3 — Capacitor wrapper',
          status: 'in_progress',
          priority: 'high',
          assignee: 'IA',
          code: 'DEV-7',
          url: 'https://linear.app/devworks/issue/DEV-7',
          subtasks: [
            { title: 'Step 8', done: true, code: 'DEV-71', url: 'https://linear.app/devworks/issue/DEV-71' },
            { title: 'Step 10', done: false, code: 'DEV-72', url: '' },
          ],
        },
        {
          id: 'DEV-8',
          title: 'Phase 4 — Biometric login',
          status: 'backlog',
          priority: 'medium',
          assignee: '',
          code: 'DEV-8',
          url: 'https://linear.app/devworks/issue/DEV-8',
          subtasks: [],
        },
        {
          id: 'DEV-99',
          title: 'Dropped idea',
          status: 'canceled',
          priority: 'low',
          assignee: '',
          code: 'DEV-99',
          url: 'https://linear.app/devworks/issue/DEV-99',
          subtasks: [],
        },
      ],
    },
  ],
};

describe('dotColor', () => {
  it('spreads hues evenly around the ring', () => {
    expect(dotColor(0, 8)).toBe('oklch(0.7 0.15 0deg)');
    expect(dotColor(1, 8)).toBe('oklch(0.7 0.15 45deg)');
    expect(dotColor(2, 4)).toBe('oklch(0.7 0.15 180deg)');
  });
  it('does not divide by zero', () => {
    expect(dotColor(0, 0)).toBe('oklch(0.7 0.15 0deg)');
  });
});

describe('buildBoard', () => {
  const board = buildBoard(fixture);
  const p = board.projects[0];

  it('passes project progress through, rounded', () => {
    expect(p.progressPct).toBe(17);
  });

  it('computes header stats over top-level issues + project health', () => {
    // open = not done/canceled => DEV-7, DEV-8
    expect(board.headerStats).toEqual({
      visibleCount: 1,
      activeCount: 1,
      inactiveCount: 0,
      open: 2,
      inProgress: 1,
      atRisk: 0,
    });
  });

  it('orders status segments by STATUS_ORDER and floors width at 4%', () => {
    // counts: backlog 1, in_progress 1, done 1, canceled 1  (of 4 issues => 25% each)
    expect(p.segments.map((s) => s.pct)).toEqual([25, 25, 25, 25]);
  });

  it('builds a legend entry per non-empty status', () => {
    expect(p.legend.map((l) => `${l.label}:${l.count}`)).toEqual([
      'Backlog:1',
      'In Progress:1',
      'Done:1',
      'Canceled:1',
    ]);
  });

  it('partitions issues into the 5 fixed columns', () => {
    const byStatus = Object.fromEntries(p.columns.map((c) => [c.status, c.issues.map((i) => i.id)]));
    expect(byStatus).toEqual({
      backlog: ['DEV-8'],
      todo: [],
      in_progress: ['DEV-7'],
      done: ['DEV-5'],
      canceled: ['DEV-99'],
    });
  });

  it('surfaces subtask done/total on the issue card', () => {
    const dev7 = p.columns.find((c) => c.status === 'in_progress')!.issues[0];
    expect(dev7.hasSubtasks).toBe(true);
    expect([dev7.subtaskDone, dev7.subtaskTotal]).toEqual([1, 2]);
  });

  it('carries the Linear code and url through to the issue and subtask view models', () => {
    const dev7 = p.columns.find((c) => c.status === 'in_progress')!.issues[0];
    expect(dev7.code).toBe('DEV-7');
    expect(dev7.url).toBe('https://linear.app/devworks/issue/DEV-7');
    expect(dev7.subtasks.map((st) => st.code)).toEqual(['DEV-71', 'DEV-72']);
    expect(dev7.subtasks[1].url).toBe('');
  });

  it('floors a tiny status share at 4% when a project has many issues', () => {
    const many: RawBoard = {
      fetchedAt: 0,
      projects: [
        {
          ...fixture.projects[0],
          issues: [
            ...Array.from({ length: 30 }, (_, i) => ({
              id: `d${i}`,
              title: 't',
              status: 'done' as const,
              priority: 'none' as const,
              assignee: '',
              code: `DEV-${i}`,
              url: '',
              subtasks: [],
            })),
            {
              id: 'lonely',
              title: 't',
              status: 'in_progress' as const,
              priority: 'none' as const,
              assignee: '',
              code: 'DEV-999',
              url: '',
              subtasks: [],
            },
          ],
        },
      ],
    };
    // segments keep STATUS_ORDER, skipping empty statuses: [in_progress, done]
    const segs = buildBoard(many).projects[0].segments;
    expect(segs).toHaveLength(2);
    // 1 / 31 ≈ 3% -> floored to 4
    expect(segs[0].pct).toBe(4);
    expect(segs[1].pct).toBe(97);
  });
});

describe('isProjectActive — derived precedence over Linear\'s own status (DEV-79)', () => {
  // isProjectActive takes only `issues` — no status/active field of any kind
  // — which is the precedence decision made structural rather than a rule to
  // remember: there is nothing here for a Linear-reported project status to
  // override, in either direction.
  const issueWith = (status: RawIssue['status']): RawIssue => ({
    id: status,
    title: status,
    status,
    priority: 'none',
    assignee: '',
    code: '',
    url: '',
    subtasks: [],
  });

  it('is active with no issues at all — nothing to be "100% complete" of', () => {
    expect(isProjectActive([])).toBe(true);
  });

  it('is active the moment any non-canceled issue is not done', () => {
    expect(isProjectActive([issueWith('done'), issueWith('backlog')])).toBe(true);
    expect(isProjectActive([issueWith('todo')])).toBe(true);
    expect(isProjectActive([issueWith('in_progress')])).toBe(true);
  });

  it('is inactive once every non-canceled issue is done', () => {
    expect(isProjectActive([issueWith('done')])).toBe(false);
    expect(isProjectActive([issueWith('done'), issueWith('done')])).toBe(false);
  });

  it('canceled issues count toward neither side, same as the existing progressPct exclusion', () => {
    // Everything real is done, the rest canceled -> inactive.
    expect(isProjectActive([issueWith('done'), issueWith('canceled')])).toBe(false);
    // Nothing real was ever done, only canceled -> same as zero real issues -> active.
    expect(isProjectActive([issueWith('canceled'), issueWith('canceled')])).toBe(true);
  });
});

describe('buildBoard "Include Inactive" filtering (DEV-77 / DEV-79)', () => {
  const openIssues: RawIssue[] = [
    { id: 'o1', title: 'open work', status: 'in_progress', priority: 'none', assignee: '', code: '', url: '', subtasks: [] },
  ];
  const allDoneIssues: RawIssue[] = [
    { id: 'd1', title: 'done work', status: 'done', priority: 'none', assignee: '', code: '', url: '', subtasks: [] },
    { id: 'd2', title: 'more done work', status: 'done', priority: 'none', assignee: '', code: '', url: '', subtasks: [] },
  ];

  const mixed: RawBoard = {
    fetchedAt: 0,
    projects: [
      {
        id: 'active-1',
        name: 'Active One',
        health: 'on_track',
        healthSource: 'derived',
        lead: '',
        target: '',
        progressPct: 0,
        issues: openIssues,
      },
      {
        id: 'inactive-1',
        name: 'Inactive One',
        health: 'done',
        healthSource: 'derived',
        lead: '',
        target: '',
        progressPct: 100,
        issues: allDoneIssues,
      },
      {
        id: 'inactive-2',
        name: 'Inactive Two',
        health: 'done',
        healthSource: 'derived',
        lead: '',
        target: '',
        progressPct: 100,
        issues: allDoneIssues,
      },
    ],
  };

  it('defaults to active-only (off), matching pre-DEV-77 behavior', () => {
    const board = buildBoard(mixed);
    expect(board.projects.map((p) => p.id)).toEqual(['active-1']);
    expect(board.projects[0].active).toBe(true);
    expect(board.headerStats).toMatchObject({ visibleCount: 1, activeCount: 1, inactiveCount: 2 });
  });

  it('explicit includeInactive: false is the same as the default', () => {
    const board = buildBoard(mixed, { includeInactive: false });
    expect(board.projects.map((p) => p.id)).toEqual(['active-1']);
  });

  it('includeInactive: true shows the union — active AND inactive together, not a swap', () => {
    const board = buildBoard(mixed, { includeInactive: true });
    expect(board.projects.map((p) => p.id).sort()).toEqual(['active-1', 'inactive-1', 'inactive-2']);
    expect(board.projects.find((p) => p.id === 'inactive-1')?.active).toBe(false);
    // activeCount/inactiveCount describe the whole board regardless of what's
    // currently visible, so the header can show "N active, M inactive".
    expect(board.headerStats).toMatchObject({ visibleCount: 3, activeCount: 1, inactiveCount: 2 });
  });

  it('stats (open/inProgress/atRisk) reflect only what is currently visible', () => {
    const activeOnly = buildBoard(mixed).headerStats;
    const union = buildBoard(mixed, { includeInactive: true }).headerStats;
    // The two inactive projects have no open/in-progress issues at all (by
    // construction — that's what makes them inactive), so including them
    // shouldn't change these counts at all, only the completed ones' own
    // (zero) contribution.
    expect(union.open).toBe(activeOnly.open);
    expect(union.inProgress).toBe(activeOnly.inProgress);
  });
});

describe('subtaskStyle', () => {
  it('strikes and dims done rows', () => {
    expect(subtaskStyle(true)).toMatchObject({ strike: 'line-through' });
    expect(subtaskStyle(false)).toMatchObject({ strike: 'none' });
  });
});

describe('subtaskProgress', () => {
  it('is complete when every sub-task is done', () => {
    expect(subtaskProgress('in_progress', 3, 3)).toBe('complete');
    expect(subtaskProgress('backlog', 1, 1)).toBe('complete');
  });

  it('is none when no sub-task is done', () => {
    expect(subtaskProgress('in_progress', 0, 3)).toBe('none');
  });

  it('is partial when some but not all sub-tasks are done', () => {
    expect(subtaskProgress('in_progress', 1, 3)).toBe('partial');
    expect(subtaskProgress('in_progress', 2, 3)).toBe('partial');
  });

  it('an issue with zero sub-tasks can only be complete or none, never partial', () => {
    expect(subtaskProgress('done', 0, 0)).toBe('complete');
    expect(subtaskProgress('in_progress', 0, 0)).toBe('none');
    expect(subtaskProgress('backlog', 0, 0)).toBe('none');
    expect(subtaskProgress('canceled', 0, 0)).toBe('none');
  });
});

describe('buildBoard progress color/label wiring', () => {
  it('assigns GREEN/YELLOW/RED per issue and a matching non-color label', () => {
    const board: RawBoard = {
      fetchedAt: 1,
      projects: [
        {
          id: 'p',
          name: 'P',
          health: 'on_track',
          healthSource: 'derived',
          lead: '',
          target: '',
          progressPct: 0,
          issues: [
            {
              id: 'complete',
              title: 'complete',
              status: 'in_progress',
              priority: 'none',
              assignee: '',
              code: 'DEV-1',
              url: '',
              subtasks: [
                { title: 'a', done: true, code: '', url: '' },
                { title: 'b', done: true, code: '', url: '' },
              ],
            },
            {
              id: 'partial',
              title: 'partial',
              status: 'in_progress',
              priority: 'none',
              assignee: '',
              code: 'DEV-2',
              url: '',
              subtasks: [
                { title: 'a', done: true, code: '', url: '' },
                { title: 'b', done: false, code: '', url: '' },
              ],
            },
            {
              id: 'none-with-subtasks',
              title: 'none',
              status: 'in_progress',
              priority: 'none',
              assignee: '',
              code: 'DEV-3',
              url: '',
              subtasks: [{ title: 'a', done: false, code: '', url: '' }],
            },
            {
              id: 'done-no-subtasks',
              title: 'done, no subtasks',
              status: 'done',
              priority: 'none',
              assignee: '',
              code: 'DEV-4',
              url: '',
              subtasks: [],
            },
            {
              id: 'open-no-subtasks',
              title: 'open, no subtasks',
              status: 'todo',
              priority: 'none',
              assignee: '',
              code: 'DEV-5',
              url: '',
              subtasks: [],
            },
          ],
        },
      ],
    };

    const issuesById = Object.fromEntries(
      buildBoard(board)
        .projects[0].columns.flatMap((c) => c.issues)
        .map((i) => [i.id, i]),
    );

    expect(issuesById['complete'].progressColor).toBe(GREEN);
    expect(issuesById['partial'].progressColor).toBe(YELLOW);
    expect(issuesById['none-with-subtasks'].progressColor).toBe(RED);
    expect(issuesById['done-no-subtasks'].progressColor).toBe(GREEN);
    expect(issuesById['open-no-subtasks'].progressColor).toBe(RED);

    // The with-subtasks cases get a done/total label; the no-subtasks cases
    // get a done/not-done label instead, since {done}/{total} never renders
    // when hasSubtasks is false — this is the non-color cue for that case.
    expect(issuesById['partial'].progressLabel).toBe('1/2 sub-tasks done');
    expect(issuesById['done-no-subtasks'].progressLabel).toBe('Issue done — no sub-tasks');
    expect(issuesById['open-no-subtasks'].progressLabel).toBe('Issue not done — no sub-tasks');
  });
});
