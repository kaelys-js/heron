import SwiftUI
import WidgetKit

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
    var stage: String // "Phone screen" | "Technical" | "Final" | …
    var scheduledAt: Date
    var interviewers: [String]
}

struct NextInterviewEntry: TimelineEntry {
    let date: Date
    let interview: NextInterviewSnapshot?
    /// Auth gate — see WidgetAuthGate.swift for the full contract.
    let authenticated: Bool
}

struct NextInterviewProvider: TimelineProvider {
    typealias Entry = NextInterviewEntry

    func placeholder(in _: Context) -> NextInterviewEntry {
        // Gallery preview — synthetic future interview so the gallery
        // thumbnail isn't a sign-in CTA.
        let preview = NextInterviewSnapshot(
            jobId: "preview",
            company: "Anthropic",
            role: "Head of Applied AI",
            stage: "Technical screen",
            scheduledAt: Date().addingTimeInterval(2 * 3600),
            interviewers: ["Sam Smith"]
        )
        return NextInterviewEntry(date: Date(), interview: preview, authenticated: true)
    }

    func getSnapshot(in _: Context, completion: @escaping (NextInterviewEntry) -> Void) {
        completion(NextInterviewEntry(
            date: Date(),
            interview: readNext(),
            authenticated: WidgetAuth.isAuthenticated()
        ))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<NextInterviewEntry>) -> Void) {
        let now = Date()
        let interview = readNext()
        let authed = WidgetAuth.isAuthenticated()
        var entries: [NextInterviewEntry] = []
        // Schedule one entry now, plus snap entries at the 1-day, 1-hour,
        // 30-min, 5-min, and at-time marks so the countdown updates
        // smoothly without burning the 15min refresh budget.
        entries.append(NextInterviewEntry(date: now, interview: interview, authenticated: authed))
        if let i = interview {
            for offset in [86400, 3600, 1800, 300, 0] {
                let when = i.scheduledAt.addingTimeInterval(-Double(offset))
                if when > now {
                    entries.append(NextInterviewEntry(date: when, interview: interview, authenticated: authed))
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
        Group {
            if !entry.authenticated {
                WidgetSignInGate()
                    .widgetURL(URL(string: Brand.deepLink("login")))
            } else if let i = entry.interview {
                content(i)
            } else {
                empty
            }
        }
        .brandContainerBackground()
    }

    @ViewBuilder
    private func content(_ i: NextInterviewSnapshot) -> some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 4) {
                WidgetHeader(icon: "calendar", label: "Next")
                Text(i.company).font(.subheadline).bold().lineLimit(1)
                Text(i.role).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                Spacer(minLength: 0)
                Text(i.scheduledAt, style: .timer)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.tint)
                    .lineLimit(1)
                Text(i.stage).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.deepLink("interview-prep/\(i.jobId)")))

        case .systemMedium:
            VStack(alignment: .leading, spacing: 6) {
                WidgetHeader(icon: "calendar.badge.clock", label: "Next Interview") {
                    Text(i.stage)
                        .font(.caption2.bold())
                        .foregroundStyle(.tint)
                }
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(i.company).font(.headline).lineLimit(1)
                        Text(i.role).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                        if !i.interviewers.isEmpty {
                            Text("with " + i.interviewers.prefix(2).joined(separator: ", "))
                                .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing) {
                        Text("In").font(.caption2).foregroundStyle(.secondary)
                        Text(i.scheduledAt, style: .timer)
                            .font(.system(size: 26, weight: .bold, design: .rounded))
                            .foregroundStyle(.tint)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.deepLink("interview-prep/\(i.jobId)")))

        case .systemLarge:
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(icon: "calendar.badge.clock", label: "Next Interview") {
                    Text(i.scheduledAt, style: .timer)
                        .font(.subheadline.bold())
                        .foregroundStyle(.tint)
                        .lineLimit(1)
                }
                Text(i.company).font(.title2.bold()).lineLimit(1)
                Text(i.role).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                Text(i.stage).font(.caption.bold()).foregroundStyle(.tint)
                Divider().padding(.vertical, 2)
                if i.interviewers.isEmpty {
                    Text("No interviewer details available yet")
                        .font(.caption2).foregroundStyle(.secondary)
                } else {
                    Text("Interviewers").font(.caption.bold()).foregroundStyle(.secondary)
                    ForEach(i.interviewers.prefix(4), id: \.self) { name in
                        HStack(spacing: 6) {
                            Image(systemName: "person.fill")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(name).font(.caption)
                        }
                    }
                }
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    Image(systemName: "arrow.up.right.circle.fill")
                        .font(.caption2)
                        .foregroundStyle(.tint)
                    Text("Tap to open prep notes")
                        .font(.caption2).foregroundStyle(.tint)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.deepLink("interview-prep/\(i.jobId)")))

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
        VStack(spacing: 6) {
            Image(systemName: "calendar.badge.clock").font(.title2)
                .foregroundStyle(.tint)
            Text("No interviews scheduled")
                .font(.subheadline.bold())
                .multilineTextAlignment(.center)
            Text("They'll show up here as soon as one is on the calendar")
                .font(.caption2).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
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
