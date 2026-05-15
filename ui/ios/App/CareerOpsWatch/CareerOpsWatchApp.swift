import SwiftUI

/**
 * CareerOpsWatchApp — standalone watchOS app target.
 *
 * Bundle ID: com.heron.app.watchkitapp
 * Deployment target: watchOS 10.0 (lowest version with current SwiftUI
 *                    Lists + NavigationStack + ContainerBackground).
 *
 * To wire this target up in Xcode:
 *   1. File → New → Target → watchOS → "App"
 *   2. Embed in companion iOS app: "App" (the main Heron target)
 *   3. Replace the auto-generated files with the ones in this directory
 *      (CareerOpsWatchApp.swift, RootView.swift, etc.)
 *   4. Add to App Groups entitlement (both watch + iPhone targets):
 *      `group.com.heron.app`
 *   5. The Watch app's Info.plist must include WKWatchOnly=false and
 *      WKCompanionAppBundleIdentifier=com.heron.app.
 *
 * Data flow:
 *   iPhone (main app)                   Watch
 *   ──────────────────                  ─────
 *   updateWidgets({stats, …})    ─WC──> WCSession.didReceiveMessage
 *     ↓                                   ↓
 *   App Group UserDefaults              WatchSession.shared.applyUpdate
 *     ↑                                   ↓
 *   Capacitor plugin                    @Published model → views
 *
 * If the phone is unreachable, the watch falls back to whatever was
 * last written to its OWN App Group defaults (so the Smart Stack stays
 * meaningful offline).
 */
@main
struct CareerOpsWatchApp: App {
    @StateObject private var model = WatchModel.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .task {
                    // Start the WCSession bridge; load whatever was last
                    // persisted while we wait for the phone to push.
                    model.bootstrap()
                }
        }
    }
}
