# Setup Guide

This doc gets you from `git clone` to a running Career Ops dashboard in under 5 minutes. If something doesn't work, jump to [Troubleshooting](#troubleshooting) at the bottom.

## What you'll have when you're done

- A SvelteKit dashboard running at `http://localhost:5173` with a passkey-protected login
- Your first user account (auto-promoted to `owner` role)
- (Optional) Native apps for macOS / Windows / Linux / iOS / Android / Apple Watch
- (Optional) GitHub Secrets staged so CI can release signed builds

---

## Prerequisites

You need these installed once, system-wide:

| Tool | Why | Install |
|---|---|---|
| **mise** | Runtime version manager — gives you the exact Node / pnpm / Ruby this repo expects | `brew install mise` then add `eval "$(mise activate zsh)"` to your shell rc |
| **git** | Source control | `brew install git` or system package manager |
| **gh** | GitHub CLI — used by `pnpm setup:native` to push secrets | `brew install gh` then `gh auth login` |
| **docker** (or OrbStack) | Only for `pnpm act:*` local CI runs | [docker.com](https://docker.com) or `brew install --cask orbstack` |
| **Xcode** (macOS only) | iOS / Watch builds | Mac App Store + `xcode-select --install` |
| **An AI CLI** | Powers the agent flows | [Claude Code](https://docs.claude.com/en/docs/claude-code/quickstart) (default); OpenCode / Gemini / Codex / Qwen / Copilot work via `AGENT_CLI=<bin>` |

**Why mise?** It pins Node 26.1.0 + pnpm 11.1.0 + Ruby 3.3.5 per-repo so contributors don't need to remember to switch versions. Just `cd career-ops` and you're on the right ones.

---

## 1. Clone + install

```sh
gh repo clone kaelys-js/career-ops
cd career-ops

# mise installs the pinned Node + pnpm + Ruby versions
mise install

# Workspace install — pnpm only (npm/yarn/bun are refused by preinstall guard)
pnpm install
```

The `pnpm install` step runs `lefthook install` automatically, so git hooks fire from your next commit.

## 2. Boot the dashboard

```sh
pnpm dev
```

Opens at `http://localhost:5173`. You'll see a passkey signup form. Sign up — the first user is auto-promoted to `owner`.

Onboarding flow runs once: upload your CV → fill out `profile.yml` answers → import portals → start scanning.

## 3. Verify everything works

```sh
pnpm verify:cached          # all verifiers, turbo-cached (~5s cold, <200ms warm)
```

Should print `verify-pipeline green · verify-capacitor green (344/0) · verify-multi-user green (138/0)`.

If anything's red, see [Troubleshooting](#troubleshooting).

## 4. (Optional) Set up native apps

```sh
pnpm setup:native           # one-shot interactive wizard
```

This walks you through:

1. Tooling check (`gh`, `cocoapods`, `bundler`, `fastlane`) and installs anything missing.
2. Apple Developer credentials:
   - **Apple ID** + **Team ID** (paste)
   - **App Store Connect API key** — opens [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → you create the key → paste the .p8 contents
3. Mac code-signing cert:
   - Opens Keychain → you pick your "Developer ID Application" cert → exports to `.p12` with a password you choose
4. Saves everything to `~/.career-ops/native-env` (mode 0600 — readable by you only).
5. Pushes the same values to your repo's GitHub Secrets via `gh secret set` so CI can sign + upload.
6. Generates the iOS Xcode targets (Widget, LiveActivity, ShareExtension).

Re-runnable: it skips steps that are already complete.

### Verify native is wired

```sh
pnpm doctor:native          # exit 0 if all 9 GitHub Secrets configured
pnpm doctor:native --strict # also fail on warnings
```

If `pnpm doctor:native` exits non-zero, you'll get a list of missing pieces with their exact fix.

## 5. (Optional) Live native dev

```sh
pnpm dev:desktop            # Electron live-reload — auto-restarts on src change
pnpm dev:ios                # Capacitor sync + Xcode auto-open
```

Production builds (locally — CI does the signed ones):

```sh
pnpm build:desktop          # → ui/electron/dist/{*.dmg, *.exe, *.AppImage}
pnpm build:ios              # → TestFlight via fastlane (needs setup:native done)
```

## 6. (Optional) Run CI locally with `act`

You don't need to push to verify CI works:

```sh
pnpm act:test               # full Tests workflow inside a docker container
pnpm act:test:dry           # YAML + action-resolution check only (~5s)
```

First `act:test` pulls a ~1GB image; subsequent runs reuse it. Configure via `.actrc` and `.env.act` (template in `.env.act.example`).

---

## Backend discovery — what just happened?

Native apps don't have a hard-coded server URL. At launch they probe:

1. **Embedded** — Electron spawns the dashboard as a child process
2. **Dev server** — `http://localhost:5173` if `pnpm dev` is running
3. **mDNS** — finds your desktop on the same Wi-Fi via `_career-ops._tcp`
4. **Tailscale** — finds your instance over the tailnet
5. **Remote** — falls back to a configured URL

So your phone + watch + laptop all reconcile to whichever instance is reachable. No configuration. The first time you open the iOS app on the same network as a running `pnpm dev`, it'll find it via mDNS and remember the address.

---

## Troubleshooting

### `Wrong package manager: npm` on install

You ran `npm install` or `yarn install`. This repo refuses anything except pnpm.

```sh
brew install pnpm           # or use mise: mise install
pnpm install
```

### `mise install` fails downloading Node

mise downloads precompiled binaries from `nodejs.org`. Check your network, then retry with `MISE_LOG_LEVEL=debug mise install`.

### svelte-check errors on first run

The SvelteKit generated tsconfig hasn't been emitted yet:

```sh
cd ui && pnpm exec svelte-kit sync
cd .. && pnpm check
```

### Dashboard returns 401 immediately on every API call

Either you're not logged in, or your session cookie expired. Sign out + sign in again.

If you're trying to run the dashboard with `BETTER_AUTH_SECRET` set to a short string (< 32 chars), Better Auth refuses. Either unset it (it auto-generates one) or set it to a long random string.

### `verify:capacitor` red on `icon.icns missing`

Icons are gitignored generated artefacts. Regenerate:

```sh
pnpm brand:apply --force    # forces icon re-render
```

On Linux you need `apt-get install imagemagick icnsutils`. On macOS `iconutil` is built in.

### `setup:native` fails on `gh secret set`

`gh` isn't authed for the right account. Check:

```sh
gh auth status              # should show kaelys-js (your fork owner)
gh secret list              # should list current secrets
```

If you have multiple accounts, `gh auth switch` to the right one.

### Tag push hangs / blocked on pre-push hook

Pre-push runs `pnpm doctor:native` for `v*.*.*` tags. If it complains about missing GitHub Secrets, run `pnpm setup:native` first. Emergency override:

```sh
SKIP_LEFTHOOK=1 git push --tags
```

### `pnpm dev` port 5173 already in use

Either you have another vite running, or 5173 is taken by a different app. Change in `ui/vite.config.ts` (`server.port`) or kill the other process.

### Native apps can't find the backend

Check both ends:

```sh
# Desktop running?
curl http://localhost:5173/api/health

# mDNS announced?
dns-sd -B _career-ops._tcp local.    # press Ctrl+C after seeing your machine
```

If mDNS isn't broadcasting, your Wi-Fi might block multicast (rare). Set the LAN URL manually in the iOS app's Settings tab.

### Where's the data stored?

`data/` (gitignored):

- `data/auth.db` — sessions, passkeys, invite codes
- `data/app.db` — profiles, activity, issues, ui-prefs
- `data/users/{userId}/profiles/{slug}/` — your per-user CV / applications / reports / generated CVs

Backup: just snapshot `data/` (`tar czf backup.tgz data/`). Restore: extract back.

---

## Next steps

- Read the main [README](../README.md) for architecture + commands.
- Browse [docs/](.) for deeper docs (autopilot, autonomous apply, multi-user RBAC, …).
- File issues at [github.com/kaelys-js/career-ops/issues](https://github.com/kaelys-js/career-ops/issues).
- Discord: [discord.gg/8pRpHETxa4](https://discord.gg/8pRpHETxa4).
