//
// InterviewAttributesTests -- HeronInterviewAttributes + ContentState
// Codable + Hashable conformance. The SwiftUI body of the Live
// Activity widget can't be unit tested without ViewInspector + a
// running WidgetKit host; this file covers the data contract that
// the WebView -> ActivityKit -> Widget pipeline depends on.
//
import ActivityKit
import Foundation
import XCTest

@available(iOS 16.1, *)
final class InterviewAttributesTests: XCTestCase {
    private let fixedDate = Date(timeIntervalSince1970: 1_750_000_000)

    private func makeState(
        date: Date? = nil,
        company: String = "Acme Co",
        role: String = "Senior iOS",
        stage: String = "Final"
    ) -> HeronInterviewAttributes.State {
        HeronInterviewAttributes.State(
            scheduledAt: date ?? fixedDate,
            company: company,
            role: role,
            stage: stage
        )
    }

    // MARK: - Init + property access

    func testStateInitializesAllFields() {
        let s = makeState()
        XCTAssertEqual(s.scheduledAt.timeIntervalSince1970, fixedDate.timeIntervalSince1970)
        XCTAssertEqual(s.company, "Acme Co")
        XCTAssertEqual(s.role, "Senior iOS")
        XCTAssertEqual(s.stage, "Final")
    }

    func testAttributesInitWithJobId() {
        let a = HeronInterviewAttributes(jobId: "job-123")
        XCTAssertEqual(a.jobId, "job-123")
    }

    func testContentStateAliasMatchesNestedState() {
        // ActivityAttributes pattern: ContentState typealias = State.
        let s: HeronInterviewAttributes.ContentState = makeState()
        XCTAssertEqual(s.company, "Acme Co")
    }

    // MARK: - Codable round-trip

    func testStateEncodesToJSON() throws {
        let s = makeState()
        let data = try JSONEncoder().encode(s)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        XCTAssertEqual(json["company"] as? String, "Acme Co")
        XCTAssertEqual(json["role"] as? String, "Senior iOS")
        XCTAssertEqual(json["stage"] as? String, "Final")
    }

    func testStateRoundTripsThroughJSON() throws {
        let original = makeState(company: "Initech", role: "Backend", stage: "Technical")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(HeronInterviewAttributes.State.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testStateRejectsMalformedJSON() {
        let bad = Data("{\"company\":\"X\"}".utf8)
        XCTAssertThrowsError(
            try JSONDecoder().decode(HeronInterviewAttributes.State.self, from: bad)
        )
    }

    // MARK: - Hashable

    func testStateEqualityWhenAllFieldsMatch() {
        XCTAssertEqual(makeState(), makeState())
    }

    func testStateInequalityWhenFieldDiffers() {
        XCTAssertNotEqual(makeState(company: "A"), makeState(company: "B"))
        XCTAssertNotEqual(makeState(role: "A"), makeState(role: "B"))
        XCTAssertNotEqual(makeState(stage: "A"), makeState(stage: "B"))
        XCTAssertNotEqual(makeState(date: fixedDate), makeState(date: fixedDate.addingTimeInterval(1)))
    }

    func testStateHashesEquallyForEqualValues() {
        var set = Set<HeronInterviewAttributes.State>()
        set.insert(makeState())
        set.insert(makeState())
        XCTAssertEqual(set.count, 1)
    }

    func testStateHashesDistinctlyForDifferentValues() {
        var set = Set<HeronInterviewAttributes.State>()
        set.insert(makeState(company: "A"))
        set.insert(makeState(company: "B"))
        XCTAssertEqual(set.count, 2)
    }

    // MARK: - Stage variant coverage (documents the contract)

    func testStageValuesAreOpaqueStrings() {
        // The data contract from VOICE.md: stage is a string the WebView
        // assembles ("Phone screen" / "Technical" / "Final" / etc.).
        // Confirm the Live Activity doesn't mutate or validate it.
        for stage in ["Phone screen", "Technical", "Final", "Onsite", ""] {
            let s = makeState(stage: stage)
            XCTAssertEqual(s.stage, stage)
        }
    }

    // MARK: - Brand deep-link integration

    func testBrandDeepLinkProducesExpectedScheme() {
        // The Live Activity's "Open prep" button uses
        // Brand.deepLink("interview-prep/{jobId}"). Brand.deepLink is
        // tested in AppTests; here we just confirm the format is what
        // the Widget body expects (the URL is built via string interp).
        let link = Brand.deepLink("interview-prep/abc")
        XCTAssertTrue(link.hasSuffix("interview-prep/abc"))
        XCTAssertNotNil(URL(string: link))
    }
}
