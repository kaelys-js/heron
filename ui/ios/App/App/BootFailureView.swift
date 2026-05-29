import UIKit

/// BootFailureView — the NATIVE last-resort UI shown when the WebView can't
/// load or render (so the user never sees a bare black screen with no way
/// out). It's the native sibling of the JS-side boot-fallback / #heron-diag
/// overlay in app.html: same brand-dark backdrop + a clear message + a
/// Reload affordance. Pure UIKit so it works even when the WebView (and all
/// of its JS) is dead.
///
/// Shown by:
///   • BridgeViewController's boot watchdog (the WebView didn't reach a
///     ready/painted state within the deadline, or its content process died).
///   • AppDelegate's root-VC guard (the storyboard failed to instantiate the
///     Capacitor bridge VC — the exact failure that caused the black screen).
final class BootFailureView: UIView {
    private let onReload: () -> Void

    /// Hex #0e1014 — matches Brand.Palette.darkBg / capacitor backgroundColor
    /// / the JS boot-fallback so the hand-off reads as one continuous surface.
    private let brandDarkBg = UIColor(red: 14.0 / 255.0, green: 16.0 / 255.0, blue: 20.0 / 255.0, alpha: 1.0)
    private let brandAccent = UIColor(red: 0.784, green: 0.608, blue: 0.290, alpha: 1.0) // #c89b4a

    init(message: String, onReload: @escaping () -> Void) {
        self.onReload = onReload
        super.init(frame: .zero)
        backgroundColor = brandDarkBg
        isOpaque = true
        build(message: message)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("init(coder:) is not used") }

    private func build(message: String) {
        // Brand mark: the cartoon mascot (BrandUI.mascotUIImage, embedded base64
        // so it survives even when asset bundles don't), in its own colors
        // (.alwaysOriginal). Falls back to the accent-tinted SF-symbol glyph if
        // the embed is ever missing.
        let mascot = BrandUI.mascotUIImage?.withRenderingMode(.alwaysOriginal)
        let glyph = UIImageView(
            image: mascot
                ?? UIImage(systemName: BrandUI.glyphSymbol)
                ?? UIImage(systemName: "exclamationmark.triangle")
        )
        if mascot == nil { glyph.tintColor = brandAccent }
        glyph.contentMode = .scaleAspectFit
        glyph.translatesAutoresizingMaskIntoConstraints = false
        glyph.heightAnchor.constraint(equalToConstant: 44).isActive = true

        let title = UILabel()
        title.text = "Couldn't load \(Brand.displayName)"
        // Dynamic Type-aware so the message scales with the user's text size.
        title.font = UIFontMetrics(forTextStyle: .title3).scaledFont(
            for: .systemFont(ofSize: 19, weight: .semibold)
        )
        title.adjustsFontForContentSizeCategory = true
        title.textColor = UIColor(white: 0.96, alpha: 1.0)
        title.textAlignment = .center
        title.numberOfLines = 0

        let body = UILabel()
        body.text = message
        body.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: .systemFont(ofSize: 14))
        body.adjustsFontForContentSizeCategory = true
        body.textColor = UIColor(white: 0.7, alpha: 1.0)
        body.textAlignment = .center
        body.numberOfLines = 0

        let reload = UIButton(type: .system)
        var cfg = UIButton.Configuration.filled()
        cfg.title = "Reload"
        cfg.baseBackgroundColor = UIColor(red: 0.29, green: 0.357, blue: 0.427, alpha: 1.0) // #4a5b6d
        cfg.baseForegroundColor = .white
        cfg.cornerStyle = .large
        cfg.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 28, bottom: 12, trailing: 28)
        reload.configuration = cfg
        reload.addTarget(self, action: #selector(reloadTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [glyph, title, body, reload])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.setCustomSpacing(22, after: body)
        stack.translatesAutoresizingMaskIntoConstraints = false

        // Host the stack in a scroll view so that at large Dynamic Type sizes
        // (or short screens) the content -- and crucially the Reload button --
        // stays reachable instead of being pushed off-screen. It still reads as
        // centered when the content fits (low-priority centerY).
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.showsVerticalScrollIndicator = false
        addSubview(scroll)
        scroll.addSubview(stack)

        let frame = scroll.frameLayoutGuide
        let content = scroll.contentLayoutGuide
        let centerY = stack.centerYAnchor.constraint(equalTo: frame.centerYAnchor)
        centerY.priority = .defaultLow // yields to the content top/bottom when it can't fit

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),

            stack.topAnchor.constraint(greaterThanOrEqualTo: content.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: content.bottomAnchor, constant: -24),
            stack.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            centerY,
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: frame.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: frame.trailingAnchor, constant: -32),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 360),
        ])
    }

    @objc private func reloadTapped() {
        onReload()
    }
}
