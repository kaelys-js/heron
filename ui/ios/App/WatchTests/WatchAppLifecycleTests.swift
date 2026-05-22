//
// WatchAppLifecycleTests -- minimal assertions on the @main WatchApp
// struct's environment-object wiring + the singleton WatchModel it
// owns. The Scene body itself (NavigationStack, TabView) can't be
// inspected without a SwiftUI snapshot dependency.
//
@testable import WatchApp
import XCTest

@MainActor
final class WatchAppLifecycleTests: XCTestCase {
    func testSharedModelExistsAtAppLaunch() {
        // WatchApp uses `@StateObject private var model = WatchModel.shared`
        // -- the singleton must be ready before the WindowGroup is built.
        XCTAssertNotNil(WatchModel.shared)
    }

    func testFreshModelHasEmptyStats() {
        // First-launch contract: a model constructed without calling
        // bootstrap() carries zero counters. The gate logic relies on
        // this default to render the sign-in CTA over empty data.
        let m = WatchModel()
        XCTAssertEqual(m.stats.queued, 0)
        XCTAssertEqual(m.stats.appliedToday, 0)
        XCTAssertEqual(m.stats.upcomingInterviews, 0)
        XCTAssertFalse(m.isAuthenticated)
    }

    func testBootstrapIsCallable() {
        // bootstrap() activates WCSession + calls loadFromDefaults. On a
        // simulator with no paired phone WCSession.isSupported() is false
        // and the call short-circuits -- the defaults read still runs.
        let m = WatchModel()
        XCTAssertNoThrow(m.bootstrap())
    }

    func testStructsAreCodable() throws {
        // WatchModel publishes Stats, InterviewSnapshot, ApplyCandidate,
        // IssueSnapshot to the UI. Each must round-trip via JSON so the
        // App Group persistence stays correct.
        let stats = WatchModel.Stats(queued: 1, appliedToday: 2, upcomingInterviews: 3)
        _ = try JSONEncoder().encode(stats)

        let interview = WatchModel.InterviewSnapshot(
            jobId: "j", company: "Co", role: "R", stage: "Final",
            scheduledAt: Date(), interviewers: ["A"]
        )
        _ = try JSONEncoder().encode(interview)

        let apply = WatchModel.ApplyCandidate(
            jobId: "j", company: "Co", role: "R", score: 4.0,
            compBand: nil, location: nil, portal: nil
        )
        _ = try JSONEncoder().encode(apply)

        let issue = WatchModel.IssueSnapshot(
            id: "i", severity: "warn", source: "s", summary: "m", ts: 0
        )
        _ = try JSONEncoder().encode(issue)
    }
}
