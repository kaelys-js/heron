# career-ops native apps — usage

This is the operating manual for the desktop (macOS / Windows / Linux) and iOS apps. Everything you need to know to develop against, build, install, and use the native targets.

## TL;DR — how it just works

Open the desktop app or iOS app. It auto-finds the career-ops backend in this order:

1. **Embedded** — the desktop production build runs its own Node server inside the app. Nothing to configure.
2. **Dev** — if you ran `pnpm dev` locally, the desktop app finds `localhost:5173` automatically.
3. **LAN** — your iPhone on the same wifi finds the desktop app via mDNS Bonjour browsing.
4. **Tailscale** — phone off your home network connects to your Mac via Tailscale magic-DNS (configurable in `/settings/backend`).
5. **Remote** — last-resort production URL (configurable in `/settings/backend`).

The current source is shown as a `DEV / PROD / LAN / TAILSCALE / REMOTE` pill in the top bar. Click it to override manually.

---

## Daily dev loop

You run **one** of these depending on what you're working on:

### Web only (existing flow — unchanged)
```bash
cd ui
pnpm dev
```
Open http://localhost:5173. Hot reload, no native build required. Same as before.

### Desktop app, dev mode (HMR works inside Electron)
```bash
cd ui
pnpm dev                       # terminal 1 — Vite dev server
cd ui/electron
npm run electron:start-live    # terminal 2 — Electron window
```
The Electron window opens, the WebView loads `localhost:5173`, hot reload of Svelte components works exactly like in the browser. Use this when you're changing UI.

### Desktop app, prod-build mode
```bash
cd ui
CAPACITOR=1 PUBLIC_CAPACITOR_BUILD=1 pnpm build   # static shell for WebView
pnpm build                                         # node server (default)
node ../native/icons/generate-icons.mjs            # if you changed the icon
pnpm exec cap sync electron
cd electron
npm install
npm run electron:start
```
This embeds the Node server inside the Electron process. Closer to what users see. Use this to test the final UX before shipping.

### iOS simulator, points at your Mac's dev server
```bash
cd ui
pnpm dev                       # terminal 1 — Vite dev on the Mac
pnpm exec cap sync ios         # terminal 2 — push current changes to ios/
cd ios/App
pod install                    # first run only
open App.xcworkspace           # opens Xcode → Cmd+R to run on sim
```
The iOS app launches in the simulator, discovers `localhost:5173` (when sim is on the same machine), and you get the full app. SSE works. Notifications work in-foreground.

### iOS on a real phone (must be on same wifi as your Mac)
Same as above, but plug in your phone, set the build target to your phone, and run. The first time you'll see a "Local Network" permission prompt — accept it. The app then discovers your Mac via Bonjour.

---

## Building for distribution

### Desktop — DMG / .exe / .AppImage

Local build (your machine only):
```bash
cd ui
CAPACITOR=1 PUBLIC_CAPACITOR_BUILD=1 pnpm build  # static
pnpm build                                       # node
node ../native/icons/generate-icons.mjs
pnpm exec cap sync electron
cd electron
npm install
npm run electron:make
```
Output: `ui/electron/dist/career-ops-X.Y.Z.dmg` (macOS), `.exe` (Win, only if you build on Windows), `.AppImage` + `.deb` (Linux).

