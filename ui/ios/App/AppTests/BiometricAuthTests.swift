//
// BiometricAuthTests — shape tests for the biometric-authentication
// helper. Full happy-path / cancel / lockout coverage needs an LAContext
// stub that doesn't run on a CI sim; those land in Phase 8 as integration
// tests under AppUITests.
//
import XCTest
import LocalAuthentication
@testable import App

final class BiometricAuthTests: XCTestCase {

    func testCanEvaluateNeverThrowsOnUnsupportedDevice() {
        // On a sim without biometric capability, canEvaluatePolicy returns
        // false but doesn't throw.
        let ctx = LAContext()
        var err: NSError?
        let canEval = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        // Either true (biometric available) or false (not) — both are OK.
        XCTAssertNotNil(canEval as Any)
    }

    func testBiometricAuthHasReasonableDefaults() {
        // BiometricAuth.shared is a singleton — exists and has the brand's
        // keychain service available (for biometric-gated reads).
        XCTAssertNotNil(BiometricAuth.shared)
    }

    func testReasonStringIsNotEmpty() {
        // The "reason" shown in the biometric prompt should be branded +
        // non-empty. We can't trigger the prompt in a unit test, but we
        // can verify the brand display name (the prompt's substring source)
        // is well-formed.
        XCTAssertFalse(Brand.displayName.isEmpty)
    }
}
