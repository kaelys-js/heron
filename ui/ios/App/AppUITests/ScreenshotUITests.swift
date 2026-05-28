// ScreenshotUITests — fastlane `snapshot`-driven App Store screenshots.
//
// Captures real, rendered screens via XCUITest (no hand-edited PNGs). Runs on
// every device class the `screenshots` lane lists. Uses SnapshotHelper.swift
// (setupSnapshot + snapshot) which fastlane wires up at capture time.
//
// Backend-less CI note: the WebView needs a reachable backend to get past the
// BackendBootGuard gate (it can't render the dashboard from nothing). The
// `screenshots` lane points the simulator at a local screenshot-mode backend
// (adapter-node server with HERON_SCREENSHOT_MODE=1 + a tmpdir data dir →
// auth bypass + seeded demo data). This test is deliberately defensive: it
// captures whatever has painted after hydration rather than asserting a
// specific surface, so a missing backend yields the (still non-blank) connect
// screen instead of a failed run.
import XCTest

// @MainActor: fastlane's SnapshotHelper marks setupSnapshot/snapshot as
// main-actor-isolated (Swift 6 concurrency), so the callers must be too.
@MainActor
final class ScreenshotUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCaptureKeyScreens() {
        let app = XCUIApplication()
        // Screenshot mode: when the capture harness provides a seeded backend
        // (HERON_SCREENSHOT_BACKEND in the test runner's environment), forward it
        // to the app via a launch arg + launch-environment. BridgeViewController
        // then points the WebView at it and marks the client authed, so we
        // capture the real dashboard instead of the connect screen. Absent the
        // env var the test runs backend-less (best-effort) exactly as before.
        let backend = ProcessInfo.processInfo.environment["HERON_SCREENSHOT_BACKEND"] ?? ""
        if !backend.isEmpty {
            app.launchArguments += ["--heron-screenshots"]
            app.launchEnvironment["HERON_SCREENSHOT_BACKEND"] = backend
        }
        setupSnapshot(app)
        app.launch()

        // The WebView element exists during the splash/boot, so don't capture
        // on its mere existence (that yields a blank #0e1014 frame). Wait until
        // a REAL surface has painted — any of: connect screen, sign-in, or an
        // authed surface — then capture. Generous timeout to ride out the
        // native splash (3.5s) + backend-discovery ladder.
        let painted = firstMatch(
            in: app,
            needles: [
                "heron", "sign in", "passkey", "welcome", "invite",
                "reach", "try again", "inbox", "pipeline",
            ],
            timeout: 40,
        )
        XCTAssertTrue(painted, "WebView never painted a recognizable surface for screenshots")
        sleep(2)
        snapshot("01-Launch")

        // If a recognizable primary surface is reachable, capture it too. These
        // are best-effort — absent (no backend / different route) they no-op
        // rather than fail the run.
        captureIfPresent(in: app, matching: ["inbox", "pipeline", "dashboard"], named: "02-Inbox")
        captureIfPresent(in: app, matching: ["sign in", "passkey", "welcome"], named: "03-SignIn")
    }

    /// Whether a WebView element whose label contains any of `needles`
    /// (case-insensitive) appears within `timeout`.
    private func firstMatch(in app: XCUIApplication, needles: [String], timeout: TimeInterval) -> Bool {
        let predicate = needles.map { "label CONTAINS[c] '\($0)'" }.joined(separator: " OR ")
        return app.webViews
            .descendants(matching: .any)
            .matching(NSPredicate(format: predicate))
            .firstMatch
            .waitForExistence(timeout: timeout)
    }

    /// Snapshot only if a matching surface is reachable. Keeps the run green
    /// when a surface isn't present in this environment.
    private func captureIfPresent(in app: XCUIApplication, matching needles: [String], named: String) {
        if firstMatch(in: app, needles: needles, timeout: 3) {
            sleep(1)
            snapshot(named)
        }
    }
}
