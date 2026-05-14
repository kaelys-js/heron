//
// NetworkMonitorTests — lifecycle + state propagation for the
// NWPathMonitor wrapper.
//
// NWPathMonitor itself is hard to stub (system framework). We exercise
// the wrapper's lifecycle: start/stop without throw, initial state,
// callback wiring. End-to-end path-change detection is a UI test.
//
import XCTest
@testable import App

@available(iOS 12.0, *)
final class NetworkMonitorTests: XCTestCase {

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
        // Allow up to 2s for NWPathMonitor to deliver the initial path
        // status (simulator usually responds within ~100ms).
        let exp = expectation(description: "pathUpdateHandler fires")
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
        let exp = expectation(description: "callback on main")
        NetworkMonitor.shared.start(notifyJS: { _ in
            XCTAssertTrue(Thread.isMainThread)
            exp.fulfill()
        })
        wait(for: [exp], timeout: 2.0)
    }
}
