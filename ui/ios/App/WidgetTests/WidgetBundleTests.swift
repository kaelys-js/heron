//
// WidgetBundleTests -- smoke-level checks on the WidgetStats + WidgetEntry
// types declared in WidgetBundle.swift. The @main AppWidgetBundle itself
// is exercised at app-launch time on the host, not in unit tests.
//
@testable import AppWidget
import WidgetKit
import XCTest

final class WidgetBundleTests: XCTestCase {
    func testWidgetStatsDefaultZero() {
        // Provider's fallback when the App Group is missing: every counter
        // reads 0. This shape gets rendered as "all clear" in the UI.
        let s = WidgetStats(queued: 0, appliedToday: 0, upcomingInterviews: 0)
        XCTAssertEqual(s.queued, 0)
        XCTAssertEqual(s.appliedToday, 0)
        XCTAssertEqual(s.upcomingInterviews, 0)
    }

    func testWidgetStatsRoundTripsThroughJSON() throws {
        let s = WidgetStats(queued: 7, appliedToday: 2, upcomingInterviews: 4)
        let data = try JSONEncoder().encode(s)
        let decoded = try JSONDecoder().decode(WidgetStats.self, from: data)
        XCTAssertEqual(decoded.queued, 7)
        XCTAssertEqual(decoded.appliedToday, 2)
        XCTAssertEqual(decoded.upcomingInterviews, 4)
    }

    func testWidgetEntryHoldsStatsAndAuthFlag() {
        // TimelineEntry conformance + the two fields the provider sets.
        let now = Date()
        let entry = WidgetEntry(
            date: now,
            stats: WidgetStats(queued: 3, appliedToday: 1, upcomingInterviews: 2),
            authenticated: true
        )
        XCTAssertEqual(entry.date, now)
        XCTAssertEqual(entry.stats.queued, 3)
        XCTAssertTrue(entry.authenticated)
    }

    func testWidgetEntrySignedOut() {
        // The sign-out branch the gate consumes. Stats are still set so
        // the view body can switch on auth state, not nil-check.
        let entry = WidgetEntry(
            date: Date(),
            stats: WidgetStats(queued: 0, appliedToday: 0, upcomingInterviews: 0),
            authenticated: false
        )
        XCTAssertFalse(entry.authenticated)
    }
}
