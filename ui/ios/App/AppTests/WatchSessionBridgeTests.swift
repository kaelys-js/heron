//
// WatchSessionBridgeTests -- lifecycle + send() smoke for the iPhone-side
// WCSession owner.
//
// WCSession itself is hard to stub (system framework + Apple-mandated
// singleton). We exercise the wrapper's public API: shared singleton,
// send() doesn't throw, behaviour when WCSession is unsupported (which
// happens to be the case on iOS simulators -- there's no paired Watch).
//
@testable import App
import WatchConnectivity
import XCTest

final class WatchSessionBridgeTests: XCTestCase {
    func testSharedSingletonExists() {
        // Shared instance is constructed lazily on first access.
        XCTAssertNotNil(WatchSessionBridge.shared)
    }

    func testSharedSingletonIsStable() {
        // Two accesses return the same object (singleton invariant).
        let a = WatchSessionBridge.shared
        let b = WatchSessionBridge.shared
        XCTAssertTrue(a === b)
    }

    func testSendWithEmptyPayloadDoesNotThrow() {
        // send() returns sync; the actual WCSession work happens on the
        // bridge's internal queue. We assert the public call doesn't crash.
        XCTAssertNoThrow(WatchSessionBridge.shared.send([:]))
    }

    func testSendWithTypicalPayloadDoesNotThrow() {
        // Mirrors the shape NativePlugin.updateWidgets pushes.
        let payload: [String: Any] = [
            "authenticated": true,
            "stats": ["queued": 5, "appliedToday": 2],
        ]
        XCTAssertNoThrow(WatchSessionBridge.shared.send(payload))
    }

    func testSendWithAuthenticatedFalse() {
        // Sign-out path: NativePlugin calls send(["authenticated": false])
        // to flip the Watch UI to its sign-in gate.
        XCTAssertNoThrow(WatchSessionBridge.shared.send(["authenticated": false]))
    }

    func testWCSessionDelegateMethodsAreSafe() throws {
        // The bridge implements three WCSessionDelegate methods. None
        // should throw. We invoke them directly to exercise their bodies.
        guard WCSession.isSupported() else {
            // On iPad-only / no-watch simulators, WCSession.default
            // raises -- skip rather than fail (matches the bridge's own
            // guard).
            throw XCTSkip("WCSession not supported on this runner")
        }
        let bridge = WatchSessionBridge.shared
        let session = WCSession.default

        XCTAssertNoThrow(bridge.session(session, activationDidCompleteWith: .activated, error: nil))
        XCTAssertNoThrow(bridge.sessionDidBecomeInactive(session))
        XCTAssertNoThrow(bridge.sessionDidDeactivate(session))
    }
}
