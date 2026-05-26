import Capacitor
import UIKit
import WebKit

// BridgeViewController — CAPBridgeViewController subclass that registers our
// custom NativePlugin AND owns the NATIVE boot safety-net: if the WebView
// never reaches a painted/ready state, we overlay a native BootFailureView
// (brand-dark + Reload) instead of leaving the user on a black screen.
//
// Why this subclass exists: Capacitor 7+ auto-discovers plugins from
// @capacitor/* packages, but custom plugins compiled into the App target are
// not auto-discovered — without explicit registration, JS calls to
// Capacitor.Plugins.HeronNative.* report "not implemented on ios".
//
// Wiring: App/Base.lproj/Main.storyboard points its root view controller's
// customClass at this class. (If that wiring ever breaks again, AppDelegate's
// root-VC guard self-heals by installing a BridgeViewController programmatically
// — see AppDelegate.ensureBridgeRoot.)
class BridgeViewController: CAPBridgeViewController {
    /// Brand-dark background applied natively BEFORE the WebView paints, so
    /// there's never a white/black flash. Hex #0e1014 = RGB(14,16,20).
    private let brandDarkBg = UIColor(
        red: 14.0 / 255.0, green: 16.0 / 255.0, blue: 20.0 / 255.0, alpha: 1.0
    )

    // ── Native boot safety-net ───────────────────────────────────────────
    /// How long the WebView gets to reach a painted/ready state before we
    /// assume it's wedged and show the native fallback. Generous so a slow
    /// cold launch + backend-discovery on a poor network isn't cut off.
    private let bootDeadline: TimeInterval = 12
    private var bootWatchdog: Timer?
    private var bootFailureView: BootFailureView?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = brandDarkBg
        // CAPBridgeViewController creates the WKWebView lazily — by viewDidLoad
        // the property is non-nil. Cover view + scroll-view bgs too.
        webView?.backgroundColor = brandDarkBg
        webView?.isOpaque = false
        webView?.scrollView.backgroundColor = brandDarkBg
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(NativePlugin())
        // Trace the resolved load URL so we can tell from the simulator log
        // whether server.url surfaced as the WebView's appStartServerURL.
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
        // (Re)arm the boot watchdog on every appearance — covers cold launch
        // AND returning from background to a dead web-content process.
        scheduleBootWatchdog()
    }

    // MARK: - Boot watchdog

    private func scheduleBootWatchdog() {
        bootWatchdog?.invalidate()
        bootWatchdog = Timer.scheduledTimer(withTimeInterval: bootDeadline, repeats: false) { [weak self] _ in
            self?.checkBootHealth()
        }
    }

    /// Ask the WebView whether it actually rendered. "Healthy" = the SvelteKit
    /// shell signalled ready (data-app-ready) OR the body has visible text
    /// (covers the branded "can't reach server" screen, which is a VALID
    /// state we must NOT cover). Anything else — blank DOM, dead JS, crashed
    /// content process, or evaluateJavaScript erroring — means the user is
    /// staring at nothing, so we show the native fallback.
    private func checkBootHealth() {
        guard let webView = webView else {
            presentBootFailure(reason: "The app view didn't load. Tap Reload to try again.")
            return
        }
        let js = """
        (function () {
          try {
            if (document.documentElement.dataset.appReady === '1') return true;
            return !!(document.body && document.body.innerText.trim().length > 0);
          } catch (e) { return false; }
        })()
        """
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self = self else { return }
            if (result as? Bool) == true {
                self.dismissBootFailure()
            } else {
                self.presentBootFailure(
                    reason: "Heron didn't finish loading. This is usually temporary — tap Reload."
                )
                ErrorReporter.shared.report(
                    message: "WebView boot watchdog fired — app not ready after \(Int(self.bootDeadline))s (url=\(webView.url?.absoluteString ?? "nil"))",
                    source: "ios-boot-watchdog",
                    level: "error"
                )
            }
        }
    }

    private func presentBootFailure(reason: String) {
        guard bootFailureView == nil else { return }
        let v = BootFailureView(message: reason) { [weak self] in self?.reloadApp() }
        v.frame = view.bounds
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(v)
        bootFailureView = v
    }

    private func dismissBootFailure() {
        bootFailureView?.removeFromSuperview()
        bootFailureView = nil
    }

    private func reloadApp() {
        dismissBootFailure()
        webView?.reload()
        scheduleBootWatchdog()
    }

    // MARK: - Web-content process crash recovery

    /// WKNavigationDelegate hook for when the web-content process is killed
    /// (memory pressure, WebKit crash). The view goes blank with no error —
    /// the standard recovery is to reload. If Capacitor owns the navigation
    /// delegate this may not fire, in which case the boot watchdog above
    /// catches the same blank state on the next appearance.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        ErrorReporter.shared.report(
            message: "WebView content process terminated — reloading",
            source: "ios-webview",
            level: "warn"
        )
        webView.reload()
        scheduleBootWatchdog()
    }
}
