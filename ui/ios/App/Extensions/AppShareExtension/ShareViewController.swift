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
 *   2. Bundle ID: com.heron.app.share
 *   3. Add to App Groups: group.com.heron.app
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

    /// Surface the outcome as a UIAlertController so the user knows
    /// whether their tap on "Post" actually did anything. Without
    /// this, the share sheet just disappears silently and the user
    /// has no way to know if the URL landed in their Inbox.
    @MainActor
    private func showOutcome(_ outcome: ShareOutcome) async {
        let title: String
        let message: String
        switch outcome {
        case .success:
            // For success we use the system success haptic instead of
            // a modal alert — feels native (matches Apple's Reminders
            // share extension) and doesn't add a tap the user must
            // dismiss.
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return
        case .unauthenticated:
            title = "Sign in on Heron first"
            message = "Open the Heron app on this iPhone, sign in, then try sharing again."
        case .unreachable:
            title = "Heron backend unreachable"
            message = "Open the Heron app once to discover your backend, then retry sharing."
        case let .failed(status):
            title = "Couldn't save the link"
            message = "Server responded with HTTP \(status). Try again, or check the activity log inside the app."
        }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
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
            for provider in providers {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    return await loadItem(provider: provider)
                }
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
        guard let defaults = UserDefaults(suiteName: Brand.appGroup),
              let backend = defaults.string(forKey: Brand.DefaultsKey.backendResolvedUrl)
        else {
            NSLog("[share] no backend cached — cannot post URL")
            return .unreachable
        }
        guard let apiUrl = URL(string: backend + "/api/pipeline") else {
            return .unreachable
        }
        let token = defaults.string(forKey: Brand.DefaultsKey.bearerToken)
        if token == nil || token?.isEmpty == true {
            // No token → server will 401. Short-circuit so the user
            // gets a clear "Sign in first" message instead of a
            // generic HTTP error.
            NSLog("[share] no bearer token cached — user must sign in first")
            return .unauthenticated
        }
        var req = URLRequest(url: apiUrl, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token!)", forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = ["url": url.absoluteString, "note": note ?? "", "source": "ios-share"]
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)

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
                if (200 ..< 300).contains(http.statusCode) {
                    continuation.resume(returning: .success)
                } else if http.statusCode == 401 {
                    continuation.resume(returning: .unauthenticated)
                } else {
                    continuation.resume(returning: .failed(http.statusCode))
                }
            }
            task.resume()
        }
    }
}
