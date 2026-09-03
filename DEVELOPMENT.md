# Mission Control — development & deploy

Live project dashboard for the DevWorks LLC Linear workspace, deployed to
**mc.devworksllc.com**. Cloudflare Pages (static SPA) + Pages Functions (the
Linear proxy) + Workers KV (poll cache), gated by HTTP Basic Auth.

`Mission Control.dc.html` is the **design reference only** — it is never shipped.
`src/theme.ts` + the component markup are the port of it; keep the reference as
the source of truth for colors, spacing, and layout.

## Architecture

```
Browser ──Basic Auth──▶ Cloudflare Pages
                         ├─ static SPA (dist/, built by Vite)
                         └─ functions/
                             ├─ _middleware.ts   Basic Auth on every route
                             └─ api/board.ts     KV cache ─▶ Linear GraphQL
```

- The Linear token lives only as a Cloudflare secret; it never reaches the browser.
- `/api/board` serves a cached board for 15s (soft) / 60s (KV hard expiry), so N
  wall displays collapse to a few Linear calls per minute.
- On a Linear failure the API returns the last cached board with `stale: true`;
  the UI shows a "sync failed" banner instead of blanking.

## One-time setup

### 1. Linear OAuth application

Linear → Settings → API → OAuth applications → **Create**:

- Redirect URI: `http://localhost:8788/callback`
- Scope: `read`

Note the **Client ID** and **Client Secret**.

### 2. Mint the token

```sh
npm install
LINEAR_CLIENT_ID=xxx LINEAR_CLIENT_SECRET=yyy npm run linear:auth
```

Approve in the browser (as a workspace admin, since the default is `actor=application`).
The script prints an `access_token` — that is `LINEAR_TOKEN`.

### 3. Cloudflare

```sh
npx wrangler login                       # or set CLOUDFLARE_API_TOKEN
npx wrangler kv namespace create MC_CACHE
```

Paste the returned namespace id into `wrangler.toml` (`kv_namespaces[0].id`).

### 4. Secrets (production)

```sh
npx wrangler pages secret put LINEAR_TOKEN     # value from step 2
npx wrangler pages secret put MC_BASIC_USER    # site username
npx wrangler pages secret put MC_BASIC_PASS    # site password
```

### 5. Custom domain

After the first deploy, in the Cloudflare dashboard → Workers & Pages →
`devworksllc-mission-control` → Custom domains → add `mc.devworksllc.com`.
The DNS record is created automatically (the zone is already on Cloudflare).

## Local development

```sh
cp .dev.vars.example .dev.vars     # fill in LINEAR_TOKEN + Basic Auth creds
npm run pages:dev                  # builds, then `wrangler pages dev` (SPA + Functions)
```

`npm run dev` (bare Vite) serves the SPA only — `/api/board` 404s without `wrangler`.

## Checks

```sh
npm test          # vitest: buildBoard view-model + Linear response mapper
npm run build     # tsc -b (all three tsconfig projects) + vite build
```

## Deploy

Push to `main` → `.github/workflows/deploy.yml` runs `npm ci && npm test &&
npm run build && wrangler pages deploy`. Requires repo secrets
`CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.

Manual: `npm run deploy`.

## Data model notes

- **Card = a Linear project.** One today ("Student Driver Log"); the grid grows
  as DevWorks adds projects.
- **Kanban card = a top-level issue** (`parent == null`); its **direct children**
  are the sub-task checkboxes. Deeper nesting is collapsed — change this in
  `mapResponse` in `functions/lib/linear.ts` if you want Step-level detail promoted.
- **Health** uses Linear's `health` field when set, otherwise a heuristic
  (`deriveHealth` in `functions/lib/linear.ts`): `done` at 100%; `off_track` if
  past `targetDate` with open issues; `at_risk` if `targetDate` ≤ 7 days out and
  progress < 60%; else `on_track`. `healthSource` records which path was taken.
- Projects with status type `completed` / `canceled` are hidden.
- `projects(first: 50)` and `issues(first: 250)` are not paginated yet.
