import Capacitor
import UIKit

/**
 * Heron iOS — UIApplicationDelegate.
 *
 * Wires platform features that need delegate hooks:
 *
 *   • Bonjour browse — exposes a JS bridge `__CAREER_OPS_MDNS_BROWSE__()`
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
        //   • Missing HeronBridgeViewController → storyboard fails to
        //     instantiate the root VC → empty UIWindow → BLACK SCREEN.
        //   • Missing HeronNativePlugin → JS bridge reports
        //     "HeronNative plugin is not implemented on ios" and every
        //     Bonjour / biometric / keychain / Spotlight / Handoff call
        //     becomes a no-op.
        // Touching the metatype here pins both symbols in the binary.
        _ = HeronBridgeViewController.self
        _ = HeronNativePlugin.self

        // Start the Bonjour browser early so backend-discovery can
        // hit a hot cache. Results are stored in a UserDefaults key
        // the JS bridge reads.
        bonjourBrowser = BonjourBrowser(serviceType: Brand.serviceType)
        bonjourBrowser?.start()

        // Start the OS-level path monitor and forward state changes into
        // the WebView so online-status.ts has authoritative truth.
        networkMonitor = NetworkMonitor.shared
        networkMonitor?.start { online in
            HeronNativePlugin.notifyNetStatus(online: online)
        }

        // Register for background fetch — minimum interval is iOS-decided.
        // Even when registered every-15-min, Apple may delay based on
        // device usage patterns. That's the limitation we accepted in
        // the plan (worst case 15min latency for closed-app notifications).
        application.setMinimumBackgroundFetchInterval(UIApplication.backgroundFetchIntervalMinimum)

        return true
    }

    // MARK: - Deep links

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Forward heron:// URLs into Capacitor's URL handling so the
        // App plugin emits the URL to the JS side.
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
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
