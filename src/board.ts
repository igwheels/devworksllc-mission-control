// Pure view-model builder. Ports `_buildProject` + `renderVals` from
// `Mission Control.dc.html` to plain functions over the `/api/board` payload.
// No React, no DOM — unit-tested in board.test.ts.

import {
  STATUS_ORDER,
  STATUS_META,
  HEALTH_META,
  PRIORITY_META,
  GREEN,
  type Status,
  type Priority,
  type Health,
} from './theme';

// ---- Wire types: the shape `/api/board` returns.
// Keep in sync with `functions/lib/linear.ts`.
export interface RawSubtask {
  title: string;
  done: boolean;
}
export interface RawIssue {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  assignee: string; // initials, '' when unassigned
  subtasks: RawSubtask[];
}
export interface RawProject {
  id: string;
  name: string;
  health: Health;
  healthSource: 'linear' | 'derived';
  lead: string; // initials, '' when no lead
  target: string; // e.g. 'Oct 12', '' when no target date
  progressPct: number; // 0..100, authoritative (from Linear or server-computed)
  issues: RawIssue[];
}
export interface RawBoard {
  fetchedAt: number; // epoch ms
  projects: RawProject[];
  stale?: boolean;
  syncError?: string;
}

// ---- View models consumed by the components.
export interface Segment {
  color: string;
  pct: number;
}
export interface LegendEntry {
  label: string;
  color: string;
  count: number;
}
export interface SubtaskVM {
  title: string;
  done: boolean;
}
export interface IssueVM {
  id: string;
  title: string;
  priorityLabel: string;
  priorityColor: string;
  assignee: string;
  hasSubtasks: boolean;
  subtaskDone: number;
  subtaskTotal: number;
  subtasks: SubtaskVM[];
}
export interface ColumnVM {
  status: Status;
  label: string;
  color: string;
  issues: IssueVM[];
}
export interface ProjectVM {
  id: string;
  name: string;
  lead: string;
  target: string;
  dotColor: string;
  health: { label: string; color: string; bg: string };
  progressPct: number;
  segments: Segment[];
  legend: LegendEntry[];
  totalIssues: number;
  columns: ColumnVM[];
}
export interface HeaderStats {
  projectCount: number;
  open: number;
  inProgress: number;
  atRisk: number;
}
export interface Board {
  projects: ProjectVM[];
  headerStats: HeaderStats;
}

function countByStatus(issues: RawIssue[]): Record<Status, number> {
  const counts: Record<Status, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    done: 0,
    canceled: 0,
  };
  for (const i of issues) counts[i.status]++;
  return counts;
}

// oklch hue ring — evenly spaced, no fixed palette to maintain (README §Design Tokens).
export function dotColor(index: number, projectCount: number): string {
  const hue = Math.round(index * (360 / Math.max(1, projectCount)));
  return `oklch(0.7 0.15 ${hue}deg)`;
}

function buildProject(raw: RawProject, index: number, projectCount: number): ProjectVM {
  const counts = countByStatus(raw.issues);
  const health = HEALTH_META[raw.health];

  const segments: Segment[] = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({
    color: STATUS_META[s].color,
    pct: Math.max(4, Math.round((counts[s] / raw.issues.length) * 100)),
  }));

  const legend: LegendEntry[] = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({
    label: STATUS_META[s].label,
    color: STATUS_META[s].color,
    count: counts[s],
  }));

  const columns: ColumnVM[] = STATUS_ORDER.map((s) => ({
    status: s,
    label: STATUS_META[s].label,
    color: STATUS_META[s].color,
    issues: raw.issues
      .filter((i) => i.status === s)
      .map((iss): IssueVM => {
        const pmeta = PRIORITY_META[iss.priority];
        const subtaskTotal = iss.subtasks.length;
        const subtaskDone = iss.subtasks.filter((st) => st.done).length;
        return {
          id: iss.id,
          title: iss.title,
          priorityLabel: pmeta.label,
          priorityColor: pmeta.color,
          assignee: iss.assignee,
          hasSubtasks: subtaskTotal > 0,
          subtaskDone,
          subtaskTotal,
          subtasks: iss.subtasks.map((st) => ({ title: st.title, done: st.done })),
        };
      }),
  }));

  return {
    id: raw.id,
    name: raw.name,
    lead: raw.lead,
    target: raw.target,
    dotColor: dotColor(index, projectCount),
    health,
    progressPct: Math.round(raw.progressPct),
    segments,
    legend,
    totalIssues: raw.issues.length,
    columns,
  };
}

export function buildBoard(raw: RawBoard): Board {
  const projectCount = raw.projects.length;
  const projects = raw.projects.map((p, i) => buildProject(p, i, projectCount));

  let open = 0;
  let inProgress = 0;
  let atRisk = 0;
  for (const p of raw.projects) {
    for (const iss of p.issues) {
      if (iss.status !== 'done' && iss.status !== 'canceled') open++;
      if (iss.status === 'in_progress') inProgress++;
    }
    if (p.health === 'at_risk' || p.health === 'off_track') atRisk++;
  }

  return {
    projects,
    headerStats: { projectCount, open, inProgress, atRisk },
  };
}

// Subtask checkbox styling (README §Project drill-down → Expanded sub-tasks).
export function subtaskStyle(done: boolean) {
  return {
    textColor: done ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.75)',
    strike: done ? ('line-through' as const) : ('none' as const),
    boxColor: done ? GREEN : 'rgba(255,255,255,.3)',
    boxBg: done ? GREEN : 'transparent',
  };
}
