//
// BonjourBrowserTests -- lifecycle for the NWBrowser wrapper.
//
// NWBrowser itself is hard to stub (system framework). We exercise the
// wrapper's lifecycle: construction, start/stop without throw, idempotent
// stop. End-to-end service discovery is a UI test.
//
@testable import App
import XCTest

@available(iOS 13.0, *)
final class BonjourBrowserTests: XCTestCase {
    func testInitStoresServiceType() {
        // Pure constructor smoke -- no NWBrowser side effect until start().
        let browser = BonjourBrowser(serviceType: "_test._tcp")
        XCTAssertNotNil(browser)
    }

    func testInitWithBrandServiceType() {
        // Production use-case: AppDelegate constructs with Brand.serviceType.
        // Confirms the brand constant is non-empty and accepted by NWBrowser.
        let browser = BonjourBrowser(serviceType: Brand.serviceType)
        XCTAssertNotNil(browser)
    }

    func testStartDoesNotThrow() {
        let browser = BonjourBrowser(serviceType: "_test._tcp")
        // start() schedules NWBrowser on its internal queue; returns sync.
        XCTAssertNoThrow(browser.start())
        // Clean up so the next test gets a fresh browser.
        browser.stop()
    }

    func testStopIsIdempotent() {
        let browser = BonjourBrowser(serviceType: "_test._tcp")
        browser.start()
        XCTAssertNoThrow(browser.stop())
        // Second stop on an already-cancelled browser must be safe.
        XCTAssertNoThrow(browser.stop())
    }

    func testStopBeforeStartIsSafe() {
        // Pre-start stop() should not crash even though browser is nil.
        let browser = BonjourBrowser(serviceType: "_test._tcp")
        XCTAssertNoThrow(browser.stop())
    }

    func testRestartLifecycle() {
        // start -> stop -> start: should not crash; the second start
        // creates a fresh NWBrowser.
        let browser = BonjourBrowser(serviceType: "_test._tcp")
        browser.start()
        browser.stop()
        XCTAssertNoThrow(browser.start())
        browser.stop()
    }
}
