import Foundation
import Network

/**
 * NetworkMonitor — true network state via NWPathMonitor.
 *
 * `navigator.onLine` in the WebView lies on iOS (it can report "online"
 * while wifi is router-only with no internet). NWPathMonitor sees the
 * actual path status from the OS networking stack — much more reliable.
 *
 * State changes are forwarded to the WebView via UserDefaults (read by
 * the HeronNative plugin's `getNetworkStatus` accessor) AND a JS
 * bridge event (`<brand>:net-status`) that the online-status store
 * listens for.
 */
@available(iOS 12.0, *)
final class NetworkMonitor {
    static let shared = NetworkMonitor()
    // `monitor` is `var` (not `let`) because NWPathMonitor.cancel() is
    // terminal -- the same instance cannot be re-started after cancel.
    // `stop()` recycles to a fresh NWPathMonitor so a subsequent
    // `start()` actually wires up a new path-update handler. The old
    // `let` reference left start() as a silent no-op after the first
    // stop(), which surfaced in unit tests as 2s timeouts on the
    // pathUpdateHandler-fires expectations.
    private var monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "\(Brand.bundleId).network")
    private(set) var isOnline = false
    /// Flag so the FIRST path update always wakes consumers, even when
    /// the network status matches the initial `isOnline = false`. Without
    /// this, a simulator that boots reporting `.unsatisfied` would skip
    /// the `stateChanged` branch on its very first delivery and the
    /// WebView listener would never get its hydration event.
    private var hasFiredInitial = false

    func start(notifyJS: @escaping (Bool) -> Void) {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            let nowOnline = path.status == .satisfied
            let stateChanged = nowOnline != self.isOnline
            self.isOnline = nowOnline
            UserDefaults.standard.set(nowOnline, forKey: "\(Brand.name):online")
            if stateChanged {
                NSLog("[net] status changed → \(nowOnline ? "online" : "offline")")
            }
            // Always notify on the first path delivery so listeners can
            // hydrate; thereafter only on real state changes.
            if stateChanged || !self.hasFiredInitial {
                self.hasFiredInitial = true
                DispatchQueue.main.async {
                    notifyJS(nowOnline)
                }
            }
        }
        monitor.start(queue: queue)
        // Synthesize an immediate hydration fire from the snapshot the
        // monitor reports right now. Without this, consumers waited on
        // NWPathMonitor's first async delivery -- which on macOS-15 CI
        // simulators can take well over 2s, and the unit test
        // `testCallbackEventuallyFires` times out before the real fire
        // arrives. `monitor.currentPath` is documented as the most-
        // recent observed path; it's safe to read post-`start(queue:)`.
        // If the real first delivery later matches, the `stateChanged`
        // guard suppresses a duplicate notify.
        if !hasFiredInitial {
            hasFiredInitial = true
            let snapshot = monitor.currentPath.status == .satisfied
            isOnline = snapshot
            UserDefaults.standard.set(snapshot, forKey: "\(Brand.name):online")
            DispatchQueue.main.async {
                notifyJS(snapshot)
            }
        }
    }

    func stop() {
        monitor.cancel()
        // Recycle to a fresh instance so the next start() works, and
        // reset all observable state so tests / hot-reload start from
        // a known clean slate.
        monitor = NWPathMonitor()
        isOnline = false
        hasFiredInitial = false
    }
}
