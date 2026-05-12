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
        guard let defaults = UserDefaults(suiteName: "group.com.resistjs.careerops") else {
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
            }.padding().widgetURL(URL(string: "careerops://queue"))

        case .systemMedium:
            HStack(spacing: 16) {
                StatBlock(label: "Queued", value: entry.stats.queued)
                StatBlock(label: "Applied", value: entry.stats.appliedToday)
                StatBlock(label: "Interviews", value: entry.stats.upcomingInterviews)
            }.padding().widgetURL(URL(string: "careerops://pipeline"))

        case .accessoryCircular:
            ZStack {
                Circle().strokeBorder(.tint, lineWidth: 2)
                Text("\(entry.stats.queued)").font(.headline.bold())
            }

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

@main
struct CareerOpsWidget: Widget {
    let kind: String = "CareerOpsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CareerOpsTimelineProvider()) { entry in
            CareerOpsWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("career-ops")
        .description("Today's pipeline at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}
