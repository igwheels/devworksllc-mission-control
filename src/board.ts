// Pure view-model builder. Ports `_buildProject` + `renderVals` from
// `Mission Control.dc.html` to plain functions over the `/api/board` payload.
// No React, no DOM — unit-tested in board.test.ts.

import {
  STATUS_ORDER,
  STATUS_META,
  HEALTH_META,
  PRIORITY_META,
  GREEN,
  YELLOW,
  RED,
  type Status,
  type Priority,
  type Health,
} from './theme';

// ---- Wire types: the shape `/api/board` returns.
// Keep in sync with `functions/lib/linear.ts`.
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
  assignee: string; // initials, '' when unassigned
  code: string; // Linear identifier, e.g. 'DEV-25'
  url: string; // link to the issue in Linear ('' when unavailable)
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
  /** False for Linear's completed/canceled projects (DEV-77). */
  active: boolean;
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
  code: string;
  url: string;
}
export interface IssueVM {
  id: string;
  title: string;
  code: string;
  url: string;
  priorityLabel: string;
  priorityColor: string;
  assignee: string;
  hasSubtasks: boolean;
  subtaskDone: number;
  subtaskTotal: number;
  subtasks: SubtaskVM[];
  /** Sub-task completion color for the avatar circle (DEV-78). */
  progressColor: string;
  /** Non-color explanation of the same signal — a tooltip today, but kept as
   *  a distinct field so the circle isn't color-only encoding (see
   *  subtaskProgress below). */
  progressLabel: string;
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
  /** False for an inactive (completed/canceled) project shown via "Include
   *  Inactive" (DEV-77) — used to badge it, since its health badge alone can
   *  be misleading for a project that isn't actually being tracked anymore. */
  active: boolean;
}
export interface HeaderStats {
  /** Projects visible with the current "Include Inactive" setting — what's
   *  actually rendered in the grid right now. */
  visibleCount: number;
  activeCount: number;
  inactiveCount: number;
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

export type SubtaskProgress = 'complete' | 'partial' | 'none';

const PROGRESS_COLOR: Record<SubtaskProgress, string> = {
  complete: GREEN,
  partial: YELLOW,
  none: RED,
};

/**
 * Classifies an issue's sub-task completion for the progress-circle color
 * (DEV-78). An issue with zero sub-tasks can't be "partial" — it reads as
 * complete only if the issue itself is Done, otherwise none.
 */
export function subtaskProgress(
  issueStatus: Status,
  subtaskDone: number,
  subtaskTotal: number,
): SubtaskProgress {
  if (subtaskTotal === 0) return issueStatus === 'done' ? 'complete' : 'none';
  if (subtaskDone >= subtaskTotal) return 'complete';
  if (subtaskDone === 0) return 'none';
  return 'partial';
}

/** Text explanation of the same signal the circle's color carries — this is
 *  the non-color cue for DEV-78's color-only-encoding concern. The existing
 *  {done}/{total} text next to the circle already covers issues *with*
 *  sub-tasks; this covers the zero-sub-task case too, where that text never
 *  renders at all. */
function progressLabel(
  progress: SubtaskProgress,
  hasSubtasks: boolean,
  subtaskDone: number,
  subtaskTotal: number,
): string {
  if (hasSubtasks) return `${subtaskDone}/${subtaskTotal} sub-tasks done`;
  return progress === 'complete' ? 'Issue done — no sub-tasks' : 'Issue not done — no sub-tasks';
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
        const hasSubtasks = subtaskTotal > 0;
        const progress = subtaskProgress(iss.status, subtaskDone, subtaskTotal);
        return {
          id: iss.id,
          title: iss.title,
          code: iss.code,
          url: iss.url,
          priorityLabel: pmeta.label,
          priorityColor: pmeta.color,
          assignee: iss.assignee,
          hasSubtasks,
          subtaskDone,
          subtaskTotal,
          subtasks: iss.subtasks.map((st) => ({
            title: st.title,
            done: st.done,
            code: st.code,
            url: st.url,
          })),
          progressColor: PROGRESS_COLOR[progress],
          progressLabel: progressLabel(progress, hasSubtasks, subtaskDone, subtaskTotal),
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
    active: raw.active,
  };
}

export interface BuildBoardOptions {
  /** "Include Inactive" (DEV-77). Off (default) shows active projects only,
   *  matching behavior before this option existed. On shows active +
   *  inactive together — a union, not a swap to inactive-only. */
  includeInactive?: boolean;
}

export function buildBoard(raw: RawBoard, opts: BuildBoardOptions = {}): Board {
  const activeRaw = raw.projects.filter((p) => p.active);
  const inactiveCount = raw.projects.length - activeRaw.length;
  // Stats reflect what's actually visible on screen right now, same as
  // before this option existed for the (still-default) active-only case.
  const visibleRaw = opts.includeInactive ? raw.projects : activeRaw;

  const visibleCount = visibleRaw.length;
  const projects = visibleRaw.map((p, i) => buildProject(p, i, visibleCount));

  let open = 0;
  let inProgress = 0;
  let atRisk = 0;
  for (const p of visibleRaw) {
    for (const iss of p.issues) {
      if (iss.status !== 'done' && iss.status !== 'canceled') open++;
      if (iss.status === 'in_progress') inProgress++;
    }
    if (p.health === 'at_risk' || p.health === 'off_track') atRisk++;
  }

  return {
    projects,
    headerStats: { visibleCount, activeCount: activeRaw.length, inactiveCount, open, inProgress, atRisk },
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
