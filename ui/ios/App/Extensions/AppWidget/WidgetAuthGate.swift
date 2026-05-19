import SwiftUI
import WidgetKit

/**
 * WidgetAuthGate — shared signed-out CTA view + helper used by every
 * widget in the AppWidget bundle.
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
 *   shared App Group UserDefaults via NativePlugin.updateWidgets.
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
 *   • Whole widget is a tap target to `heron://login` — opens the
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
        // top-to-bottom-right indigo tint differentiates Heron
        // widgets from generic system widgets without overwhelming the
        // foreground content.
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color.indigo.opacity(0.06),
                Color.purple.opacity(0.10),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

/**
 * BrandMark — miniature reproduction of the app icon for use inside
 * widget content (auth gate, branded headers). Renders the same
 * indigo→violet→purple gradient rounded-rect from branding/logo.svg
 * with the rocket glyph centred on top.
 *
 * Why not just use the SF Symbol `paperplane.fill` or similar:
 *   Generic SF Symbols don't say "this is YOUR app" the way the brand
 *   mark does. The previous gate used `lock.shield.fill` which read as
 *   a generic security warning, not a friendly "open Heron to
 *   continue" affordance. Reproducing the actual app icon makes the
 *   gate visually identical to the icon the user just installed.
 *
 * Why not load the AppIcon image directly:
 *   WidgetKit extensions can't access the host app's AppIcon — the
 *   image lives in the host's asset catalog, not the extension's. We
 *   could ship a duplicate but that means two places to update. SwiftUI
 *   reproduction stays in sync with branding/logo.svg via the same
 *   indigo/violet/purple constants the inline app.html uses.
 *
 * Sizing: the rounded-rect occupies the full frame; callers control
 * the outer size with `.frame(width:height:)`.
 */
struct BrandMark: View {
    var body: some View {
        ZStack {
            // Backing rounded rect with the brand gradient. Corner
            // radius is ~22% of the side, matching the iOS-style
            // squircle that branding/logo.svg uses (232 of 1024).
            GeometryReader { geo in
                let size = min(geo.size.width, geo.size.height)
                RoundedRectangle(cornerRadius: size * 0.226, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.388, green: 0.400, blue: 0.945), // #6366f1
                                Color(red: 0.545, green: 0.361, blue: 0.965), // #8b5cf6
                                Color(red: 0.659, green: 0.333, blue: 0.969), // #a855f7
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    // Top-half subtle white wash for depth, matches the
                    // ".06 white opacity rect" in branding/logo.svg.
                    .overlay(
                        RoundedRectangle(cornerRadius: size * 0.226, style: .continuous)
                            .fill(Color.white.opacity(0.06))
                            .frame(height: size / 2)
                            .frame(maxHeight: .infinity, alignment: .top)
                            .clipShape(RoundedRectangle(cornerRadius: size * 0.226, style: .continuous))
                    )
                    // Rocket glyph centred on top. Uses SF Symbol
                    // `paperplane.fill` rotated — closest stock symbol
                    // to the lucide rocket shape used in branding/logo.svg.
                    // Apple ships `figure.fall.forward` style rockets
                    // only from iOS 17; we use a more compatible glyph.
                    .overlay(
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: size * 0.42, weight: .medium))
                            .foregroundStyle(.white)
                            .rotationEffect(.degrees(-45))
                            .offset(x: -size * 0.02, y: 0)
                    )
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .shadow(color: .indigo.opacity(0.35), radius: 12, x: 0, y: 6)
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
            containerBackground(for: .widget) { BrandBackground() }
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
        trailing = { EmptyView() }
    }
}

/**
 * WidgetSignInGate — branded "tap to sign in" placeholder rendered by
 * every widget when the user isn't authenticated on the host app.
 *
 * Design priorities:
 *   1. **Device-agnostic copy**: the widget can be on iPhone OR iPad,
 *      and the same binary runs on both. "Sign in on iPhone" was wrong
 *      on iPad and truncated to "Sign in on iP…" on small widgets even
 *      on iPhone. We replaced it with "Tap to sign in" everywhere —
 *      short, fits the small widget without truncation, and accurate
 *      regardless of the device the user is looking at.
 *   2. **Branded mark, not a lock**: the previous gate used
 *      `lock.shield.fill` which read as a security warning. The brand
 *      mark (matching the app icon the user just installed) reads as
 *      "open YOUR app" which is the actual action we want.
 *   3. **No truncation on systemSmall**: typography sized so headline
 *      fits in one line at the small-widget width (≈155 pt on iPhone).
 *      The supporting line is shown only on systemMedium+ where there
 *      is room.
 */
struct WidgetSignInGate: View {
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            // Lock Screen circular — tiny canvas. Mini brand mark
            // (smaller corner radius works at this size) over the
            // accessory background.
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.tint)
                    .rotationEffect(.degrees(-45))
            }
        case .accessoryInline:
            Label("Tap to sign in", systemImage: "paperplane.fill")
        case .accessoryRectangular:
            HStack(spacing: 6) {
                Image(systemName: "paperplane.fill")
                    .foregroundStyle(.tint)
                    .rotationEffect(.degrees(-45))
                VStack(alignment: .leading, spacing: 1) {
                    Text(Brand.displayName)
                        .font(.caption2.bold())
                        .foregroundStyle(.tint)
                    Text("Tap to sign in")
                        .font(.caption)
                        .lineLimit(1)
                }
            }
        default:
            // systemSmall / systemMedium / systemLarge — full card.
            VStack(spacing: family == .systemSmall ? 6 : 10) {
                BrandMark()
                    .frame(
                        width: family == .systemLarge ? 64 : family == .systemMedium ? 56 : 44,
                        height: family == .systemLarge ? 64 : family == .systemMedium ? 56 : 44
                    )
                Text(Brand.displayName)
                    .font(.caption2.bold())
                    .foregroundStyle(.secondary)
                    .tracking(0.5)
                Text("Tap to sign in")
                    .font(family == .systemSmall ? .footnote.bold() : .headline)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.8)
                    .lineLimit(1)
                if family != .systemSmall {
                    Text("Open the app to see your pipeline.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 4)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding()
        }
    }
}
