import Foundation
import UIKit
import UserNotifications

/**
 * BackgroundFetcher — runs every ~15min when iOS decides to wake us.
 *
 * Poll /api/issues?since=lastSeen on the discovered backend, find
 * high-priority Issues (level >= warn), and post Local Notifications
 * so the user sees them when their phone is locked.
 *
 * This is the workaround for the iOS background-SSE limitation: SSE
 * dies ~30s after backgrounding, so we polyfill with periodic fetches.
 * Apple controls the actual cadence — UIApplication.backgroundFetchIntervalMinimum
 * is a lower bound (~15min in practice).
 */
final class BackgroundFetcher {
    static let shared = BackgroundFetcher()

    func fetch(completion: @escaping (UIBackgroundFetchResult) -> Void) {
        guard let backend = resolveBackend() else {
            NSLog("[bg-fetch] no backend cached — skipping")
            completion(.noData)
            return
        }
        let lastSeen = UserDefaults.standard.double(forKey: "career-ops:last-seen-issue")
        var components = URLComponents(string: backend + "/api/issues")!
        components.queryItems = [URLQueryItem(name: "since", value: String(Int64(lastSeen * 1000)))]
        guard let url = components.url else {
            completion(.failed)
            return
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let task = URLSession.shared.dataTask(with: req) { data, response, error in
            if let _ = error { completion(.failed); return }
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let issues = json["issues"] as? [[String: Any]]
            else {
                completion(.noData)
                return
            }
            var newest = lastSeen
            var surfaced = 0
            for issue in issues {
                guard let createdAt = issue["createdAt"] as? Double else { continue }
                let createdSec = createdAt / 1000.0
                if createdSec <= lastSeen { continue }
                if createdSec > newest { newest = createdSec }
                let level = (issue["level"] as? String) ?? "info"
                if level == "error" || level == "warn" {
                    self.scheduleNotification(issue)
                    surfaced += 1
                }
            }
            if newest > lastSeen {
                UserDefaults.standard.set(newest, forKey: "career-ops:last-seen-issue")
            }
            completion(surfaced > 0 ? .newData : .noData)
        }
        task.resume()
    }

    private func scheduleNotification(_ issue: [String: Any]) {
        let content = UNMutableNotificationContent()
        content.title = (issue["title"] as? String) ?? "career-ops"
        content.body = (issue["summary"] as? String) ?? ""
        content.sound = .default
        if let jobId = issue["jobId"] as? String {
            content.userInfo = ["deepLink": "careerops://job/\(jobId)"]
        }
        let id = (issue["id"] as? String) ?? UUID().uuidString
        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    private func resolveBackend() -> String? {
        // Order mirrors lib/client/backend-discovery.ts. We can only
        // probe LAN + tailscale + production from native because the
        // WebView isn't running during background-fetch.
        if let lan = UserDefaults.standard.string(forKey: "career-ops:lan-url") { return lan }
        if let cached = UserDefaults.standard.string(forKey: "career-ops:backend-resolved-url") { return cached }
        if let ts = UserDefaults.standard.string(forKey: "career-ops:tailscale-url") { return ts }
        if let prod = UserDefaults.standard.string(forKey: "career-ops:production-url") { return prod }
        return nil
    }
}
