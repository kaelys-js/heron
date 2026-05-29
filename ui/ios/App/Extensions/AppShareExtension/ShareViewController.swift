import MobileCoreServices
import Social
import UIKit
import UniformTypeIdentifiers

/**
 * AppShareExtension — adds a "Send to heron" option to the
 * iOS share sheet. When the user shares a job-posting URL from Safari
 * (or any app), this extension grabs the URL and POSTs it to the
 * /api/pipeline endpoint on the resolved backend.
 *
 * To add this target in Xcode:
 *   1. File → New → Target → Share Extension → "AppShareExtension"
 *   2. Bundle ID: <brand.json::identifiers.bundleId>.share
 *   3. Add to App Groups: <brand.json::identifiers.appGroup>
 *   4. NSExtensionAttributes / NSExtensionActivationRule (in
 *      MainInterface.storyboard's Info.plist):
 *         NSExtensionActivationSupportsWebURLWithMaxCount = 1
 *         NSExtensionActivationSupportsWebPageWithMaxCount = 1
 *   5. Replace the auto-generated ShareViewController with this file.
 */
class ShareViewController: SLComposeServiceViewController {
    override func isContentValid() -> Bool {
        // Always allow — we extract the URL from the attached items.
        return true
    }

    override func didSelectPost() {
        Task { @MainActor in
            guard let url = await extractUrl() else {
                // No URL in the share payload (user shared a photo or
                // bare text). Complete silently — Compose sheet already
                // had its built-in cancel button.
                self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
                return
            }
            let outcome = await postToBackend(url: url, note: self.contentText)
            await showOutcome(outcome)
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    /// Result of the POST so the UI feedback path knows which alert /
    /// haptic to show. We deliberately distinguish `unauthenticated`
    /// from `failed` because the recovery path is different — user
    /// must sign in on the iPhone vs. retry the share later.
    enum ShareOutcome {
        case success
        case unauthenticated // 401 / no token → user must sign in on iPhone
        case unreachable // No backend URL cached, or timeout
        case failed(Int) // Other non-2xx HTTP status
    }

    // MARK: - Pure request/response helpers (testable without extensionContext)

    /// Map an HTTP status code to a ShareOutcome. 2xx is success; 401 is the
    /// "sign in on the iPhone first" path; anything else is a generic failure
    /// carrying the status for the alert. Extracted from the URLSession
    /// completion so it can be unit-tested without a live backend.
    static func outcome(forStatus status: Int) -> ShareOutcome {
        if (200 ..< 300).contains(status) { return .success }
        if status == 401 { return .unauthenticated }
        return .failed(status)
    }

    /// Build the POST /api/pipeline request from the resolved backend, bearer
    /// token, shared URL, and optional compose-sheet note. Returns nil when
    /// the backend string can't form a URL. Extracted so the request shape
    /// (path, headers, JSON body) is unit-testable without extensionContext.
    static func pipelineRequest(backend: String, token: String, url: URL, note: String?) -> URLRequest? {
        guard let apiUrl = URL(string: backend + "/api/pipeline") else { return nil }
        var req = URLRequest(url: apiUrl, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = ["url": url.absoluteString, "note": note ?? "", "source": "ios-share"]
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        return req
    }

    /// Short-circuit outcome before any network call: `.unreachable` when no
    /// backend is cached, `.unauthenticated` when no bearer token is cached,
    /// or nil when both are present (proceed to POST). Extracted so the
    /// precondition branches are unit-testable without the App Group/network.
    static func preflightOutcome(backend: String?, token: String?) -> ShareOutcome? {
        guard let backend, !backend.isEmpty else { return .unreachable }
        if token == nil || token?.isEmpty == true { return .unauthenticated }
        return nil
    }

    /// Title/message for the outcome alert, or nil for `.success` (which uses
    /// a haptic, not a modal). Extracted from showOutcome so the user-facing
    /// copy is unit-testable without presenting a real UIAlertController.
    static func alertText(for outcome: ShareOutcome) -> (title: String, message: String)? {
        switch outcome {
        case .success:
            return nil
        case .unauthenticated:
            return ("Sign in on Heron first",
                    "Open the Heron app on this iPhone, sign in, then try sharing again.")
        case .unreachable:
            return ("Heron backend unreachable",
                    "Open the Heron app once to discover your backend, then retry sharing.")
        case let .failed(status):
            return ("Couldn't save the link",
                    "Server responded with HTTP \(status). Try again, or check the activity log inside the app.")
        }
    }

    /// Surface the outcome as a UIAlertController so the user knows
    /// whether their tap on "Post" actually did anything. Without
    /// this, the share sheet just disappears silently and the user
    /// has no way to know if the URL landed in their Inbox.
    @MainActor
    private func showOutcome(_ outcome: ShareOutcome) async {
        guard let text = Self.alertText(for: outcome) else {
            // .success → system success haptic instead of a modal alert —
            // feels native (matches Apple's Reminders share extension) and
            // doesn't add a tap the user must dismiss.
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return
        }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let alert = UIAlertController(title: text.title, message: text.message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
                continuation.resume()
            })
            self.present(alert, animated: true)
        }
    }

    override func configurationItems() -> [Any]! {
        return []
    }

    // MARK: - Private

    private func extractUrl() async -> URL? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        for item in items {
            guard let providers = item.attachments else { continue }
            for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                return await loadItem(provider: provider)
            }
        }
        return nil
    }

    private func loadItem(provider: NSItemProvider) async -> URL? {
        return await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                if let url = item as? URL {
                    continuation.resume(returning: url)
                } else if let str = item as? String, let url = URL(string: str) {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func postToBackend(url: URL, note: String?) async -> ShareOutcome {
        // Read the resolved backend URL + bearer token from the shared
        // App Group. The iPhone main app mirrors both whenever they
        // change (see NativePlugin.setSharedBackendUrl /
        // setSharedBearerToken). If either is missing the user hasn't
        // opened + signed in to the host app yet.
        let defaults = UserDefaults(suiteName: Brand.appGroup)
        let backend = defaults?.string(forKey: Brand.DefaultsKey.backendResolvedUrl)
        let token = defaults?.string(forKey: Brand.DefaultsKey.bearerToken)
        // Short-circuit before the network call: no backend → unreachable,
        // no bearer token → unauthenticated (server would 401; a clear
        // "sign in first" message beats a generic HTTP error).
        if let preflight = Self.preflightOutcome(backend: backend, token: token) {
            NSLog("[share] preflight outcome: \(preflight)")
            return preflight
        }
        guard let req = Self.pipelineRequest(backend: backend!, token: token!, url: url, note: note) else {
            return .unreachable
        }

        return await withCheckedContinuation { (continuation: CheckedContinuation<ShareOutcome, Never>) in
            let task = URLSession.shared.dataTask(with: req) { _, response, error in
                if let error = error {
                    NSLog("[share] network error: \(error.localizedDescription)")
                    continuation.resume(returning: .unreachable)
                    return
                }
                guard let http = response as? HTTPURLResponse else {
                    continuation.resume(returning: .unreachable)
                    return
                }
                NSLog("[share] posted, status=\(http.statusCode)")
                continuation.resume(returning: Self.outcome(forStatus: http.statusCode))
            }
            task.resume()
        }
    }
}
