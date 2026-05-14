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
}

struct InboxProvider: TimelineProvider {
    typealias Entry = InboxEntry

    func placeholder(in context: Context) -> InboxEntry {
        InboxEntry(date: Date(), issues: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (InboxEntry) -> Void) {
        completion(InboxEntry(date: Date(), issues: read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<InboxEntry>) -> Void) {
        let entry = InboxEntry(date: Date(), issues: read())
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
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: "tray.full").font(.callout)
                    Text("Inbox").font(.subheadline.bold())
                }
                Text("\(entry.issues.count)")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    // Explicit `Color` on both branches so Swift's ternary
                    // type-inference doesn't fail trying to unify
                    // `HierarchicalShapeStyle.secondary` with `Color.orange`
                    // — `.foregroundStyle` accepts any ShapeStyle, but the
                    // branches MUST resolve to the same type before being
                    // passed in. Color conforms to ShapeStyle, so this
                    // works.
                    .foregroundStyle(entry.issues.isEmpty ? Color.secondary : Color.orange)
                if let first = entry.issues.first {
                    Text(first.summary).font(.caption2)
                        .foregroundStyle(.secondary).lineLimit(2)
                } else {
                    Text("All clear").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding()
            .widgetURL(URL(string: Brand.deepLink("inbox")))

        case .systemMedium:
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "tray.full")
                    Text("Inbox").font(.headline)
                    Spacer()
                    Text("\(entry.issues.count)").font(.headline.bold())
                        .foregroundStyle(entry.issues.isEmpty ? Color.secondary : Color.orange)
                }
                Divider()
                ForEach(entry.issues.prefix(3), id: \.id) { issue in
                    HStack(spacing: 6) {
                        Image(systemName: severityIcon(issue.severity))
                            .foregroundStyle(severityColor(issue.severity))
                            .font(.caption2)
                        Text(issue.summary).font(.caption).lineLimit(1)
                    }
                }
                if entry.issues.isEmpty {
                    Text("Nothing needs attention").font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .widgetURL(URL(string: Brand.deepLink("inbox")))

        case .systemLarge:
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "tray.full")
                    Text("Inbox").font(.title3.bold())
                    Spacer()
                    Text("\(entry.issues.count)").font(.title3.bold())
                        .foregroundStyle(entry.issues.isEmpty ? Color.secondary : Color.orange)
                }
                Divider()
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
                if entry.issues.isEmpty {
                    Text("All clear — nothing in the Inbox.").font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
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
        .configurationDisplayName("Inbox issues")
        .description("Open issues that need your attention — captcha-blocked applies, custom Q&A, more.")
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
