import Foundation
import Combine
import WatchConnectivity
import WidgetKit

/**
 * WatchModel — single source of truth for the watch UI.
 *
 * Holds the same data shape the iPhone widgets read out of the App
 * Group. Updates arrive through three channels (in priority order):
 *
 *   1. WCSession messages from the iPhone (push, ~real-time)
 *   2. App Group UserDefaults written by the phone (used when the
 *      phone is unreachable; same defaults the iPhone widgets use)
 *   3. Empty / placeholder data for first-launch on the watch
 *
 * The `@MainActor @Published` properties drive the UI directly; views
 * just bind to them.
 */
@MainActor
final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchModel()

    @Published var stats: Stats = .empty
    @Published var nextInterview: InterviewSnapshot?
    @Published var topApply: ApplyCandidate?
    @Published var openIssues: [IssueSnapshot] = []
    @Published var lastSyncAt: Date?
    @Published var isReachable: Bool = false

    private let appGroupId = "group.com.resistjs.careerops"

    struct Stats: Codable {
        var queued: Int = 0
        var appliedToday: Int = 0
        var upcomingInterviews: Int = 0
        static let empty = Stats()
    }
    struct InterviewSnapshot: Codable {
        var jobId: String
        var company: String
        var role: String
        var stage: String
        var scheduledAt: Date
        var interviewers: [String]
    }
    struct ApplyCandidate: Codable {
        var jobId: String
        var company: String
        var role: String
        var score: Double
        var compBand: String?
        var location: String?
        var portal: String?
    }
    struct IssueSnapshot: Codable {
        var id: String
        var severity: String
        var source: String
        var summary: String
        var ts: Double
    }

    // MARK: - Lifecycle

    func bootstrap() {
        // Activate WCSession if the watch is paired with an iPhone that
        // has the companion app installed.
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
            isReachable = session.isReachable
        }
        // First paint comes from whatever the phone last pushed into the
        // App Group defaults. Subsequent WCSession messages overwrite.
        loadFromDefaults()
    }

    // MARK: - WCSessionDelegate

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith state: WCSessionActivationState,
        error: Error?
    ) {
        // No-op; the activation callback exists so didReceiveMessage works.
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in self.isReachable = reachable }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        Task { @MainActor in
            self.applyPayload(message)
            self.lastSyncAt = Date()
            replyHandler(["ok": true])
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext context: [String: Any]
    ) {
        Task { @MainActor in
            self.applyPayload(context)
            self.lastSyncAt = Date()
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    // MARK: - Data merge

    func applyPayload(_ payload: [String: Any]) {
        if let s = payload["stats"] as? [String: Int] {
            stats = Stats(
                queued: s["queued"] ?? stats.queued,
                appliedToday: s["appliedToday"] ?? stats.appliedToday,
                upcomingInterviews: s["upcomingInterviews"] ?? stats.upcomingInterviews
            )
        }
        if let blob = payload["nextInterview"] as? [String: Any] {
            nextInterview = decode(InterviewSnapshot.self, from: blob)
        } else if payload.keys.contains("nextInterview") {
            nextInterview = nil
        }
        if let blob = payload["topApply"] as? [String: Any] {
            topApply = decode(ApplyCandidate.self, from: blob)
        } else if payload.keys.contains("topApply") {
            topApply = nil
        }
        if let arr = payload["openIssues"] as? [[String: Any]] {
            openIssues = arr.compactMap { decode(IssueSnapshot.self, from: $0) }
        }
        persistToDefaults()
    }

    // MARK: - Cross-launch persistence

    private func loadFromDefaults() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        stats = Stats(
            queued: defaults.integer(forKey: "stats:queued"),
            appliedToday: defaults.integer(forKey: "stats:appliedToday"),
            upcomingInterviews: defaults.integer(forKey: "stats:upcomingInterviews")
        )
        if let d = defaults.data(forKey: "interview:next"),
           let snap = try? JSONDecoder().decode(InterviewSnapshot.self, from: d) {
            nextInterview = snap
        }
        if let d = defaults.data(forKey: "topApply:next"),
           let snap = try? JSONDecoder().decode(ApplyCandidate.self, from: d) {
            topApply = snap
        }
        if let d = defaults.data(forKey: "issues:open"),
           let arr = try? JSONDecoder().decode([IssueSnapshot].self, from: d) {
            openIssues = arr
        }
    }

    private func persistToDefaults() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        defaults.set(stats.queued, forKey: "stats:queued")
        defaults.set(stats.appliedToday, forKey: "stats:appliedToday")
        defaults.set(stats.upcomingInterviews, forKey: "stats:upcomingInterviews")
        if let n = nextInterview, let d = try? JSONEncoder().encode(n) {
            defaults.set(d, forKey: "interview:next")
        } else {
            defaults.removeObject(forKey: "interview:next")
        }
        if let t = topApply, let d = try? JSONEncoder().encode(t) {
            defaults.set(d, forKey: "topApply:next")
        } else {
            defaults.removeObject(forKey: "topApply:next")
        }
        if let d = try? JSONEncoder().encode(openIssues) {
            defaults.set(d, forKey: "issues:open")
        }
    }

    // MARK: - JSON dictionary decode helper

    private func decode<T: Decodable>(_ type: T.Type, from dict: [String: Any]) -> T? {
        guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
