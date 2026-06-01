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
 *
 * Architecture limits the user must understand:
 *
 *   ┌─────────────────────────┬──────────────────────────────────────┐
 *   │ App state               │ Notifications behaviour              │
 *   ├─────────────────────────┼──────────────────────────────────────┤
 *   │ Foregrounded (active)   │ Bell SSE (/api/stream) fires an OS    │
 *   │                         │ notify on product warn/error events   │
 *   │ Backgrounded            │ This BackgroundFetcher polls         │
 *   │ (recently used,         │ /api/issues at Apple-controlled       │
 *   │ system retains process) │ cadence — typically 15-30min          │
 *   │ Force-quit / cold       │ iOS won't wake us — NO notifications  │
 *   │                         │ until the user opens the app again.   │
 *   │                         │ True push (APNs) is required for      │
 *   │                         │ delivery in this state, which we do   │
 *   │                         │ not yet ship. The dashboard's          │
 *   │                         │ activity feed still records every     │
 *   │                         │ event server-side, so the user sees   │
 *   │                         │ them as soon as they re-open the app. │
 *   └─────────────────────────┴──────────────────────────────────────┘
 *
 * Why no APNs yet: integrating Apple Push Notification Service
 * requires a server-side push provider holding the APNs certificate,
 * per-device-token persistence, and routing logic to fan out activity-
 * feed events to subscribed devices. The infrastructure for that lives
 * outside the local-first scope of Heron today. When we add it,
 * this fetcher remains useful for low-bandwidth deltas + as a fallback
 * if the user has push notifications disabled.
 *
 * Critical post-mount fixes (caught during behavioural verification):
 *
 *   1. Bearer auth: /api/issues is auth-gated. The previous version sent
 *      no Authorization header → every background poll silently 401'd.
 *      We now read the token mirrored into App Group UserDefaults by
 *      the WebView (NativePlugin.setSharedBearerToken).
 *   2. App Group: backend URL + bearer token live in the App Group, not
 *      UserDefaults.standard. The previous resolveBackend() never found
 *      anything because it read the wrong domain.
 *   3. Branding: notification title fallback was lowercase "heron"
 *      instead of the brand display name.
 *   4. Quiet hours: respect the user's quiet-hours window (read from
 *      App Group too) so a 3am email-reactor event doesn't ring through.
 */
final class BackgroundFetcher {
    static let shared = BackgroundFetcher()

