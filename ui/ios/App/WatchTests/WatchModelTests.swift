//
// WatchModelTests -- applyPayload branches + persistToDefaults round-trip
// for WatchModel. WCSession activation is exercised only via bootstrap()
// (loadFromDefaults path); paired-phone messaging needs hardware -- see
// WatchSessionBridgeTests on the iOS side for the phone-side smoke.
//
@testable import WatchApp
import XCTest

@MainActor
final class WatchModelTests: XCTestCase {
    private var defaults: UserDefaults? {
        UserDefaults(suiteName: Brand.appGroup)
    }

    private let appGroupKeys = [
        "auth:isAuthenticated",
        "stats:queued",
        "stats:appliedToday",
        "stats:upcomingInterviews",
        "interview:next",
        "topApply:next",
        "issues:open",
    ]

    override func setUp() {
        super.setUp()
        appGroupKeys.forEach { defaults?.removeObject(forKey: $0) }
    }

    override func tearDown() {
        appGroupKeys.forEach { defaults?.removeObject(forKey: $0) }
        super.tearDown()
    }

    // MARK: - Initial state

    func testInitialStateIsEmpty() {
        let m = WatchModel()
        XCTAssertEqual(m.stats.queued, 0)
        XCTAssertEqual(m.stats.appliedToday, 0)
        XCTAssertEqual(m.stats.upcomingInterviews, 0)
        XCTAssertNil(m.nextInterview)
        XCTAssertNil(m.topApply)
        XCTAssertTrue(m.openIssues.isEmpty)
        XCTAssertNil(m.lastSyncAt)
        XCTAssertFalse(m.isReachable)
        XCTAssertFalse(m.isAuthenticated)
    }

