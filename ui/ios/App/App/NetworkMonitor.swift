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
        // Synth-fire IMMEDIATELY with the offline initial state, BEFORE
        // touching the monitor. Three earlier attempts (cc41705 +
        // d3ff9aa + 66ba18d) tried to fire after `monitor.start(queue:)`
        // with the snapshot from `monitor.currentPath`. The xcresult
        // bundle from run 26175226567 narrowed the failure: in alpha
        // order, `testCallbackEventuallyFires` is the FIRST test that
        // touches `NetworkMonitor.shared`. That access lazy-creates
        // NWPathMonitor #1; the subsequent `monitor.currentPath` read
        // (Apple says "most recent observed path", but on a cold process
        // there is no observation yet) ends up waiting on the system
        // network framework's first path query -- empirically >2s on
        // macOS-15 simulator runners. The next test
        // (`testCallbackInvokedOnMainQueue`) passes in 2ms because by
        // then the framework is warm.
        //
        // The real fix: don't read currentPath at all in the synth path.
        // Hydrate consumers with `false` (offline) -- the real
        // pathUpdateHandler will correct to `.satisfied` within ~100ms
        // on a connected device, AND the WebView listener already knows
        // how to react to that follow-up. This is still strictly better
        // than the pre-cc41705 behaviour (which fired NOTHING until a
        // state change).
        if !hasFiredInitial {
            hasFiredInitial = true
            isOnline = false
            UserDefaults.standard.set(false, forKey: "\(Brand.name):online")
            if Thread.isMainThread {
                notifyJS(false)
            } else {
                DispatchQueue.main.async {
                    notifyJS(false)
                }
            }
        }
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            let nowOnline = path.status == .satisfied
            let stateChanged = nowOnline != self.isOnline
            self.isOnline = nowOnline
            UserDefaults.standard.set(nowOnline, forKey: "\(Brand.name):online")
            if stateChanged {
                NSLog("[net] status changed → \(nowOnline ? "online" : "offline")")
                DispatchQueue.main.async {
                    notifyJS(nowOnline)
                }
            }
        }
        monitor.start(queue: queue)
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