CI build (auto, when you push a tag):
```bash
git tag v1.7.0
git push origin v1.7.0
```
The `native-release.yml` workflow runs builds in parallel on macOS, Ubuntu, Windows runners, signs the Mac DMG (if you've added the signing secrets to GitHub), and uploads everything to a GitHub Release as DMG / .exe / .AppImage / .deb.

**Code signing (one-time setup for signed Mac DMG):**
- Apple Developer account ($99/yr) — you said you have one.
- Export `Developer ID Application` cert from Keychain Access as a `.p12` with a password.
- Base64-encode it: `base64 -i cert.p12 -o cert.p12.b64`
- Add to GitHub Secrets:
  - `MAC_CERTIFICATE` = contents of cert.p12.b64
  - `MAC_CERTIFICATE_PASSWORD` = the export password
  - `APPLE_ID` = your dev account email
  - `APPLE_APP_SPECIFIC_PASSWORD` = generate at appleid.apple.com → "Sign-In and Security" → "App-Specific Passwords"
  - `APPLE_TEAM_ID` = from developer.apple.com → "Membership"

**Windows:** You skipped EV cert. Unsigned `.exe` works — first-time installers will hit SmartScreen. Workaround: right-click `.exe` → Properties → tick "Unblock" → OK. Document this in your install notes.

### iOS — TestFlight via Fastlane

Local build (requires Xcode + cocoapods):
```bash
cd ui/ios/App
bundle install                # first run — installs Fastlane
bundle exec fastlane beta     # builds + uploads to TestFlight
```

CI build (auto, on tag push to `v*.*.*`): the `native-release.yml` `build-ios` job runs Fastlane on a macos-latest runner.

**Required CI secrets:**
- `APPLE_ID`, `APPLE_TEAM_ID` (same as above)
- `APP_STORE_CONNECT_KEY_ID` — from appstoreconnect.apple.com → Users and Access → Keys
- `APP_STORE_CONNECT_ISSUER_ID` — also from the Keys page
- `APP_STORE_CONNECT_KEY` — contents of the downloaded .p8 key file (or use MATCH_GIT_URL for a cert repo)

**TestFlight expiry:** builds expire 90 days after upload. The `testflight-keepalive.yml` cron tags + rebuilds automatically every 60 days (1st of every other month at 09:00 UTC) so you never have to manually re-upload.

---

## How it actually works (the spine)

```
                                  ┌─────────────────────────────────┐
                                  │  Backend resolver               │
                                  │  (lib/client/backend-discovery) │
                                  │                                 │
   ┌─────────────────────────┐    │  resolveBackend(opts)           │
   │ Desktop (Capacitor +    │    │   ├─ embedded URL?              │
   │  Electron)              │───▶│   ├─ localhost:5173?            │
   │   embeds Node server    │    │   ├─ _career-ops._tcp mDNS?     │
   │   advertises via mDNS   │    │   ├─ Tailscale host?            │
   └─────────────────────────┘    │   └─ production URL?            │
                                  │  first 200 OK wins              │
   ┌─────────────────────────┐    │  cache 5 min                    │
   │ iPhone (Capacitor + iOS)│───▶└────────────────┬────────────────┘
   │   thin WebView client   │                     │
   │   Bonjour browses LAN   │                     ▼
   └─────────────────────────┘    ┌─────────────────────────────────┐
                                  │  /api/health                    │
                                  │  /api/stats                     │
                                  │  /api/notifications  (SSE)      │
                                  │  /api/pipeline       (share ext)│
                                  │  ... all existing endpoints     │
                                  └─────────────────────────────────┘
```

Same Capacitor binary works against:
- The dev server you ran 5 seconds ago.
- The DMG you installed yesterday.
- Your Mac via Tailscale while you're at the airport.
- A remote production server (when you're ready for that).

You never edit a URL in a config file. The app figures it out.

---

## Native features (per platform)

### Desktop
- ✅ Full **App Menu Bar** (File / Edit / View / Window / Help, all standard shortcuts)
- ✅ **System Tray** with quick-glance: "3 queued · 1 applied · 2 interviews" + Pause/Resume Autopilot + Quit
- ✅ **OS Notifications** (existing browser Notification API + Electron-native bridge when WebView is hidden)
- ✅ **Auto-update** via electron-updater → GitHub Releases
- ✅ **mDNS advertise** so iOS can find this Mac
- ✅ **Deep links** — `careerops://job/abc` opens the app at that job
- ✅ **macOS notarization** (when signing secrets are configured in CI)

### iOS
- ✅ **Local notifications** (`@capacitor/local-notifications` + SSE bridge)
- ✅ **Bonjour discovery** of the desktop server on LAN
- ✅ **Tailscale** support — set the magic-DNS hostname in `/settings/backend`
- ✅ **Custom URL scheme** — `careerops://job/abc` opens the app
- ✅ **Background fetch** every ~15 min for high-priority Issues when SSE is suspended
- ✅ **Core Spotlight** — search "Vercel" in iOS Spotlight, tap, jump straight to that job
- ✅ **Share Extension** — Safari → Share → "career-ops" → URL added to pipeline
- ✅ **Widgets** (small / medium / Lock Screen circular) — today's queue counters
- ✅ **Live Activities** — interview countdown in the Dynamic Island when a call is within 24h
- ✅ **Handoff** — open a job on iPhone, Handoff icon appears on Mac, click to continue
- ✅ **Face ID gating** — `/settings/security` toggle to protect Negotiation playbook / Comp insights
- ✅ **Keychain** — secrets (cookies, tokens) stored in iOS Keychain, never in WebView storage

---

## Adding the iOS Xcode targets (one-time setup)

The Swift files for Widget / Live Activity / Share Extension exist in the repo but iOS Xcode targets need to be added manually (these can't be created via Capacitor CLI):

1. **Open `ui/ios/App/App.xcworkspace` in Xcode**

2. **Add Widget target:**
   - File → New → Target → "Widget Extension" → name `CareerOpsWidget`
   - Bundle ID: `com.resistjs.careerops.widget`
   - Tick "Include Configuration Intent" → No
   - Replace generated `CareerOpsWidget.swift` with the one already in `ui/ios/App/CareerOpsWidget/`

3. **Add Live Activity target:**
   - File → New → Target → "Widget Extension" → name `CareerOpsLiveActivity`
   - Tick "Include Live Activity"
   - Bundle ID: `com.resistjs.careerops.liveactivity`
   - Replace generated `*.swift` with the one in `ui/ios/App/CareerOpsLiveActivity/`

4. **Add Share Extension target:**
   - File → New → Target → "Share Extension" → name `CareerOpsShareExtension`
   - Bundle ID: `com.resistjs.careerops.share`
   - Replace generated `ShareViewController.swift` with the one in `ui/ios/App/CareerOpsShareExtension/`
   - In the Share Extension target's `Info.plist`, set `NSExtensionAttributes.NSExtensionActivationRule`:
     - `NSExtensionActivationSupportsWebURLWithMaxCount = 1`
     - `NSExtensionActivationSupportsWebPageWithMaxCount = 1`

5. **App Groups (all three new targets + main App):**
   - Project → target → Signing & Capabilities → "+ Capability" → App Groups → "+ App Group" → `group.com.resistjs.careerops`
   - Repeat for every target.

6. **Build (Cmd+B) — should succeed.**

After this one-time setup, every `pod install` + `cap sync ios` works fine without re-touching Xcode.

---

## Troubleshooting

**iOS app says "no backend found":**
- Make sure your desktop career-ops is running (`pnpm dev` OR the installed Mac app)
- Phone must be on the same wifi as the Mac
- Go to `/settings/backend` in the iOS app, tap "Force re-discover"
- If you're remote: configure Tailscale magic-DNS in `/settings/backend`

**Desktop app launches but window is blank:**
- Open DevTools (View → Toggle Developer Tools) and check the console
- Most common: embedded server didn't start. Check `~/Library/Logs/career-ops/` for stderr
- Restart the app — if the embedded server crashed, `before-quit` cleanup should have killed it

**TestFlight build is "Invalid Binary" within 5 min of upload:**
- Apple's automatic checker rejects builds with missing entitlements or unsigned frameworks
- Common cause: a Capacitor plugin's framework isn't signed
- Fix: in Xcode → target → Build Phases → "Embed Pods Frameworks" → ensure "Code Sign On Copy" is checked

**Tray icon doesn't appear on macOS:**
- Some Mac apps don't get tray space if dozens of other apps are competing — you'll see it as an "overflow" icon in the menu bar `>` indicator
- Check the icon path: `ui/electron/build/icon.png` must exist (regenerate via `node native/icons/generate-icons.mjs` if missing)

**Auto-update doesn't trigger:**
- The app only checks for updates in the **packaged** build (not in `electron:start-live` dev mode)
- Updates require a GitHub Release with a `latest-mac.yml` / `latest-win.yml` artifact (electron-builder publishes these automatically when `npm run electron:make` runs with `GH_TOKEN` set)

**"Local network access" permission prompt on iOS:**
- This is expected the first time. Tap "OK" to allow.
- If you accidentally tapped "Don't Allow", go to Settings → career-ops → Local Network → toggle on.

---

## Versioning policy

The desktop and iOS apps share `ui/electron/package.json::version`. Bump it before tagging:

```bash
# Patch (1.6.0 → 1.6.1) — bugfix releases
npm version patch --prefix ui/electron

# Minor (1.6.0 → 1.7.0) — feature releases
npm version minor --prefix ui/electron

# Major (1.6.0 → 2.0.0) — breaking changes
npm version major --prefix ui/electron

git push origin main --tags
# CI workflow picks up the tag and builds everything.
```

The 60-day TestFlight keepalive cron generates intermediate tags of the form `vX.Y.Z-tfYYYYMMDD` that don't affect your semver — they just keep the iOS build fresh.

---

## What you should NOT do

- **Don't commit signing certificates** to the repo. Use GitHub Secrets or Fastlane Match with a separate private cert repo.
- **Don't put secrets in `capacitor.config.ts`** — it's bundled into the static shell that any user can extract. Use Keychain (iOS) or Electron's safeStorage (desktop) instead.
- **Don't bump `appId`** without re-issuing certs + provisioning profiles. The bundle ID is baked into Apple's signing artifacts.
- **Don't add iOS App Store submission** unless you genuinely want Apple to review the app. TestFlight internal-testers does NOT trigger review.

---

## Files index

| File | Purpose |
|---|---|
| `ui/capacitor.config.ts` | Root Capacitor config (bundle ID, plugins) |
| `ui/svelte.config.js` | Dual adapter (`CAPACITOR=1` → static, else node) |
| `ui/src/routes/+layout.ts` | SSR off when CAPACITOR_BUILD env is set |
| `ui/src/lib/client/backend-discovery.ts` | The resolver — the spine of everything |
| `ui/src/lib/client/notifications.ts` | Unified OS notifications across platforms |
| `ui/src/lib/client/deep-links.ts` | `careerops://` URL parser |
| `ui/src/lib/client/native-bridge.ts` | JS wrapper for iOS native plugin |
| `ui/src/lib/client/sse-notifications-bridge.ts` | Routes SSE events to OS notifications |
| `ui/src/lib/components/BackendPill.svelte` | DEV/PROD/LAN/etc pill |
| `ui/src/routes/api/stats/+server.ts` | Counters for tray + widget |
| `ui/electron/src/index.ts` | Electron main process |
| `ui/electron/src/app-menu.ts` | Full File/Edit/View/Window/Help menu |
| `ui/electron/src/tray.ts` | Quick-glance system tray |
| `ui/electron/src/mdns.ts` | Bonjour advertise |
| `ui/electron/electron-builder.config.json` | DMG/EXE/AppImage build config |
| `ui/electron/build/entitlements.mac.plist` | macOS hardened-runtime entitlements |
| `ui/ios/App/App/AppDelegate.swift` | iOS app lifecycle + bg-fetch |
| `ui/ios/App/App/BonjourBrowser.swift` | LAN discovery |
| `ui/ios/App/App/BackgroundFetcher.swift` | 15-min poll for missed Issues |
| `ui/ios/App/App/CareerOpsNativePlugin.swift` | JS↔Swift bridge |
| `ui/ios/App/App/SpotlightIndexer.swift` | iOS Spotlight |
| `ui/ios/App/App/BiometricAuth.swift` | Face ID |
| `ui/ios/App/App/KeychainStore.swift` | Secure storage |
| `ui/ios/App/CareerOpsWidget/CareerOpsWidget.swift` | Home / Lock screen widgets |
| `ui/ios/App/CareerOpsLiveActivity/CareerOpsLiveActivity.swift` | Dynamic Island countdown |
| `ui/ios/App/CareerOpsShareExtension/ShareViewController.swift` | Safari Share → pipeline |
| `ui/ios/App/fastlane/Fastfile` | TestFlight upload lane |
| `native/icons/generate-icons.mjs` | Renders all platform icon sizes |
| `.github/workflows/native-release.yml` | CI: 3-OS desktop + iOS TestFlight |
| `.github/workflows/testflight-keepalive.yml` | 60-day TestFlight re-upload cron |
| `verify-capacitor.mjs` | 89-check sanity verifier |
