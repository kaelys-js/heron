//
// WidgetSnapshotTests -- record-and-replay snapshots of every widget
// SwiftUI view at every family size. Each test exercises a distinct
// branch of the view's body{} so xcov picks up the per-case lines.
// First CI run records baselines under __Snapshots__/; subsequent runs
// diff. Re-record with RECORD=1 after intentional UI changes.
//
import SnapshotTesting
import SwiftUI
import WidgetKit
import XCTest

@MainActor
final class WidgetSnapshotTests: XCTestCase {
    private let referenceDate = Date(timeIntervalSince1970: 1_750_000_000)

    private func fixedIssues() -> [IssueSnapshot] {
        [
            IssueSnapshot(id: "1", severity: "warn",
                          source: "apply-linkedin",
                          summary: "CAPTCHA blocked apply",
                          ts: referenceDate.timeIntervalSince1970 * 1000),
            IssueSnapshot(id: "2", severity: "error",
                          source: "scan-portals",
                          summary: "Portal returned 500",
                          ts: referenceDate.timeIntervalSince1970 * 1000),
            IssueSnapshot(id: "3", severity: "info",
                          source: "apply-greenhouse",
                          summary: "Question needs answer",
                          ts: referenceDate.timeIntervalSince1970 * 1000),
            IssueSnapshot(id: "4", severity: "warn",
                          source: "apply-ashby",
                          summary: "Cover letter required",
                          ts: referenceDate.timeIntervalSince1970 * 1000),
            IssueSnapshot(id: "5", severity: "error",
                          source: "scan-portals",
                          summary: "Auth expired",
                          ts: referenceDate.timeIntervalSince1970 * 1000),
        ]
    }

    private func fixedTopCandidate() -> TopApplyCandidate {
        TopApplyCandidate(
            jobId: "j-1",
            company: "Anthropic",
            role: "Head of Applied AI",
            score: 4.7,
            compBand: "$240k-$320k",
            location: "Remote",
            portal: "Greenhouse"
        )
    }

    private func fixedRunnerUps() -> [TopApplyCandidate] {
        [
            TopApplyCandidate(jobId: "j-2", company: "OpenAI", role: "ML Eng",
                              score: 4.4, compBand: "$220k-$300k",
                              location: "SF", portal: "Ashby"),
            TopApplyCandidate(jobId: "j-3", company: "Mistral", role: "Research",
                              score: 4.2, compBand: "EUR 180k-EUR 240k",
                              location: "Paris", portal: "Greenhouse"),
        ]
    }

    private func assert(view: some View, name: String = #function, width: CGFloat, height: CGFloat) {
        assertSnapshot(of: view.frame(width: width, height: height), as: .image,
                       named: name)
    }

    // MARK: - InboxIssuesWidgetView -- every family + state combination

