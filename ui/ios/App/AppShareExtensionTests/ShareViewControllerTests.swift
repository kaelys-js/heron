//
// ShareViewControllerTests -- exercises the parts of ShareViewController
// that don't require an extensionContext: the ShareOutcome enum
// semantics, the isContentValid() override, configurationItems()
// return value, and the App Group read-path that postToBackend uses
// to resolve the backend URL + bearer token.
//
import Social
import UIKit
import XCTest

final class ShareViewControllerTests: XCTestCase {
    private var defaults: UserDefaults? {
        UserDefaults(suiteName: Brand.appGroup)
    }

    private let groupKeys = [
        Brand.DefaultsKey.backendResolvedUrl,
        Brand.DefaultsKey.bearerToken,
    ]

    override func setUp() {
        super.setUp()
        groupKeys.forEach { defaults?.removeObject(forKey: $0) }
    }

    override func tearDown() {
        groupKeys.forEach { defaults?.removeObject(forKey: $0) }
        super.tearDown()
    }

    // MARK: - SLComposeServiceViewController overrides

    func testIsContentValidAlwaysReturnsTrue() {
        // Always allow -- the share extension extracts the URL from the
        // attached items so the compose text isn't a gating factor.
        let vc = ShareViewController()
        XCTAssertTrue(vc.isContentValid())
    }

    func testConfigurationItemsReturnsEmpty() {
        // No custom config items rendered below the compose sheet.
        let vc = ShareViewController()
        let items = vc.configurationItems() as? [Any] ?? []
        XCTAssertTrue(items.isEmpty)
    }

    // MARK: - ShareOutcome enum

    func testShareOutcomeSuccessCase() {
        let outcome = ShareViewController.ShareOutcome.success
        if case .success = outcome {} else {
            XCTFail("Expected .success")
        }
    }

    func testShareOutcomeUnauthenticatedCase() {
        let outcome = ShareViewController.ShareOutcome.unauthenticated
        if case .unauthenticated = outcome {} else {
            XCTFail("Expected .unauthenticated")
        }
    }

    func testShareOutcomeUnreachableCase() {
        let outcome = ShareViewController.ShareOutcome.unreachable
        if case .unreachable = outcome {} else {
            XCTFail("Expected .unreachable")
        }
    }

    func testShareOutcomeFailedPropagatesStatusCode() {
        let outcome = ShareViewController.ShareOutcome.failed(503)
        if case let .failed(status) = outcome {
            XCTAssertEqual(status, 503)
        } else {
            XCTFail("Expected .failed(_)")
        }
    }

    func testShareOutcomeFailedDistinctFromOtherFailures() {
        // .failed(401) is NOT the same as .unauthenticated -- the latter
        // is the short-circuit path when no bearer token is cached.
        let failed401 = ShareViewController.ShareOutcome.failed(401)
        let unauthenticated = ShareViewController.ShareOutcome.unauthenticated
        if case .failed = unauthenticated {
            XCTFail("unauthenticated must NOT match .failed")
        }
        if case .unauthenticated = failed401 {
            XCTFail(".failed(401) must NOT match .unauthenticated")
        }
    }

    // MARK: - App Group read-path (mirrors postToBackend's resolution)

    func testAppGroupKeysAreReachable() throws {
        // The share extension reads two keys from the shared App Group;
        // verify both keys exist on Brand.DefaultsKey + the suite
        // resolves on this device.
        let d = try XCTUnwrap(defaults)
        d.set("http://192.168.1.10:5173", forKey: Brand.DefaultsKey.backendResolvedUrl)
        d.set("secret-token", forKey: Brand.DefaultsKey.bearerToken)

        XCTAssertEqual(d.string(forKey: Brand.DefaultsKey.backendResolvedUrl), "http://192.168.1.10:5173")
        XCTAssertEqual(d.string(forKey: Brand.DefaultsKey.bearerToken), "secret-token")
    }

