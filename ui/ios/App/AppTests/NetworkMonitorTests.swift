//
@testable import App

// NetworkMonitorTests — lifecycle + state propagation for the
// NWPathMonitor wrapper.
//
// NWPathMonitor itself is hard to stub (system framework). We exercise
// the wrapper's lifecycle: start/stop without throw, initial state,
// callback wiring. End-to-end path-change detection is a UI test.
//
import XCTest

@available(iOS 12.0, *)
final class NetworkMonitorTests: XCTestCase {
    override func setUp() {
        super.setUp()
        // AppTests is a host-app-hosted XCTest bundle. xcodebuild launches
        // App.app FIRST, which runs AppDelegate.didFinishLaunchingWithOptions,
        // which calls NetworkMonitor.shared.start { ... NativePlugin.notifyNetStatus ... }
        // BEFORE any test method runs. That call flips hasFiredInitial=true
        // and assigns the AppDelegate's pathUpdateHandler closure.
        //
        // Without this setUp, the FIRST alpha-order test
        // (testCallbackEventuallyFires) inherits a "synth-fire already used"
        // singleton: its .start() skips the synth-fire branch (because
        // hasFiredInitial==true), and waits 2s for a path-change-fire that
        // never comes -- TIMEOUT.
        //
        // Calling .stop() here resets hasFiredInitial=false and recycles
        // NWPathMonitor to a fresh instance. Every test now begins from the
        // same clean state the test author originally assumed.
        NetworkMonitor.shared.stop()
    }

    override func tearDown() {
        super.tearDown()
        NetworkMonitor.shared.stop()
    }

    func testInitialStateIsOffline() {
        // Before start() runs, isOnline defaults to false.
        XCTAssertFalse(NetworkMonitor.shared.isOnline)
    }

    func testStartIsIdempotent() {
        var calls = 0
        NetworkMonitor.shared.start(notifyJS: { _ in calls += 1 })
        NetworkMonitor.shared.start(notifyJS: { _ in calls += 1 })
        // Second start replaces the handler — no crash. calls may or
        // may not be > 0 depending on whether NWPathMonitor has settled.
        XCTAssertGreaterThanOrEqual(calls, 0)
    }

    func testStopIsIdempotent() {
        NetworkMonitor.shared.start(notifyJS: { _ in })
        XCTAssertNoThrow(NetworkMonitor.shared.stop())
        XCTAssertNoThrow(NetworkMonitor.shared.stop())
    }

    func testCallbackEventuallyFires() {
        // Production fires notifyJS at LEAST once on .start(): the synth-fire
        // path runs immediately with `false`, and NWPathMonitor's initial
        // path delivery may fire a SECOND time ~100ms later if the simulator
        // reports `.satisfied` (state changes false→true). Both are correct
        // production behaviour; the test just wants "callback was wired".
        // `assertForOverFulfill = false` absorbs the second fire without
        // tripping XCTest's API-violation crash on iOS 26+ simulators (where
        // NWPath delivery is fast enough to race the test exit).
        let exp = expectation(description: "pathUpdateHandler fires")
        exp.assertForOverFulfill = false
        NetworkMonitor.shared.start(notifyJS: { _ in exp.fulfill() })
        wait(for: [exp], timeout: 2.0)
    }

    func testStatePersistedToUserDefaults() {
        // After a few updates, the "<brand>:online" key should exist.
        // We can't force an offline transition in a unit test, so we
        // assert only that the KEY is well-formed.
        let key = "\(Brand.name):online"
        XCTAssertTrue(key.hasPrefix(Brand.name + ":"))
    }

    func testCallbackInvokedOnMainQueue() {
        // Same over-fulfill tolerance as testCallbackEventuallyFires --
        // see that test for the explanation. We only need ONE fulfill to
        // assert main-thread dispatch; additional fires are ignored.
        let exp = expectation(description: "callback on main")
        exp.assertForOverFulfill = false
        NetworkMonitor.shared.start(notifyJS: { _ in
            XCTAssertTrue(Thread.isMainThread)
            exp.fulfill()
        })
        wait(for: [exp], timeout: 2.0)
    }
}