    func testInboxIssuesSmallEmpty() {
        let v = InboxIssuesWidgetView(entry: InboxEntry(
            date: referenceDate, issues: [], authenticated: true
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testInboxIssuesSmallWithIssues() {
        let v = InboxIssuesWidgetView(entry: InboxEntry(
            date: referenceDate, issues: fixedIssues(), authenticated: true
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testInboxIssuesMediumEmpty() {
        let v = InboxIssuesWidgetView(entry: InboxEntry(
            date: referenceDate, issues: [], authenticated: true
        ))
        assert(view: v, width: 320, height: 160)
    }

    func testInboxIssuesMediumWithIssues() {
        let v = InboxIssuesWidgetView(entry: InboxEntry(
            date: referenceDate, issues: fixedIssues(), authenticated: true
        ))
        assert(view: v, width: 320, height: 160)
    }

    func testInboxIssuesLargeWithIssues() {
        let v = InboxIssuesWidgetView(entry: InboxEntry(
            date: referenceDate, issues: fixedIssues(), authenticated: true
        ))
        assert(view: v, width: 320, height: 320)
    }

    func testInboxIssuesAccessoryCircular() {
        let v = InboxIssuesWidgetView(entry: InboxEntry(
            date: referenceDate, issues: fixedIssues(), authenticated: true
        ))
        assert(view: v, width: 72, height: 72)
    }

    func testInboxIssuesUnauthenticatedSmall() {
        let v = InboxIssuesWidgetView(entry: InboxEntry(
            date: referenceDate, issues: [], authenticated: false
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testInboxIssuesUnauthenticatedMedium() {
        let v = InboxIssuesWidgetView(entry: InboxEntry(
            date: referenceDate, issues: [], authenticated: false
        ))
        assert(view: v, width: 320, height: 160)
    }

    // MARK: - NextInterviewWidgetView -- non-timer paths only

    func testNextInterviewSmallNoInterview() {
        let v = NextInterviewWidgetView(entry: NextInterviewEntry(
            date: referenceDate, interview: nil, authenticated: true
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testNextInterviewMediumNoInterview() {
        let v = NextInterviewWidgetView(entry: NextInterviewEntry(
            date: referenceDate, interview: nil, authenticated: true
        ))
        assert(view: v, width: 320, height: 160)
    }

    func testNextInterviewLargeNoInterview() {
        let v = NextInterviewWidgetView(entry: NextInterviewEntry(
            date: referenceDate, interview: nil, authenticated: true
        ))
        assert(view: v, width: 320, height: 320)
    }

    func testNextInterviewAccessoryRectangularNoInterview() {
        let v = NextInterviewWidgetView(entry: NextInterviewEntry(
            date: referenceDate, interview: nil, authenticated: true
        ))
        assert(view: v, width: 200, height: 60)
    }

    func testNextInterviewAccessoryInlineNoInterview() {
        let v = NextInterviewWidgetView(entry: NextInterviewEntry(
            date: referenceDate, interview: nil, authenticated: true
        ))
        assert(view: v, width: 200, height: 20)
    }

    func testNextInterviewUnauthenticatedSmall() {
        let v = NextInterviewWidgetView(entry: NextInterviewEntry(
            date: referenceDate, interview: nil, authenticated: false
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testNextInterviewUnauthenticatedMedium() {
        let v = NextInterviewWidgetView(entry: NextInterviewEntry(
            date: referenceDate, interview: nil, authenticated: false
        ))
        assert(view: v, width: 320, height: 160)
    }

    // MARK: - TopApplyWidgetView -- every family

    func testTopApplySmallWithCandidate() {
        let v = TopApplyWidgetView(entry: TopApplyEntry(
            date: referenceDate, candidate: fixedTopCandidate(),
            runnerUps: [], authenticated: true
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testTopApplyMediumWithCandidate() {
        let v = TopApplyWidgetView(entry: TopApplyEntry(
            date: referenceDate, candidate: fixedTopCandidate(),
            runnerUps: [], authenticated: true
        ))
        assert(view: v, width: 320, height: 160)
    }

    func testTopApplyLargeWithCandidateAndRunnerUps() {
        let v = TopApplyWidgetView(entry: TopApplyEntry(
            date: referenceDate, candidate: fixedTopCandidate(),
            runnerUps: fixedRunnerUps(), authenticated: true
        ))
        assert(view: v, width: 320, height: 320)
    }

    func testTopApplyAccessoryRectangular() {
        let v = TopApplyWidgetView(entry: TopApplyEntry(
            date: referenceDate, candidate: fixedTopCandidate(),
            runnerUps: [], authenticated: true
        ))
        assert(view: v, width: 200, height: 60)
    }

    func testTopApplyAccessoryCircular() {
        let v = TopApplyWidgetView(entry: TopApplyEntry(
            date: referenceDate, candidate: fixedTopCandidate(),
            runnerUps: [], authenticated: true
        ))
        assert(view: v, width: 72, height: 72)
    }

    func testTopApplySmallNoCandidate() {
        let v = TopApplyWidgetView(entry: TopApplyEntry(
            date: referenceDate, candidate: nil,
            runnerUps: [], authenticated: true
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testTopApplyUnauthenticatedSmall() {
        let v = TopApplyWidgetView(entry: TopApplyEntry(
            date: referenceDate, candidate: nil,
            runnerUps: [], authenticated: false
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testTopApplyCandidateMissingOptionals() {
        // compBand / location / portal are optionals; render the
        // candidate with all of them nil to hit the fallback branches.
        let c = TopApplyCandidate(
            jobId: "j", company: "X", role: "Y", score: 3.5,
            compBand: nil, location: nil, portal: nil
        )
        let v = TopApplyWidgetView(entry: TopApplyEntry(
            date: referenceDate, candidate: c,
            runnerUps: [], authenticated: true
        ))
        assert(view: v, width: 320, height: 160)
    }

    // MARK: - AppWidgetEntryView (umbrella stats widget)

    func testAppWidgetSmallAuthenticated() {
        let stats = WidgetStats(queued: 3, appliedToday: 1, upcomingInterviews: 2)
        let v = AppWidgetEntryView(entry: WidgetEntry(
            date: referenceDate, stats: stats, authenticated: true
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testAppWidgetMediumAuthenticated() {
        let stats = WidgetStats(queued: 3, appliedToday: 1, upcomingInterviews: 2)
        let v = AppWidgetEntryView(entry: WidgetEntry(
            date: referenceDate, stats: stats, authenticated: true
        ))
        assert(view: v, width: 320, height: 160)
    }

    func testAppWidgetLargeAuthenticated() {
        let stats = WidgetStats(queued: 3, appliedToday: 1, upcomingInterviews: 2)
        let v = AppWidgetEntryView(entry: WidgetEntry(
            date: referenceDate, stats: stats, authenticated: true
        ))
        assert(view: v, width: 320, height: 320)
    }

    func testAppWidgetUnauthenticatedSmall() {
        let stats = WidgetStats(queued: 0, appliedToday: 0, upcomingInterviews: 0)
        let v = AppWidgetEntryView(entry: WidgetEntry(
            date: referenceDate, stats: stats, authenticated: false
        ))
        assert(view: v, width: 160, height: 160)
    }

    func testAppWidgetUnauthenticatedMedium() {
        let stats = WidgetStats(queued: 0, appliedToday: 0, upcomingInterviews: 0)
        let v = AppWidgetEntryView(entry: WidgetEntry(
            date: referenceDate, stats: stats, authenticated: false
        ))
        assert(view: v, width: 320, height: 160)
    }

    // MARK: - Primitives

    func testWidgetSignInGate() {
        assert(view: WidgetSignInGate(), width: 160, height: 160)
    }

    func testStatBlockSmall() {
        assert(view: StatBlock(label: "queued", value: 5), width: 80, height: 80)
    }

    func testStatBlockZero() {
        assert(view: StatBlock(label: "applied", value: 0), width: 80, height: 80)
    }

    func testStatBlockLargeNumber() {
        assert(view: StatBlock(label: "interviews", value: 99), width: 80, height: 80)
    }

    func testBrandBackground() {
        assert(view: BrandBackground(), width: 160, height: 160)
    }

    func testBrandMark() {
        assert(view: BrandMark(), width: 50, height: 50)
    }

    func testWidgetHeader() {
        assert(view: WidgetHeader(icon: "tray.full", label: "Inbox") { EmptyView() },
               width: 160, height: 24)
    }
}
