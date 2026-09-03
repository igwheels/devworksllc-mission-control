# Handoff: Mission Control (mc.devworksllc.com)

> **Build status:** the app is implemented — Vite + React SPA on Cloudflare Pages,
> a Pages Function proxying the Linear GraphQL API, Workers KV poll cache, HTTP
> Basic Auth. See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for setup, secrets, and
> the deploy runbook. This file remains the design spec of record.

## Overview
"Mission Control" is a visual project-management dashboard for DevWorks LLC's Linear workspace. It shows all active projects at a glance (progress, status breakdown, health) and drills down into a per-project kanban view with issues and sub-tasks. Intended to run on a wall-mounted display and/or a browser tab, refreshing continuously.

## About the Design Files
The bundled file (`Mission Control.dc.html`) is a **design reference built in HTML**, not production code. It currently renders with **hardcoded mock data** standing in for a real Linear workspace. The task is to recreate this design in whatever stack mc.devworksllc.com will run on (a small Next.js/React/Vue app, etc. — pick what fits the existing DevWorks LLC stack, or default to a simple React + Node/serverless setup if none exists), wired to real Linear data. Do not ship the HTML file directly — it has no backend, auth, or live data handling.

## Fidelity
**High-fidelity.** Colors, spacing, type, and layout in the HTML file are final. Recreate pixel-for-pixel using the values below.

## Why this needs a backend (important)
Linear's API requires an API key/OAuth token in request headers. That token **must never be shipped to the browser** — a static page calling Linear directly from client JS would expose the key to anyone who views source/network tab. The real implementation needs:
1. A small backend (serverless function, Node/Express route, etc.) that holds the Linear API key as a server-side secret and calls Linear's GraphQL API (`https://api.linear.app/graphql`).
2. The frontend polls/fetches from that backend endpoint, not from Linear directly.
3. Recommended refresh: poll every 15–30s, or use Linear's webhooks to push updates into a cache the frontend polls — either satisfies the "live" feel in this design.

