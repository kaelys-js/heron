import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

/**
 * CareerOpsShareExtension — adds a "Send to career-ops" option to the
 * iOS share sheet. When the user shares a job-posting URL from Safari
 * (or any app), this extension grabs the URL and POSTs it to the
 * /api/pipeline endpoint on the resolved backend.
 *
 * To add this target in Xcode:
 *   1. File → New → Target → Share Extension → "CareerOpsShareExtension"
 *   2. Bundle ID: com.resistjs.careerops.share
 *   3. Add to App Groups: group.com.resistjs.careerops
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
            if let url = await extractUrl() {
                await postToCareerOps(url: url, note: self.contentText)
            }
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    override func configurationItems() -> [Any]! {
        return []
    }

    // MARK: - Private

    private func extractUrl() async -> URL? {
        guard let items = self.extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
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

    private func postToCareerOps(url: URL, note: String?) async {
        // Read the resolved backend URL from the shared App Group.
        guard let defaults = UserDefaults(suiteName: "group.com.resistjs.careerops"),
              let backend = defaults.string(forKey: "career-ops:backend-resolved-url") else {
            NSLog("[share] no backend cached — cannot post URL")
            return
        }
        guard let apiUrl = URL(string: backend + "/api/pipeline") else { return }
        var req = URLRequest(url: apiUrl, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any] = ["url": url.absoluteString, "note": note ?? "", "source": "ios-share"]
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let task = URLSession.shared.dataTask(with: req) { _, response, _ in
                if let http = response as? HTTPURLResponse {
                    NSLog("[share] posted, status=\(http.statusCode)")
                }
                continuation.resume()
            }
            task.resume()
        }
    }
}