    func fetch(completion: @escaping (UIBackgroundFetchResult) -> Void) {
        guard let backend = resolveBackend() else {
            NSLog("[bg-fetch] no backend cached — skipping")
            completion(.noData)
            return
        }
        // App Group's `lastSeenIssue` key (not UserDefaults.standard).
        // Mirrors backend-discovery, bearerToken etc. — all per-install
        // state lives in the shared group so extension targets can read.
        let groupDefaults = UserDefaults(suiteName: Brand.appGroup) ?? UserDefaults.standard
        let lastSeen = groupDefaults.double(forKey: Brand.DefaultsKey.lastSeenIssue)
        var components = URLComponents(string: backend + "/api/issues")!
        components.queryItems = [URLQueryItem(name: "since", value: String(Int64(lastSeen * 1000)))]
        guard let url = components.url else {
            completion(.failed)
            return
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        // Bearer auth — without this the request 401s and the user
        // never gets a notification. Token mirrored from the WebView's
        // auth-client.ts customFetch on every set-auth-token capture.
        if let token = groupDefaults.string(forKey: Brand.DefaultsKey.bearerToken),
           !token.isEmpty
        {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            // No token = user signed out. Don't fire a fetch that would
            // 401 and trip an error event for nothing.
            NSLog("[bg-fetch] no bearer token cached — user signed out, skipping")
            completion(.noData)
            return
        }

        let task = URLSession.shared.dataTask(with: req) { data, response, error in
            if let error = error {
                ErrorReporter.shared.report(
                    message: "background fetch network error: \(error.localizedDescription)",
                    source: "BackgroundFetcher",
                    level: "warn"
                )
                completion(.failed); return
            }
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
            // Quiet-hours gate — read the same localStorage shape the JS
            // NotificationPreferences.svelte writes. Critical-level
            // events still go through; info/warn/success suppress.
            let inQuiet = self.isInQuietHours(groupDefaults: groupDefaults)
            for issue in issues {
                guard let createdAt = issue["createdAt"] as? Double else { continue }
                let createdSec = createdAt / 1000.0
                if createdSec <= lastSeen { continue }
                if createdSec > newest { newest = createdSec }
                let level = (issue["level"] as? String) ?? "info"
                if level == "error" || (level == "warn" && !inQuiet) {
                    self.scheduleNotification(issue)
                    surfaced += 1
                }
            }
            if newest > lastSeen {
                groupDefaults.set(newest, forKey: Brand.DefaultsKey.lastSeenIssue)
            }
            completion(surfaced > 0 ? .newData : .noData)
        }
        task.resume()
    }

    private func scheduleNotification(_ issue: [String: Any]) {
        let content = UNMutableNotificationContent()
        // Default to brand display name when the issue lacks an explicit
        // title — previously this was lowercase "heron", which read
        // as a build-system leak in the notification tray.
        content.title = (issue["title"] as? String) ?? Brand.displayName
        content.body = (issue["summary"] as? String) ?? ""
        content.sound = .default
        // Build the deep link from richer issue context when available.
        // Priority: explicit deepLink field → jobId → /inbox (always
        // routable since the issue is itself an Inbox row).
        var userInfo: [AnyHashable: Any] = [:]
        if let explicit = issue["deepLink"] as? String {
            userInfo["deepLink"] = explicit
        } else if let jobId = issue["jobId"] as? String {
            userInfo["deepLink"] = Brand.jobDeepLink(jobId)
        } else {
            userInfo["deepLink"] = Brand.deepLink("inbox")
        }
        content.userInfo = userInfo
        let id = (issue["id"] as? String) ?? UUID().uuidString
        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    /// Read the quiet-hours JSON the JS NotificationPreferences.svelte
    /// persisted into App Group UserDefaults via NativePlugin's
    /// setSharedQuietHours method. The JS side fires this on every
    /// preference change (see NotificationPreferences.svelte lines
    /// 74 + 92); this background fetcher reads the value at decision
    /// time so a recently-saved preference change takes effect on the
    /// next fetch cycle.
    ///
    /// Fails safe to "not in quiet hours" if the key is missing,
    /// malformed, or disabled — better to wake the user for a warn /
    /// error event than to silently swallow a notification because
    /// the JSON didn't parse.
    private func isInQuietHours(groupDefaults: UserDefaults) -> Bool {
        guard let raw = groupDefaults.string(forKey: "\(Brand.name):quiet-hours"),
              let data = raw.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let enabled = parsed["enabled"] as? Bool, enabled,
              let start = parsed["startHour"] as? Int,
              let end = parsed["endHour"] as? Int,
              start != end
        else {
            return false
        }
        let hour = Calendar.current.component(.hour, from: Date())
        if start < end {
            return hour >= start && hour < end
        }
        return hour >= start || hour < end
    }

    private func resolveBackend() -> String? {
        // Order mirrors lib/client/backend-discovery.ts. We can only
        // probe LAN + tailscale + production from native because the
        // WebView isn't running during background-fetch.
        //
        // Reads from App Group, not UserDefaults.standard — the WebView
        // mirrors the resolved URL there via NativePlugin.
        // setSharedBackendUrl. Pre-fix this method read .standard and
        // found nothing, so background fetch silently no-op'd forever.
        let defaults = UserDefaults(suiteName: Brand.appGroup) ?? UserDefaults.standard
        if let lan = defaults.string(forKey: Brand.DefaultsKey.lanUrl) { return lan }
        if let cached = defaults.string(forKey: Brand.DefaultsKey.backendResolvedUrl) { return cached }
        if let ts = defaults.string(forKey: Brand.DefaultsKey.tailscaleUrl) { return ts }
        if let prod = defaults.string(forKey: Brand.DefaultsKey.productionUrl) { return prod }
        return nil
    }
}
