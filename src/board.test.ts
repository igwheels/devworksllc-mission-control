import { describe, it, expect } from 'vitest';
import { buildBoard, dotColor, subtaskStyle, type RawBoard } from './board';

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
      projectCount: 1,
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

describe('subtaskStyle', () => {
  it('strikes and dims done rows', () => {
    expect(subtaskStyle(true)).toMatchObject({ strike: 'line-through' });
    expect(subtaskStyle(false)).toMatchObject({ strike: 'none' });
  });
});
