import WidgetKit
import SwiftUI

/**
 * InboxIssuesWidget — open issues that need user attention.
 *
 * Use case: a Greenhouse apply got CAPTCHA-blocked and now sits in the
 * Inbox waiting for me to finish by hand. The widget on my Home Screen
 * tells me "2 issues" with the most recent one's source + summary.
 *
 * Families:
 *   • systemSmall: total count + most-recent title
 *   • systemMedium: top 3 issues with one-line summaries
 *   • systemLarge: top 5 issues with severity icons + sources
 *   • accessoryCircular: just the count
 */
struct IssueSnapshot: Codable {
    var id: String
    var severity: String        // 'info' | 'warn' | 'error'
    var source: String
    var summary: String
    var ts: Double              // ms epoch
}

struct InboxEntry: TimelineEntry {
    let date: Date
    let issues: [IssueSnapshot]
    /// Auth gate — see WidgetAuthGate.swift for the full contract.
    let authenticated: Bool
}

struct InboxProvider: TimelineProvider {
    typealias Entry = InboxEntry

    func placeholder(in context: Context) -> InboxEntry {
        // Gallery preview — show authenticated with a sample issue so
        // the widget gallery thumbnail isn't a sign-in CTA.
        InboxEntry(
            date: Date(),
            issues: [IssueSnapshot(
                id: "preview",
                severity: "warn",
                source: "apply-linkedin",
                summary: "CAPTCHA blocked an apply — finish by hand",
                ts: Date().timeIntervalSince1970 * 1000
            )],
            authenticated: true
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (InboxEntry) -> Void) {
        completion(InboxEntry(
            date: Date(),
            issues: read(),
            authenticated: WidgetAuth.isAuthenticated()
        ))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<InboxEntry>) -> Void) {
        let entry = InboxEntry(
            date: Date(),
            issues: read(),
            authenticated: WidgetAuth.isAuthenticated()
        )
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func read() -> [IssueSnapshot] {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup),
              let data = defaults.data(forKey: "issues:open") else { return [] }
        return (try? JSONDecoder().decode([IssueSnapshot].self, from: data)) ?? []
    }
}

struct InboxIssuesWidgetView: View {
    var entry: InboxEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        Group {
            if !entry.authenticated {
                WidgetSignInGate()
                    .widgetURL(URL(string: Brand.deepLink("login")))
            } else {
                content
            }
        }
        .brandContainerBackground()
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 6) {
                WidgetHeader(icon: "tray.full", label: "Inbox") {
                    if !entry.issues.isEmpty {
                        Text("\(entry.issues.count)")
                            .font(.caption.bold())
                            .foregroundStyle(.orange)
                    }
                }
                Spacer(minLength: 0)
                Text("\(entry.issues.count)")
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                    .foregroundStyle(entry.issues.isEmpty ? Color.secondary : Color.orange)
                if let first = entry.issues.first {
                    Text(first.summary).font(.caption2)
                        .foregroundStyle(.secondary).lineLimit(2)
                } else {
                    Text("Nothing needs attention")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.deepLink("inbox")))

        case .systemMedium:
            VStack(alignment: .leading, spacing: 6) {
                WidgetHeader(icon: "tray.full", label: "Inbox") {
                    Text("\(entry.issues.count)")
                        .font(.caption.bold())
                        .foregroundStyle(entry.issues.isEmpty ? Color.secondary : Color.orange)
                }
                if entry.issues.isEmpty {
                    Spacer(minLength: 0)
                    Text("Nothing needs attention")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                } else {
                    ForEach(entry.issues.prefix(3), id: \.id) { issue in
                        HStack(spacing: 6) {
                            Image(systemName: severityIcon(issue.severity))
                                .foregroundStyle(severityColor(issue.severity))
                                .font(.caption2)
                            Text(issue.summary).font(.caption).lineLimit(1)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.deepLink("inbox")))

        case .systemLarge:
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(icon: "tray.full", label: "Inbox") {
                    Text("\(entry.issues.count)")
                        .font(.subheadline.bold())
                        .foregroundStyle(entry.issues.isEmpty ? Color.secondary : Color.orange)
                }
                if entry.issues.isEmpty {
                    Spacer(minLength: 0)
                    VStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title)
                            .foregroundStyle(.tint)
                        Text("All clear")
                            .font(.headline)
                        Text("Nothing in the Inbox right now.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    Spacer(minLength: 0)
                } else {
                    ForEach(entry.issues.prefix(5), id: \.id) { issue in
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 6) {
                                Image(systemName: severityIcon(issue.severity))
                                    .foregroundStyle(severityColor(issue.severity))
                                    .font(.caption)
                                Text(issue.source).font(.caption2.bold())
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            Text(issue.summary).font(.caption).lineLimit(2)
                        }
                        .padding(.vertical, 2)
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.deepLink("inbox")))

        case .accessoryCircular:
            ZStack {
                Circle().strokeBorder(.tint, lineWidth: 2)
                Text("\(entry.issues.count)").font(.headline.bold())
            }

        case .accessoryInline:
            Text("⚠ Inbox: \(entry.issues.count)")

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("INBOX").font(.caption2).foregroundStyle(.tint)
                Text("\(entry.issues.count) issue(s)").font(.caption.bold())
                if let first = entry.issues.first {
                    Text(first.summary).font(.caption2).lineLimit(1)
                }
            }

        default:
            Text("\(entry.issues.count) issues")
        }
    }

    private func severityIcon(_ s: String) -> String {
        switch s {
        case "error": return "exclamationmark.octagon.fill"
        case "warn": return "exclamationmark.triangle.fill"
        default: return "info.circle.fill"
        }
    }

    private func severityColor(_ s: String) -> Color {
        switch s {
        case "error": return .red
        case "warn": return .orange
        default: return .blue
        }
    }
}

struct InboxIssuesWidget: Widget {
    let kind: String = "InboxIssuesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: InboxProvider()) { entry in
            InboxIssuesWidgetView(entry: entry)
        }
        .configurationDisplayName("Inbox")
        .description("Anything that needs your attention before an apply can finish.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,
            .accessoryInline,
            .accessoryRectangular,
        ])
    }
}
