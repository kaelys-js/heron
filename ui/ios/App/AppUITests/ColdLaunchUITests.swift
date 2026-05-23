// ColdLaunchUITests -- launch the app from a cold start, verify the
// Capacitor WKWebView hydrates within 30s, and assert at least one
// first-paint surface (Inbox UI for authed users, login UI otherwise)
// is reachable through accessibility.
//
// Why both surfaces are valid: a clean simulator's keychain is empty,
// so the app routes to /login. A re-run on the same sim that's
// previously authenticated routes to /inbox. The test treats either
// as "cold launch reached first paint" -- both fail closed when the
// WebView hydration breaks.
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

        // Either an authed-inbox surface (greeting / stat cards) or the
        // login form should be reachable via accessibility within 10s
        // of WebView hydration.
        let firstPaint = app.webViews
            .descendants(matching: .any)
            .matching(
                NSPredicate(
                    format: "label CONTAINS[c] 'inbox' OR label CONTAINS[c] 'sign in' OR label CONTAINS[c] 'passkey'"
                )
            )
            .firstMatch
        XCTAssertTrue(
            firstPaint.waitForExistence(timeout: 10),
            "Inbox UI or login UI must render after WebView hydration"
        )
    }
}
