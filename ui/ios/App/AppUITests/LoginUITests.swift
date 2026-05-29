// LoginUITests -- anonymous launch must surface the login form.
//
// The test runs against a sim whose Keychain has no Better-Auth
// session token; the SvelteKit root layout's auth gate redirects to
// /login and renders the passkey / passwordless sign-in entrypoint.
import XCTest

final class LoginUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testAnonymousLaunchShowsLoginForm() {
        let app = XCUIApplication()
        // Hint the app to skip any auto-reauth attempt (the JS bridge
        // reads launchArguments via `process.argv` parity through the
        // Capacitor plugin). Even without the hint, an empty Keychain
        // forces the same route.
        app.launchArguments = ["--anonymous"]
        app.launch()

        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 30))

        // Unauthenticated launch must reach an unauthenticated ENTRY surface,
        // never the authed dashboard. With a backend the auth gate renders the
        // sign-in / passkey entry; backend-less (CI) the BackendBootGuard
        // connect screen paints first (login is backend-served). The accepted
        // set is the connect + sign-in surfaces -- deliberately excluding
        // inbox/pipeline so an authed surface leaking through would fail.
        XCTAssertTrue(
            app.waitForHeronSurface([
                "heron", "sign in", "passkey", "welcome", "invite", "reach", "try again",
            ]),
            "WebView must paint an unauthenticated entry surface for anonymous launch"
        )
    }
}