### Data this needs from Linear's API (GraphQL)
- **Projects**: `id`, `name`, `progress` (or compute from issue states), `health` (Linear's project health field: onTrack / atRisk / offTrack), `lead { name/initials }`, `targetDate`.
- **Issues** per project: `id`, `title`, `state { name, type }` (map Linear's workflow state types — backlog/unstarted/started/completed/canceled — to the 5 columns used here), `priority` (0–4, maps to P0–P3/none), `assignee { initials }`.
- **Sub-issues**: Linear issues can have `children` (sub-issues). Map each child's `completedAt`/state to the done/not-done checkbox shown in the expanded sub-task list.

## Screens / Views

### 1. Overview grid (default view)
- **Purpose**: At-a-glance status of every active project.
- **Layout**: Full-viewport dark page, `padding: 28px 36px 40px`. Header bar, then a CSS grid of project cards: `grid-template-columns: repeat(auto-fill, minmax(300px,1fr))`, `gap: 16px`.
- **Header bar**: flex row, `justify-content: space-between`, bottom border `1px solid rgba(255,255,255,.09)`, `padding-bottom: 20px`.
  - Left: "MISSION CONTROL" (22px/700/letterspacing .02em) stacked over "DevWorks LLC" (12px, monospace, `rgba(255,255,255,.4)`), and below that "{N} active projects" (12px, `rgba(255,255,255,.4)`).
  - Right: three stat readouts (ISSUES OPEN / IN PROGRESS / AT RISK — 10px label letterspacing .08em over 20px/600 monospace value; IN PROGRESS value colored `#4C8DFF`, AT RISK colored `#F2884B`), a 1px vertical divider, then a live-sync block: 7px pulsing green dot (`#33C48D`, `mc-pulse` keyframe 1.6s) + "synced Xs ago" (11px), and below it the clock (18px/600 monospace, HH:MM:SS).
- **Project card**: background `#121821`, border `1px solid rgba(255,255,255,.08)` (hover: bg `#161d28`, border `rgba(255,255,255,.16)`), `border-radius: 10px`, `padding: 16px 18px`, cursor pointer.
  - Row 1: 9px colored dot (per-project categorical color, see Design Tokens) + project name (15px/600, truncates with ellipsis) + health pill, right-aligned (10px/600 letterspacing .04em, pill `padding: 3px 8px`, `border-radius: 20px`, colored per health state).
  - Progress: "PROGRESS" label (10px letterspacing .06em, `rgba(255,255,255,.4)`) vs. bold percentage (13px/600 monospace), then a 6px-tall rounded track (`rgba(255,255,255,.08)`) with a filled bar in the project's dot color, width = progress%.
  - Status segment bar: 5px tall, flex row of colored segments (1px gaps) proportional to issue-status counts (min 4% width so small counts stay visible).
  - Legend: wrapping row of "{count} {Status label}" chips, each with a 6px colored dot, 11px text `rgba(255,255,255,.5)`, count in monospace.
  - Footer: divider `1px solid rgba(255,255,255,.07)` above `padding-top:12px`; left = 22px circular avatar (`rgba(255,255,255,.1)` bg, initials 10px/600) + "Target {date}" (11px, `rgba(255,255,255,.4)`); right = "{n} issues" (11px monospace, `rgba(255,255,255,.4)`).

### 2. Project drill-down (kanban view)
- **Purpose**: See every issue and its sub-tasks for one project.
- **Entry**: clicking any project card.
- **Layout**: "← All Projects" back link (12px, `rgba(255,255,255,.5)`, hover `rgba(255,255,255,.85)`) at top. Below: project header row (12px dot, 22px/700 name, health pill), then a meta row (lead avatar+label, target date, issue count, a 220px-max progress bar, percentage) all 12px `rgba(255,255,255,.45)`. Then a 5-column grid (one column per status), `gap:14px`, horizontally scrollable if narrower than 5×200px.
- **Kanban column**: bg `#10151d`, border `1px solid rgba(255,255,255,.07)`, `border-radius:10px`, `padding:12px`, `min-height:120px`. Header: colored dot + status label (11px/600) + count (monospace, right-aligned), bottom border under header.
- **Issue card**: bg `#161c26`, border `1px solid rgba(255,255,255,.06)` (hover lightens border), `border-radius:7px`, `padding:9px 10px`, cursor pointer. Row: priority tag (9px/700 monospace, "P0"–"P3" or "–", colored — see tokens) + title (12.5px). Below: 18px avatar circle (initials) left, "{done}/{total}" sub-task counter (10px monospace, `rgba(255,255,255,.4)`) right — only shown if the issue has sub-tasks.
- **Expanded sub-tasks** (click an issue card to toggle): indented block (`margin-left:14px`, `padding-left:10px`, left border `1px solid rgba(255,255,255,.08)`), each sub-task a row with a 9x9px checkbox (filled green + no border-fill difference when done) and its title — done sub-tasks get `text-decoration: line-through` and dimmed text (`rgba(255,255,255,.35)` vs `rgba(255,255,255,.75)` for open ones).

## Interactions & Behavior
- Click a project card → opens drill-down for that project (`selectedProjectId` state).
- Click "← All Projects" → returns to grid.
- Click an issue card in drill-down → toggles its sub-task list open/closed (only one issue expanded at a time in the reference build; fine to allow multiple in production).
- Clock updates every 1s.
- "Synced Xs ago" resets on each poll (reference build simulates a poll every 20s and also nudges one random issue forward a stage, purely to demo the "live" feel — replace with a real fetch-on-interval against your backend).
- No loading/error states are designed yet — recommend adding: a skeleton/dimmed state for initial load, and a small inline banner if the backend poll fails (e.g. "Last known data — sync failed Xs ago") rather than blanking the screen, since this is meant to run unattended on a display.

## State Management
- `selectedProjectId` (string | null) — which project's drill-down is open.
- `expandedIssueId` (string | null, or a Set for multi-expand) — which issue's sub-tasks are shown.
- `projects` — array of project objects (from backend fetch, replacing `RAW_PROJECTS` in the reference file).
- `lastSyncedAt` (timestamp) — for the "synced Xs ago" readout.
- Recommend a polling hook (`useEffect` + `setInterval`, or SWR/React Query with a `refetchInterval`) that re-fetches from your backend endpoint and updates `projects` + `lastSyncedAt`.

## Design Tokens

**Colors**
- Background: `#0B0F14`
- Card surface: `#121821` (grid card), `#10151d` (kanban column), `#161c26` (issue card)
- Borders: `rgba(255,255,255,.06–.16)` depending on element (see above)
- Primary text: `#E7E9EE`
- Secondary text: `rgba(255,255,255,.4–.5)`
- Accent (in-progress / links): `#4C8DFF`
- Success / done / on-track: `#33C48D`
- Warning / at-risk: `#F2884B`
- Off-track: `#E5484D`
- High-priority accent: `#B98CE8`
- Neutral status colors (backlog/todo): `#5B6270`, `#8B92A5`
- Canceled: `#6B4C57`
- Per-project categorical dot color: `oklch(0.7 0.15 {hue}deg)` where hue = `index * (360 / project_count)` — generates evenly-spaced hues automatically for any number of projects, no fixed palette to maintain.

**Typography**
- Sans (UI text): `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
- Monospace (all numbers/data — percentages, counts, clock, priority tags): `ui-monospace, "SF Mono", Menlo, Consolas, monospace`
- Sizes used: 9px (priority tags, sub-counters), 10–11px (labels/legend/meta), 12–13px (issue titles, progress %), 15px (card title), 18–22px (headers/clock).

**Spacing / radius**
- Card padding: 16–18px (grid card), 12px (kanban column), 9–10px (issue card)
- Grid gap: 16px; kanban column gap: 14px
- Border radius: 10px (cards/columns), 7px (issue cards), 4px (progress bar), 20px (pills), 50% (avatars/dots)

**Motion**
- Live dot pulse: `opacity 1 → .25 → 1` over 1.6s, ease-in-out, infinite.
- Progress bar fill: `width` transition 0.4s.
- Drill-down entrance: fade+slide-up, 0.2s ease-out.

## Assets
No image assets — all visuals are CSS (dots, bars, avatar-initial circles). No icon font/library used.

## Files
- `Mission Control.dc.html` — the full design reference (markup + mock data + interaction logic in one file). Open directly in a browser to see it running.
