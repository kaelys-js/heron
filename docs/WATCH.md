# Apple Watch -- standalone app + Smart Stack widgets

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

heron ships a **standalone watchOS app target** plus four
Smart-Stack widget families. Watch users get both: a dedicated app on
the wrist for browsing, and at-a-glance complications + widgets on the
Smart Stack / watch face.

## What's in the box

| Surface | Source | Where it appears |
|---|---|---|
| Standalone Watch app | `ui/ios/App/WatchApp/` | Dedicated launcher icon on the watch home grid |
| Pipeline stats widget | `AppWidget` | Smart Stack, Home Screen widget (mirrored via Lock-Screen widgets) |
| Next interview countdown | `NextInterviewWidget` | Smart Stack, Home Screen |
| Top job to apply | `TopApplyWidget` | Smart Stack, Lock Screen |
| Inbox issues | `InboxIssuesWidget` | Smart Stack, Home Screen |
| Interview Live Activity | `AppLiveActivity` | Dynamic Island → Watch Smart Stack (watchOS 9+) |

## Data flow

```text
iPhone (main app)                         Apple Watch
─────────────────                         ───────────
authClient action                         RootView (TabView)
   ↓                                          ↑
api/* writes data                          WatchModel @Published
   ↓                                          ↑
updateWidgets(payload)  ─Capacitor──┐      WCSession.didReceive*
   ↓                                ▼
NativePlugin           WatchSessionBridge
   ↓                                ↓
App Group UserDefaults     ────────►  WCSession.applicationContext
   ↓                                ↓                          ↑
WidgetCenter.reload               applyPayload(...)            │
                                      ↓                          │
                              App Group UserDefaults (mirror) ───┘
```

Both surfaces stay in sync because each watch payload is also
persisted into the watch's App Group defaults. If the phone is
unreachable when the watch app opens, the watch falls back to the
last-known values from defaults -- Smart Stack widgets keep showing
recent data instead of "--".

## Adding the Watch target in Xcode

The source files are committed; you need to create the Xcode target
(Xcode does target wiring through its UI, not files we can write).

1. **File → New → Target → watchOS → App**
   - Product Name: `WatchApp`
   - Bundle ID: `<brand.json::identifiers.bundleId>.watchkitapp` -- currently `com.heron.app.watchkitapp`
   - Interface: SwiftUI · Lifecycle: SwiftUI App
   - Embed in: `App` (the iOS main target)
2. Delete the auto-generated `ContentView.swift`, `WatchApp.swift`,
   `Assets.xcassets` and `Info.plist` Xcode created. Drag the existing
   files from `ui/ios/App/WatchApp/` into the new target (✓ "Copy
   if needed" should be UNCHECKED -- we want references).
3. Under the watch target's **Signing & Capabilities**:
   - Set **Entitlements**: `WatchApp.entitlements`
   - Add **App Groups**: `<brand.json::identifiers.appGroup>` -- currently `group.com.heron.app`
4. Add the watch target to `ui/ios/App/fastlane/Fastfile` so the
   `pnpm build:ios` lane archives it alongside the main app.
5. Run `pnpm brand:apply` -- the icon generator already writes the
   1024×1024 `AppIcon-1024.png` into the watch's appiconset.

## Files

```text
ui/ios/App/WatchApp/
├── WatchApp.swift   # @main entry, WindowGroup → RootView
├── RootView.swift            # 4-page TabView (Stats, Next Interview, Top Apply, Inbox)
├── WatchModel.swift          # @ObservableObject + WCSessionDelegate
├── Info.plist                # WKApplication, WKCompanionAppBundleIdentifier
├── WatchApp.entitlements  # App Group
└── Assets.xcassets/
    ├── AppIcon.appiconset/   # 1024×1024 (Xcode auto-derives sizes)
    └── AccentColor.colorset/

ui/ios/App/App/WatchSessionBridge.swift   # iPhone-side WCSession push
```

## Widget Smart Stack on the watch

watchOS 9+ promotes any iPhone-side Lock-Screen widget into the watch
Smart Stack automatically. Our four widgets all declare:

* `.accessoryCircular` -- circle complication
* `.accessoryRectangular` -- rectangular complication
* `.accessoryInline` -- top-of-face inline complication

That means users get widget surface area on the watch even without
adding the standalone Watch app. The standalone app is the "browse +
drill in" experience; widgets are the "glance" experience.

## Limitations

* No custom complications outside the Smart Stack (we use system
  widget families, not `CLKComplication`). watchOS picks where to
  place them on the face -- the user can't pin a heron
  complication to a specific modular slot.
* No background refresh on watch when the phone is asleep. The watch
  falls back to its last App Group snapshot. Re-opens the moment the
  phone wakes.
* `WidgetURL` from a watch widget can't open the iPhone dashboard
  directly -- watchOS only knows how to open the watch app. The
  workaround landed: when the user taps a job on the Watch and the
  paired iPhone is on the same Apple ID, an `NSUserActivity` published
  by the SwiftUI view (`RootView.NextInterviewPage` and friends) appears
  in iPhone Continuity -- swipe up on the lock screen lands on
  `interview-prep/{jobId}` in the dashboard. Routed through
  `AppDelegate.application(_:continue:restorationHandler:)` which gates
  on the `Brand.handoffActivityType` prefix.
