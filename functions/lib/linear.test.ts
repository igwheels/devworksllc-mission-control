import { describe, it, expect } from 'vitest';
import {
  mapStatus,
  mapPriority,
  initials,
  formatTarget,
  deriveHealth,
  mapResponse,
  authHeader,
  type GqlResponse,
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
      { id: 'a', title: 'x', status: 'in_progress' as const, priority: 'none' as const, assignee: '', subtasks: [] },
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

  const res: GqlResponse = {
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
            issues: {
              // Flat list — parents and children together, children carry `parent`.
              nodes: [
                {
                  id: 'DEV-7',
                  identifier: 'DEV-7',
                  title: 'Phase 3 — Capacitor wrapper',
                  priority: 2,
                  completedAt: null,
                  state: { type: 'started' },
                  assignee: { displayName: 'ian' },
                  parent: null,
                },
                {
                  id: 'DEV-8',
                  identifier: 'DEV-8',
                  title: 'Phase 4 — Biometric login',
                  priority: 0,
                  completedAt: null,
                  state: { type: 'backlog' },
                  assignee: null,
                  parent: null,
                },
                {
                  id: 'DEV-19',
                  identifier: 'DEV-19',
                  title: 'Step 8',
                  priority: 0,
                  completedAt: '2026-09-02T05:04:38Z',
                  state: { type: 'completed' },
                  assignee: null,
                  parent: { id: 'DEV-7' },
                },
                {
                  id: 'DEV-23',
                  identifier: 'DEV-23',
                  title: 'Step 10',
                  priority: 0,
                  completedAt: null,
                  state: { type: 'backlog' },
                  assignee: null,
                  parent: { id: 'DEV-7' },
                },
                {
                  // grandchild — attaches to DEV-23 (a non-top-level issue) and
                  // must therefore not surface anywhere
                  id: 'DEV-40',
                  identifier: 'DEV-40',
                  title: 'Sub-step',
                  priority: 0,
                  completedAt: null,
                  state: { type: 'backlog' },
                  assignee: null,
                  parent: { id: 'DEV-23' },
                },
              ],
            },
          },
          {
            id: 'proj-old',
            name: 'Archived thing',
            progress: 1,
            health: null,
            targetDate: null,
            status: { type: 'completed', name: 'Completed' },
            lead: null,
            issues: { nodes: [] },
          },
        ],
      },
    },
  };

  const board = mapResponse(res, NOW);

  it('drops completed/canceled projects', () => {
    expect(board.projects.map((p) => p.id)).toEqual(['proj-live']);
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
      { title: 'Step 8', done: true },
      { title: 'Step 10', done: false },
    ]);
  });

  it('uses Linear project.progress when present', () => {
    expect(board.projects[0].progressPct).toBe(42);
  });

  it('derives health and records the source', () => {
    expect(board.projects[0].healthSource).toBe('derived');
    expect(board.projects[0].health).toBe('on_track');
  });

  it('throws on GraphQL errors', () => {
    expect(() => mapResponse({ errors: [{ message: 'boom' }] })).toThrow('boom');
  });
});
