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
class BridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
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
        injectScreenshotModeIfRequested()
    }

    // MARK: - Screenshot mode (XCUITest / fastlane snapshot)

    /// When launched by the screenshot harness (the `--heron-screenshots` launch
    /// argument), inject a document-start user script that points the WebView at
    /// the seeded screenshot-mode backend (read from the `HERON_SCREENSHOT_BACKEND`
    /// launch-environment value) and marks the client authed -- so the dashboard
    /// renders instead of the connect / login gate. A reload is required because
    /// Capacitor's `super.viewDidLoad()` already kicked off the first navigation
    /// before user scripts could be registered; reloading re-runs it at document
    /// start. No-op in normal launches.
    private func injectScreenshotModeIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains("--heron-screenshots") else { return }
        guard let webView = webView else { return }
        let backend = ProcessInfo.processInfo.environment["HERON_SCREENSHOT_BACKEND"] ?? ""
        let payloadJSON =
            (try? String(
                data: JSONSerialization.data(withJSONObject: ["backend": backend]),
                encoding: .utf8
            )) ?? "{}"
        // Forward JS boot errors to NSLog so a failed screenshot run (the
        // dashboard never paints) is diagnosable from the CI/sim log instead of
        // a black box. Only installed in screenshot mode.
        webView.configuration.userContentController.add(self, name: "heronDiag")
        let js = """
        (function () {
          var post = function (tag, msg) {
            try { window.webkit.messageHandlers.heronDiag.postMessage(tag + ": " + msg); } catch (e) {}
          };
          try {
            window.__HERON_SCREENSHOTS__ = \(payloadJSON);
            localStorage.setItem("\(Brand.name):authed", "1");
          } catch (e) { post("inject-error", String(e)); }
          window.addEventListener("error", function (e) {
            post("js-error", (e.message || "") + " @ " + (e.filename || "") + ":" + (e.lineno || ""));
          });
          // Capture phase catches RESOURCE load failures (script/css 404s) which
          // don't bubble to the bubble-phase handler above.
          window.addEventListener("error", function (e) {
            var t = e.target || {};
            if (t && (t.src || t.href)) post("res-error", (t.tagName || "?") + " " + (t.src || t.href));
          }, true);
          window.addEventListener("unhandledrejection", function (e) {
            var r = e.reason;
            post("js-reject", String((r && (r.stack || r.message)) || r));
          });
          var snap = function (when) {
            try {
              var b = document.body;
              post("dom@" + when,
                "ready=" + (document.documentElement.dataset.appReady || "0") +
                " txt=" + (b ? b.innerText.trim().length : -1) +
                " kids=" + (b ? b.children.length : -1) +
                " scripts=" + document.scripts.length +
                " href=" + location.href);
            } catch (e) { post("snap-error", String(e)); }
          };
          setTimeout(function () { snap("2s"); }, 2000);
          setTimeout(function () { snap("6s"); }, 6000);
          setTimeout(function () { snap("11s"); }, 11000);
          post("armed", "diag installed");
        })();
        """
        let script = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        webView.configuration.userContentController.addUserScript(script)
        NSLog("[Heron] screenshot mode armed (backend=%@)", backend)
        webView.reload()
    }

    /// Receives the screenshot-mode JS diagnostics (boot errors / rejections)
    /// posted by the injected script above and mirrors them to NSLog.
    func userContentController(
        _: WKUserContentController, didReceive message: WKScriptMessage
    ) {
        guard message.name == "heronDiag" else { return }
        NSLog("[Heron][js] %@", String(describing: message.body))
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
