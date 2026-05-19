import Foundation
import WatchConnectivity

/**
 * WatchSessionBridge — iPhone side of the Watch <-> iPhone link.
 *
 * Owns a single WCSession.default and exposes `send(_:)` to push
 * widget data to the watch. Two delivery modes:
 *
 *   • reachable phone + watch app open → sendMessage (real-time)
 *   • reachable phone + watch app closed → updateApplicationContext
 *     (latest-only; watchOS delivers on next launch)
 *
 * Activated lazily — first call to `shared.send()` triggers session
 * activation. If WCSession isn't supported (iPad without paired watch),
 * `send()` no-ops silently.
 *
 * Called by NativePlugin.updateWidgets — every dashboard data
 * change pushes through here automatically.
 */
final class WatchSessionBridge: NSObject, WCSessionDelegate {
    static let shared = WatchSessionBridge()

    private let queue = DispatchQueue(label: "\(Brand.name).watch-session")
    private var activated = false

    override private init() {
        super.init()
    }

    func send(_ payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        queue.async { [weak self] in
            guard let self else { return }
            let session = WCSession.default
            if !self.activated {
                session.delegate = self
                session.activate()
                self.activated = true
            }
            // applicationContext is "latest value, delivered next launch"
            // — perfect for widget state since older snapshots are useless.
            do {
                try session.updateApplicationContext(payload)
            } catch {
                // Non-fatal; the watch will refresh from App Group
                // defaults the next time it opens.
            }
            // sendMessage is best-effort and only works if the watch app
            // is currently open. Try it for instant updates.
            if session.isReachable {
                session.sendMessage(payload, replyHandler: nil) { _ in
                    /* delivery failed — applicationContext still fires */
                }
            }
        }
    }

    // MARK: - WCSessionDelegate (iPhone side)

    func session(
        _: WCSession,
        activationDidCompleteWith _: WCSessionActivationState,
        error _: Error?
    ) {
        // No-op; we only push, we don't receive in this direction.
    }

    func sessionDidBecomeInactive(_: WCSession) {
        // Some iOS apps switch paired-watch mid-session (rare). When
        // that happens iOS deactivates the current session; we'll
        // re-activate on next send().
    }

    func sessionDidDeactivate(_: WCSession) {
        activated = false
        // Required for switching paired watches.
        WCSession.default.activate()
    }
}
