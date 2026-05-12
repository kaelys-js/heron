import Foundation
import LocalAuthentication

/**
 * BiometricAuth — Face ID / Touch ID gating for sensitive screens.
 *
 * The WebView calls this via a Capacitor plugin (added below) when the
 * user lands on a gated page (negotiation, comp insights, settings).
 *
 * Behavior:
 *   • requestAuth(reason): try Face ID, fall back to passcode if it's
 *     enrolled but Face ID is denied/unavailable.
 *   • isAvailable(): true iff the device can use any LAPolicy. Used by
 *     the JS side to hide the "Enable Face ID gate" toggle on iPads
 *     without biometrics.
 */
enum BiometricResult {
    case success
    case userCanceled
    case unavailable(String)
    case failed(String)
}

final class BiometricAuth {
    static let shared = BiometricAuth()

    func isAvailable() -> Bool {
        let ctx = LAContext()
        var err: NSError?
        return ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
    }

    func requestAuth(reason: String, completion: @escaping (BiometricResult) -> Void) {
        let ctx = LAContext()
        var error: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            completion(.unavailable(error?.localizedDescription ?? "Biometrics not available"))
            return
        }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, err in
            DispatchQueue.main.async {
                if ok {
                    completion(.success)
                } else if let nsErr = err as NSError? {
                    if nsErr.code == LAError.userCancel.rawValue || nsErr.code == LAError.appCancel.rawValue {
                        completion(.userCanceled)
                    } else {
                        completion(.failed(nsErr.localizedDescription))
                    }
                } else {
                    completion(.failed("Unknown error"))
                }
            }
        }
    }
}
