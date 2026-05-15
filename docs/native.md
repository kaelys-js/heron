# Heron native apps

You should not need to read this file. The commands are:

```bash
pnpm native                # menu of every native command
pnpm setup:native          # one-time interactive setup (runs once, walks you through everything)

pnpm dev                   # web only
pnpm dev:desktop           # Electron window + HMR (macOS / Windows / Linux)
pnpm dev:ios               # iPhone simulator: boots, builds, installs, launches, HMR
pnpm dev:android           # Android emulator: boots, builds, installs, launches, HMR
pnpm dev:apple-watch       # Apple Watch simulator: xcodebuild + simctl install + launch

pnpm build:desktop         # local DMG / .exe / .AppImage / .deb (full release)
pnpm build:desktop:fast    # single-arch DMG only (3-5 min)
pnpm build:ios             # upload to TestFlight (Watch app ships in same archive)
pnpm icons                 # regenerate all platform icons

pnpm release patch         # bump version + tag + push → CI builds everything
pnpm release minor
pnpm release major
pnpm release 1.7.3         # explicit version
```

Each maps to a script under `scripts/native/`.

## First-time setup — what `pnpm setup:native` does

Interactive wizard, ~5 minutes:

1. Checks tooling (gh, Xcode, CocoaPods, Bundler, Homebrew). Offers to install anything missing via `brew install`.
2. Verifies `gh auth status`; runs `gh auth login` if needed.
3. Prompts for Apple Developer identifiers — `APPLE_ID`, `APPLE_TEAM_ID`. Stored to `~/.heron/native-state.json` for re-runs.
4. Opens `appleid.apple.com` in your browser; you generate an App-Specific Password named "heron CI" and paste it. The wizard masks the input.
5. Opens `appstoreconnect.apple.com`; you create an App Store Connect API key (App Manager role), download the `.p8`, the wizard asks for its path and reads it.
6. Lists code-signing identities in your Keychain via `security find-identity`. Picks the first `Developer ID Application` cert, asks you to set an export password, exports to `.p12` via `security export`.
7. Writes everything to `~/.heron/native-env` (mode 600) so local builds (`pnpm build:desktop`, `pnpm build:ios`) can sign.
8. Pushes the same values to GitHub Actions secrets via `gh secret set` so CI can sign.
9. Runs `scripts/native/add-xcode-targets.rb` to programmatically add the 3 Xcode extension targets (Widget, Live Activity, Share Extension) using the `xcodeproj` Ruby gem. No Xcode dialogs.

Safe to re-run — re-prompts only for missing/stale values, otherwise reuses what's stored.

## Release flow (after setup)

```bash
pnpm release patch
```

That command:
1. Verifies clean working tree.
2. Bumps `package.json` + `ui/electron/package.json`.
3. Commits `release: vX.Y.Z`, tags `vX.Y.Z`, pushes.
4. GitHub Actions (`native-release.yml`) picks up the tag:
   - 3-OS matrix: builds DMG (macOS, signed + notarized), .exe (Windows), .AppImage + .deb (Linux). Uploads to GitHub Release.
   - macOS-only iOS job: builds, signs, uploads to TestFlight via Fastlane.
5. Opens the Actions page in your browser, streams the build logs.

Auto-update on the desktop side is wired (electron-updater + GitHub Releases). TestFlight notifies your testers automatically. The 60-day TestFlight keepalive cron (`testflight-keepalive.yml`) regenerates iOS builds before expiry without any manual action.

## Architecture (the spine)

The app finds its backend at runtime — same Capacitor binary works against:
- Vite dev server (`pnpm dev`)
- Embedded Node server in the installed desktop app
- Your Mac discovered via Bonjour on the same wifi
- Tailscale hostname when you're remote
- Any user-configured remote URL

A `DEV / PROD / LAN / TAILSCALE / REMOTE` pill in the topbar shows the live source. Click to override.

## What's where

| Need | Read |
|---|---|
| Run a command | `pnpm native` — print all options + current status |
| Add a new one-shot script | `scripts/native/_lib.mjs` for the helpers, then mirror an existing script |
| Debug a build failure | `pnpm test -- capacitor.integration` (brand + native consistency checks) |
| Understand resolver | `ui/src/lib/client/backend-discovery.ts` |
| Understand notification routing | `ui/src/lib/client/sse-notifications-bridge.ts` |
| Tweak the AppMenuBar | `ui/electron/src/app-menu.ts` |
| Tweak the system tray | `ui/electron/src/tray.ts` |
| Add an iOS feature | `ui/ios/App/App/CareerOpsNativePlugin.swift` + JS wrapper in `ui/src/lib/client/native-bridge.ts` |
| Change CI build flow | `.github/workflows/native-release.yml` |

That's it. `pnpm native` is the menu, `pnpm setup:native` is the one-time setup, everything else is one command.
