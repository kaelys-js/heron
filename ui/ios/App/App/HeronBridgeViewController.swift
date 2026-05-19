import Capacitor
import UIKit

// HeronBridgeViewController — CAPBridgeViewController subclass that
// explicitly registers our custom HeronNativePlugin with the
// Capacitor bridge.
//
// Why this subclass exists: Capacitor 7+ auto-discovers plugins that
// come from @capacitor/* npm packages (they declare themselves in
// capacitor.config.json and the SPM build wires them up). Custom
// plugins compiled into the main App target are NOT auto-discovered —
// the bridge has no way to know about them. Without explicit
// registration, JS calls to Capacitor.Plugins.HeronNative.* report
// "HeronNative plugin is not implemented on ios" and the app keeps
// running but every Bonjour / biometric / keychain / Spotlight /
// Handoff call no-ops.
//
// Wiring: App/Base.lproj/Main.storyboard points its root view-
// controller's customClass at this class (was CAPBridgeViewController
// from the Capacitor module — now HeronBridgeViewController from
// the App module).
class HeronBridgeViewController: CAPBridgeViewController {
    /// Brand-dark background applied natively to the view hierarchy
    /// BEFORE the WebView paints. Eliminates the white flash users
    /// previously saw between when the native splash dismissed and
    /// when the WebView's first paint applied the body CSS background.
    ///
    /// Three surfaces matter: the view controller's view (visible if
    /// the WebView is briefly transparent), the WebView itself (the
    /// WKWebView's underlying backgroundColor — defaults to white in
    /// iOS), and the WebView's scrollView (visible during bounce).
    /// `isOpaque = false` keeps the bg visible even while content is
    /// composing on top.
    ///
    /// Hex #0e1014 = RGB(14, 16, 20). Divided by 255 below.
    private let brandDarkBg = UIColor(
        red: 14.0 / 255.0, green: 16.0 / 255.0, blue: 20.0 / 255.0, alpha: 1.0
    )

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = brandDarkBg
        // CAPBridgeViewController creates the WKWebView lazily — by
        // viewDidLoad the property is non-nil. Setting both view +
        // scroll-view bgs covers iOS's rubber-band overscroll exposure.
        webView?.backgroundColor = brandDarkBg
        webView?.isOpaque = false
        webView?.scrollView.backgroundColor = brandDarkBg
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(HeronNativePlugin())
        // Trace the resolved load URL so we can tell from the simulator
        // log whether `server.url` in capacitor.config.json actually
        // surfaced as the WebView's appStartServerURL. CAPLog is silent
        // unless `loggingBehavior` is set to debug/production, but
        // NSLog always shows up in `xcrun simctl spawn booted log show`.
        let serverURL = bridge?.config.serverURL.absoluteString ?? "nil"
        let localURL = bridge?.config.localURL.absoluteString ?? "nil"
        let startURL = bridge?.config.appStartServerURL.absoluteString ?? "nil"
        NSLog(
            "[Heron] capacitorDidLoad serverURL=%@ localURL=%@ startURL=%@",
            serverURL, localURL, startURL
        )
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if let url = webView?.url?.absoluteString {
            NSLog("[Heron] viewDidAppear webView.url=%@", url)
        } else {
            NSLog("[Heron] viewDidAppear webView.url=nil")
        }
    }
}
