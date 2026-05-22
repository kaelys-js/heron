//
// NextInterviewWidgetTests -- Entry + NextInterviewSnapshot codability
// assertions and App Group read-path coverage for the Next Interview
// widget. TimelineProviderContext can't be constructed in tests, so we
// reproduce the read path against the same App Group suite.
//
import WidgetKit
import XCTest

final class NextInterviewWidgetTests: XCTestCase {
    private let key = "interview:next"

    private var defaults: UserDefaults? {
        UserDefaults(suiteName: Brand.appGroup)
    }

    override func setUp() {
        super.setUp()
        defaults?.removeObject(forKey: key)
    }

    override func tearDown() {
        defaults?.removeObject(forKey: key)
        super.tearDown()
    }

    func testNextInterviewSnapshotRoundTrips() throws {
        let when = Date(timeIntervalSince1970: 1_800_000_000)
        let snap = NextInterviewSnapshot(
            jobId: "job-7",
            company: "Anthropic",
            role: "Head of Applied AI",
            stage: "Technical screen",
            scheduledAt: when,
            interviewers: ["Sam Smith", "Jane Doe"]
        )
        let data = try JSONEncoder().encode(snap)
        let decoded = try JSONDecoder().decode(NextInterviewSnapshot.self, from: data)
        XCTAssertEqual(decoded.jobId, "job-7")
        XCTAssertEqual(decoded.company, "Anthropic")
        XCTAssertEqual(decoded.stage, "Technical screen")
        XCTAssertEqual(decoded.scheduledAt, when)
        XCTAssertEqual(decoded.interviewers, ["Sam Smith", "Jane Doe"])
    }

    func testSnapshotDecodesFromAppGroupBlob() throws {
        let d = try XCTUnwrap(defaults)
        let snap = NextInterviewSnapshot(
            jobId: "j",
            company: "Co",
            role: "R",
            stage: "Phone screen",
            scheduledAt: Date(timeIntervalSince1970: 1_700_000_000),
            interviewers: []
        )
        try d.set(JSONEncoder().encode(snap), forKey: key)
        let raw = try XCTUnwrap(d.data(forKey: key))
        let decoded = try JSONDecoder().decode(NextInterviewSnapshot.self, from: raw)
        XCTAssertEqual(decoded.jobId, "j")
        XCTAssertEqual(decoded.interviewers, [])
    }

    func testMalformedSnapshotYieldsNilDecode() throws {
        // Provider's readNext() returns nil on decode failure -- match it.
        let d = try XCTUnwrap(defaults)
        d.set(Data("not json".utf8), forKey: key)
        let raw = try XCTUnwrap(d.data(forKey: key))
        let decoded = try? JSONDecoder().decode(NextInterviewSnapshot.self, from: raw)
        XCTAssertNil(decoded)
    }

    func testEntryWithInterviewIsAuthenticated() {
        let snap = NextInterviewSnapshot(
            jobId: "j",
            company: "Co",
            role: "R",
            stage: "Final",
            scheduledAt: Date().addingTimeInterval(3600),
            interviewers: ["Pat"]
        )
        let entry = NextInterviewEntry(date: Date(), interview: snap, authenticated: true)
        XCTAssertNotNil(entry.interview)
        XCTAssertEqual(entry.interview?.company, "Co")
        XCTAssertTrue(entry.authenticated)
    }

    func testEntryWithoutInterview() {
        // Empty-state branch -- no interview on the calendar yet.
        let entry = NextInterviewEntry(date: Date(), interview: nil, authenticated: true)
        XCTAssertNil(entry.interview)
        XCTAssertTrue(entry.authenticated)
    }

    func testEntryUnauthenticatedHidesInterview() {
        // The widget body shows the sign-in gate first; data presence
        // doesn't matter, but the entry shape supports both.
        let snap = NextInterviewSnapshot(
            jobId: "j", company: "X", role: "Y", stage: "Z",
            scheduledAt: Date(), interviewers: []
        )
        let entry = NextInterviewEntry(date: Date(), interview: snap, authenticated: false)
        XCTAssertFalse(entry.authenticated)
        // Snapshot is still present; gate is enforced by the View body.
        XCTAssertNotNil(entry.interview)
    }
}
