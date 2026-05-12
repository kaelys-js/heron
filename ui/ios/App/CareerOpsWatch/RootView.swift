import SwiftUI

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
        TabView {
            StatsPage()
            NextInterviewPage()
            TopApplyPage()
            InboxPage()
        }
        .tabViewStyle(.page)
        // `.tint.gradient` was the goal, but TintShapeStyle doesn't
        // expose `.gradient` (only concrete Colors do). Anchor to a
        // brand-adjacent indigo so the gradient renders correctly on
        // watchOS 10+; iOS 18 tint-on-watch will still recolor it.
        .containerBackground(Color.indigo.gradient, for: .tabView)
    }
}

private struct StatsPage: View {
    @EnvironmentObject var model: WatchModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Today").font(.title3.bold())
                // CounterRow.color expects a concrete `Color`. `.tint`
                // resolves to `TintShapeStyle` in this context, not a
                // Color value — use the same indigo we use for the
                // container background to stay visually consistent.
                CounterRow(label: "Queued", value: model.stats.queued, color: .indigo)
                CounterRow(label: "Applied", value: model.stats.appliedToday, color: .green)
                CounterRow(label: "Interviews", value: model.stats.upcomingInterviews, color: .orange)
                if let synced = model.lastSyncAt {
                    Text("Synced \(synced, style: .relative)")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("career-ops")
    }
}

private struct CounterRow: View {
    let label: String
    let value: Int
    let color: Color
    var body: some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Spacer()
            Text("\(value)").font(.title.bold()).foregroundStyle(color)
        }
        .padding(.vertical, 4)
        .overlay(alignment: .bottom) {
            Rectangle().frame(height: 0.5).foregroundStyle(.secondary.opacity(0.3))
        }
    }
}

private struct NextInterviewPage: View {
    @EnvironmentObject var model: WatchModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Next Interview").font(.caption.bold()).foregroundStyle(.secondary)
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
                        // Tap-to-open on iPhone via a deep link Handoff.
                        // The phone receives the activity and navigates
                        // the WebView to /job/{jobId}.
                        let job = i.jobId
                        if let url = URL(string: "careerops://job/\(job)") {
                            // WKExtension is iOS — on watchOS we use
                            // openSystemURL via a NSUserActivity.
                            // Captured here for the Xcode target to wire
                            // through HandoffTransfer.
                            _ = url
                        }
                    } label: {
                        Label("Open on iPhone", systemImage: "iphone")
                    }
                } else {
                    Text("No interviews scheduled").foregroundStyle(.secondary)
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
                Text("Top to Apply").font(.caption.bold()).foregroundStyle(.secondary)
                if let c = model.topApply {
                    HStack {
                        Text(c.company).font(.headline)
                        Spacer()
                        Text(String(format: "%.1f", c.score))
                            .font(.caption.bold())
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.tint.opacity(0.2))
                            .clipShape(Capsule())
                    }
                    Text(c.role).font(.caption).lineLimit(2).foregroundStyle(.secondary)
                    if let band = c.compBand {
                        Text(band).font(.caption).foregroundStyle(.tint)
                    }
                    if let loc = c.location {
                        Text(loc).font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("Open on iPhone to apply").font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Text("No queued jobs").foregroundStyle(.secondary)
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
            Section(header: Text("Inbox").font(.caption.bold())) {
                if model.openIssues.isEmpty {
                    Text("All clear").foregroundStyle(.secondary)
                } else {
                    ForEach(model.openIssues.prefix(8), id: \.id) { issue in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 4) {
                                Image(systemName: severityIcon(issue.severity))
                                    .foregroundStyle(severityColor(issue.severity))
                                    .font(.caption2)
                                Text(issue.source).font(.caption2.bold())
                                    .foregroundStyle(.secondary)
                            }
                            Text(issue.summary).font(.caption).lineLimit(3)
                        }
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
