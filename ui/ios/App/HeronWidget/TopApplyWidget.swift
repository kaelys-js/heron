import SwiftUI
import WidgetKit

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
    var compBand: String? // "$140k–$200k" or nil
    var location: String?
    var portal: String? // 'linkedin' | 'greenhouse' | …
}

struct TopApplyEntry: TimelineEntry {
    let date: Date
    let candidate: TopApplyCandidate?
    /// Auth gate — see WidgetAuthGate.swift for the full contract.
    let authenticated: Bool
}

struct TopApplyProvider: TimelineProvider {
    typealias Entry = TopApplyEntry

    func placeholder(in _: Context) -> TopApplyEntry {
        // Gallery preview — synthetic candidate so the gallery thumbnail
        // shows what the widget DOES, not a sign-in CTA.
        let preview = TopApplyCandidate(
            jobId: "preview",
            company: "Anthropic",
            role: "Head of Applied AI",
            score: 4.7,
            compBand: "$240k–$320k",
            location: "Remote · US",
            portal: "Greenhouse"
        )
        return TopApplyEntry(date: Date(), candidate: preview, authenticated: true)
    }

    func getSnapshot(in _: Context, completion: @escaping (TopApplyEntry) -> Void) {
        completion(TopApplyEntry(
            date: Date(),
            candidate: read(),
            authenticated: WidgetAuth.isAuthenticated()
        ))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<TopApplyEntry>) -> Void) {
        let entry = TopApplyEntry(
            date: Date(),
            candidate: read(),
            authenticated: WidgetAuth.isAuthenticated()
        )
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
        Group {
            if !entry.authenticated {
                WidgetSignInGate()
                    .widgetURL(URL(string: Brand.deepLink("login")))
            } else if let c = entry.candidate {
                content(c)
            } else {
                empty
            }
        }
        .brandContainerBackground()
    }

    @ViewBuilder
    private func content(_ c: TopApplyCandidate) -> some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 4) {
                WidgetHeader(icon: "star.fill", label: "Top to Apply") {
                    ScoreBadge(score: c.score)
                }
                Text(c.company).font(.subheadline.bold()).lineLimit(1)
                Text(c.role).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                Spacer(minLength: 0)
                if let band = c.compBand {
                    Text(band).font(.caption2.bold()).foregroundStyle(.tint).lineLimit(1)
                }
                if let loc = c.location {
                    Text(loc).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.jobDeepLink(c.jobId)))

        case .systemMedium:
            VStack(alignment: .leading, spacing: 6) {
                WidgetHeader(icon: "star.fill", label: "Top to Apply") {
                    if let portal = c.portal {
                        Text(portal.capitalized)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.company).font(.headline).lineLimit(1)
                        Text(c.role).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                        if let band = c.compBand {
                            Text(band).font(.caption.bold()).foregroundStyle(.tint)
                        }
                        if let loc = c.location {
                            Text(loc).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer()
                    VStack(spacing: 4) {
                        ScoreBadge(score: c.score, size: .large)
                        HStack(spacing: 2) {
                            Image(systemName: "arrow.up.right")
                                .font(.caption2.bold())
                            Text("Apply").font(.caption2.bold())
                        }
                        .foregroundStyle(.tint)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding()
            .widgetURL(URL(string: Brand.jobDeepLink(c.jobId)))

        case .systemLarge:
            // Large variant — surfaces the SINGLE top candidate at the top
            // with full details, then a list of up-to-2 runner-ups below
            // (read from App Group "topApply:runnerUps" key if present —
            // a future enhancement; for now we just show the top candidate
            // in a roomier layout with full comp + portal + Apply CTA).
            VStack(alignment: .leading, spacing: 10) {
                WidgetHeader(icon: "star.fill", label: "Top to Apply") {
                    if let portal = c.portal {
                        Text(portal.capitalized)
                            .font(.caption2.bold())
                            .foregroundStyle(.secondary)
                    }
                }
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.company).font(.title2.bold()).lineLimit(1)
                        Text(c.role).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Spacer()
                    ScoreBadge(score: c.score, size: .large)
                }
                Divider()
                VStack(alignment: .leading, spacing: 4) {
                    if let band = c.compBand {
                        HStack(spacing: 6) {
                            Image(systemName: "dollarsign.circle.fill")
                                .foregroundStyle(.tint)
                            Text(band).font(.subheadline.bold())
                        }
                    }
                    if let loc = c.location {
                        HStack(spacing: 6) {
                            Image(systemName: "mappin.and.ellipse")
                                .foregroundStyle(.secondary)
                            Text(loc).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
                HStack {
                    Spacer()
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.right.circle.fill")
                            .font(.subheadline)
                        Text("Tap to apply").font(.caption.bold())
                    }
                    .foregroundStyle(.tint)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
        VStack(spacing: 6) {
            Image(systemName: "checkmark.circle").font(.title2).foregroundStyle(.tint)
            Text("All caught up")
                .font(.subheadline.bold()).multilineTextAlignment(.center)
            Text("Run a scan to find more").font(.caption)
                .foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
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
        .configurationDisplayName("Top to Apply")
        .description("Your highest-scoring queued job — one tap to start applying.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            // .systemLarge added in Task 4 — gives users a roomier
            // single-candidate view with full comp + location + Apply
            // CTA, matching how Apple's Reminders / Mail render their
            // large variants vs the squeezed medium.
            .systemLarge,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}
