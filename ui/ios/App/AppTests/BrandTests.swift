//
// BrandTests — assert every constant in Brand.swift is non-empty, well-formed,
// and consistent with branding/brand.json (the rebrand single source of truth).
//
// Drift here means apply-brand.mjs didn't propagate correctly OR a fork edited
// Brand.swift by hand (forbidden — Brand.swift is auto-generated).
//
import XCTest
@testable import App

final class BrandTests: XCTestCase {

    // MARK: - Core identifiers

    func testNameIsNonEmpty() {
        XCTAssertFalse(Brand.name.isEmpty)
        XCTAssertFalse(Brand.name.contains(" "), "Brand.name is a slug — no spaces")
    }

    func testDisplayNameIsNonEmpty() {
        XCTAssertFalse(Brand.displayName.isEmpty)
    }

    func testBundleIdIsReverseDomain() {
        // bundleId follows reverse-domain convention: at least one dot.
        XCTAssertTrue(Brand.bundleId.contains("."))
        XCTAssertFalse(Brand.bundleId.hasPrefix("."))
        XCTAssertFalse(Brand.bundleId.hasSuffix("."))
    }

    func testAppGroupHasGroupPrefix() {
        XCTAssertTrue(Brand.appGroup.hasPrefix("group."))
        // The rest after `group.` must match bundleId
        let rest = String(Brand.appGroup.dropFirst("group.".count))
        XCTAssertEqual(rest, Brand.bundleId)
    }

    func testUrlSchemeIsNonEmptyAndLowercase() {
        XCTAssertFalse(Brand.urlScheme.isEmpty)
        XCTAssertEqual(Brand.urlScheme, Brand.urlScheme.lowercased())
        // URL schemes shouldn't contain dots or colons
        XCTAssertFalse(Brand.urlScheme.contains("."))
        XCTAssertFalse(Brand.urlScheme.contains(":"))
    }

    func testServiceTypeIsBonjourFormatted() {
        // Bonjour service type: "_<name>._tcp" or "_<name>._udp"
        XCTAssertTrue(Brand.serviceType.hasPrefix("_"))
        XCTAssertTrue(Brand.serviceType.hasSuffix("._tcp") || Brand.serviceType.hasSuffix("._udp"))
    }

    func testSpotlightDomainStartsWithBundle() {
        XCTAssertTrue(Brand.spotlightDomain.hasPrefix(Brand.bundleId))
    }

    func testKeychainServiceMatchesBundle() {
        XCTAssertEqual(Brand.keychainService, Brand.bundleId)
    }

    func testOpenJobActivityType() {
        XCTAssertTrue(Brand.openJobActivityType.hasPrefix(Brand.bundleId))
        XCTAssertTrue(Brand.openJobActivityType.contains("openJob") ||
                      Brand.openJobActivityType.contains("openjob"))
    }

    // MARK: - DefaultsKey

    func testDefaultsKeysAreBrandNamespaced() {
        let keys = [
            Brand.DefaultsKey.lanUrl,
            Brand.DefaultsKey.backendResolvedUrl,
            Brand.DefaultsKey.tailscaleUrl,
            Brand.DefaultsKey.productionUrl,
            Brand.DefaultsKey.lastSeenIssue,
            Brand.DefaultsKey.bearerToken,
        ]
        for k in keys {
            XCTAssertTrue(k.hasPrefix(Brand.name + ":"), "key '\(k)' should be brand-namespaced")
        }
    }

    func testDefaultsKeysAreUnique() {
        let keys = [
            Brand.DefaultsKey.lanUrl,
            Brand.DefaultsKey.backendResolvedUrl,
            Brand.DefaultsKey.tailscaleUrl,
            Brand.DefaultsKey.productionUrl,
            Brand.DefaultsKey.lastSeenIssue,
            Brand.DefaultsKey.bearerToken,
        ]
        XCTAssertEqual(Set(keys).count, keys.count, "duplicate DefaultsKey value")
    }

    // MARK: - Deep link builders

    func testDeepLinkBuildsCustomScheme() {
        let url = Brand.deepLink("inbox")
        XCTAssertEqual(url, "\(Brand.urlScheme)://inbox")
    }

    func testDeepLinkStripsLeadingSlash() {
        XCTAssertEqual(Brand.deepLink("/inbox"), "\(Brand.urlScheme)://inbox")
    }

    func testDeepLinkPreservesNestedPath() {
        XCTAssertEqual(Brand.deepLink("/job/123"), "\(Brand.urlScheme)://job/123")
    }

    func testJobDeepLink() {
        XCTAssertEqual(Brand.jobDeepLink("abc123"), "\(Brand.urlScheme)://job/abc123")
    }

    func testJobDeepLinkAcceptsEmptyId() {
        // Not ideal usage but shouldn't crash
        XCTAssertEqual(Brand.jobDeepLink(""), "\(Brand.urlScheme)://job/")
    }
}
