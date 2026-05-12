import WidgetKit
import SwiftUI

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
 *   2. Bundle ID: com.resistjs.careerops.widget
 *   3. Add to "App Groups" entitlement (both this target and the
 *      main app): group.com.resistjs.careerops
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
}

struct CareerOpsTimelineProvider: TimelineProvider {
    typealias Entry = CareerOpsEntry

    func placeholder(in context: Context) -> CareerOpsEntry {
        CareerOpsEntry(date: Date(), stats: CareerOpsStats(queued: 0, appliedToday: 0, upcomingInterviews: 0))
    }

    func getSnapshot(in context: Context, completion: @escaping (CareerOpsEntry) -> Void) {
        completion(CareerOpsEntry(date: Date(), stats: readStats()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CareerOpsEntry>) -> Void) {
        let entry = CareerOpsEntry(date: Date(), stats: readStats())
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
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 4) {
                Text("career-ops").font(.caption).foregroundStyle(.secondary)
                Text("\(entry.stats.queued)").font(.system(size: 40, weight: .bold))
                Text("queued").font(.caption2).foregroundStyle(.secondary)
            }.padding().widgetURL(URL(string: Brand.deepLink("queue")))

        case .systemMedium:
            HStack(spacing: 16) {
                StatBlock(label: "Queued", value: entry.stats.queued)
                StatBlock(label: "Applied", value: entry.stats.appliedToday)
                StatBlock(label: "Interviews", value: entry.stats.upcomingInterviews)
            }.padding().widgetURL(URL(string: Brand.deepLink("pipeline")))

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
                Text("career-ops").font(.caption2).foregroundStyle(.tint)
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

struct StatBlock: View {
    let label: String
    let value: Int
    var body: some View {
        VStack {
            Text("\(value)").font(.system(size: 28, weight: .bold))
            Text(label).font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity)
    }
}

struct CareerOpsWidget: Widget {
    let kind: String = "CareerOpsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CareerOpsTimelineProvider()) { entry in
            CareerOpsWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("career-ops")
        .description("Today's pipeline at a glance.")
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
