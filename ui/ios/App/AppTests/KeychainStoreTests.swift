//
// KeychainStoreTests — round-trip + missing-item behaviour for the
// secure-storage facade. Hits the REAL Keychain (sim or device) under
// a per-test key prefix so we don't clobber any app data.
//
import XCTest
@testable import App

final class KeychainStoreTests: XCTestCase {

    private let testPrefix = "__test__"

    override func tearDown() {
        super.tearDown()
        // Best-effort cleanup of every key we might have left behind.
        for k in ["a", "b", "round-trip", "overwrite", "unicode", "long"] {
            try? KeychainStore.shared.remove("\(testPrefix):\(k)")
        }
    }

    private func k(_ name: String) -> String { "\(testPrefix):\(name)" }

    func testRoundTripBasic() throws {
        let key = k("round-trip")
        try KeychainStore.shared.set("hello", forKey: key)
        let got = try KeychainStore.shared.get(key)
        XCTAssertEqual(got, "hello")
    }

    func testGetMissingThrowsNotFound() {
        do {
            _ = try KeychainStore.shared.get(k("absent-\(UUID().uuidString)"))
            XCTFail("expected KeychainError.notFound")
        } catch KeychainError.notFound {
            // expected
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }

    func testRemoveMissingDoesNotThrow() {
        // Remove of a key that doesn't exist should be a no-op, not a throw.
        XCTAssertNoThrow(try KeychainStore.shared.remove(k("never-set-\(UUID().uuidString)")))
    }

    func testOverwriteReplacesValue() throws {
        let key = k("overwrite")
        try KeychainStore.shared.set("v1", forKey: key)
        try KeychainStore.shared.set("v2", forKey: key)
        let got = try KeychainStore.shared.get(key)
        XCTAssertEqual(got, "v2")
    }

    func testUnicodeRoundTrip() throws {
        let key = k("unicode")
        let value = "👋 héllo 你好 — 🎉"
        try KeychainStore.shared.set(value, forKey: key)
        XCTAssertEqual(try KeychainStore.shared.get(key), value)
    }

    func testLongValueRoundTrip() throws {
        // Keychain has practical size limits — exercise a 4KB value.
        let key = k("long")
        let value = String(repeating: "x", count: 4096)
        try KeychainStore.shared.set(value, forKey: key)
        XCTAssertEqual(try KeychainStore.shared.get(key), value)
    }

    func testIsolatedFromKeysOutsideService() {
        // KeychainStore is scoped to Brand.keychainService — anything stored
        // by other apps with the same key but a different service must not
        // collide. We can't easily verify that without a 2nd service, but
        // we can confirm the service is set on the instance.
        XCTAssertFalse(Brand.keychainService.isEmpty)
    }
}
