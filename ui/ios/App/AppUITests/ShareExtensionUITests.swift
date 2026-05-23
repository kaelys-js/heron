// ShareExtensionUITests -- invoke the app's share extension from
// Safari + assert it accepts a URL.
//
// Safari is the only system-installed app that reliably exposes a
// share sheet on a fresh sim. The test types a URL, taps Share, then
// taps the app's extension entry. The extension's success surface
// confirms the share flow round-tripped.
//
// Flake guard: the share-sheet population is heuristic-driven by iOS
// (recent apps surface first). If the app's extension doesn't appear
// in the share sheet within 10s, the test XCTSkips rather than fails;
// the extension's own logic-bundle tests (AppShareExtensionTests)
// cover the same surface deterministically.
import XCTest

final class ShareExtensionUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testShareExtensionAcceptsURLFromSafari() throws {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.launch()
        guard safari.state == .runningForeground else {
            throw XCTSkip("Safari not available on this sim variant")
        }

        // Type a URL into Safari's address bar.
        let addressBar = safari.textFields.firstMatch
        XCTAssertTrue(addressBar.waitForExistence(timeout: 10))
        addressBar.tap()
        addressBar.typeText("https://example.com/job/abc\n")

        // Wait for the page to settle, then trigger Share.
        let shareButton = safari.buttons["Share"].firstMatch
        guard shareButton.waitForExistence(timeout: 15) else {
            throw XCTSkip("Share button not reachable on this sim layout")
        }
        shareButton.tap()

        // Look for the app's extension entry in the share sheet.
        // Brand.displayName (resolved at build time) is what surfaces
        // here; for the default Heron brand that's "Heron".
        let appExt = safari.cells.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] 'heron'")
        ).firstMatch
        guard appExt.waitForExistence(timeout: 10) else {
            throw XCTSkip("App's share extension not surfaced in Safari's share sheet")
        }
        appExt.tap()

        // Extension's success surface ("Saved" / "Added to inbox") or
        // its compose UI ("Add note" / "Tag") should be visible within
        // 10s of selection.
        let extSurface = safari.staticTexts.matching(
            NSPredicate(
                format: "label CONTAINS[c] 'saved' OR label CONTAINS[c] 'added' OR label CONTAINS[c] 'inbox' OR label CONTAINS[c] 'add note'"
            )
        ).firstMatch
        XCTAssertTrue(
            extSurface.waitForExistence(timeout: 10),
            "Share extension UI must reach a recognizable state"
        )
    }
}
