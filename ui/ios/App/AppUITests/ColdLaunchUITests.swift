// ColdLaunchUITests -- launch the app from a cold start, verify the
// Capacitor WKWebView hydrates, and assert it paints a recognizable Heron
// surface through accessibility.
//
// On a backend-less CI simulator the app paints the BackendBootGuard
// connect screen (it can't reach /login or /inbox without a discovered
// backend); with a backend it reaches sign-in or the authed dashboard.
// All are valid "cold launch reached first paint"; the test fails closed
// only when the WebView never hydrates or paints a blank frame.
import XCTest

final class ColdLaunchUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testColdLaunchHydratesWebView() {
        let app = XCUIApplication()
        app.launch()

        let webView = app.webViews.firstMatch
        XCTAssertTrue(
            webView.waitForExistence(timeout: 30),
            "Capacitor WKWebView must hydrate within 30s of cold launch"
        )
        XCTAssertTrue(
            app.waitForHeronSurface(),
            "WebView must paint a recognizable Heron surface after hydration"
        )
    }
}
