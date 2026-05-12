import Foundation
import Network

/**
 * BonjourBrowser — discover career-ops desktop servers on the local
 * network via mDNS. The discovered URL is stored in UserDefaults under
 * `career-ops:lan-url` so the JS-side backend-discovery resolver can
 * read it through a Capacitor Preferences plugin or a tiny native bridge.
 *
 * iOS 14+ Bonjour browsing requires the `_career-ops._tcp` service to
 * be declared in Info.plist's `NSBonjourServices` (done) and the user
 * to have granted local-network permission (handled by the OS — prompt
 * fires on first browse call).
 */
@available(iOS 13.0, *)
final class BonjourBrowser {
    private let serviceType: String
    private var browser: NWBrowser?
    private let queue = DispatchQueue(label: "com.resistjs.careerops.bonjour")

    init(serviceType: String) {
        self.serviceType = serviceType
    }

    func start() {
        let parameters = NWParameters()
        parameters.includePeerToPeer = false
        // Browse for our service type in the local domain.
        let descriptor = NWBrowser.Descriptor.bonjour(type: serviceType, domain: "local.")
        let browser = NWBrowser(for: descriptor, using: parameters)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self = self else { return }
            for result in results {
                if case let .service(name: name, type: _, domain: _, interface: _) = result.endpoint {
                    // Resolve the service to a host+port for the URL we'll
                    // hand to the WebView.
                    self.resolve(serviceName: name)
                }
            }
        }
        browser.stateUpdateHandler = { state in
            NSLog("[bonjour] state: \(state)")
        }
        browser.start(queue: queue)
        self.browser = browser
        NSLog("[bonjour] browse started for \(serviceType)")
    }

    func stop() {
        browser?.cancel()
        browser = nil
    }

    private func resolve(serviceName: String) {
        // Build an NWConnection to the service to get the resolved host/port.
        let endpoint = NWEndpoint.service(name: serviceName, type: serviceType, domain: "local.", interface: nil)
        let conn = NWConnection(to: endpoint, using: .tcp)
        conn.stateUpdateHandler = { state in
            if case .ready = state {
                if let inner = conn.currentPath?.remoteEndpoint {
                    if case let .hostPort(host: host, port: port) = inner {
                        let hostStr: String
                        switch host {
                        case .ipv4(let v): hostStr = String(describing: v)
                        case .ipv6(let v): hostStr = String(describing: v)
                        case .name(let n, _): hostStr = n
                        @unknown default: hostStr = "unknown"
                        }
                        let url = "http://\(hostStr):\(port.rawValue)"
                        UserDefaults.standard.set(url, forKey: "career-ops:lan-url")
                        NSLog("[bonjour] resolved career-ops at \(url)")
                    }
                }
                conn.cancel()
            } else if case .failed = state {
                conn.cancel()
            }
        }
        conn.start(queue: queue)
    }
}
