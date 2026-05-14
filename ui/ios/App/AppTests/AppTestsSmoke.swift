@testable import App

// AppTests — XCTest unit tests for the App target. Real cases live
// in BrandTests.swift, KeychainStoreTests.swift, etc. (Phase 3.3+).
import XCTest

final class AppTestsSmoke: XCTestCase {
    func testHostBundleAvailable() {
        XCTAssertNotNil(Bundle.main.bundleIdentifier)
    }
}
