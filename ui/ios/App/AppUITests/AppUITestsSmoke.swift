// AppUITests — XCUITest end-to-end tests. Drives a real simulator
// running the app. Real cases land in ColdLaunchUITests.swift,
// SidebarUITests.swift, NotificationsBellUITests.swift, etc.
import XCTest

final class AppUITestsSmoke: XCTestCase {
    func testLaunchApp() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.state == .runningForeground || app.state == .runningBackground)
    }
}
