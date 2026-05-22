//
// WidgetAuthGateTests -- WidgetAuth.isAuthenticated() reads the App Group
// UserDefaults written by NativePlugin.updateWidgets. We seed that suite
// directly and assert the gate flips under each documented branch.
//
@testable import AppWidget
import XCTest

final class WidgetAuthGateTests: XCTestCase {
    private let authKey = "auth:isAuthenticated"

    private var defaults: UserDefaults? {
        // Same suite WidgetAuth reads under the hood. Returns nil only if
        // the App Group identifier itself is malformed -- in CI sims the
        // suite is created on demand and lives in the bundle sandbox.
        UserDefaults(suiteName: Brand.appGroup)
    }

    override func setUp() {
        super.setUp()
        defaults?.removeObject(forKey: authKey)
    }

    override func tearDown() {
        defaults?.removeObject(forKey: authKey)
        super.tearDown()
    }

    func testIsAuthenticatedFalseByDefault() {
        // Fresh install -- key missing in the App Group. UserDefaults.bool
        // returns false for missing keys, which is the gate's safe default.
        XCTAssertFalse(WidgetAuth.isAuthenticated())
    }

    func testIsAuthenticatedTrueWhenFlagSet() throws {
        let d = try XCTUnwrap(defaults)
        d.set(true, forKey: authKey)
        XCTAssertTrue(WidgetAuth.isAuthenticated())
    }

    func testIsAuthenticatedFalseWhenFlagExplicitlyFalse() throws {
        let d = try XCTUnwrap(defaults)
        d.set(false, forKey: authKey)
        XCTAssertFalse(WidgetAuth.isAuthenticated())
    }

    func testIsAuthenticatedFlipsFromTrueToFalse() throws {
        let d = try XCTUnwrap(defaults)
        d.set(true, forKey: authKey)
        XCTAssertTrue(WidgetAuth.isAuthenticated())
        d.set(false, forKey: authKey)
        XCTAssertFalse(WidgetAuth.isAuthenticated())
    }

    func testIsAuthenticatedFlipsFromFalseToTrue() throws {
        let d = try XCTUnwrap(defaults)
        d.set(false, forKey: authKey)
        XCTAssertFalse(WidgetAuth.isAuthenticated())
        d.set(true, forKey: authKey)
        XCTAssertTrue(WidgetAuth.isAuthenticated())
    }

    func testRepeatedReadsAreStable() throws {
        let d = try XCTUnwrap(defaults)
        d.set(true, forKey: authKey)
        // Five reads in a row -- no internal caching that would let one
        // stale read mask a subsequent flip.
        for _ in 0 ..< 5 {
            XCTAssertTrue(WidgetAuth.isAuthenticated())
        }
    }

    func testNegativeStringCoercesToFalse() throws {
        let d = try XCTUnwrap(defaults)
        // UserDefaults.bool(forKey:) coerces NSString via -boolValue:
        // strings starting with N/n/F/f/0 read as false. Confirms the
        // gate stays safe if some future bug writes "no" into the slot.
        d.set("no", forKey: authKey)
        XCTAssertFalse(WidgetAuth.isAuthenticated())
    }

    func testIntegerOneCoercesToTrue() throws {
        let d = try XCTUnwrap(defaults)
        // UserDefaults coerces integer 1 -> true. Documents the platform
        // behaviour so a future change doesn't surprise the team.
        d.set(1, forKey: authKey)
        XCTAssertTrue(WidgetAuth.isAuthenticated())
    }

    func testIntegerZeroCoercesToFalse() throws {
        let d = try XCTUnwrap(defaults)
        d.set(0, forKey: authKey)
        XCTAssertFalse(WidgetAuth.isAuthenticated())
    }

    func testRemovingFlagFallsBackToFalse() throws {
        let d = try XCTUnwrap(defaults)
        d.set(true, forKey: authKey)
        XCTAssertTrue(WidgetAuth.isAuthenticated())
        d.removeObject(forKey: authKey)
        XCTAssertFalse(WidgetAuth.isAuthenticated())
    }

    func testAppGroupConstantIsNonEmpty() {
        // The gate's fail-safe branch fires only when the suite name is
        // malformed -- guard the brand-applied constant stays well-formed.
        XCTAssertFalse(Brand.appGroup.isEmpty)
        XCTAssertTrue(Brand.appGroup.hasPrefix("group."))
    }

    func testAuthKeyIsStableString() {
        // The plugin on the iPhone writes via a hardcoded string ("auth:isAuthenticated").
        // Lock that string in case anyone renames the constant under the gate.
        XCTAssertEqual(authKey, "auth:isAuthenticated")
    }
}
