// AppLiveActivityTests -- LOGIC tests for the AppLiveActivity
// extension. The extension is `.appex` so TEST_HOST won't work;
// source files are compiled into this test bundle directly.
import XCTest

final class AppLiveActivityTestsSmoke: XCTestCase {
    func testHostBundleAvailable() {
        XCTAssertNotNil(Bundle.main.bundleIdentifier)
    }
}
