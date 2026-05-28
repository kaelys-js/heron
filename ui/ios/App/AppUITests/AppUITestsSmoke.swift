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

extension XCUIApplication {
    /// Wait until the Capacitor WebView has painted a recognizable Heron
    /// surface. On a backend-less CI simulator the BackendBootGuard connect
    /// screen is the expected first paint -- the app can't reach /login or
    /// /inbox without a discovered backend (those are backend-served), so the
    /// default accepted set spans the connect screen, the sign-in entry, and
    /// authed surfaces, mirroring ScreenshotUITests. These E2E tests fail
    /// closed only when the WebView never hydrates or paints a blank frame,
    /// which is the real regression they guard against. Pass a narrower
    /// `needles` set to assert a specific class of surface.
    func waitForHeronSurface(
        _ needles: [String] = [
            "heron", "sign in", "passkey", "welcome", "invite",
            "reach", "try again", "inbox", "pipeline",
        ],
        timeout: TimeInterval = 40
    ) -> Bool {
        let predicate = needles.map { "label CONTAINS[c] '\($0)'" }.joined(separator: " OR ")
        return webViews
            .descendants(matching: .any)
            .matching(NSPredicate(format: predicate))
            .firstMatch
            .waitForExistence(timeout: timeout)
    }
}
