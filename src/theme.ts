// Design tokens — lifted verbatim from `Mission Control.dc.html` (the pixel-final
// design reference) and the handoff README's Design Tokens section. Do not
// retune these here; the reference file is the source of truth.

export const ACCENT = '#4C8DFF';
export const GREEN = '#33C48D';
export const ORANGE = '#F2884B';
export const RED = '#E5484D';
export const PURPLE = '#B98CE8';
export const GRAY = '#5B6270';
export const GRAY2 = '#8B92A5';

export const BG = '#0B0F14';
export const TEXT = '#E7E9EE';

export type Status = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled';
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type Health = 'on_track' | 'at_risk' | 'off_track' | 'done';

export const STATUS_ORDER: Status[] = ['backlog', 'todo', 'in_progress', 'done', 'canceled'];

export const STATUS_META: Record<Status, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: GRAY },
  todo: { label: 'Todo', color: GRAY2 },
  in_progress: { label: 'In Progress', color: ACCENT },
  done: { label: 'Done', color: GREEN },
  canceled: { label: 'Canceled', color: '#6B4C57' },
};

export const HEALTH_META: Record<Health, { label: string; color: string; bg: string }> = {
  on_track: { label: 'ON TRACK', color: GREEN, bg: 'rgba(51,196,141,.14)' },
  at_risk: { label: 'AT RISK', color: ORANGE, bg: 'rgba(242,136,74,.14)' },
  off_track: { label: 'OFF TRACK', color: RED, bg: 'rgba(229,72,77,.14)' },
  done: { label: 'DONE', color: GREEN, bg: 'rgba(51,196,141,.14)' },
};

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  urgent: { label: 'P0', color: RED },
  high: { label: 'P1', color: PURPLE },
  medium: { label: 'P2', color: GRAY2 },
  low: { label: 'P3', color: GRAY },
  none: { label: '–', color: GRAY },
};

export const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
export const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
