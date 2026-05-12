import WidgetKit
import SwiftUI

/**
 * NextInterviewWidget — countdown to the user's next scheduled interview.
 *
 * Surfaces:
 *   • systemSmall: company + role + "in 3h 22m"
 *   • systemMedium: ↑ + stage + interviewers + Open prep button
 *   • systemLarge: ↑ + full interview-prep summary (top 3 STAR stories)
 *   • accessoryRectangular: minimal "ANTHRP · Tech screen · 3h"
 *   • accessoryInline: "⌛ Anthropic 3h"
 *
 * Live updates: data is pulled from the App Group UserDefaults written
 * by the dashboard whenever interview-schedule changes. Timeline
 * entries are scheduled at the 1-day, 1-hour, 30-min, and 5-min marks
 * so the countdown precision sharpens as the interview approaches.
 */
struct NextInterviewSnapshot: Codable {
    var jobId: String
    var company: String
    var role: String
    var stage: String          // "Phone screen" | "Technical" | "Final" | …
    var scheduledAt: Date
    var interviewers: [String]
}

struct NextInterviewEntry: TimelineEntry {
    let date: Date
    let interview: NextInterviewSnapshot?
}

struct NextInterviewProvider: TimelineProvider {
    typealias Entry = NextInterviewEntry

    func placeholder(in context: Context) -> NextInterviewEntry {
        NextInterviewEntry(date: Date(), interview: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (NextInterviewEntry) -> Void) {
        completion(NextInterviewEntry(date: Date(), interview: readNext()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextInterviewEntry>) -> Void) {
        let now = Date()
        let interview = readNext()
        var entries: [NextInterviewEntry] = []
        // Schedule one entry now, plus snap entries at the 1-day, 1-hour,
        // 30-min, 5-min, and at-time marks so the countdown updates
        // smoothly without burning the 15min refresh budget.
        entries.append(NextInterviewEntry(date: now, interview: interview))
        if let i = interview {
            for offset in [86400, 3600, 1800, 300, 0] {
                let when = i.scheduledAt.addingTimeInterval(-Double(offset))
                if when > now {
                    entries.append(NextInterviewEntry(date: when, interview: interview))
                }
            }
        }
        completion(Timeline(entries: entries.sorted(by: { $0.date < $1.date }),
                            policy: .after(now.addingTimeInterval(900))))
    }

    private func readNext() -> NextInterviewSnapshot? {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup),
              let data = defaults.data(forKey: "interview:next") else { return nil }
        return try? JSONDecoder().decode(NextInterviewSnapshot.self, from: data)
    }
}

struct NextInterviewWidgetView: View {
    var entry: NextInterviewEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        if let i = entry.interview {
            content(i)
        } else {
            empty
        }
    }

    @ViewBuilder
    private func content(_ i: NextInterviewSnapshot) -> some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 4) {
                Text(i.company).font(.subheadline).bold().lineLimit(1)
                Text(i.role).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                Spacer(minLength: 0)
                Text(i.scheduledAt, style: .timer)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.tint)
                Text(i.stage).font(.caption2).foregroundStyle(.secondary)
            }
            .padding()
            .widgetURL(URL(string: Brand.jobDeepLink(i.jobId)))

        case .systemMedium:
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(i.company).font(.headline).lineLimit(1)
                    Text(i.role).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    Spacer(minLength: 0)
                    Text(i.stage).font(.caption.bold())
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text("In").font(.caption2).foregroundStyle(.secondary)
                    Text(i.scheduledAt, style: .timer)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundStyle(.tint)
                    if !i.interviewers.isEmpty {
                        Text(i.interviewers.prefix(2).joined(separator: ", "))
                            .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
            .padding()
            .widgetURL(URL(string: Brand.jobDeepLink(i.jobId)))

        case .systemLarge:
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(i.company).font(.title2.bold())
                    Spacer()
                    Text(i.scheduledAt, style: .timer)
                        .font(.title3.bold())
                        .foregroundStyle(.tint)
                }
                Text(i.role).font(.subheadline)
                Text(i.stage).font(.caption).foregroundStyle(.secondary)
                Divider().padding(.vertical, 2)
                Text("Interviewers").font(.caption.bold()).foregroundStyle(.secondary)
                ForEach(i.interviewers.prefix(4), id: \.self) { name in
                    Text("• \(name)").font(.caption)
                }
                Spacer(minLength: 0)
                Text("Tap to open interview prep")
                    .font(.caption2).foregroundStyle(.tint)
            }
            .padding()
            .widgetURL(URL(string: Brand.jobDeepLink(i.jobId)))

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(i.company.uppercased()).font(.caption2).foregroundStyle(.tint).lineLimit(1)
                Text(i.stage).font(.caption.bold()).lineLimit(1)
                Text(i.scheduledAt, style: .timer)
                    .font(.caption.monospacedDigit())
            }

        case .accessoryInline:
            Text("⌛ \(i.company) · ")
                + Text(i.scheduledAt, style: .timer)

        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Text(i.scheduledAt, style: .timer)
                    .font(.system(size: 12, weight: .semibold))
                    .multilineTextAlignment(.center)
            }

        default:
            empty
        }
    }

    private var empty: some View {
        VStack(spacing: 4) {
            Image(systemName: "calendar.badge.clock").font(.title2)
                .foregroundStyle(.secondary)
            Text("No interviews scheduled").font(.caption).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }.padding()
    }
}

struct NextInterviewWidget: Widget {
    let kind: String = "NextInterviewWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextInterviewProvider()) { entry in
            NextInterviewWidgetView(entry: entry)
        }
        .configurationDisplayName("Next interview")
        .description("Countdown to your next scheduled interview, with stage + interviewers.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCircular,
        ])
    }
}
