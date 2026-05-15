# `ui/` — Career Ops SvelteKit workspace

The main app workspace. SvelteKit 2 + Svelte 5 + Better Auth + Drizzle ORM,
wrapped via Capacitor 8 for iOS / Android and Electron 39 for macOS / Windows
/ Linux, plus a watchOS companion + 4 iOS widgets.

See the root [README](../README.md) for the project overview, repo layout,
release flow, and CI matrix. **This README only covers what's specific to the
`ui/` workspace.**

## Layout

```
ui/
├── src/
│   ├── routes/                # File-based routing (pages + API endpoints)
│   │   ├── api/               # 100+ /api/* endpoints — wrap()-helper envelope
│   │   ├── job/[id]/          # Job detail page
│   │   ├── inbox/             # Issues + notifications
│   │   ├── autopilot/, profile/, settings/, … # Domain pages
│   │   └── +layout.svelte     # Topbar + AppSidebar + ConnectionBanner
│   ├── lib/
│   │   ├── server/            # Server-only — auth, db, parsers, jobs, orchestrator
│   │   │   ├── db/            # Drizzle schema + migrations + better-sqlite3
│   │   │   ├── jobs/          # Autopilot background tasks (apply-queue, scan-vc, …)
│   │   │   └── *              # auth.ts, profile.ts, modes.ts, skills.ts, …
│   │   ├── client/            # Client-only (brand, capacitor plugins, safe-markdown)
│   │   ├── components/        # Svelte 5 components ($state runes + snippets)
│   │   ├── config/            # branding.ts + cli.ts (single sources of truth)
│   │   ├── hooks/             # use-is-mobile, etc.
│   │   ├── integration/       # Vitest integration suite (replaces verify-*.mjs)
│   │   └── test-helpers/      # render, msw-handlers, state-helpers, fs-fixtures
│   ├── hooks.server.ts        # Auth guard + security headers + CSP
│   ├── test-setup.ts          # Vitest setup (MSW + jest-dom + matchMedia + IDB)
│   └── app.html
├── static/                    # PWA manifest, icons, robots.txt
├── ios/                       # Capacitor iOS app + Watch + 3 extensions
├── android/                   # Capacitor Android app
├── electron/                  # Capacitor-Electron shell (its own workspace)
├── vitest.config.ts           # Single-config gate
├── vitest.workspace.ts        # 5 projects: ui-unit / ui-server / ui-component
│                              # (browser-mode Chromium+WebKit) / ui-routes / ui-integration
└── package.json
```

## Workspace-scoped commands

These run only inside `ui/`. Most users invoke them via the root `pnpm <name>`
which delegates through turbo.

```sh
pnpm -C ui dev                  # SvelteKit dev server, port 5173
pnpm -C ui build                # adapter-node + adapter-static outputs
pnpm -C ui test                 # full Vitest matrix (5 projects)
pnpm -C ui test:watch           # interactive watcher
pnpm -C ui test:ui              # @vitest/ui browser inspector
pnpm -C ui test:coverage        # V8 coverage report
pnpm -C ui exec svelte-check    # type/template diagnostics
pnpm -C ui exec prettier --check "**/*.svelte" --ignore-path ../.prettierignore
```

From repo root, the same commands are exposed as `pnpm dev`, `pnpm build`,
`pnpm test`, etc. (see [root README](../README.md) for the full table).

## Stack notes specific to this workspace

- **Better Auth** with passkey + email/password + invite-code flows. Cookie
  attributes (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` env-gated).
  Rate-limited on `/sign-in/email`, `/forget-password`.
- **Drizzle ORM** over `better-sqlite3`. Two DBs: `data/auth.db`
  (sessions, passkeys, invite codes, audit log, pending deletions) and
  `data/app.db` (profiles, activity_events, issues, ui_prefs).
  Schemas in `src/lib/server/db/{auth,app}.schema.ts`.
- **AsyncLocalStorage user context** — every server endpoint sets
  `currentUserId()` via `hooks.server.ts:populateAuth` then `withUserContext`
  scopes every Drizzle read to that user. No endpoint accepts a raw
  `userId` param, so cross-user IDOR is structurally impossible.
- **`wrap()` helper** (`src/lib/server/api-helpers.ts`) — every API endpoint
  uses it for try/catch + JSON envelope (`{ ok: true, ... }` /
  `{ ok: false, error: { message, code, details } }`).
- **Capacitor 8** with custom native plugin `CareerOpsNativePlugin`. Bridge
  defined in `src/lib/client/native-plugin.ts`. iOS Swift side under
  `ios/App/App/CareerOpsNativePlugin.swift`.
- **Backend discovery** (native apps) — `src/lib/client/backend-discovery.ts`
  probes embedded → localhost → mDNS (`_career-ops._tcp`) → Tailscale →
  user-configured remote, in that order, with deduped in-flight promises
  and a TTL cache.

## Testing

Five Vitest projects in `vitest.workspace.ts`:

| Project | Environment | Glob | What's tested |
|---|---|---|---|
| `ui-unit` | jsdom | `src/lib/**/*.test.ts` (excl. server/component) | Pure functions, $state stores, validators, utils |
| `ui-server` | node | `src/lib/server/**/*.test.ts` + `src/routes/api/**/*.test.ts` + `src/hooks.server.test.ts` | Server modules + API endpoints + middleware |
| `ui-component` | browser (Playwright Chromium + WebKit) | `src/**/*.component.test.ts` | Mounted Svelte components |
| `ui-routes` | jsdom | `src/routes/**/*.test.ts` (excl. api) | Page-level smoke |
| `ui-integration` | node | `src/lib/integration/**/*.integration.test.ts` | Replaces legacy verify-pipeline / verify-capacitor / verify-multi-user / verify-apply / verify-backup / verify-cleanup / verify-deep-links / verify-post-apply / verify-versions |

DB-isolation: every test process gets a tmpdir DB via `CAREER_OPS_DATA_DIR`
auto-set in `test-setup.ts`. The production `data/auth.db` and `data/app.db`
are never touched by the test matrix.

## Native sub-targets

- `ios/App/App/` — main iOS app (Capacitor WebView + Native Plugin + Spotlight indexer)
- `ios/App/CareerOpsWatch/` — standalone watchOS app
- `ios/App/CareerOpsWidget/` — 4 widgets (pipeline / next-interview / top-apply / inbox-issues)
- `ios/App/CareerOpsLiveActivity/` — Live Activity for interview countdowns
- `ios/App/CareerOpsShareExtension/` — share-sheet receiver for "Save to career-ops"
- `android/` — Capacitor Android wrapper + Brand.kt
- `electron/` — Capacitor-Electron workspace (its own `package.json`)

## See also

- Root [README](../README.md) — project overview + repo layout
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — system diagram + data flow
- [docs/TESTING.md](../docs/TESTING.md) — full testing strategy across TS + iOS
- [docs/WATCH.md](../docs/WATCH.md) — Apple Watch + widget specifics
- [docs/native.md](../docs/native.md) — native-build command cheat-sheet
- [AGENTS.md](../AGENTS.md) — AI-CLI runtime brief (data contract, mode routing)
