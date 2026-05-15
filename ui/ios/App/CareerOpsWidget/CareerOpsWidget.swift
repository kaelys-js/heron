import SwiftUI
import WidgetKit

/**
 * CareerOpsWidget — Lock Screen + Home Screen widgets.
 *
 * Three variants:
 *   • small: "3 queued"
 *   • medium: "3 queued · 1 applied · 2 interviews this week"
 *   • accessoryCircular (Lock Screen iOS 16+): queue count badge
 *
 * Timeline refresh: every 15min via TimelineProvider. The data source
 * is App Group UserDefaults written by the WebView at significant
 * state transitions (a new Issue, queue change, applied count change).
 *
 * To add this target in Xcode:
 *   1. File → New → Target → Widget Extension → "CareerOpsWidget"
 *   2. Bundle ID: com.heron.app.widget
 *   3. Add to "App Groups" entitlement (both this target and the
 *      main app): group.com.heron.app
 *   4. Replace the auto-generated CareerOpsWidget.swift with this file.
 */
struct CareerOpsStats: Codable {
    var queued: Int
    var appliedToday: Int
    var upcomingInterviews: Int
}

struct CareerOpsEntry: TimelineEntry {
    let date: Date
    let stats: CareerOpsStats
    /// Auth gate — when false, the widget renders WidgetSignInGate instead
    /// of the stats. Read at TimelineProvider time from App Group defaults
    /// so the gate flips immediately when the iPhone main app pushes
    /// `{ authenticated: false }` on sign-out.
    let authenticated: Bool
}

struct CareerOpsTimelineProvider: TimelineProvider {
    typealias Entry = CareerOpsEntry

    func placeholder(in _: Context) -> CareerOpsEntry {
        // Placeholder is rendered before the timeline is ready (widget
        // gallery thumbnails + the snapshot before getTimeline returns).
        // Show a populated-looking preview so users picking the widget
        // from the gallery understand what it does — but mark it
        // authenticated so the placeholder doesn't accidentally tell
        // the user to sign in.
        CareerOpsEntry(
            date: Date(),
            stats: CareerOpsStats(queued: 3, appliedToday: 1, upcomingInterviews: 2),
            authenticated: true
        )
    }

    func getSnapshot(in _: Context, completion: @escaping (CareerOpsEntry) -> Void) {
        completion(CareerOpsEntry(
            date: Date(),
            stats: readStats(),
            authenticated: WidgetAuth.isAuthenticated()
        ))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<CareerOpsEntry>) -> Void) {
        let entry = CareerOpsEntry(
            date: Date(),
            stats: readStats(),
            authenticated: WidgetAuth.isAuthenticated()
        )
        // Refresh in 15min. Apple decides when this actually runs.
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func readStats() -> CareerOpsStats {
        // App Group UserDefaults — shared with the main app target.
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            return CareerOpsStats(queued: 0, appliedToday: 0, upcomingInterviews: 0)
        }
        return CareerOpsStats(
            queued: defaults.integer(forKey: "stats:queued"),
            appliedToday: defaults.integer(forKey: "stats:appliedToday"),
            upcomingInterviews: defaults.integer(forKey: "stats:upcomingInterviews")
        )
    }
}

struct CareerOpsWidgetEntryView: View {
    var entry: CareerOpsEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        // Signed-out users see the gate everywhere. The gate is itself a
        // tap target — `widgetURL` is set on the whole bundle by each
        // widget below, so taps on the gate land at `heron://login`.
        Group {
            if !entry.authenticated {
                WidgetSignInGate()
                    .widgetURL(URL(string: Brand.deepLink("login")))
            } else {
                content
            }
        }
        // `containerBackground` (iOS 17+) is the Apple-recommended way
        // to set widget backgrounds — older systems fall through to the
        // system default. We use a subtle brand-indigo gradient so the
        // Heron widgets read as a coordinated set in the user's
        // home screen rather than four unrelated white cards.
        .brandContainerBackground()
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 4) {
                WidgetHeader(icon: "tray", label: "Queue")
                Spacer(minLength: 0)
                Text("\(entry.stats.queued)")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundStyle(.tint)
                Text(entry.stats.queued == 1 ? "job queued" : "jobs queued")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.deepLink("queue")))

        case .systemMedium:
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(icon: "chart.bar.fill", label: "Pipeline")
                Spacer(minLength: 0)
                HStack(spacing: 16) {
                    StatBlock(label: "Queued", value: entry.stats.queued, accent: .indigo)
                    StatBlock(label: "Applied", value: entry.stats.appliedToday, accent: .green)
                    StatBlock(label: "Interviews", value: entry.stats.upcomingInterviews, accent: .orange)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.deepLink("pipeline")))

        case .accessoryCircular:
            // Lock Screen (iOS 16+) + Apple Watch Smart Stack
            // (watchOS 9+ surfaces iPhone Lock-Screen widgets here).
            ZStack {
                Circle().strokeBorder(.tint, lineWidth: 2)
                Text("\(entry.stats.queued)").font(.headline.bold())
            }

        case .accessoryRectangular:
            // Watch face complication slot (rectangular). Three lines
            // of compact info — fits in the modular Smart Stack.
            VStack(alignment: .leading, spacing: 1) {
                Text(Brand.displayName).font(.caption2).foregroundStyle(.tint)
                Text("\(entry.stats.queued) queued · \(entry.stats.appliedToday) applied")
                    .font(.caption.bold())
                Text("\(entry.stats.upcomingInterviews) interview(s)")
                    .font(.caption2).foregroundStyle(.secondary)
            }

        case .accessoryInline:
            // Top-of-watch-face inline complication: single-line summary.
            Text("⌛ \(entry.stats.upcomingInterviews) · ▶︎ \(entry.stats.queued)")

        default:
            Text("\(entry.stats.queued) queued")
        }
    }
}

/**
 * StatBlock — number + label pair used by the medium Pipeline widget.
 *
 * The accent color tints just the numeric value so the label row stays
 * neutral grey (preserves the visual ladder: header → big number →
 * label). A `nil` value collapses to "—" so the empty state still
 * shows three blocks (consistent layout) instead of three "0"s.
 */
struct StatBlock: View {
    let label: String
    let value: Int
    var accent: Color = .indigo
    var body: some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(accent)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity)
    }
}

struct CareerOpsWidget: Widget {
    let kind: String = "CareerOpsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CareerOpsTimelineProvider()) { entry in
            CareerOpsWidgetEntryView(entry: entry)
        }
        // Widget-gallery label + subtitle. These are what the user reads
        // when picking the widget — should describe what it DOES, not
        // restate the app name (which is already the section header
        // grouping all our widgets in the gallery).
        .configurationDisplayName("Pipeline")
        .description("Queue, applies today, and upcoming interviews — at a glance.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            // Lock Screen + Apple Watch Smart Stack (iOS 16+ / watchOS 9+).
            // Watch users see the queue counter on their wrist without
            // needing a standalone Watch app target.
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

/**
 * WidgetBundle entry point — register every widget the user can pick
 * from the gallery in one place. iOS shows them as separate cards in
 * the widget picker.
 *
 * The four widgets:
 *   • CareerOpsWidget    — pipeline stats summary
 *   • NextInterviewWidget — countdown to next interview
 *   • TopApplyWidget     — highest-scoring queued job
 *   • InboxIssuesWidget  — open issues needing user action
 */
@main
struct CareerOpsWidgetBundle: WidgetBundle {
    var body: some Widget {
        CareerOpsWidget()
        NextInterviewWidget()
        TopApplyWidget()
        InboxIssuesWidget()
    }
}
