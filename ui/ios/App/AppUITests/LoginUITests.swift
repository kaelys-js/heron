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

        // Login form -- accessible label contains "sign in" / "passkey"
        // / "email" depending on the variant the layout renders.
        let signInEntry = app.webViews.descendants(matching: .any)
            .matching(
                NSPredicate(
                    format: "label CONTAINS[c] 'sign in' OR label CONTAINS[c] 'passkey' OR label CONTAINS[c] 'continue with email'"
                )
            )
            .firstMatch
        XCTAssertTrue(
            signInEntry.waitForExistence(timeout: 15),
            "Login surface must render for anonymous launch"
        )
    }
}
