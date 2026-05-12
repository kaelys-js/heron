import Foundation
import Capacitor

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
    ]

    @objc public func getLanUrl(_ call: CAPPluginCall) {
        let url = UserDefaults.standard.string(forKey: "career-ops:lan-url")
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

    @objc public func setUserActivity(_ call: CAPPluginCall) {
        let type = call.getString("type") ?? "com.resistjs.careerops.openJob"
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
}
