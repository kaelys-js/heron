import WidgetKit
import SwiftUI

/**
 * WidgetAuthGate — shared signed-out CTA view + helper used by every
 * widget in the CareerOpsWidget bundle.
 *
 * Why a dedicated module:
 *   Every widget (Pipeline / Inbox / TopApply / NextInterview) needs the
 *   exact same "Sign in on iPhone" treatment when the user has signed
 *   out — same gradient, same SF Symbol, same copy, same tap-target
 *   deep link. Duplicating it across four widget files would mean four
 *   places to update copy and four places for the design to drift.
 *
 * Auth model:
 *   The iPhone main app writes `auth:isAuthenticated` (Bool) into the
 *   shared App Group UserDefaults via CareerOpsNativePlugin.updateWidgets.
 *   On sign-out the plugin also scrubs every cached widget data key so
 *   the widget surface can't render stale data — but the boolean is the
 *   authoritative gate. A fresh-installed device defaults to FALSE
 *   (UserDefaults.bool returns false for missing keys) so widgets show
 *   the gate from the very first install, NOT empty stats that look
 *   like working data.
 *
 * Visual treatment:
 *   • Brand-tinted soft gradient background (matches Task 4 widget
 *     polish — every widget uses the same containerBackground recipe).
 *   • `lock.shield.fill` SF Symbol in brand tint.
 *   • Two-line copy: bold "Sign in on iPhone" headline + secondary
 *     instruction.
 *   • Whole widget is a tap target to `careerops://login` — opens the
 *     iPhone app at /login so the user can authenticate.
 */
enum WidgetAuth {
    /// Read the gate flag the iPhone main app stamps into App Group
    /// defaults. FALSE for fresh installs / signed-out users → widget
    /// shows the gate; TRUE → widget renders its real content.
    static func isAuthenticated() -> Bool {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            // App Group misconfigured — fail safe to signed-out so the
            // user sees the gate (better than rendering zeroes that read
            // as a broken app).
            return false
        }
        return defaults.bool(forKey: "auth:isAuthenticated")
    }
}

/**
 * BrandBackground — soft gradient + container background used by every
 * widget so they sit visually together instead of reading as four
 * unrelated white cards.
 *
 * The gradient is brand-indigo with a low opacity ceiling so it doesn't
 * fight with the system tint (users who pick a different widget tint in
 * iOS settings still see their chosen color on the foreground content).
 * Bottom corner has a slightly stronger tint stop so the eye reads a
 * subtle "depth" gradient rather than a flat fill.
 *
 * `.containerBackground(for: .widget)` is iOS 17+ — older systems still
 * fall back to the default system white. We deliberately do NOT
 * `@available(iOS 17.0, *)` guard the entire view because the gradient
 * is a visual nicety, not a functional requirement; downlevel users
 * just get the system default.
 */
struct BrandBackground: View {
    var body: some View {
        // System background as the base so .containerBackground on iOS
        // 17+ inherits the OS material correctly while older systems
        // see the standard widget background as a fallback. A subtle
        // top-to-bottom-right indigo tint differentiates Career Ops
        // widgets from generic system widgets without overwhelming the
        // foreground content.
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color.indigo.opacity(0.06),
                Color.purple.opacity(0.10)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

/**
 * View extension that applies the brand container background only on iOS
 * 17+, where `.containerBackground(for: .widget)` is the Apple-blessed
 * API. On iOS 14-16 the modifier is unavailable and we fall through to
 * the default widget background (white in light mode, dark in dark
 * mode) — the BrandBackground gradient is a visual nicety, not a
 * functional requirement. Wrapping the modifier at the call site means
 * widget views stay readable and don't have to repeat the availability
 * check eight times.
 */
extension View {
    @ViewBuilder
    func brandContainerBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { BrandBackground() }
        } else {
            // iOS 14-16: widgets get the default system background.
            // Adding an explicit `.background(BrandBackground())` here
            // would conflict with Apple's iOS 16 layout (padding around
            // backgrounds is reserved for the system), so we deliberately
            // no-op rather than risk a layout regression on older
            // devices.
            self
        }
    }
}

/**
 * WidgetHeader — shared top-row composition used by every widget so the
 * card-level hierarchy reads consistently across the gallery:
 *
 *   [SF Symbol] [Label]                          [Trailing accent]
 *
 * Examples:
 *   tray.full      INBOX                                     3
 *   tray           QUEUE                                     0
 *   calendar       NEXT INTERVIEW                          2h
 *   star.fill      TOP TO APPLY                           4.7
 */
struct WidgetHeader<Trailing: View>: View {
    let icon: String
    let label: String
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption.bold())
                .foregroundStyle(.tint)
            Text(label.uppercased())
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
                .tracking(0.5)
            Spacer(minLength: 0)
            trailing()
        }
    }
}

extension WidgetHeader where Trailing == EmptyView {
    init(icon: String, label: String) {
        self.icon = icon
        self.label = label
        self.trailing = { EmptyView() }
    }
}

struct WidgetSignInGate: View {
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            // Lock Screen circular — tiny canvas, just the lock glyph.
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 14, weight: .semibold))
            }
        case .accessoryInline:
            Text("Sign in on iPhone")
        case .accessoryRectangular:
            HStack(spacing: 6) {
                Image(systemName: "lock.shield.fill")
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Career Ops").font(.caption2.bold()).foregroundStyle(.tint)
                    Text("Sign in on iPhone").font(.caption).lineLimit(1)
                }
            }
        default:
            // systemSmall / systemMedium / systemLarge — full card.
            VStack(spacing: 8) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: family == .systemLarge ? 44 : 32, weight: .regular))
                    .foregroundStyle(.tint)
                Text("Career Ops")
                    .font(family == .systemSmall ? .caption.bold() : .subheadline.bold())
                    .foregroundStyle(.secondary)
                Text("Sign in on iPhone")
                    .font(family == .systemSmall ? .footnote.bold() : .headline)
                    .multilineTextAlignment(.center)
                if family != .systemSmall {
                    Text("Open the app to see your pipeline.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 4)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding()
        }
    }
}
