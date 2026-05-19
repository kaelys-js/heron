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
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "\(Brand.bundleId).network")
    private(set) var isOnline = false

    func start(notifyJS: @escaping (Bool) -> Void) {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            let nowOnline = path.status == .satisfied
            if nowOnline != self.isOnline {
                self.isOnline = nowOnline
                UserDefaults.standard.set(nowOnline, forKey: "\(Brand.name):online")
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
    }
}
