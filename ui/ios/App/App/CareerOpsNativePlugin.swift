import Foundation
import Capacitor
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
    public let jsName = "CareerOpsNative"
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
    ]

    @objc public func getLanUrl(_ call: CAPPluginCall) {
        let url = UserDefaults.standard.string(forKey: Brand.DefaultsKey.lanUrl)
        call.resolve(["url": url as Any])
    }

    @objc public func biometricAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": BiometricAuth.shared.isAvailable()])
    }

    @objc public func biometricAuth(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Unlock career-ops"
        BiometricAuth.shared.requestAuth(reason: reason) { result in
            switch result {
            case .success: call.resolve(["ok": true])
            case .userCanceled: call.resolve(["ok": false, "reason": "canceled"])
            case .unavailable(let m): call.reject("biometric-unavailable", m)
            case .failed(let m): call.reject("biometric-failed", m)
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
    public override func load() {
        CareerOpsNativePlugin.pluginInstance = self
    }
    static func notifyNetStatus(online: Bool) {
        pluginInstance?.notifyListeners("netStatusChanged", data: ["online": online])
    }

    @objc public func drainNativeErrors(_ call: CAPPluginCall) {
        // Read + clear the queue of native errors captured while the
        // WebView wasn't able to forward them.
        let errors = ErrorReporter.shared.drain()
        call.resolve(["errors": errors])
    }

    @objc public func setUserActivity(_ call: CAPPluginCall) {
        let type = call.getString("type") ?? Brand.openJobActivityType
        let title = call.getString("title") ?? "career-ops"
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
        WatchSessionBridge.shared.send(call.options)

        call.resolve(["ok": true])
    }
}
