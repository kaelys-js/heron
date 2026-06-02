import Capacitor
import Foundation
import WidgetKit

/**
 * NativePlugin — Capacitor JS↔Swift bridge for native-only
 * features the WebView can't reach.
 *
 * Exposed JS methods (called via Capacitor.Plugins.HeronNative.*):
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
@objc(NativePlugin)
public class NativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativePlugin"
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
        // Tailscale + production URL configuration. The user enters
        // these in /settings/backend on the dashboard; the JS side
        // persists them via these bridge methods into App Group
        // UserDefaults. backend-discovery.ts reads them back on cold
        // boot to populate `opts.tailscaleHost` + `opts.productionUrl`
        // — the previous build never wrote either, so cellular users
        // were stuck at "no backend found" even with Tailscale running.
        CAPPluginMethod(name: "setSharedTailscaleUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSharedProductionUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSharedTailscaleUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSharedProductionUrl", returnType: CAPPluginReturnPromise),
        // Quiet-hours mirror so BackgroundFetcher.swift can honour the
        // user's window when deciding whether to fire a 3am warn-level
        // notification. The WebView writes localStorage; this method
        // copies the JSON into App Group UserDefaults where the
        // background process can read it.
        CAPPluginMethod(name: "setSharedQuietHours", returnType: CAPPluginReturnPromise),
        // Full sign-out scrub. Single method to wipe every piece of
        // user-scoped App Group state in one bridge round-trip so the
        // JS sign-out flow can't accidentally forget one of the keys.
        // See clearAllSharedState() below.
        CAPPluginMethod(name: "clearAllSharedState", returnType: CAPPluginReturnPromise),
        // Bundle identity for the in-app About screen. The WebView's
        // __APP_VERSION__ literal is the SOURCE semver and can drift from the
        // shipped binary; only Info.plist's CFBundleShortVersionString /
        // CFBundleVersion are the trustworthy App Store build identity, and the
        // WebView can't read them without this bridge. See getBuildInfo() below.
        CAPPluginMethod(name: "getBuildInfo", returnType: CAPPluginReturnPromise),
    ]

    @objc public func getLanUrl(_ call: CAPPluginCall) {
        let url = UserDefaults.standard.string(forKey: Brand.DefaultsKey.lanUrl)
        call.resolve(["url": url as Any])
    }

    /// Return the running binary's Info.plist version identity for the About
    /// screen: CFBundleShortVersionString (marketing, e.g. "1.2.0") +
    /// CFBundleVersion (build number, e.g. "47"). Empty strings if absent so the
    /// JS side can fall back to its compile-time literal.
    @objc public func getBuildInfo(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary
        let shortVersion = info?["CFBundleShortVersionString"] as? String ?? ""
        let buildNumber = info?["CFBundleVersion"] as? String ?? ""
        call.resolve([
            "shortVersion": shortVersion,
            "buildNumber": buildNumber,
        ])
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
    static var pluginInstance: NativePlugin?
    override public func load() {
        NativePlugin.pluginInstance = self
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
     * Persist the user-configured Tailscale URL (e.g.
     * `http://imac.tail-xxxx.ts.net:5173`) into App Group UserDefaults.
     * Backend-discovery reads it back at boot via getSharedTailscaleUrl
     * and passes it as `opts.tailscaleHost` to `resolveBackend()`.
     *
     * Empty string clears the slot. No validation here — the JS side
     * has already URL-parsed the value. We store it verbatim so a user
     * who wants to point at a non-standard port or path can.
     */
    @objc public func setSharedTailscaleUrl(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.reject("app-group-missing", "App Group not configured: \(Brand.appGroup)")
            return
        }
        let url = call.getString("url") ?? ""
        if url.isEmpty {
            defaults.removeObject(forKey: Brand.DefaultsKey.tailscaleUrl)
        } else {
            defaults.set(url, forKey: Brand.DefaultsKey.tailscaleUrl)
        }
        call.resolve(["ok": true])
    }

    /**
     * Persist the user-configured production URL (a public deployment
     * the user has set up themselves, e.g. their own VPS). Last-resort
     * fallback after LAN + Tailscale fail.
     */
    @objc public func setSharedProductionUrl(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.reject("app-group-missing", "App Group not configured: \(Brand.appGroup)")
            return
        }
        let url = call.getString("url") ?? ""
        if url.isEmpty {
            defaults.removeObject(forKey: Brand.DefaultsKey.productionUrl)
        } else {
            defaults.set(url, forKey: Brand.DefaultsKey.productionUrl)
        }
        call.resolve(["ok": true])
    }

    /** Read the stored Tailscale URL. Returns empty string when unset. */
    @objc public func getSharedTailscaleUrl(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.resolve(["url": ""])
            return
        }
        let url = defaults.string(forKey: Brand.DefaultsKey.tailscaleUrl) ?? ""
        call.resolve(["url": url])
    }

    /** Read the stored production URL. Returns empty string when unset. */
    @objc public func getSharedProductionUrl(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.resolve(["url": ""])
            return
        }
        let url = defaults.string(forKey: Brand.DefaultsKey.productionUrl) ?? ""
        call.resolve(["url": url])
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

    /**
     * Full sign-out scrub of every user-scoped App Group key.
     *
     * Multi-tenant safety: when user A signs out and user B signs in on
     * the same device, NO piece of user A's data may leak through the
     * App Group container — that container is shared across the host app,
     * the Share Extension, the Watch, the Widgets, and the BackgroundFetcher,
     * none of which know about better-auth sessions. The only defence is
     * to wipe everything that's keyed to the previous user.
     *
     * What's cleared (user-specific):
     *   • bearerToken             — auth credential
     *   • <brand>:quiet-hours     — user A's notification schedule
     *   • lastSeenIssue           — user A's dismissed-issue cursor
     *   • Spotlight job index     — user A's company/role names visible in
     *                               iOS Spotlight search
     *
     * What's kept (machine-level, NOT user-specific):
     *   • lanUrl / backendResolvedUrl / tailscaleUrl / productionUrl
     *     — same backend serves the next user too; resolving them again
     *       would cost a Bonjour round-trip with zero security benefit.
     *
     * Widget data + auth gate are scrubbed separately by
     * NativePlugin.updateWidgets({authenticated: false}) — the layout
     * +effect already fires that on `heron:authed` flag drop. Splitting
     * the two paths means widgets can be re-gated without nuking the rest
     * of the App Group (and vice versa).
     */
    @objc public func clearAllSharedState(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Brand.appGroup) else {
            call.reject("app-group-missing", "App Group not configured: \(Brand.appGroup)")
            return
        }
        // User-scoped App Group keys.
        defaults.removeObject(forKey: Brand.DefaultsKey.bearerToken)
        defaults.removeObject(forKey: Brand.DefaultsKey.lastSeenIssue)
        defaults.removeObject(forKey: "\(Brand.name):quiet-hours")
        // Spotlight index — user A's job IDs / company / role names live
        // in the system search index. Clear them so user B's Spotlight
        // search doesn't surface user A's pipeline.
        SpotlightIndexer.shared.clear()
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
        // other paired devices ("Continue Heron from iPhone").
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
                "topApply:runnerUps",
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

        // stats — flat int keys (read by AppTimelineProvider).
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

        // F5 — topApplyRunnerUps (up to 2 candidates surfaced under the
        // top one in the systemLarge widget variant). Array of the same
        // TopApplyCandidate shape the widget already decodes.
        if let runnerUps = call.getArray("topApplyRunnerUps") {
            if let data = try? JSONSerialization.data(withJSONObject: runnerUps) {
                defaults.set(data, forKey: "topApply:runnerUps")
            }
        } else if call.options.keys.contains("topApplyRunnerUps") {
            defaults.removeObject(forKey: "topApply:runnerUps")
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
