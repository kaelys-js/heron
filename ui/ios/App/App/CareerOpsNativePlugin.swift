import Capacitor
import Foundation
import WidgetKit

/**
 * CareerOpsNativePlugin — Capacitor JS↔Swift bridge for native-only
 * features the WebView can't reach.
 *
 * Exposed JS methods (called via Capacitor.Plugins.CareerOpsNative.*):
 *
 *   • getLanUrl()                         → resolved Bonjour URL or null
 *   • biometricAvailable()                → bool
 *   • biometricAuth({reason})             → ok/error
 *   • keychainSet({key, value})           → ok
 *   • keychainGet({key})                  → {value} or null
 *   • keychainRemove({key})               → ok
 *   • indexJobs({jobs})                   → ok (writes to Spotlight)
 *   • clearJobIndex()                     → ok
 *   • setUserActivity({type, title, data}) → ok (Handoff + Spotlight signal)
 *
 * Registered in CapApp-SPM/Package.swift (or via Xcode targets if not
 * using SPM). Capacitor auto-discovers it via the @objc(...) name.
 */
@objc(CareerOpsNativePlugin)
public class CareerOpsNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CareerOpsNativePlugin"
    // jsName MUST match the TypeScript registerPlugin('...') call in
    // ui/src/lib/client/native-bridge.ts. Both sides read this string
    // from branding/brand.json::identifiers.capacitorPluginName via
    // apply-brand so a rebrand retargets the bridge contract.
    public let jsName = Brand.capacitorPluginName
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLanUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometricAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometricAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keychainSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keychainGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keychainRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "indexJobs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearJobIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setUserActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainNativeErrors", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateWidgets", returnType: CAPPluginReturnPromise),
        // Bearer-token mirror for the Share Extension. The extension runs
        // in its own sandboxed process and CANNOT read Capacitor
        // Preferences (different security scope) — we stash the latest
        // token in App Group UserDefaults via this method so the
        // ShareViewController can attach Authorization headers when it
        // POSTs shared URLs.
        CAPPluginMethod(name: "setSharedBearerToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSharedBearerToken", returnType: CAPPluginReturnPromise),
        // Backend-URL mirror — the extension needs to know where to POST.
        // The WebView already calls resolveBackend() on cold boot; this
        // lets the JS side push the resolved URL into the App Group so
        // the extension reads the same value.
        CAPPluginMethod(name: "setSharedBackendUrl", returnType: CAPPluginReturnPromise),
        // Quiet-hours mirror so BackgroundFetcher.swift can honour the
        // user's window when deciding whether to fire a 3am warn-level
        // notification. The WebView writes localStorage; this method
        // copies the JSON into App Group UserDefaults where the
        // background process can read it.
        CAPPluginMethod(name: "setSharedQuietHours", returnType: CAPPluginReturnPromise),
    ]

    @objc public func getLanUrl(_ call: CAPPluginCall) {
        let url = UserDefaults.standard.string(forKey: Brand.DefaultsKey.lanUrl)
        call.resolve(["url": url as Any])
    }

    @objc public func biometricAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": BiometricAuth.shared.isAvailable()])
    }

    @objc public func biometricAuth(_ call: CAPPluginCall) {
        // The reason string is what iOS shows beneath the Face ID /
        // Touch ID prompt ("App wants to use Face ID to ..."). Falling
        // back to the brand display name keeps the prompt readable
        // instead of leaking the lowercase technical name.
        let reason = call.getString("reason") ?? "Unlock \(Brand.displayName)"
        BiometricAuth.shared.requestAuth(reason: reason) { result in
            switch result {
            case .success: call.resolve(["ok": true])
            case .userCanceled: call.resolve(["ok": false, "reason": "canceled"])
            case let .unavailable(msg): call.reject("biometric-unavailable", msg)
            case let .failed(msg): call.reject("biometric-failed", msg)
            }
        }
    }

    @objc public func keychainSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("missing-arg", "key and value required")
            return
        }
        do {
            try KeychainStore.shared.set(value, forKey: key)
            call.resolve(["ok": true])
        } catch {
            call.reject("keychain-write-failed", "\(error)")
        }
    }

    @objc public func keychainGet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("missing-arg", "key required")
            return
        }
        do {
            let value = try KeychainStore.shared.get(key)
            call.resolve(["value": value])
        } catch KeychainError.notFound {
            call.resolve(["value": NSNull()])
        } catch {
            call.reject("keychain-read-failed", "\(error)")
        }
    }

    @objc public func keychainRemove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("missing-arg", "key required")
            return
        }
        do {
            try KeychainStore.shared.remove(key)
            call.resolve(["ok": true])
        } catch {
            call.reject("keychain-remove-failed", "\(error)")
        }
    }

    @objc public func indexJobs(_ call: CAPPluginCall) {
        guard let jobsArr = call.getArray("jobs", JSObject.self) else {
            call.reject("missing-arg", "jobs[] required")
            return
        }
        let parsed: [JobIndexEntry] = jobsArr.compactMap { dict in
            guard let id = dict["id"] as? String,
                  let company = dict["company"] as? String,
                  let role = dict["role"] as? String else { return nil }
            let score = dict["score"] as? Double
            let status = dict["status"] as? String
            return JobIndexEntry(id: id, company: company, role: role, score: score, status: status)
        }
        SpotlightIndexer.shared.reindex(jobs: parsed)
        call.resolve(["ok": true, "indexed": parsed.count])
    }

    @objc public func clearJobIndex(_ call: CAPPluginCall) {
        SpotlightIndexer.shared.clear()
        call.resolve(["ok": true])
    }

    /// Static notifier — AppDelegate calls this when NetworkMonitor sees a
    /// path-state change. We push the bool down to the WebView via the
    /// plugin's notifyListeners mechanism. online-status.ts in JS converts
    /// this to a `<brand>:net-status` window event.
    static var pluginInstance: CareerOpsNativePlugin?
    override public func load() {
        CareerOpsNativePlugin.pluginInstance = self
    }

    static func notifyNetStatus(online: Bool) {
        pluginInstance?.notifyListeners("netStatusChanged", data: ["online": online])
    }

    /**
     * Mirror the current bearer token into App Group UserDefaults so the
     * Share Extension can attach `Authorization: Bearer <token>` to its
     * POSTs. The extension is its own process — it can't read Capacitor
     * Preferences directly, but App Group defaults are visible to both
     * the host app + every extension target sharing the group.
     *
     * Called from JS on every set-auth-token capture (auth-client.ts'
     * customFetch). Idempotent — overwriting with the same value is
     * cheap. Pass an empty string or null to clear.
     */
    @objc public func setSharedBearerToken(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.reject("app-group-missing", "App Group not configured: \(Brand.appGroup)")
            return
        }
        let token = call.getString("token") ?? ""
        if token.isEmpty {
            defaults.removeObject(forKey: Brand.DefaultsKey.bearerToken)
        } else {
            defaults.set(token, forKey: Brand.DefaultsKey.bearerToken)
        }
        call.resolve(["ok": true])
    }

    /**
     * Clear the shared bearer token — explicit sign-out path. Splitting
     * this from setSharedBearerToken("") lets the JS side call it on the
     * sign-out flow without having to construct an empty-string payload,
     * and gives the operator a clearer audit-log line.
     */
    @objc public func clearSharedBearerToken(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.reject("app-group-missing", "App Group not configured: \(Brand.appGroup)")
            return
        }
        defaults.removeObject(forKey: Brand.DefaultsKey.bearerToken)
        call.resolve(["ok": true])
    }

    /**
     * Mirror the resolved backend URL into App Group UserDefaults so the
     * Share Extension knows where to POST. The WebView's backend-discovery
     * already resolves this on cold boot; the JS side calls this once the
     * resolution succeeds.
     *
     * Stored under `Brand.DefaultsKey.backendResolvedUrl` which is the
     * same key the Share Extension already reads. Idempotent.
     */
    @objc public func setSharedBackendUrl(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.reject("app-group-missing", "App Group not configured: \(Brand.appGroup)")
            return
        }
        let url = call.getString("url") ?? ""
        if url.isEmpty {
            defaults.removeObject(forKey: Brand.DefaultsKey.backendResolvedUrl)
        } else {
            defaults.set(url, forKey: Brand.DefaultsKey.backendResolvedUrl)
        }
        call.resolve(["ok": true])
    }

    /**
     * Quiet-hours preference mirror. The JS NotificationPreferences
     * component persists a `{enabled, startHour, endHour}` JSON blob to
     * localStorage; we copy it (verbatim) into App Group UserDefaults
     * so BackgroundFetcher.swift can decode the same shape and apply
     * the same window logic when deciding whether to deliver a warn-
     * level notification at 3am.
     *
     * Key namespaced by brand name so a rename moves the data cleanly.
     */
    @objc public func setSharedQuietHours(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.reject("app-group-missing", "App Group not configured: \(Brand.appGroup)")
            return
        }
        let json = call.getString("json") ?? ""
        let key = "\(Brand.name):quiet-hours"
        if json.isEmpty {
            defaults.removeObject(forKey: key)
        } else {
            defaults.set(json, forKey: key)
        }
        call.resolve(["ok": true])
    }

    @objc public func drainNativeErrors(_ call: CAPPluginCall) {
        // Read + clear the queue of native errors captured while the
        // WebView wasn't able to forward them.
        let errors = ErrorReporter.shared.drain()
        call.resolve(["errors": errors])
    }

    @objc public func setUserActivity(_ call: CAPPluginCall) {
        let type = call.getString("type") ?? Brand.openJobActivityType
        // NSUserActivity.title shows up in Handoff banners on macOS and
        // other paired devices ("Continue Career Ops from iPhone").
        // Brand display name beats the lowercase technical name.
        let title = call.getString("title") ?? Brand.displayName
        let data = call.getObject("data") ?? JSObject()
        // NSUserActivity must be set on the main thread.
        DispatchQueue.main.async {
            let activity = NSUserActivity(activityType: type)
            activity.title = title
            activity.userInfo = data as [AnyHashable: Any]
            activity.isEligibleForSearch = true
            activity.isEligibleForHandoff = true
            activity.isEligibleForPublicIndexing = false
            activity.becomeCurrent()
        }
        call.resolve(["ok": true])
    }

    /**
     * Push fresh widget data into the App Group UserDefaults and kick
     * WidgetCenter to reload the timelines. Called whenever the
     * dashboard updates stats / next interview / top apply / inbox.
     *
     * Body shape (every key optional — only the present keys are written):
     *   stats: { queued, appliedToday, upcomingInterviews }
     *   nextInterview: { jobId, company, role, stage, scheduledAt (ISO), interviewers[] } | null
     *   topApply: { jobId, company, role, score, compBand, location, portal } | null
     *   openIssues: [{ id, severity, source, summary, ts }]
     */
    @objc public func updateWidgets(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.reject("app-group-missing", "App Group not configured: \(Brand.appGroup)")
            return
        }

        // Auth gate — JS clients pass `authenticated: bool` so the Watch
        // app + iPhone widgets know whether to display data or show a
        // sign-in prompt. Default TRUE because the legacy callers (pre-
        // gate) only call this method when an authenticated route has
        // data ready; explicit `false` from sign-out clears everything.
        let authenticated = call.getBool("authenticated") ?? true
        defaults.set(authenticated, forKey: "auth:isAuthenticated")
        if !authenticated {
            // Sign-out path: scrub every cached widget/Watch key so a
            // screenshot of the Watch or a Smart Stack peek never leaks
            // the previous user's queue / interview info.
            for key in [
                "stats:queued",
                "stats:appliedToday",
                "stats:upcomingInterviews",
                "interview:next",
                "topApply:next",
                "issues:open",
            ] {
                defaults.removeObject(forKey: key)
            }
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            // Push the cleared state to the Watch so its UI flips to
            // the sign-in gate immediately.
            WatchSessionBridge.shared.send(["authenticated": false])
            call.resolve(["ok": true])
            return
        }

        // stats — flat int keys (read by CareerOpsTimelineProvider).
        if let stats = call.getObject("stats") {
            if let queued = stats["queued"] as? Int {
                defaults.set(queued, forKey: "stats:queued")
            }
            if let applied = stats["appliedToday"] as? Int {
                defaults.set(applied, forKey: "stats:appliedToday")
            }
            if let interviews = stats["upcomingInterviews"] as? Int {
                defaults.set(interviews, forKey: "stats:upcomingInterviews")
            }
        }

        // nextInterview — JSON blob the widget decodes.
        if let nextInterview = call.getObject("nextInterview") {
            if let data = try? JSONSerialization.data(withJSONObject: nextInterview) {
                defaults.set(data, forKey: "interview:next")
            }
        } else if call.options.keys.contains("nextInterview") {
            // Explicit null clears the slot.
            defaults.removeObject(forKey: "interview:next")
        }

        // topApply
        if let topApply = call.getObject("topApply") {
            if let data = try? JSONSerialization.data(withJSONObject: topApply) {
                defaults.set(data, forKey: "topApply:next")
            }
        } else if call.options.keys.contains("topApply") {
            defaults.removeObject(forKey: "topApply:next")
        }

        // openIssues — array of issue snapshots
        if let openIssues = call.getArray("openIssues") {
            if let data = try? JSONSerialization.data(withJSONObject: openIssues) {
                defaults.set(data, forKey: "issues:open")
            }
        } else if call.options.keys.contains("openIssues") {
            defaults.removeObject(forKey: "issues:open")
        }

        // Tell WidgetKit to reload every timeline. The widgets will
        // re-render with the new defaults at the OS's next refresh tick.
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        // Push the same payload to the paired Apple Watch (if any). The
        // bridge is a no-op on iPad-without-paired-watch installs.
        // `call.options` is `[AnyHashable: Any]` (Capacitor's JSObject
        // dictionary); WatchSessionBridge expects `[String: Any]`. Cast
        // through Dictionary's `compactMapKeys`-style filter rather than
        // a force-cast so any non-String keys are dropped silently.
        let payload = Dictionary(uniqueKeysWithValues:
            call.options.compactMap { key, value -> (String, Any)? in
                guard let keyStr = key as? String else { return nil }
                return (keyStr, value)
            })
        WatchSessionBridge.shared.send(payload)

        call.resolve(["ok": true])
    }
}
