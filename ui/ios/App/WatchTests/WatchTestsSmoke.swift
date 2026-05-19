// WatchTests — XCTest unit tests for the HeronWatch target.
// Real cases live in WatchModelTests.swift, RootViewTests.swift
// (ViewInspector), snapshot tests, etc.
import XCTest

final class WatchTestsSmoke: XCTestCase {
    func testHostBundleAvailable() {
        XCTAssertNotNil(Bundle.main.bundleIdentifier)
    }
}
