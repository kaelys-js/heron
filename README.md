<div align="center">

# Career Ops

**Run your job search like a product launch.**

[![Tests](https://github.com/kaelys-js/career-ops/actions/workflows/test.yml/badge.svg)](https://github.com/kaelys-js/career-ops/actions/workflows/test.yml)
[![CodeQL](https://github.com/kaelys-js/career-ops/actions/workflows/codeql.yml/badge.svg)](https://github.com/kaelys-js/career-ops/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![pnpm](https://img.shields.io/badge/pnpm-11.1.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A526.1.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.59-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.3-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![Electron](https://img.shields.io/badge/Electron-39.8-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![Better Auth](https://img.shields.io/badge/Better_Auth-1.6-000)](https://www.better-auth.com)

**Multi-user · self-hosted · runs on every platform you own.**

[Quickstart](#quickstart) ·
[What's in the box](#whats-in-the-box) ·
[Architecture](#architecture) ·
[Development](#development) ·
[Releasing](#releasing) ·
[Acknowledgements](#acknowledgements)

</div>

---

## What Career Ops is

A self-hosted job-search platform that does the boring stuff while you sleep:

- **Evaluates offers** — A-G scoring (role match, CV match, level strategy, comp, personalisation, interview prep, posting legitimacy)
- **Tailors CVs** — generates one PDF per job, keyword-injected, kept under 2 pages
- **Scans portals** — Greenhouse, Ashby, Lever, Workable, Personio, SmartRecruiters, Recruitee, Teamtailor, Workday, Indeed, LinkedIn — zero token cost on portal scrape (direct API hits)
- **Drafts everything** — cover letters, outreach DMs, interview prep briefs, negotiation scripts, follow-up cadence
- **Autonomous-applies** (opt-in, per profile) — fills LinkedIn Easy Apply / Greenhouse / Ashby forms, falls back to `ManualApplyNeeded` Issues on CAPTCHA / unknown questions / anti-bot
- **Surfaces issues** — every silent failure becomes an actionable Inbox card with a one-click fix CTA

**Multi-user from day one.** Better Auth + passkeys + per-user data segregation. Run one instance for yourself, share it with your partner, or self-host for a few friends — every user gets their own profiles, applications, CVs, and inbox.

**Cross-platform native.** SvelteKit dashboard wrapped via Capacitor 8 for iOS / Android, Electron 39 for macOS / Windows / Linux, plus a watchOS companion + 4 iOS widgets.

> [!IMPORTANT]
> Career Ops is a **filter**, not a spray-and-pray cannon. The default policy blocks autonomous-applies below score 4.0/5 and caps daily applies. You'll send fewer applications, not more.

---

## Quickstart

> [!NOTE]
> **Prerequisites** (you only need these once):
> - **mise** — runtime manager (`brew install mise` or [install guide](https://mise.jdx.dev/getting-started.html))
> - **git**, **gh**, **docker** — typical macOS dev kit (Linux + WSL work too)
> - **An AI CLI** — [Claude Code](https://docs.claude.com/en/docs/claude-code/quickstart) is the default; OpenCode / Gemini / Codex / Qwen / Copilot all work via `AGENT_CLI=<bin>`

### 1. Clone + set up

```sh
gh repo clone kaelys-js/career-ops
cd career-ops

# mise installs the exact Node + pnpm + Ruby versions this repo expects
mise install

# Install workspace deps (pnpm only — npm/yarn/bun are refused by preinstall guard)
pnpm install
```

### 2. Run the dashboard

```sh
pnpm dev
# → http://localhost:5173
```

First boot triggers the onboarding flow: passkey signup → upload CV → tweak profile YAML → start scanning.

### 3. Optional: native apps

```sh
# One-shot interactive wizard — sets up Apple credentials, generates icons,
# stages GitHub Secrets for CI release builds.
pnpm setup:native

# Live dev (boots simulator/emulator, builds, installs, launches, hot-reloads):
pnpm dev:desktop          # Electron shell — macOS / Windows / Linux
pnpm dev:ios              # iOS Simulator (boots newest iPhone, cap run ios)
pnpm dev:android          # Android Emulator (boots newest AVD, cap run android)
pnpm dev:apple-watch      # watchOS Simulator (xcodebuild + simctl install)

# Production builds:
pnpm build:desktop        # → ui/electron/dist/{DMG, .exe, .AppImage, .deb}
pnpm build:desktop:fast   # → single-arch DMG only (3-5 min vs full release)
pnpm build:ios            # → TestFlight via fastlane (Watch app ships in same archive)
```

### 4. Verify everything is green

```sh
pnpm test                  # full Vitest matrix (~30s on a warm cache)
pnpm doctor:native         # checks GitHub Secrets configured for release
pnpm act:test              # runs the Tests workflow in a local docker container
```

---

## What's in the box

| Layer | Tech | Notes |
|---|---|---|
| **Dashboard UI** | SvelteKit 2.59 + Tailwind 4 + bits-ui + Svelte 5 runes | Mobile-first responsive |
| **Auth** | Better Auth 1.6 + passkey + GitHub OAuth + invite codes | Multi-user, RBAC (owner/admin/member) |
| **DB** | Drizzle ORM + better-sqlite3 12.9 (WAL mode) | Two files: `auth.db` + `app.db` |
| **AI** | Anthropic SDK + Google Gemini SDK + any CLI via `AGENT_CLI` | Routes through your Max plan via `claude -p` |
| **Portal scrape** | Playwright 1.59 + direct ATS APIs | Zero token cost on the scan |
| **Native — desktop** | Electron 39 + electron-builder 26 + electron-updater 6 | Auto-updates via Squirrel/Mac, Squirrel.Windows, AppImageUpdate |
| **Native — mobile** | Capacitor 8 (iOS + Android) + Swift Package Manager | Same SvelteKit codebase, native APIs via plugins |
| **Apple Watch** | WKApplication + WCSession + WidgetBundle | Reads from App Group UserDefaults |
| **iOS Widgets** | 4 widgets (pipeline stats / next interview / top apply / inbox issues) | WidgetKit timeline entries |
| **Build** | mise + pnpm 11 workspace + turborepo + biome + lefthook | Sub-second warm CI thanks to turbo cache |
| **CI** | GitHub Actions on Node 24 actions, Node 26.1 for the app | `act` for local runs |
| **Release** | release-please (Conventional Commits) + fastlane (ASC API key) | One commit ⇒ one release ⇒ TestFlight + GitHub Release artefacts |

### Repository layout

```
career-ops/
├── README.md                    # ← you are here
├── CHANGELOG.md                 # Release-Please-managed
├── AGENTS.md                    # Runtime brief for any agent-skill-standard CLI
├── CLAUDE.md                    # 2-line pointer → AGENTS.md
├── GEMINI.md                    # Gemini-specific slash-command table + pointer
├── LICENSE
│
├── ui/                          # SvelteKit dashboard (workspace)
│   ├── src/
│   │   ├── routes/              # Pages + API endpoints (file-based routing)
│   │   ├── lib/
│   │   │   ├── server/          # Server-only (auth, db, parsers, jobs, …)
│   │   │   ├── client/          # Client-only (brand, capacitor plugins, safe-markdown)
│   │   │   └── components/      # Svelte 5 components
│   │   └── hooks.server.ts      # Auth guard + security headers + CSP
│   ├── static/                  # PWA manifest, icons, robots.txt
│   ├── ios/                     # Capacitor iOS app + Watch + 3 extensions
│   ├── android/                 # Capacitor Android app
│   └── electron/                # Capacitor-Electron shell (workspace)
│
├── .github/                     # Community profile + 11 workflows
│   ├── CODE_OF_CONDUCT.md
│   ├── CONTRIBUTING.md
│   ├── SECURITY.md
│   ├── SUPPORT.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
│
├── docs/                        # All long-form documentation
│   ├── ARCHITECTURE.md          # System diagram + flows
│   ├── SETUP.md, TESTING.md, WATCH.md, SCRIPTS.md, …
│   ├── DATA_CONTRACT.md         # System vs user layer rules
│   ├── GOVERNANCE.md            # BDFL + contributor ladder
│   ├── CONTRIBUTORS.md, LEGAL_DISCLAIMER.md, TRADEMARK.md
│   ├── native.md, prettier.md
│   └── archive/                 # Finished plan snapshots
│
├── branding/
│   ├── brand.json               # SINGLE SOURCE OF TRUTH for all branding
│   └── logo.svg                 # SINGLE SOURCE OF TRUTH for all icons
│
├── scripts/
│   ├── clean.mjs, reset-data.mjs, ensure-pnpm.mjs, ensure-native-bindings.mjs
│   └── native/                  # apply-brand, setup, doctor, build, dev wizards
│       └── icons/               # generate-icons.mjs + _build/ cache
│
├── modes/                       # AI skill modes (oferta, apply, scan, batch, … + de/fr/ja/pt/ru/)
├── templates/                   # CV HTML + LaTeX templates, states.yml, portals.example.yml, fonts/
├── batch/                       # Headless batch evaluation runner
├── examples/                    # Sample CVs, profile.example.yml, sample-report.md, dual-track/
├── writing-samples/             # User's portfolio writing (per-profile, gitignored content)
│
├── data/                        # Per-user runtime state (gitignored)
│   ├── auth.db                  # Sessions, passkeys, invites, audit log
│   ├── app.db                   # Profiles, activity, issues, ui_prefs
│   └── users/{userId}/profiles/{slug}/   # Per-user content tree
│
├── interview-prep/, output/, reports/, jds/   # Runtime symlink targets (managed by dashboard)
├── config/                      # User profile.yml (gitignored, auto-created by symlink mgr)
│
├── *.mjs / *.py                 # ~49 root-level CLI scripts spawned by ui/ and turbo
├── .mise.toml                   # Pinned Node 26.1.0 + pnpm 11.1.0 + Ruby 3.3.5 + Python 3.13
├── pnpm-workspace.yaml          # Workspace + allowBuilds + overrides
├── turbo.json                   # Cache config for build / check / test
├── lefthook.yml                 # Pre-commit + pre-push hooks
└── biome.json                   # Format-only config (no linting — svelte-check covers it)
```

---

## Architecture

### Multi-user, multi-profile

Each user owns one or more **profiles** (separate career identities: e.g. "AI Engineer search" vs "Engineering Manager search"). Profiles are scoped at the SQL layer via `currentUserId()` AsyncLocalStorage context — no API endpoint accepts a raw `userId` param, so cross-user IDOR is structurally impossible.

```
auth.db: users, sessions, passkeys, invite_codes, accounts, audit_log, pending_deletions
app.db:  profiles, activity_events, issues, ui_prefs
fs:      data/users/{userId}/profiles/{slug}/{cv.md, profile.yml, applications.md, reports/, output/, ...}
```

The Claude CLI reads per-user content files directly from the filesystem (legacy upstream design); user separation is enforced by the per-user path prefix.

### Backend discovery (native apps)

Native apps don't have a hard-coded server URL. At launch they probe in order:

1. **Embedded** — Electron spawns the SvelteKit server as a child process
2. **Dev server** — `http://localhost:5173` if running `pnpm dev`
3. **mDNS (`_career-ops._tcp`)** — finds your desktop instance on the same Wi-Fi
4. **Tailscale magic-DNS** — finds your instance over the tailnet
5. **Remote** — falls back to a user-configured URL

So your phone, watch, and laptop reconcile to whichever instance is reachable, without you configuring anything.

### Security posture

- **Better Auth** with explicit cookie attributes (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` env-gated on HTTPS)
- **Rate limiting** on auth endpoints (5 req/min on `/sign-in/email`, 3 on `/forget-password`, etc.)
- **CSP** with hash-mode (`unsafe-inline` blocked on scripts), `frame-ancestors 'none'`, restricted `connect-src`
- **DOMPurify** sanitises every `{@html ...}` render (markdown from AI / job descriptions is attacker-influenced)
- **Path-traversal guards** on every per-user file read (avatar, profile, CV)
- **Audit log** on every state-changing API hit (account-deletion, role-change, backup, etc.)
- **27 verifier sections** (138 tests) covering auth guard, RBAC, IDOR, session expiry, cookie attributes, rate-limit shape, etc.

### Open-redirect, XSS, IDOR — covered

| Class | Mitigation | Verifier section |
|---|---|---|
| Open redirect | `safeRedirectTo()` rejects protocol-relative / absolute / control-char URLs | n/a (compile-time) |
| XSS via markdown | `renderMarkdown()` in `safe-markdown.ts` runs `marked.parse → DOMPurify.sanitize` with strict tag allowlist | n/a (compile-time) |
| CORS abuse | `/api/answer-form` only accepts 17 known ATS origins | n/a (compile-time) |
| IDOR via `?profile=<slug>` | SQL filters scope by user_id; slug collisions across users return only the caller's row | §27 |
| Session hijack via stolen cookie | FK cascade on `users` → `sessions` invalidates immediately | §26 |
| Avatar enumeration | `readAvatar()` validates path under `data/avatars/{userId}/` + `realpath` escape check | §23 |

---

## Development

### Daily commands

```sh
pnpm dev                    # SvelteKit dev server (vite + HMR)
pnpm check                  # svelte-check + tsgo (electron), turbo-cached
pnpm format                 # biome + prettier-svelte, in-place
pnpm test                   # full Vitest matrix (unit + server + browser-mode + integration + electron)
pnpm act:test               # run the Tests workflow locally via docker
```

### Pre-commit / pre-push

`lefthook` is wired automatically by `pnpm install`. On commit it runs:

- `apply-brand` if any `branding/*` file is staged
- `biome-format` + `biome-format-check` (in place + verify)
- `prettier-svelte` + `prettier-svelte-check`
- `svelte-check` + `tsgo` (typecheck through turbo cache)
- `no-secrets` regex guard (Anthropic / GitHub PAT / AWS / Google / Slack / Stripe / OPENSSH)

On push:

- All of the above + the full Vitest matrix (`turbo run test --filter=ui --filter=electron`)
- `release-readiness` — if pushing a `v*.*.*` tag, runs `pnpm doctor:native` to verify GitHub Secrets exist before the tag hits origin

Bypass any hook with `SKIP_LEFTHOOK=1`. (Don't.)

### Running CI locally — `act`

You don't need to push to verify CI. After `brew install act` + docker running:

```sh
pnpm act:test               # full Tests workflow, same image as GitHub
pnpm act:test:dry           # YAML / action-resolution check, no exec
pnpm act:codeql             # CodeQL on javascript-typescript matrix
pnpm act:labeler            # PR label workflow
pnpm act:sbom               # SBOM generation
pnpm act:dependency-review  # PR dependency-review check
```

First `act:test` run pulls a ~1GB ubuntu-act image; subsequent runs reuse it. Config is in `.actrc`; secrets template in `.env.act.example`.

### TypeScript

- `ui/tsconfig.json` — strict mode + `noImplicitOverride` + `noFallthroughCasesInSwitch` + `forceConsistentCasingInFileNames`. Compiles via `tsgo` (the Rust port of `tsc`, ~10× faster).
- `ui/electron/tsconfig.json` — target ES2024, NodeNext module resolution. strict OFF because Capacitor's auto-generated `setup.ts` / `rt/electron-rt.ts` predate strictNullChecks.

### Working with branding

`branding/brand.json` + `branding/logo.svg` are the **only** files you edit when rebranding. Every consumer (`package.json` × 3, Capacitor configs × 2, electron-builder, Info.plist, Brand.swift × 4, brand.ts × 2, manifest.webmanifest, favicon, app icons, fastlane Appfile + Fastfile, etc.) is regenerated by:

```sh
pnpm brand:apply            # propagates brand.json → 30+ files
```

Pre-commit re-runs this automatically when you stage anything under `branding/`. The icon generator caches by SHA-256 of `logo.svg + size matrix`, so a no-op run is <100ms.

---

## Releasing

Releases are fully automated through [Conventional Commits](https://www.conventionalcommits.org) → [release-please](https://github.com/googleapis/release-please) → [native-release](https://github.com/kaelys-js/career-ops/blob/main/.github/workflows/native-release.yml).

| Commit prefix | Bump | Example |
|---|---|---|
| `feat: …` | minor (1.6.0 → 1.7.0) | `feat(scan): add Workable ATS adapter` |
| `fix: …` | patch (1.6.0 → 1.6.1) | `fix(auth): reject same-site=none in WebView` |
| `perf: …` | patch | `perf: cache /api/stats response` |
| `feat!: …` / `BREAKING CHANGE:` | major | `feat!: drop adapter-auto` |
| `chore:` / `docs:` / `refactor:` / `ci:` | (none) | `chore(deps): bump electron 39 → 39.8.10` |

### Flow

1. Merge a PR to `main` (squash-merge, one Conventional commit).
2. `release-please` accumulates commits into a long-lived "release PR" titled `chore(main): release X.Y.Z`.
3. Merge the release PR — `release-please` cuts the tag + generates `CHANGELOG.md` + creates the GitHub Release.
4. The tag push fires `native-release.yml`:
   - **`preflight` job** (NEW) verifies all 9 GitHub Secrets are configured. Fails fast with a clear remediation message if any are missing.
   - **`build-desktop`** runs on `macos-latest`, `ubuntu-latest`, `windows-latest` in parallel → `.dmg`, `.exe`, `.AppImage`
   - **`build-ios`** runs fastlane → TestFlight (App Store Connect API key auth)
5. All artefacts attach to the GitHub Release.

### One-time setup for releases

```sh
pnpm setup:native           # interactive wizard:
                            #   – Apple ID + Team ID
                            #   – App Store Connect API key (.p8)
                            #   – Mac + iOS code-signing certs (.p12)
                            #   – iOS provisioning profile (.mobileprovision)
                            #   – Pushes everything to GitHub Secrets via `gh secret set`

pnpm doctor:native          # verify all 9 secrets are configured
pnpm doctor:native --strict # exit non-zero on any warning too
```

Without this, the `preflight` job in `native-release.yml` will fail loudly on the first tag push.

### Manual release escape hatch

```sh
pnpm release patch          # cuts v1.6.1 immediately, bypasses release-please
pnpm release minor          # v1.7.0
pnpm release major          # v2.0.0
pnpm release 1.7.0-beta.1   # exact
```

---

## Verifiers

Three layers of verification, all turbo-cached:

| Command | What it checks | Wall time |
|---|---|---|
| `pnpm test` | Full Vitest matrix — unit + server + browser-mode (Chromium + WebKit) + integration + electron | ~30s warm, ~90s cold |
| `pnpm test --filter=ui-integration` | Integration suite only — pipeline-data hygiene, capacitor brand propagation, multi-user RBAC + IDOR + GDPR + auth flows | ~10s |
| `pnpm test:coverage` | Same matrix + V8 coverage report (70% lines / 65% branches floor) | ~45s |
| `pnpm test:ios` | Fastlane test_ci on macOS — XCTest + XCUITest + WidgetTests + WatchTests | ~15min |
| `pnpm exec svelte-check` | Type/template diagnostics across ui/ | ~17s |
| `pnpm doctor:native` | GitHub Secrets configured for native-release | ~3s |

### Test-failure → fix flow

```sh
pnpm test                                   # red? read the failure, fix, re-run
pnpm test --filter=ui-integration           # focus on integration (replaces legacy verify-pipeline + verify-multi-user)
pnpm test --filter=ui-unit                  # focus on pure-function unit tests
pnpm test:watch                             # interactive watcher for the file you're working on
```

If a brand-propagation test (`capacitor.integration.test.ts`) complains about missing icons → run `pnpm brand:apply` (regenerates `.icns`, `.ico`, all PWA + iOS + Android icon sets).

---

## CI / GitHub Actions

11 workflows under `.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `test.yml` | PR + push to main | Format check + svelte-check + tsgo + full Vitest matrix + build + pnpm audit |
| `native-release.yml` | tag push / dispatch / call | **preflight** (secret check) → desktop builds × 3 OS in parallel → iOS via fastlane |
| `release.yml` | push to main | release-please PR accumulation + cut |
| `codeql.yml` | PR + push + weekly | CodeQL on javascript-typescript |
| `dependency-review.yml` | PR | Block PRs that add vulnerable deps |
| `sbom.yml` | release | Anchore SBOM attached to release artefacts |
| `labeler.yml` | PR | Auto-label based on changed paths |
| `welcome.yml` | first issue / PR | Greet first-time contributors |
| `stale.yml` | weekly | Close stale issues / PRs |
| `sync-upstream.yml` | weekly / dispatch | Mirror santifer/career-ops into this fork |
| `testflight-keepalive.yml` | weekly | Rebuild & re-upload to TestFlight to keep the build under Apple's 90-day expiry |

Every action is on its latest Node-24-native major (no deprecation banner). Concurrency groups cancel in-flight PR runs; release runs never cancel mid-upload.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pnpm install` refused (`Wrong package manager`) | Use `pnpm`, not npm/yarn/bun. Install with `mise install` or `brew install pnpm`. |
| `mise: unknown setting` warnings | Run `mise install` to refresh tool versions, then `mise reshim`. |
| svelte-check fails on first run | `cd ui && pnpm exec svelte-kit sync` (regenerates `.svelte-kit/`) |
| `verify:capacitor` red on `icon.icns missing` | `pnpm brand:apply --force` (requires `iconutil` on macOS or `icnsutils` on Linux) |
| `act:test` complains about Apple Silicon images | The `.actrc` pins `linux/amd64` for portability; Rosetta runs it transparently |
| Better Auth signup returns 422 | `BETTER_AUTH_SECRET` env var needs to be ≥ 32 characters |
| Native release CI red on `preflight` | `pnpm setup:native` then `pnpm doctor:native` |
| GitHub Pro features missing (branch protection, secret scanning, rulesets, PVR) | Make the repo public OR upgrade to GitHub Pro ($4/mo) |

For anything else: open a [Discussion](https://github.com/kaelys-js/career-ops/discussions) or jump into [Discord](https://discord.gg/8pRpHETxa4).

---

## Acknowledgements

Career Ops is a hard fork of [`santifer/career-ops`](https://github.com/santifer/career-ops) — the original CLI-driven job-search system [santifer](https://santifer.io) built and used to evaluate 740+ offers, generate 100+ tailored CVs, and land a Head of Applied AI role. His [case study](https://santifer.io/career-ops-system) is required reading if you want to understand the philosophy (filter, not cannon).

This fork adds:

- Multi-user system + RBAC + GDPR-compliant lifecycle
- SvelteKit + Better Auth + Drizzle dashboard (replaces the original Go TUI)
- Capacitor 8 native apps (iOS / Android / desktop / Apple Watch)
- 4 iOS widgets + Live Activity
- Autonomous-apply pipeline (LinkedIn / Greenhouse / Ashby in production; 8 portals stubbed)
- act-based local CI verification
- Native-release preflight gate (`pnpm doctor:native`)
- 138-test multi-user behavioural verifier
- 0-CVE supply chain (pnpm overrides + Electron 39)

Upstream READMEs (i18n translations of the original CLI flow) are still in this repo as `README.{es,pt-BR,ko-KR,ja,ru,cn,zh-TW}.md`. They describe the upstream system; for the multi-user fork's onboarding, this English README is canonical.

## License

[MIT](LICENSE). Original work © santifer. This fork © resist.js.

See [TRADEMARK.md](docs/TRADEMARK.md) for trademark policy and [GOVERNANCE.md](docs/GOVERNANCE.md) for contribution governance.
