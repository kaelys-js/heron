import UIKit
import Capacitor

/**
 * career-ops iOS — UIApplicationDelegate.
 *
 * Wires platform features that need delegate hooks:
 *
 *   • Bonjour browse — exposes a JS bridge `__CAREER_OPS_MDNS_BROWSE__()`
 *     to the WebView so backend-discovery.ts can find the desktop app
 *     via the local network.
 *
 *   • Deep links — `careerops://job/abc123` hands the URL to the
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

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Start the Bonjour browser early so backend-discovery can
        // hit a hot cache. Results are stored in a UserDefaults key
        // the JS bridge reads.
        self.bonjourBrowser = BonjourBrowser(serviceType: "_career-ops._tcp")
        self.bonjourBrowser?.start()

        // Register for background fetch — minimum interval is iOS-decided.
        // Even when registered every-15-min, Apple may delay based on
        // device usage patterns. That's the limitation we accepted in
        // the plan (worst case 15min latency for closed-app notifications).
        application.setMinimumBackgroundFetchInterval(UIApplication.backgroundFetchIntervalMinimum)

        return true
    }

    // MARK: - Deep links

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Forward careerops:// URLs into Capacitor's URL handling so the
        // App plugin emits the URL to the JS side.
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Background fetch

    func application(_ application: UIApplication, performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        BackgroundFetcher.shared.fetch { result in
            completionHandler(result)
        }
    }

    // MARK: - Lifecycle (preserved from scaffold)

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {
        self.bonjourBrowser?.stop()
    }
}
