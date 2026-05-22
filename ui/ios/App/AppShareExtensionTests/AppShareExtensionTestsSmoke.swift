// AppShareExtensionTests -- LOGIC tests for the AppShareExtension.
// `.appex` target so TEST_HOST won't work; source files are
// compiled into this test bundle directly.
import XCTest

final class AppShareExtensionTestsSmoke: XCTestCase {
    func testHostBundleAvailable() {
        XCTAssertNotNil(Bundle.main.bundleIdentifier)
    }
}
