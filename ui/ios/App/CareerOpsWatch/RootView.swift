import SwiftUI
#if os(watchOS)
    import WatchKit
#endif

/**
 * RootView — top-level watch UI.
 *
 * 4 tabbed pages (PageTabViewStyle):
 *   1. Today: stats summary (queued / applied / interviews)
 *   2. NextInterview: countdown + stage + interviewers
 *   3. TopApply: highest-scoring queued job (one-tap action via Handoff)
 *   4. Inbox: open issues needing attention
 *
 * Tap on any card → hand off to the iPhone with the relevant deep
 * link, which opens the dashboard on the right screen.
 */
struct RootView: View {
    @EnvironmentObject var model: WatchModel

    var body: some View {
        Group {
            if model.isAuthenticated {
                TabView {
                    StatsPage()
                    NextInterviewPage()
                    TopApplyPage()
                    InboxPage()
                }
                .tabViewStyle(.page)
            } else {
                // No authenticated iPhone session yet — show a clean
                // gate prompting the user to open the iPhone app to
                // sign in. Avoids confusing the user with empty stats
                // (0, 0, 0) that look like real data.
                SignInGate()
            }
        }
        // `.tint.gradient` was the goal, but TintShapeStyle doesn't
        // expose `.gradient` (only concrete Colors do). Anchor to a
        // brand-adjacent indigo so the gradient renders correctly on
        // watchOS 10+; iOS 18 tint-on-watch will still recolor it.
        .containerBackground(Color.indigo.gradient, for: .tabView)
    }
}

/**
 * Helper: dispatch a `heron://` URL to the iPhone via WKExtension's
 * `openSystemURL`. The OS forwards the URL to the paired phone, which
 * fires the standard `appUrlOpen` event in the WebView — same path
 * widget taps + Live Activity buttons take. This is the watch's
 * mechanism for "tap to open on iPhone" actions.
 */
@MainActor
private func openOnPhone(_ deepLink: String) {
    guard let url = URL(string: deepLink) else { return }
    // WKExtension.shared() exists only on watchOS — using it directly
    // would break the type-check for the iOS host. Since this file
    // ships ONLY in the Watch target, the conditional compile guard
    // keeps the import clean while pinning intent.
    #if os(watchOS)
        WKExtension.shared().openSystemURL(url)
    #endif
}

/**
 * SignInGate — shown on the Watch when the paired iPhone hasn't
 * pushed an authenticated-state widget update yet.
 *
 * The Watch app is a peripheral display for the iPhone — it never
 * authenticates directly. So the gate just tells the user where to
 * sign in (the companion iPhone app) and surfaces the brand mark
 * so the screen doesn't feel broken.
 */
private struct SignInGate: View {
    var body: some View {
        VStack(spacing: 10) {
            // Brand mark — system iPhone glyph instead of inlining the
            // rocket SVG because watchOS SF Symbols compose more cleanly
            // with the system tint than a custom shape would.
            Image(systemName: "iphone.gen3.radiowaves.left.and.right")
                .font(.system(size: 32, weight: .regular))
                .foregroundStyle(.tint)
            Text("Sign in on iPhone")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("Open Heron on your iPhone to set up. Your stats will sync here.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
        }
        .padding(.vertical, 12)
    }
}

private struct StatsPage: View {
    @EnvironmentObject var model: WatchModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "chart.bar.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.indigo)
                    Text("Today").font(.headline)
                }
                // Three Counter cards in a vertical stack — more compact
                // than the previous one-row-per-stat layout AND each card
                // is tappable to deep-link the phone to the relevant view.
                // Deep links use Brand.deepLink so a rebrand in
                // branding/brand.json (urlScheme rename) updates every
                // tap target on the Watch in one shot.
                StatCard(
                    icon: "tray", label: "Queued",
                    value: model.stats.queued, color: .indigo,
                    deepLink: Brand.deepLink("queue")
                )
                StatCard(
                    icon: "checkmark.circle.fill", label: "Applied today",
                    value: model.stats.appliedToday, color: .green,
                    deepLink: Brand.deepLink("applied")
                )
                StatCard(
                    icon: "calendar", label: "Interviews this week",
                    value: model.stats.upcomingInterviews, color: .orange,
                    deepLink: Brand.deepLink("pipeline")
                )
                if let synced = model.lastSyncAt {
                    Text("Synced \(synced, style: .relative)")
                        .font(.caption2).foregroundStyle(.secondary)
                        .padding(.top, 2)
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle(Brand.displayName)
    }
}

