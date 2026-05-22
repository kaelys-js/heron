//
// InboxIssuesWidgetTests -- Entry + IssueSnapshot codability + the
// provider's App Group read path. TimelineProviderContext has no public
// init, so we reproduce the read path against the same suite the widget
// will read at refresh time rather than calling placeholder(in:) directly.
//
import WidgetKit
import XCTest

final class InboxIssuesWidgetTests: XCTestCase {
    private let issuesKey = "issues:open"
    private let authKey = "auth:isAuthenticated"

    private var defaults: UserDefaults? {
        UserDefaults(suiteName: Brand.appGroup)
    }

    override func setUp() {
        super.setUp()
        defaults?.removeObject(forKey: issuesKey)
        defaults?.removeObject(forKey: authKey)
    }

    override func tearDown() {
        defaults?.removeObject(forKey: issuesKey)
        defaults?.removeObject(forKey: authKey)
        super.tearDown()
    }

    func testIssueSnapshotRoundTripsThroughJSON() throws {
        let original = IssueSnapshot(
            id: "x",
            severity: "info",
            source: "queue",
            summary: "hello",
            ts: 1_700_000_000_000
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(IssueSnapshot.self, from: data)
        XCTAssertEqual(decoded.id, "x")
        XCTAssertEqual(decoded.severity, "info")
        XCTAssertEqual(decoded.source, "queue")
        XCTAssertEqual(decoded.summary, "hello")
        XCTAssertEqual(decoded.ts, 1_700_000_000_000)
    }

    func testIssueArrayDecodesFromAppGroupBlob() throws {
        // Mirrors the provider's read() path: write JSON into the App
        // Group, decode it the same way the widget will at refresh time.
        let d = try XCTUnwrap(defaults)
        let issues = [
            IssueSnapshot(id: "a", severity: "error", source: "apply", summary: "boom", ts: 1),
            IssueSnapshot(id: "b", severity: "warn", source: "scan", summary: "captcha", ts: 2),
        ]
        try d.set(JSONEncoder().encode(issues), forKey: issuesKey)
        let raw = try XCTUnwrap(d.data(forKey: issuesKey))
        let decoded = try JSONDecoder().decode([IssueSnapshot].self, from: raw)
        XCTAssertEqual(decoded.count, 2)
        XCTAssertEqual(decoded[0].id, "a")
        XCTAssertEqual(decoded[1].severity, "warn")
    }

    func testMalformedIssuesBlobYieldsEmptyDecode() throws {
        // The provider falls back to [] when the JSON doesn't parse. If
        // that contract ever broke, the widget would crash on render --
        // assert the decoder produces no value (not a partial array).
        let d = try XCTUnwrap(defaults)
        d.set(Data("not json".utf8), forKey: issuesKey)
        let raw = try XCTUnwrap(d.data(forKey: issuesKey))
        let decoded = try? JSONDecoder().decode([IssueSnapshot].self, from: raw)
        XCTAssertNil(decoded)
    }

    func testMissingIssuesKeyReadsAsNoData() throws {
        let d = try XCTUnwrap(defaults)
        XCTAssertNil(d.data(forKey: issuesKey))
    }

    func testInboxEntryConstructsWithFields() {
        // TimelineEntry conformance -- date + custom payload are set
        // exactly as the provider would set them.
        let now = Date()
        let entry = InboxEntry(
            date: now,
            issues: [IssueSnapshot(id: "i", severity: "info", source: "s", summary: "m", ts: 0)],
            authenticated: true
        )
        XCTAssertEqual(entry.date, now)
        XCTAssertEqual(entry.issues.count, 1)
        XCTAssertTrue(entry.authenticated)
    }

    func testInboxEntryWithEmptyIssuesAndUnauthenticated() {
        // Signed-out branch -- the entry the gate path consumes.
        let entry = InboxEntry(date: Date(), issues: [], authenticated: false)
        XCTAssertTrue(entry.issues.isEmpty)
        XCTAssertFalse(entry.authenticated)
    }
}
