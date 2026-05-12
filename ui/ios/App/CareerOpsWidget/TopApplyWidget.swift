import WidgetKit
import SwiftUI

/**
 * TopApplyWidget — surfaces the highest-scoring job currently waiting
 * in the Queued / Scored states. Tap → opens that job in the WebView.
 *
 * Use case: I open my phone, glance at the widget, and the single
 * highest-priority job stares back at me. One tap to start the apply
 * flow. No need to dig through the Inbox or Pipeline.
 *
 * Families:
 *   • systemSmall: company + role + score badge
 *   • systemMedium: ↑ + comp band + location + "Apply now" CTA
 *   • accessoryRectangular: minimal compact card for Lock Screen
 */
struct TopApplyCandidate: Codable {
    var jobId: String
    var company: String
    var role: String
    var score: Double
    var compBand: String?       // "$140k–$200k" or nil
    var location: String?
    var portal: String?         // 'linkedin' | 'greenhouse' | …
}

struct TopApplyEntry: TimelineEntry {
    let date: Date
    let candidate: TopApplyCandidate?
}

struct TopApplyProvider: TimelineProvider {
    typealias Entry = TopApplyEntry

    func placeholder(in context: Context) -> TopApplyEntry {
        TopApplyEntry(date: Date(), candidate: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TopApplyEntry) -> Void) {
        completion(TopApplyEntry(date: Date(), candidate: read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TopApplyEntry>) -> Void) {
        let entry = TopApplyEntry(date: Date(), candidate: read())
        // 15min refresh — fast enough to feel current, slow enough to
        // respect the 40-budget Apple gives widgets per day.
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func read() -> TopApplyCandidate? {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup),
              let data = defaults.data(forKey: "topApply:next") else { return nil }
        return try? JSONDecoder().decode(TopApplyCandidate.self, from: data)
    }
}

struct TopApplyWidgetView: View {
    var entry: TopApplyEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        if let c = entry.candidate {
            content(c)
        } else {
            empty
        }
    }

    @ViewBuilder
    private func content(_ c: TopApplyCandidate) -> some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(c.company).font(.headline).lineLimit(1)
                    Spacer()
                    ScoreBadge(score: c.score)
                }
                Text(c.role).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                Spacer(minLength: 0)
                if let band = c.compBand {
                    Text(band).font(.caption2).foregroundStyle(.tint)
                }
                if let loc = c.location {
                    Text(loc).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .padding()
            .widgetURL(URL(string: Brand.jobDeepLink(c.jobId)))

        case .systemMedium:
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(c.company).font(.headline)
                        if let portal = c.portal {
                            Text(portal).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Text(c.role).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    Spacer(minLength: 0)
                    if let band = c.compBand {
                        Text(band).font(.caption.bold()).foregroundStyle(.tint)
                    }
                    if let loc = c.location {
                        Text(loc).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                VStack {
                    ScoreBadge(score: c.score, size: .large)
                    Text("Apply").font(.caption.bold()).foregroundStyle(.tint)
                }
            }
            .padding()
            .widgetURL(URL(string: Brand.jobDeepLink(c.jobId)))

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                HStack {
                    Text(c.company.uppercased())
                        .font(.caption2).foregroundStyle(.tint).lineLimit(1)
                    Spacer()
                    Text("⭐ \(c.score, specifier: "%.1f")").font(.caption2).bold()
                }
                Text(c.role).font(.caption.bold()).lineLimit(1)
                if let band = c.compBand {
                    Text(band).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }

        case .accessoryInline:
            Text("▶︎ \(c.company) ⭐ \(c.score, specifier: "%.1f")")

        default:
            empty
        }
    }

    private var empty: some View {
        VStack(spacing: 4) {
            Image(systemName: "tray").font(.title2).foregroundStyle(.secondary)
            Text("No jobs ready to apply")
                .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.padding()
    }
}

struct ScoreBadge: View {
    let score: Double
    enum Size { case standard, large }
    var size: Size = .standard

    var body: some View {
        Text(String(format: "%.1f", score))
            .font(size == .large ? .title.bold() : .caption.bold())
            .foregroundStyle(color)
            .padding(.horizontal, size == .large ? 8 : 4)
            .padding(.vertical, size == .large ? 4 : 2)
            .background(color.opacity(0.15))
            .clipShape(Capsule())
    }
    private var color: Color {
        if score >= 4.5 { return .green }
        if score >= 4.0 { return .blue }
        if score >= 3.5 { return .yellow }
        return .secondary
    }
}

struct TopApplyWidget: Widget {
    let kind: String = "TopApplyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TopApplyProvider()) { entry in
            TopApplyWidgetView(entry: entry)
        }
        .configurationDisplayName("Top job to apply")
        .description("The highest-scoring job currently queued for you to apply to.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}
