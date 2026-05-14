import ActivityKit
import WidgetKit
import SwiftUI

/**
 * CareerOpsLiveActivity — Dynamic Island + Lock Screen countdown for
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
 *   1. File → New → Target → Widget Extension → "CareerOpsLiveActivity"
 *      with "Include Live Activity" ticked
 *   2. Bundle ID: com.resistjs.careerops.liveactivity
 *   3. Add to App Groups: group.com.resistjs.careerops
 */
struct CareerOpsInterviewAttributes: ActivityAttributes {
    public typealias ContentState = State

    public struct State: Codable, Hashable {
        var scheduledAt: Date
        var company: String
        var role: String
        var stage: String  // "Phone screen" | "Technical" | "Final" etc.
    }

    var jobId: String
}

@available(iOS 16.1, *)
struct CareerOpsInterviewLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CareerOpsInterviewAttributes.self) { context in
            // Lock-screen / banner UI
            VStack(alignment: .leading) {
                HStack {
                    Text(context.state.company).font(.headline)
                    Spacer()
                    Text(context.state.stage).font(.caption).foregroundStyle(.secondary)
                }
                Text(context.state.role).font(.subheadline)
                Text("In \(context.state.scheduledAt, style: .timer)")
                    .font(.system(size: 28, weight: .bold))
            }.padding().activityBackgroundTint(Color.black.opacity(0.85))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.company).font(.caption.bold())
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.scheduledAt, style: .timer).font(.caption.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.state.role).font(.caption2).foregroundStyle(.secondary)
                        Spacer()
                        Link(destination: URL(string: Brand.jobDeepLink(context.attributes.jobId))!) {
                            Text("Open prep").font(.caption.bold())
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "hourglass")
            } compactTrailing: {
                Text(context.state.scheduledAt, style: .timer).font(.caption.monospacedDigit())
            } minimal: {
                Image(systemName: "hourglass")
            }
        }
    }
}

/*
 * WidgetBundle entry point. WidgetKit extension targets are binaries
 * that MUST declare an `@main` symbol or the produced .appex has no
 * runtime entry point — iOS's installer then rejects the bundle with
 * "Invalid placeholder attributes / Failed to create app extension
 * placeholder", since its probe can't read widget configurations
 * from an entry-less binary.
 *
 * Apple's recommended pattern is actually one WidgetBundle in the
 * main CareerOpsWidget extension containing all widgets + live
 * activities. This project ships them as SEPARATE extension targets
 * (CareerOpsWidget vs CareerOpsLiveActivity) because Live Activities
 * require iOS 16.1 while regular widgets only need 14.0 — keeping
 * them split lets the widget extension support older iPhones. Each
 * separate extension needs its own @main.
 */
@available(iOS 16.1, *)
@main
struct CareerOpsLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        CareerOpsInterviewLiveActivity()
    }
}
