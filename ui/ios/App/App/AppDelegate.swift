import Capacitor
import UIKit

/**
 * Heron iOS — UIApplicationDelegate.
 *
 * Wires platform features that need delegate hooks:
 *
 *   • Bonjour browse — exposes a JS bridge `__HERON_MDNS_BROWSE__()`
 *     to the WebView so backend-discovery.ts can find the desktop app
 *     via the local network.
 *
 *   • Deep links — `heron://job/abc123` hands the URL to the
 *     Capacitor app, which the route layer in lib/client/deep-link.ts
 *     resolves to a navigation.
 *
 *   • Background fetch — registers a 15-minute background-fetch task
 *     that polls /api/issues?since=lastSeen and surfaces high-priority
 *     items as Local Notifications even when the app is suspended.
 *
 *   • Spotlight + Handoff — NSUserActivity continuation, restored
 *     into the WebView's route by lib/client/restore-activity.ts.
 */
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    var bonjourBrowser: BonjourBrowser?
    var networkMonitor: NetworkMonitor?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Keep custom App-target classes from being dead-stripped by the
        // Swift static linker. Both classes are referenced ONLY by name
        // (via Main.storyboard or NSClassFromString plugin lookup) — the
        // optimizer has no compile-time Swift edge proving they're live,
        // so it drops them, and at runtime UIKit / Capacitor fail silently:
        //   • Missing BridgeViewController → storyboard fails to
        //     instantiate the root VC → empty UIWindow → BLACK SCREEN.
        //   • Missing NativePlugin → JS bridge reports
        //     "HeronNative plugin is not implemented on ios" and every
        //     Bonjour / biometric / keychain / Spotlight / Handoff call
        //     becomes a no-op.
        // Touching the metatype here pins both symbols in the binary.
        _ = BridgeViewController.self
        _ = NativePlugin.self

        // Start the Bonjour browser early so backend-discovery can
        // hit a hot cache. Results are stored in a UserDefaults key
        // the JS bridge reads.
        bonjourBrowser = BonjourBrowser(serviceType: Brand.serviceType)
        bonjourBrowser?.start()

        // Start the OS-level path monitor and forward state changes into
        // the WebView so online-status.ts has authoritative truth.
        networkMonitor = NetworkMonitor.shared
        networkMonitor?.start { online in
            NativePlugin.notifyNetStatus(online: online)
        }

        // Register for background fetch — minimum interval is iOS-decided.
        // Even when registered every-15-min, Apple may delay based on
        // device usage patterns. That's the limitation we accepted in
        // the plan (worst case 15min latency for closed-app notifications).
        application.setMinimumBackgroundFetchInterval(UIApplication.backgroundFetchIntervalMinimum)

        // Root-VC self-heal (defense-in-depth). The black screen we shipped
        // was caused by Main.storyboard's customClass drifting away from the
        // BridgeViewController class name: the storyboard couldn't instantiate
        // the root VC and silently fell back to a bare UIViewController with
        // NO WebView. If that ever happens again, don't strand the user on
        // black — install a BridgeViewController programmatically. Delayed one
        // run-loop hop so the storyboard finishes wiring the root first.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.ensureBridgeRoot()
        }

        return true
    }

    /// If the storyboard failed to instantiate the Capacitor bridge VC, the
    /// window's root is a plain UIViewController (black, no WebView). Replace
    /// it with a real BridgeViewController so the app recovers instead of
    /// showing a dead screen. No-op in the healthy case.
    private func ensureBridgeRoot() {
        guard let window = window else { return }
        if window.rootViewController is CAPBridgeViewController { return }
        let actual = window.rootViewController.map { String(describing: type(of: $0)) } ?? "nil"
        ErrorReporter.shared.report(
            message: "Root VC is \(actual), not a Capacitor bridge VC — storyboard wiring failed; installing BridgeViewController programmatically.",
            source: "ios-root-guard",
            level: "error"
        )
        let bridge = BridgeViewController()
        window.rootViewController = bridge
        window.makeKeyAndVisible()
    }

    // MARK: - Deep links

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Forward heron:// URLs into Capacitor's URL handling so the
        // App plugin emits the URL to the JS side.
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // F4 — Watch / Live Activity → iPhone Handoff. Activity type
        // pattern is `<bundleId>.handoff.<kind>` (see Brand.handoffActivityType).
        // We gate on the bundleId prefix so a rogue app on the same Apple
        // ID can't push us into a foreign view, then forward the embedded
        // deep link through Capacitor's URL plugin so the WebView routes
        // exactly the same way it would for a normal `heron://` tap.
        let handoffPrefix = "\(Brand.bundleId).handoff."
        if userActivity.activityType.hasPrefix(handoffPrefix) {
            // webpageURL is set to a heron:// scheme URL by the Watch
            // publisher; we accept that OR a `deepLink` userInfo key as
            // a fallback for future publishers (Live Activity buttons,
            // Spotlight rows, etc.) that may not be able to set
            // webpageURL.
            var url: URL? = userActivity.webpageURL
            if url == nil, let link = userActivity.userInfo?["deepLink"] as? String {
                url = URL(string: link)
            }
            if let url = url, url.scheme == Brand.urlScheme {
                // Defence-in-depth: route through the same open(url:)
                // path a launched-from-cold-state heron:// URL takes
                // so any future changes to URL handling apply uniformly.
                _ = self.application(application, open: url, options: [:])
                return true
            }
        }
        // Spotlight + universal-link activities (Capacitor handles those).
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Background fetch

    func application(_: UIApplication, performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        BackgroundFetcher.shared.fetch { result in
            completionHandler(result)
        }
    }

    // MARK: - Lifecycle (preserved from scaffold)

    func applicationWillResignActive(_: UIApplication) {}
    func applicationDidEnterBackground(_: UIApplication) {}
    func applicationWillEnterForeground(_: UIApplication) {}
    func applicationDidBecomeActive(_: UIApplication) {}
    func applicationWillTerminate(_: UIApplication) {
        bonjourBrowser?.stop()
    }
}
