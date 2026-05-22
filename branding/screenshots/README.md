# Store screenshot specifications

*Part of the [Heron](../../README.md) branding system.*

> **What this directory is.** Per-store screenshot directories with
> `.gitkeep` placeholders. Capture screenshots locally + commit the
> binaries into the right per-store subdirectory before submitting
> the corresponding store-listing.

Store reviewers reject submissions that lack screenshots. Each store
has its own required dimensions + count rules. This doc lists what
each store wants + the canonical commit location.

## iOS App Store (App Store Connect)

Location: `ui/ios/App/fastlane/screenshots/en-US/`

| Device class | Resolution | Filename suffix (Fastlane convention) | Count |
|---|---|---|---|
| iPhone 6.7" (Pro Max) | 1290 × 2796 portrait | `iPhone 6.7 Display-*.png` | 3-10 |
| iPhone 6.5" (older Pro Max) | 1242 × 2688 portrait | `iPhone 6.5 Display-*.png` | 3-10 |
| iPad Pro 12.9" (6th gen) | 2048 × 2732 portrait | `iPad Pro (12.9-inch) (6th generation)-*.png` | 3-10 |
| Apple Watch Ultra | 410 × 502 | `Apple Watch Ultra 2 (49mm)-*.png` | 3-10 |

**How to capture**: `cd ui/ios/App && bundle exec fastlane screenshots`
runs an XCUItest snapshot lane on a populated simulator. Commit the
resulting PNGs.

Apple uses ONLY the highest-resolution-class set you provide; lower
resolutions get downscaled automatically by App Store Connect.

## Android Play Store (Play Console)

Location: `ui/android/fastlane/metadata/android/en-US/images/`

| Subdirectory | Use | Resolution | Count |
|---|---|---|---|
| `phoneScreenshots/` | Phone (portrait) | 1080 × 1920 min, 9:16 aspect | 2-8 |
| `sevenInchScreenshots/` | 7" tablet | 1024 × 600 min, 16:9 | 2-8 |
| `tenInchScreenshots/` | 10" tablet | 1280 × 800 min, 16:10 | 2-8 |
| `wearScreenshots/` | Wear OS | 384 × 384 | 1-8 |
| `featureGraphic/` | Promo banner | 1024 × 500 | exactly 1 (`featureGraphic.png`) |
| `icon/` | Listing icon | 512 × 512 PNG | exactly 1 (`icon.png`) |

**How to capture**: take manually on emulator or use `screengrab`
(Fastlane's Android equivalent). Play Store requires at minimum
`phoneScreenshots/` (≥ 2) + `featureGraphic/featureGraphic.png` +
`icon/icon.png`.

The `featureGraphic` is the 1024×500 banner that shows above the
listing on phones and is the most visible store-facing asset --
treat it as the brand wordmark + mascot at hero scale.

## macOS App Store

Location: `branding/screenshots/macos/`

| Dimension | Use | Count |
|---|---|---|
| 1280 × 800 (min) | Standard Mac | 3-10 |
| 1440 × 900 | MacBook Air (older) | optional |
| 2880 × 1800 (max) | Retina Mac | optional |

**How to capture**: `Cmd+Shift+5` on the running Mac app -- capture
the window only. Then resize to one of the supported dimensions in
Preview. App Store Connect uploads PNG / JPG.

## Microsoft Store

Location: `branding/screenshots/windows/`

| Dimension | Use | Count |
|---|---|---|
| 1366 × 768 (min) | Mainstream Windows | 1-10 |
| 1920 × 1080 (full HD) | Common | optional |
| 3840 × 2160 (4K, max) | High-end | optional |

**How to capture**: Windows Snipping Tool or `Win+Shift+S` on the
running app. Then upload to Partner Center via Partner Center web UI
during the submission flow.

## What NOT to commit here

- Personal data in screenshots (real CV contents, real recruiter
  emails, real interview notes). Use the demo dataset
  (`pnpm seed:demo`) before capturing.
- Original 5K / 10K-px captures: scale down to the per-store maximum
  before committing -- store CDNs reject oversized files.
- Animated GIFs / mp4s: store-screenshot fields don't accept
  animation. Microsoft Store accepts a separate `trailer` field for
  video, not in this directory.

## Brand context for screenshots

When capturing, include the **brand bloom background** (visible in
the Inbox + Splash screens) so the screenshots feel cohesive with
the OG card and the in-app palette. Avoid screenshots that show only
a white form -- the brand identity should be present in every
captured frame.

See [`branding/VOICE.md`](../VOICE.md) for tone guidance on the
captions you add in App Store Connect / Play Console alongside each
screenshot.