    func testSharedSingletonIsStable() {
        let a = WatchModel.shared
        let b = WatchModel.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - applyPayload: auth

    func testApplyPayloadAuthTrue() {
        let m = WatchModel()
        m.applyPayload(["authenticated": true])
        XCTAssertTrue(m.isAuthenticated)
    }

    func testApplyPayloadAuthFalseScrubsAllData() {
        let m = WatchModel()
        // Seed some data first
        m.applyPayload([
            "authenticated": true,
            "stats": ["queued": 5, "appliedToday": 1, "upcomingInterviews": 2],
        ])
        XCTAssertEqual(m.stats.queued, 5)
        // Then sign out -- everything must be wiped.
        m.applyPayload(["authenticated": false])
        XCTAssertFalse(m.isAuthenticated)
        XCTAssertEqual(m.stats.queued, 0)
        XCTAssertEqual(m.stats.appliedToday, 0)
        XCTAssertNil(m.nextInterview)
        XCTAssertNil(m.topApply)
        XCTAssertTrue(m.openIssues.isEmpty)
    }

    func testApplyPayloadInfersAuthWhenFlagMissing() {
        // Per the source: a payload without `authenticated` is treated as
        // proof the iPhone is in an authenticated session.
        let m = WatchModel()
        m.applyPayload(["stats": ["queued": 1]])
        XCTAssertTrue(m.isAuthenticated)
    }

    // MARK: - applyPayload: stats

    func testApplyPayloadMergesStats() {
        let m = WatchModel()
        m.applyPayload([
            "stats": ["queued": 7, "appliedToday": 3, "upcomingInterviews": 4],
        ])
        XCTAssertEqual(m.stats.queued, 7)
        XCTAssertEqual(m.stats.appliedToday, 3)
        XCTAssertEqual(m.stats.upcomingInterviews, 4)
    }

    func testApplyPayloadStatsPartialUpdate() {
        // Only one stat key set -- the rest must retain their prior values.
        let m = WatchModel()
        m.applyPayload(["stats": ["queued": 10, "appliedToday": 2, "upcomingInterviews": 5]])
        m.applyPayload(["stats": ["queued": 11]])
        XCTAssertEqual(m.stats.queued, 11)
        XCTAssertEqual(m.stats.appliedToday, 2)
        XCTAssertEqual(m.stats.upcomingInterviews, 5)
    }

    func testApplyPayloadEmptyDictionaryDoesNotCrash() {
        let m = WatchModel()
        XCTAssertNoThrow(m.applyPayload([:]))
        // Empty dict has no `authenticated` key, so the model infers true.
        XCTAssertTrue(m.isAuthenticated)
    }

    // MARK: - applyPayload: snapshots

    func testApplyPayloadDecodesNextInterview() {
        let m = WatchModel()
        let interview: [String: Any] = [
            "jobId": "j",
            "company": "Co",
            "role": "R",
            "stage": "Final",
            "scheduledAt": Date(timeIntervalSince1970: 1_700_000_000).timeIntervalSinceReferenceDate,
            "interviewers": ["Sam"],
        ]
        m.applyPayload(["nextInterview": interview])
        XCTAssertNotNil(m.nextInterview)
        XCTAssertEqual(m.nextInterview?.company, "Co")
    }

    func testApplyPayloadClearsNextInterviewOnNil() {
        let m = WatchModel()
        // Seed an interview first
        let snap: [String: Any] = [
            "jobId": "j", "company": "Co", "role": "R", "stage": "S",
            "scheduledAt": Date().timeIntervalSinceReferenceDate,
            "interviewers": [String](),
        ]
        m.applyPayload(["nextInterview": snap])
        XCTAssertNotNil(m.nextInterview)
        // NSNull through `payload.keys.contains("nextInterview")` branch
        m.applyPayload(["nextInterview": NSNull()])
        XCTAssertNil(m.nextInterview)
    }

    func testApplyPayloadDecodesTopApply() {
        let m = WatchModel()
        m.applyPayload([
            "topApply": [
                "jobId": "j",
                "company": "Co",
                "role": "R",
                "score": 4.5,
            ],
        ])
        XCTAssertNotNil(m.topApply)
        XCTAssertEqual(m.topApply?.score ?? 0, 4.5, accuracy: 0.0001)
    }

    func testApplyPayloadDecodesOpenIssues() {
        let m = WatchModel()
        m.applyPayload([
            "openIssues": [
                ["id": "i1", "severity": "warn", "source": "apply", "summary": "blocked", "ts": 1.0],
                ["id": "i2", "severity": "error", "source": "scan", "summary": "boom", "ts": 2.0],
            ],
        ])
        XCTAssertEqual(m.openIssues.count, 2)
        XCTAssertEqual(m.openIssues.first?.id, "i1")
    }

    func testApplyPayloadIgnoresMalformedSnapshot() {
        // Missing required field -- the JSON decode fails and the snapshot
        // stays nil. The model must NOT crash.
        let m = WatchModel()
        XCTAssertNoThrow(m.applyPayload([
            "nextInterview": ["company": "Co"], // missing jobId, role, stage, scheduledAt, interviewers
        ]))
        XCTAssertNil(m.nextInterview)
    }

    func testApplyPayloadIgnoresWrongTypes() {
        // `stats` typed as something other than [String: Int] -- branch
        // is gated by `as? [String: Int]` so the assignment is skipped.
        let m = WatchModel()
        m.applyPayload(["stats": "not a dictionary"])
        XCTAssertEqual(m.stats.queued, 0)
    }

    // MARK: - Persistence

    func testPersistAndReloadRoundTrip() throws {
        // Write through one model, read back through another via
        // bootstrap() -- which internally calls loadFromDefaults().
        let writer = WatchModel()
        writer.applyPayload([
            "authenticated": true,
            "stats": ["queued": 4, "appliedToday": 2, "upcomingInterviews": 1],
            "topApply": [
                "jobId": "j", "company": "Co", "role": "R", "score": 4.1,
            ],
            "openIssues": [
                ["id": "x", "severity": "info", "source": "s", "summary": "y", "ts": 0.0],
            ],
        ])
        // Confirm the writer pushed state through to the App Group suite.
        let d = try XCTUnwrap(defaults)
        XCTAssertTrue(d.bool(forKey: "auth:isAuthenticated"))
        XCTAssertEqual(d.integer(forKey: "stats:queued"), 4)
        XCTAssertNotNil(d.data(forKey: "topApply:next"))
        XCTAssertNotNil(d.data(forKey: "issues:open"))

        // A second instance picks up the same state via bootstrap().
        let reader = WatchModel()
        reader.bootstrap()
        XCTAssertTrue(reader.isAuthenticated)
        XCTAssertEqual(reader.stats.queued, 4)
        XCTAssertEqual(reader.stats.appliedToday, 2)
        XCTAssertEqual(reader.stats.upcomingInterviews, 1)
        XCTAssertEqual(reader.topApply?.jobId, "j")
        XCTAssertEqual(reader.openIssues.count, 1)
    }

    func testPersistClearsTopApplyOnNil() throws {
        let m = WatchModel()
        m.applyPayload([
            "topApply": ["jobId": "j", "company": "Co", "role": "R", "score": 3.0],
        ])
        let d = try XCTUnwrap(defaults)
        XCTAssertNotNil(d.data(forKey: "topApply:next"))
        // Clear via NSNull payload
        m.applyPayload(["topApply": NSNull()])
        XCTAssertNil(d.data(forKey: "topApply:next"))
    }
}