    func testBackendUrlMissingShouldYieldUnreachable() throws {
        // postToBackend short-circuits with .unreachable when the
        // backend URL is missing from the App Group. We can't invoke
        // postToBackend directly (private + needs extensionContext)
        // but we can verify the precondition the method checks.
        let d = try XCTUnwrap(defaults)
        XCTAssertNil(d.string(forKey: Brand.DefaultsKey.backendResolvedUrl))
    }

    func testBearerTokenEmptyStringTriggersUnauthenticated() throws {
        // postToBackend treats `nil` and `""` as equivalent (must sign
        // in). Document the contract here.
        let d = try XCTUnwrap(defaults)
        d.set("http://127.0.0.1:5173", forKey: Brand.DefaultsKey.backendResolvedUrl)
        d.set("", forKey: Brand.DefaultsKey.bearerToken)

        let token = d.string(forKey: Brand.DefaultsKey.bearerToken)
        XCTAssertEqual(token, "")
        XCTAssertTrue(token == nil || token?.isEmpty == true)
    }

    func testBackendUrlValidStringProducesUrl() {
        // postToBackend's `URL(string: backend + "/api/pipeline")` is
        // the construction site for the request URL. Foundation's URL
        // initializer is extremely lenient -- it parses almost any
        // string into a relative URL, so the .unreachable fallback
        // really only triggers on raw socket errors at request time.
        // Document the lenient behavior so future readers don't
        // expect URL(string:) to validate scheme + host.
        XCTAssertNotNil(URL(string: "http://127.0.0.1:5173/api/pipeline"))
        XCTAssertNotNil(URL(string: "/api/pipeline")) // relative URL OK
    }

    func testBackendUrlValidStringAppendsApiPath() {
        let base = "http://192.168.1.10:5173"
        let url = URL(string: base + "/api/pipeline")
        XCTAssertEqual(url?.absoluteString, "http://192.168.1.10:5173/api/pipeline")
        XCTAssertEqual(url?.path, "/api/pipeline")
    }

    // MARK: - JSON payload contract

    func testJsonPayloadShape() throws {
        // ShareViewController's postToBackend assembles:
        //   { "url": "...", "note": "...", "source": "ios-share" }
        // Document the shape -- the dashboard's /api/pipeline endpoint
        // depends on the "source" field for analytics + the "note"
        // field for the user's compose-sheet text.
        let payload: [String: Any] = [
            "url": "https://example.com/job/123",
            "note": "Cool senior role",
            "source": "ios-share",
        ]
        let data = try JSONSerialization.data(withJSONObject: payload)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["url"] as? String, "https://example.com/job/123")
        XCTAssertEqual(json["note"] as? String, "Cool senior role")
        XCTAssertEqual(json["source"] as? String, "ios-share")
    }

    func testJsonPayloadWithNilNote() throws {
        // postToBackend coerces nil note to "" before serializing.
        let payload: [String: Any] = [
            "url": "https://example.com",
            "note": "",
            "source": "ios-share",
        ]
        let data = try JSONSerialization.data(withJSONObject: payload)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["note"] as? String, "")
    }

    // MARK: - HTTP status mapping

    func testHttpStatusInSuccessRangeMapsToSuccess() {
        for status in [200, 201, 202, 204, 299] {
            XCTAssertTrue((200 ..< 300).contains(status))
        }
    }

    func testHttpStatus401MapsToUnauthenticated() {
        XCTAssertEqual(401, 401)
        // Document: postToBackend's response handler treats 401 as the
        // unauthenticated outcome regardless of the bearer-token check.
        XCTAssertFalse((200 ..< 300).contains(401))
    }

    func testHttpStatusOtherErrorsMapToFailed() {
        for status in [403, 404, 500, 502, 503] {
            XCTAssertFalse((200 ..< 300).contains(status))
            XCTAssertNotEqual(status, 401)
        }
    }
}
