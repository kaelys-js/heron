import ActivityKit
import SwiftUI
import WidgetKit

/**
 * AppLiveActivity — Dynamic Island + Lock Screen countdown for
 * upcoming interviews.
 *
 * The WebView starts a Live Activity ~24h before a scheduled interview
 * via a small Capacitor bridge that calls `Activity<...>.request(...)`.
 * The activity ends automatically when the interview time passes.
 *
 * Dynamic Island states:
 *   • compact: ⌛ 3h 22m
 *   • minimal: ⌛
 *   • expanded: company logo + role + countdown + "Open prep" button
 *
 * To add this target in Xcode:
 *   1. File → New → Target → Widget Extension → "AppLiveActivity"
 *      with "Include Live Activity" ticked
 *   2. Bundle ID: <brand.json::identifiers.bundleId>.liveactivity
 *   3. Add to App Groups: <brand.json::identifiers.appGroup>
 */
struct HeronInterviewAttributes: ActivityAttributes {
    typealias ContentState = State

    struct State: Codable, Hashable {
        var scheduledAt: Date
        var company: String
        var role: String
        var stage: String // "Phone screen" | "Technical" | "Final" etc.
    }

    var jobId: String
}

// The interview UI is extracted into standalone SwiftUI views so it can
// be rendered (and thus coverage-exercised) in tests. ActivityConfiguration
// can't be invoked without an ActivityViewContext the framework reserves,
// so the configuration below just composes these views from
// `context.state` / `context.attributes` -- the rendered view tree is
// identical to the previous inline closures.

/// Lock-screen / banner UI. The brand-indigo low-opacity tint (applied by
/// the configuration) matches the iPhone widgets' BrandBackground recipe so
/// the whole iOS surface reads as one cohesive Heron experience.
@available(iOS 16.1, *)
struct HeronInterviewLockScreenView: View {
    let state: HeronInterviewAttributes.State

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "calendar.badge.clock")
                    .font(.caption.bold())
                    .foregroundStyle(.tint)
                Text("NEXT INTERVIEW")
                    .font(.caption2.bold())
                    .foregroundStyle(.secondary)
                    .tracking(0.5)
                Spacer()
                Text(state.stage)
                    .font(.caption2.bold())
                    .foregroundStyle(.tint)
            }
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(state.company).font(.headline)
                    Text(state.role).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Text(state.scheduledAt, style: .timer)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundStyle(.tint)
                    .lineLimit(1)
            }
        }
        .padding()
    }
}

@available(iOS 16.1, *)
struct HeronInterviewDILeadingView: View {
    let state: HeronInterviewAttributes.State
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(state.company).font(.caption.bold())
            Text(state.stage).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

@available(iOS 16.1, *)
struct HeronInterviewDITrailingView: View {
    let state: HeronInterviewAttributes.State
    var body: some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text("In").font(.caption2).foregroundStyle(.secondary)
            Text(state.scheduledAt, style: .timer)
                .font(.caption.monospacedDigit().bold())
                .foregroundStyle(.tint)
        }
    }
}

@available(iOS 16.1, *)
struct HeronInterviewDIBottomView: View {
    let state: HeronInterviewAttributes.State
    let jobId: String
    var body: some View {
        HStack {
            Text(state.role).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            Spacer()
            Link(destination: URL(string: Brand.deepLink("interview-prep/\(jobId)"))!) {
                HStack(spacing: 4) {
                    Text("Open prep").font(.caption.bold())
                    Image(systemName: "arrow.up.right")
                        .font(.caption2.bold())
                }
                .foregroundStyle(.tint)
            }
        }
    }
}

@available(iOS 16.1, *)
struct HeronInterviewLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HeronInterviewAttributes.self) { context in
            HeronInterviewLockScreenView(state: context.state)
                .activityBackgroundTint(Color.indigo.opacity(0.35))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HeronInterviewDILeadingView(state: context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    HeronInterviewDITrailingView(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HeronInterviewDIBottomView(state: context.state, jobId: context.attributes.jobId)
                }
            } compactLeading: {
                Image(systemName: "calendar.badge.clock")
                    .foregroundStyle(.tint)
            } compactTrailing: {
                Text(context.state.scheduledAt, style: .timer)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.tint)
            } minimal: {
                Image(systemName: "calendar.badge.clock")
                    .foregroundStyle(.tint)
            }
        }
    }
}

/**
 * WidgetBundle entry point. WidgetKit extension targets are binaries
 * that MUST declare an `@main` symbol or the produced .appex has no
 * runtime entry point — iOS's installer then rejects the bundle with
 * "Invalid placeholder attributes / Failed to create app extension
 * placeholder", since its probe can't read widget configurations
 * from an entry-less binary.
 *
 * Apple's recommended pattern is actually one WidgetBundle in the
 * main AppWidget extension containing all widgets + live
 * activities. This project ships them as SEPARATE extension targets
 * (AppWidget vs AppLiveActivity) because Live Activities
 * require iOS 16.1 while regular widgets only need 14.0 — keeping
 * them split lets the widget extension support older iPhones. Each
 * separate extension needs its own @main.
 */
@available(iOS 16.1, *)
@main
struct LiveActivityBundle: WidgetBundle {
    var body: some Widget {
        HeronInterviewLiveActivity()
    }
}
