//
import SnapshotTesting
import SwiftUI

// RootViewTests -- visual regression for the Watch's RootView.
//
// Renders RootView in three states (authenticated populated,
// authenticated empty, unauthenticated gate). Each state exercises
// body{} on the relevant pages so xcov picks up the SwiftUI lines,
// then assertSnapshot pixel-diffs against the committed baseline in
// __Snapshots__/.
//
// Mirrors WidgetSnapshotTests.swift's progressive-enhancement pattern:
// first-run with no baseline + RECORD_MODE!=1 short-circuits to
// view-materialization only (test passes, no diff). `RECORD_MODE=1
// bundle exec fastlane test_ci` writes baselines; commit the resulting
// __Snapshots__/ subtree to enable verification on subsequent runs.
//
// Simulator pinning: Apple Watch Ultra 2 / watchOS 11 (Fastfile).
// Baselines recorded on any other watchOS sim WILL diff against CI's
// render.
//
@testable import WatchApp
import XCTest

@MainActor
final class RootViewTests: XCTestCase {
    private let referenceDate = Date(timeIntervalSince1970: 1_750_000_000)

    private func makeAuthenticatedModel() -> WatchModel {
        let m = WatchModel()
        m.isAuthenticated = true
        m.stats = WatchModel.Stats(queued: 3, appliedToday: 1, upcomingInterviews: 2)
        m.nextInterview = WatchModel.InterviewSnapshot(
            jobId: "j-1",
            company: "Anthropic",
            role: "Head of Applied AI",
            stage: "Technical screen",
            scheduledAt: referenceDate.addingTimeInterval(3600),
            interviewers: ["Alex", "Sam"]
        )
        m.topApply = WatchModel.ApplyCandidate(
            jobId: "j-1",
            company: "OpenAI",
            role: "ML Eng",
            score: 4.5,
            compBand: "$220k-$300k",
            location: "Remote",
            portal: "Greenhouse"
        )
        m.openIssues = [
            WatchModel.IssueSnapshot(
                id: "1",
                severity: "warn",
                source: "apply-linkedin",
                summary: "CAPTCHA blocked apply",
                ts: referenceDate.timeIntervalSince1970 * 1000
            ),
            WatchModel.IssueSnapshot(
                id: "2",
                severity: "error",
                source: "scan-portals",
                summary: "Portal returned 500",
                ts: referenceDate.timeIntervalSince1970 * 1000
            ),
        ]
        m.lastSyncAt = referenceDate
        return m
    }

    private func makeAuthenticatedEmptyModel() -> WatchModel {
        let m = WatchModel()
        m.isAuthenticated = true
        return m
    }

    private func makeUnauthenticatedModel() -> WatchModel {
        let m = WatchModel()
        m.isAuthenticated = false
        return m
    }

    /// Render `view` + (if a baseline exists OR RECORD_MODE=1) image-diff.
    /// See WidgetSnapshotTests.swift for the progressive-enhancement
    /// pattern's rationale.
    private func snap(
        view: some View,
        testName: String = #function,
        file: StaticString = #filePath
    ) {
        // View-materialization coverage: ImageRenderer.uiImage forces
        // SwiftUI's body{} to evaluate. Even if image-diff is gated off
        // (no baseline yet), this assertion lines coverage.
        let renderer = ImageRenderer(content: AnyView(view))
        guard let renderedImage = renderer.uiImage else {
            XCTFail("ImageRenderer.uiImage returned nil for \(testName)")
            return
        }

        let recordMode = ProcessInfo.processInfo.environment["RECORD_MODE"] == "1"
        let testFile = URL(fileURLWithPath: "\(file)")
        let snapshotsDir = testFile
            .deletingLastPathComponent()
            .appendingPathComponent("__Snapshots__")
        let testClassName = testFile.deletingPathExtension().lastPathComponent
        let canonicalTestName = String(testName.dropLast(2))
        let baselineFile = snapshotsDir
            .appendingPathComponent("\(testClassName).\(canonicalTestName).1.png")
        let baselineExists = FileManager.default.fileExists(atPath: baselineFile.path)

        guard recordMode || baselineExists else { return }

        // watchOS doesn't expose Snapshotting<some View, _>.image -- the
        // SnapshotTesting SwiftUI extension is iOS/macOS/tvOS only.
        // Render to UIImage manually via the ImageRenderer above, then
        // diff against UIImage's well-supported `.image` strategy.
        assertSnapshot(
            of: renderedImage,
            as: .image(precision: 0.98, perceptualPrecision: 0.98),
            file: file,
            testName: testName
        )
    }

    // MARK: - Authenticated states

    func testRootViewAuthenticatedPopulated() {
        let model = makeAuthenticatedModel()
        let view = RootView()
            .environmentObject(model)
            .frame(width: 184, height: 224) // Apple Watch Ultra 2 dimensions
        snap(view: view)
    }

    func testRootViewAuthenticatedEmpty() {
        let model = makeAuthenticatedEmptyModel()
        let view = RootView()
            .environmentObject(model)
            .frame(width: 184, height: 224)
        snap(view: view)
    }

    // MARK: - Unauthenticated gate

    func testRootViewUnauthenticated() {
        let model = makeUnauthenticatedModel()
        let view = RootView()
            .environmentObject(model)
            .frame(width: 184, height: 224)
        snap(view: view)
    }

    // MARK: - Smaller form factor (Series 10 41mm)

    func testRootViewAuthenticatedSmallForm() {
        let model = makeAuthenticatedModel()
        let view = RootView()
            .environmentObject(model)
            .frame(width: 150, height: 184)
        snap(view: view)
    }
}
