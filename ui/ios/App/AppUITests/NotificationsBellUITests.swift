// NotificationsBellUITests -- tap the notifications bell + assert
// either the sheet (mobile) or the dropdown (desktop) surfaces its
// content. Same accessibility selector works for both because the
// notification entry's aria-label is shared across responsive layouts.
import XCTest

final class NotificationsBellUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testBellOpensNotificationsSurface() throws {
        let app = XCUIApplication()
        app.launch()

        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 30))

        // Bell button -- aria-label="Notifications" per NotificationsBell.svelte.
        let bell = app.webViews.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'notification'")
        ).firstMatch
        guard bell.waitForExistence(timeout: 10) else {
            throw XCTSkip("Notifications bell not present (e.g. unauthed layout)")
        }

        bell.tap()

        // Notification surface should expose its empty-state copy or
        // an activity-feed entry within 5s of tap.
        let surface = app.webViews.descendants(matching: .any)
            .matching(
                NSPredicate(
                    format: "label CONTAINS[c] 'no notifications' OR label CONTAINS[c] 'recent' OR label CONTAINS[c] 'activity'"
                )
            )
            .firstMatch
        XCTAssertTrue(
            surface.waitForExistence(timeout: 5),
            "Notifications surface must render after bell tap"
        )
    }
}
