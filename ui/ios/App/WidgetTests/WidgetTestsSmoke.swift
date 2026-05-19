// WidgetTests — XCTest unit tests for the HeronWidget extension
// target. Real cases live in WidgetAuthGateTests.swift,
// NextInterviewWidgetTests.swift, snapshot tests, etc.
import XCTest

final class WidgetTestsSmoke: XCTestCase {
    func testHostBundleAvailable() {
        XCTAssertNotNil(Bundle.main.bundleIdentifier)
    }
}