/**
 * StatCard — single counter rendered as a tappable card with icon +
 * label + big number. Tapping forwards the deep link to the iPhone
 * via openSystemURL so the user lands on the right dashboard view.
 *
 * Replaces the previous CounterRow which was just a flat HStack
 * with no affordance — taps on it did nothing.
 */
private struct StatCard: View {
    let icon: String
    let label: String
    let value: Int
    let color: Color
    let deepLink: String

    var body: some View {
        Button {
            openOnPhone(deepLink)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(color)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 0) {
                    Text(label)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text("\(value)")
                        .font(.title.bold())
                        .foregroundStyle(color)
                }
                Spacer()
                Image(systemName: "iphone")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(8)
            .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}

private struct NextInterviewPage: View {
    @EnvironmentObject var model: WatchModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.caption.bold())
                        .foregroundStyle(.orange)
                    Text("Next Interview").font(.caption.bold()).foregroundStyle(.secondary)
                }
                if let i = model.nextInterview {
                    Text(i.company).font(.headline)
                    Text(i.role).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    Divider().padding(.vertical, 4)
                    Text(i.scheduledAt, style: .timer)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundStyle(.orange)
                    Text(i.stage).font(.caption.bold())
                    if !i.interviewers.isEmpty {
                        Text("With \(i.interviewers.prefix(3).joined(separator: ", "))")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Button {
                        // Open the interview-prep tab on the iPhone. The
                        // deep link is parsed by deep-links-parser.ts on
                        // the phone side which routes to /job/{id}/interview-prep.
                        openOnPhone(Brand.deepLink("interview-prep/\(i.jobId)"))
                    } label: {
                        Label("Open prep on iPhone", systemImage: "iphone.and.arrow.forward")
                    }
                    .tint(.orange)
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "calendar.badge.clock")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                        Text("No interviews scheduled")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

private struct TopApplyPage: View {
    @EnvironmentObject var model: WatchModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "star.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.indigo)
                    Text("Top to Apply").font(.caption.bold()).foregroundStyle(.secondary)
                }
                if let c = model.topApply {
                    HStack {
                        Text(c.company).font(.headline)
                        Spacer()
                        Text(String(format: "%.1f", c.score))
                            .font(.caption.bold())
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.indigo.opacity(0.2))
                            .clipShape(Capsule())
                    }
                    Text(c.role).font(.caption).lineLimit(2).foregroundStyle(.secondary)
                    if let band = c.compBand {
                        HStack(spacing: 4) {
                            Image(systemName: "dollarsign.circle.fill")
                                .font(.caption2)
                                .foregroundStyle(.indigo)
                            Text(band).font(.caption).foregroundStyle(.indigo)
                        }
                    }
                    if let loc = c.location {
                        HStack(spacing: 4) {
                            Image(systemName: "mappin")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(loc).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Button {
                        openOnPhone(Brand.jobDeepLink(c.jobId))
                    } label: {
                        Label("Open on iPhone", systemImage: "iphone.and.arrow.forward")
                    }
                    .tint(.indigo)
                    .padding(.top, 4)
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "checkmark.circle")
                            .font(.title2)
                            .foregroundStyle(.indigo)
                        Text("All caught up")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

private struct InboxPage: View {
    @EnvironmentObject var model: WatchModel
    var body: some View {
        List {
            Section(header: HStack(spacing: 6) {
                Image(systemName: "tray.full")
                    .foregroundStyle(.orange)
                Text("Inbox").font(.caption.bold())
            }) {
                if model.openIssues.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.indigo)
                        Text("Nothing needs attention")
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                } else {
                    ForEach(model.openIssues.prefix(8), id: \.id) { issue in
                        Button {
                            // Tap → open the Inbox tab on the iPhone. The
                            // user can drill into the specific issue from
                            // there — surfacing per-issue deep links from
                            // the Watch would need richer routing (issue
                            // ids in URLs) which we don't expose yet.
                            openOnPhone(Brand.deepLink("inbox"))
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    Image(systemName: severityIcon(issue.severity))
                                        .foregroundStyle(severityColor(issue.severity))
                                        .font(.caption2)
                                    Text(issue.source).font(.caption2.bold())
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Image(systemName: "iphone")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary.opacity(0.6))
                                }
                                Text(issue.summary).font(.caption).lineLimit(3)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
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
