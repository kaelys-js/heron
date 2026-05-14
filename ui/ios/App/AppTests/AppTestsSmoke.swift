@testable import App

// AppTests — XCTest unit tests for the App target. The smoke case
// here just exercises the host-bundle wiring; the real coverage
// lives in BrandTests.swift, KeychainStoreTests.swift, etc.
import XCTest

final class AppTestsSmoke: XCTestCase {
    func testHostBundleAvailable() {
        XCTAssertNotNil(Bundle.main.bundleIdentifier)
    }
}
