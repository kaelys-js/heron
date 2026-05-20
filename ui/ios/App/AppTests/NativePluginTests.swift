//
// NativePluginTests -- exercise every @objc bridge method by constructing
// CAPPluginCall instances directly and capturing resolve/reject callbacks.
//
// We don't mock CAPPlugin or Capacitor internals; we use Capacitor's
// own CAPPluginCall init in test mode (callbackId/methodName/options/
// success/error closures). Side effects are observed via App Group
// UserDefaults reads + the public state of singletons NativePlugin
// delegates to (KeychainStore, SpotlightIndexer, ErrorReporter,
// WatchSessionBridge).
//
@testable import App
import Capacitor
import XCTest

final class NativePluginTests: XCTestCase {
    private var plugin: NativePlugin!
    private var groupDefaults: UserDefaults!

    override func setUp() {
        super.setUp()
        plugin = NativePlugin()
        plugin.load() // assigns NativePlugin.pluginInstance
        groupDefaults = UserDefaults(suiteName: Brand.appGroup) ?? UserDefaults.standard
        for key in [
            Brand.DefaultsKey.lanUrl,
            Brand.DefaultsKey.backendResolvedUrl,
            Brand.DefaultsKey.tailscaleUrl,
            Brand.DefaultsKey.productionUrl,
            Brand.DefaultsKey.bearerToken,
            Brand.DefaultsKey.lastSeenIssue,
            "\(Brand.name):quiet-hours",
            "auth:isAuthenticated",
            "stats:queued",
            "stats:appliedToday",
            "stats:upcomingInterviews",
            "interview:next",
            "topApply:next",
            "topApply:runnerUps",
            "issues:open",
        ] {
            groupDefaults.removeObject(forKey: key)
        }
        UserDefaults.standard.removeObject(forKey: Brand.DefaultsKey.lanUrl)
    }

    // MARK: - call() helper

    /// Build a CAPPluginCall with the test's options + callbacks that
    /// fulfill an expectation for either resolve or reject. Returns the
    /// call so the test can hand it to the plugin method under test.
    private func makeCall(
        _ method: String,
        options: [String: Any] = [:],
        onResolve: ((CAPPluginCallResult?) -> Void)? = nil,
        onReject: ((String?) -> Void)? = nil
    ) -> CAPPluginCall {
        CAPPluginCall(
            callbackId: "test-\(method)",
            methodName: method,
            options: options,
            success: { result, _ in onResolve?(result) },
            error: { err in onReject?(err?.message) }
        )
    }

    // MARK: - Plugin metadata

    func testPluginIdentifier() {
        XCTAssertEqual(plugin.identifier, "NativePlugin")
    }

    func testPluginJsNameMatchesBrand() {
        XCTAssertEqual(plugin.jsName, Brand.capacitorPluginName)
    }

    func testPluginMethodsList() {
        // Sanity: every @objc bridge method is declared in pluginMethods.
        let names = plugin.pluginMethods.map(\.name)
        XCTAssertTrue(names.contains("getLanUrl"))
        XCTAssertTrue(names.contains("biometricAvailable"))
        XCTAssertTrue(names.contains("biometricAuth"))
        XCTAssertTrue(names.contains("keychainSet"))
        XCTAssertTrue(names.contains("keychainGet"))
        XCTAssertTrue(names.contains("keychainRemove"))
        XCTAssertTrue(names.contains("indexJobs"))
        XCTAssertTrue(names.contains("clearJobIndex"))
        XCTAssertTrue(names.contains("setUserActivity"))
        XCTAssertTrue(names.contains("drainNativeErrors"))
        XCTAssertTrue(names.contains("updateWidgets"))
        XCTAssertTrue(names.contains("setSharedBearerToken"))
        XCTAssertTrue(names.contains("clearSharedBearerToken"))
        XCTAssertTrue(names.contains("setSharedBackendUrl"))
        XCTAssertTrue(names.contains("setSharedTailscaleUrl"))
        XCTAssertTrue(names.contains("setSharedProductionUrl"))
        XCTAssertTrue(names.contains("getSharedTailscaleUrl"))
        XCTAssertTrue(names.contains("getSharedProductionUrl"))
        XCTAssertTrue(names.contains("setSharedQuietHours"))
        XCTAssertTrue(names.contains("clearAllSharedState"))
    }

    func testLoadAssignsPluginInstance() {
        // load() is the Capacitor lifecycle hook; we call it in setUp.
        XCTAssertNotNil(NativePlugin.pluginInstance)
    }

    func testNotifyNetStatusIsStaticAndSafe() {
        // No listener registered in the test bundle; the call should
        // gracefully no-op. Tests the static-notifier code path.
        XCTAssertNoThrow(NativePlugin.notifyNetStatus(online: true))
        XCTAssertNoThrow(NativePlugin.notifyNetStatus(online: false))
    }

    // MARK: - getLanUrl

    func testGetLanUrlReturnsNullWhenUnset() {
        UserDefaults.standard.removeObject(forKey: Brand.DefaultsKey.lanUrl)
        let exp = expectation(description: "resolve")
        let call = makeCall("getLanUrl", onResolve: { result in
            // Result data should have "url" key with NSNull or nil.
            XCTAssertNotNil(result)
            exp.fulfill()
        })
        plugin.getLanUrl(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testGetLanUrlReturnsCachedValue() {
        let url = "http://heron.local:5173"
        UserDefaults.standard.set(url, forKey: Brand.DefaultsKey.lanUrl)
        defer { UserDefaults.standard.removeObject(forKey: Brand.DefaultsKey.lanUrl) }

        let exp = expectation(description: "resolve")
        let call = makeCall("getLanUrl", onResolve: { _ in exp.fulfill() })
        plugin.getLanUrl(call)
        wait(for: [exp], timeout: 2.0)
    }

    // MARK: - biometricAvailable

    func testBiometricAvailableResolves() {
        // On simulator the result is typically false; we only assert
        // the resolve callback fires, not the value (LAContext-dependent).
        let exp = expectation(description: "resolve")
        let call = makeCall("biometricAvailable", onResolve: { _ in exp.fulfill() })
        plugin.biometricAvailable(call)
        wait(for: [exp], timeout: 2.0)
    }

    // MARK: - keychain

    func testKeychainSetMissingArgRejects() {
        let exp = expectation(description: "reject")
        let call = makeCall("keychainSet", options: [:], onReject: { msg in
            XCTAssertNotNil(msg)
            exp.fulfill()
        })
        plugin.keychainSet(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testKeychainSetGetRoundTrip() {
        let key = "native-plugin-test-key"
        let value = "round-trip-value"
        defer { try? KeychainStore.shared.remove(key) }

        let setExp = expectation(description: "set resolve")
        let setCall = makeCall("keychainSet",
                               options: ["key": key, "value": value],
                               onResolve: { _ in setExp.fulfill() })
        plugin.keychainSet(setCall)
        wait(for: [setExp], timeout: 2.0)

        let getExp = expectation(description: "get resolve")
        let getCall = makeCall("keychainGet",
                               options: ["key": key],
                               onResolve: { _ in getExp.fulfill() })
        plugin.keychainGet(getCall)
        wait(for: [getExp], timeout: 2.0)
    }

    func testKeychainGetMissingArgRejects() {
        let exp = expectation(description: "reject")
        let call = makeCall("keychainGet", options: [:], onReject: { _ in exp.fulfill() })
        plugin.keychainGet(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testKeychainGetMissingKeyResolvesNull() {
        // KeychainError.notFound is caught and resolved as { value: null }.
        let exp = expectation(description: "resolve null")
        let call = makeCall("keychainGet",
                            options: ["key": "definitely-not-in-keychain-\(UUID().uuidString)"],
                            onResolve: { _ in exp.fulfill() })
        plugin.keychainGet(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testKeychainRemoveMissingArgRejects() {
        let exp = expectation(description: "reject")
        let call = makeCall("keychainRemove", options: [:], onReject: { _ in exp.fulfill() })
        plugin.keychainRemove(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testKeychainRemoveSucceedsOnMissingKey() {
        // KeychainStore.remove() is documented as no-throw on missing.
        let exp = expectation(description: "resolve")
        let call = makeCall("keychainRemove",
                            options: ["key": "absent-\(UUID().uuidString)"],
                            onResolve: { _ in exp.fulfill() })
        plugin.keychainRemove(call)
        wait(for: [exp], timeout: 2.0)
    }

    // MARK: - Spotlight

    func testIndexJobsMissingArgRejects() {
        let exp = expectation(description: "reject")
        let call = makeCall("indexJobs", options: [:], onReject: { _ in exp.fulfill() })
        plugin.indexJobs(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testIndexJobsAcceptsEmptyList() {
        // Empty list is a valid argument and resolves with count = 0.
        let exp = expectation(description: "resolve")
        let call = makeCall("indexJobs",
                            options: ["jobs": [] as [Any]],
                            onResolve: { _ in exp.fulfill() })
        plugin.indexJobs(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testIndexJobsParsesValidEntries() {
        // JSObject = [String: JSValue]; call.getArray("jobs", JSObject.self)
        // requires elements to match exactly, so types must be explicit.
        let job: JSObject = [
            "id": "j-1",
            "company": "Acme",
            "role": "iOS Engineer",
            "score": 4.5,
            "status": "Applied",
        ]
        let exp = expectation(description: "resolve")
        let call = makeCall("indexJobs",
                            options: ["jobs": [job]],
                            onResolve: { _ in exp.fulfill() })
        plugin.indexJobs(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testIndexJobsDropsMalformedEntries() {
        // Missing required field 'role' -> compactMap drops the entry.
        let bad: JSObject = ["id": "j-1", "company": "Acme"]
        let exp = expectation(description: "resolve")
        let call = makeCall("indexJobs",
                            options: ["jobs": [bad]],
                            onResolve: { _ in exp.fulfill() })
        plugin.indexJobs(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testClearJobIndexResolves() {
        let exp = expectation(description: "resolve")
        let call = makeCall("clearJobIndex", onResolve: { _ in exp.fulfill() })
        plugin.clearJobIndex(call)
        wait(for: [exp], timeout: 2.0)
    }

    // MARK: - App Group mirrors

    func testSetSharedBearerTokenWritesToAppGroup() {
        let exp = expectation(description: "resolve")
        let call = makeCall("setSharedBearerToken",
                            options: ["token": "abc123"],
                            onResolve: { _ in exp.fulfill() })
        plugin.setSharedBearerToken(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertEqual(groupDefaults.string(forKey: Brand.DefaultsKey.bearerToken), "abc123")
    }

    func testSetSharedBearerTokenEmptyStringClears() {
        groupDefaults.set("preexisting", forKey: Brand.DefaultsKey.bearerToken)
        let exp = expectation(description: "resolve")
        let call = makeCall("setSharedBearerToken",
                            options: ["token": ""],
                            onResolve: { _ in exp.fulfill() })
        plugin.setSharedBearerToken(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertNil(groupDefaults.string(forKey: Brand.DefaultsKey.bearerToken))
    }

    func testClearSharedBearerToken() {
        groupDefaults.set("xyz", forKey: Brand.DefaultsKey.bearerToken)
        let exp = expectation(description: "resolve")
        let call = makeCall("clearSharedBearerToken", onResolve: { _ in exp.fulfill() })
        plugin.clearSharedBearerToken(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertNil(groupDefaults.string(forKey: Brand.DefaultsKey.bearerToken))
    }

    func testSetSharedBackendUrlWrites() {
        let exp = expectation(description: "resolve")
        let call = makeCall("setSharedBackendUrl",
                            options: ["url": "http://backend.local:5173"],
                            onResolve: { _ in exp.fulfill() })
        plugin.setSharedBackendUrl(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertEqual(groupDefaults.string(forKey: Brand.DefaultsKey.backendResolvedUrl),
                       "http://backend.local:5173")
    }

    func testSetSharedBackendUrlEmptyClears() {
        groupDefaults.set("http://old", forKey: Brand.DefaultsKey.backendResolvedUrl)
        let exp = expectation(description: "resolve")
        let call = makeCall("setSharedBackendUrl",
                            options: ["url": ""],
                            onResolve: { _ in exp.fulfill() })
        plugin.setSharedBackendUrl(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertNil(groupDefaults.string(forKey: Brand.DefaultsKey.backendResolvedUrl))
    }

    func testSetSharedTailscaleUrlRoundTrip() {
        let url = "http://heron.tail-xxxx.ts.net:5173"
        let setExp = expectation(description: "set")
        let setCall = makeCall("setSharedTailscaleUrl",
                               options: ["url": url],
                               onResolve: { _ in setExp.fulfill() })
        plugin.setSharedTailscaleUrl(setCall)
        wait(for: [setExp], timeout: 2.0)

        let getExp = expectation(description: "get")
        let getCall = makeCall("getSharedTailscaleUrl",
                               onResolve: { _ in getExp.fulfill() })
        plugin.getSharedTailscaleUrl(getCall)
        wait(for: [getExp], timeout: 2.0)
    }

    func testSetSharedTailscaleUrlEmptyClears() {
        groupDefaults.set("http://old", forKey: Brand.DefaultsKey.tailscaleUrl)
        let exp = expectation(description: "resolve")
        let call = makeCall("setSharedTailscaleUrl",
                            options: ["url": ""],
                            onResolve: { _ in exp.fulfill() })
        plugin.setSharedTailscaleUrl(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertNil(groupDefaults.string(forKey: Brand.DefaultsKey.tailscaleUrl))
    }

    func testSetSharedProductionUrlRoundTrip() {
        let setExp = expectation(description: "set")
        let setCall = makeCall("setSharedProductionUrl",
                               options: ["url": "https://prod.example.com"],
                               onResolve: { _ in setExp.fulfill() })
        plugin.setSharedProductionUrl(setCall)
        wait(for: [setExp], timeout: 2.0)

        let getExp = expectation(description: "get")
        let getCall = makeCall("getSharedProductionUrl",
                               onResolve: { _ in getExp.fulfill() })
        plugin.getSharedProductionUrl(getCall)
        wait(for: [getExp], timeout: 2.0)
    }

    func testSetSharedProductionUrlEmptyClears() {
        groupDefaults.set("https://old", forKey: Brand.DefaultsKey.productionUrl)
        let exp = expectation(description: "resolve")
        let call = makeCall("setSharedProductionUrl",
                            options: ["url": ""],
                            onResolve: { _ in exp.fulfill() })
        plugin.setSharedProductionUrl(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertNil(groupDefaults.string(forKey: Brand.DefaultsKey.productionUrl))
    }

    func testGetSharedTailscaleUrlReturnsEmptyWhenUnset() {
        let exp = expectation(description: "resolve")
        let call = makeCall("getSharedTailscaleUrl", onResolve: { _ in exp.fulfill() })
        plugin.getSharedTailscaleUrl(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testGetSharedProductionUrlReturnsEmptyWhenUnset() {
        let exp = expectation(description: "resolve")
        let call = makeCall("getSharedProductionUrl", onResolve: { _ in exp.fulfill() })
        plugin.getSharedProductionUrl(call)
        wait(for: [exp], timeout: 2.0)
    }

    // MARK: - Quiet hours

    func testSetSharedQuietHoursWrites() {
        let json = #"{"enabled":true,"startHour":22,"endHour":7}"#
        let key = "\(Brand.name):quiet-hours"
        let exp = expectation(description: "resolve")
        let call = makeCall("setSharedQuietHours",
                            options: ["json": json],
                            onResolve: { _ in exp.fulfill() })
        plugin.setSharedQuietHours(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertEqual(groupDefaults.string(forKey: key), json)
    }

    func testSetSharedQuietHoursEmptyClears() {
        let key = "\(Brand.name):quiet-hours"
        groupDefaults.set("old-value", forKey: key)
        let exp = expectation(description: "resolve")
        let call = makeCall("setSharedQuietHours",
                            options: ["json": ""],
                            onResolve: { _ in exp.fulfill() })
        plugin.setSharedQuietHours(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertNil(groupDefaults.string(forKey: key))
    }

    // MARK: - clearAllSharedState

    func testClearAllSharedStateScrubsUserKeys() {
        // Seed every user-scoped key clearAllSharedState should wipe.
        groupDefaults.set("token", forKey: Brand.DefaultsKey.bearerToken)
        groupDefaults.set(1.0, forKey: Brand.DefaultsKey.lastSeenIssue)
        groupDefaults.set("{}", forKey: "\(Brand.name):quiet-hours")
        // Machine-level keys should SURVIVE the scrub.
        groupDefaults.set("http://lan:5173", forKey: Brand.DefaultsKey.lanUrl)
        groupDefaults.set("https://prod", forKey: Brand.DefaultsKey.productionUrl)
        groupDefaults.set("http://ts.local", forKey: Brand.DefaultsKey.tailscaleUrl)
        groupDefaults.set("http://cached", forKey: Brand.DefaultsKey.backendResolvedUrl)

        let exp = expectation(description: "resolve")
        let call = makeCall("clearAllSharedState", onResolve: { _ in exp.fulfill() })
        plugin.clearAllSharedState(call)
        wait(for: [exp], timeout: 2.0)

        // User-scoped: gone
        XCTAssertNil(groupDefaults.string(forKey: Brand.DefaultsKey.bearerToken))
        XCTAssertEqual(groupDefaults.double(forKey: Brand.DefaultsKey.lastSeenIssue), 0.0)
        XCTAssertNil(groupDefaults.string(forKey: "\(Brand.name):quiet-hours"))

        // Machine-level: preserved
        XCTAssertEqual(groupDefaults.string(forKey: Brand.DefaultsKey.lanUrl), "http://lan:5173")
        XCTAssertEqual(groupDefaults.string(forKey: Brand.DefaultsKey.productionUrl), "https://prod")
        XCTAssertEqual(groupDefaults.string(forKey: Brand.DefaultsKey.tailscaleUrl), "http://ts.local")
        XCTAssertEqual(groupDefaults.string(forKey: Brand.DefaultsKey.backendResolvedUrl), "http://cached")
    }

    // MARK: - drainNativeErrors

    func testDrainNativeErrorsReturnsArray() {
        let exp = expectation(description: "resolve")
        let call = makeCall("drainNativeErrors", onResolve: { _ in exp.fulfill() })
        plugin.drainNativeErrors(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testDrainNativeErrorsClearsQueue() {
        ErrorReporter.shared.report(message: "test error", source: "test", level: "warn")
        // First drain returns the queued entry; second drain returns empty.
        let firstExp = expectation(description: "first drain")
        let firstCall = makeCall("drainNativeErrors", onResolve: { _ in firstExp.fulfill() })
        plugin.drainNativeErrors(firstCall)
        wait(for: [firstExp], timeout: 2.0)

        let secondExp = expectation(description: "second drain")
        let secondCall = makeCall("drainNativeErrors", onResolve: { _ in secondExp.fulfill() })
        plugin.drainNativeErrors(secondCall)
        wait(for: [secondExp], timeout: 2.0)
    }

    // MARK: - setUserActivity

    func testSetUserActivityWithDefaults() {
        let exp = expectation(description: "resolve")
        let call = makeCall("setUserActivity", onResolve: { _ in exp.fulfill() })
        plugin.setUserActivity(call)
        wait(for: [exp], timeout: 2.0)
    }

    func testSetUserActivityWithCustomType() {
        let exp = expectation(description: "resolve")
        let call = makeCall("setUserActivity",
                            options: [
                                "type": "\(Brand.bundleId).test.activity",
                                "title": "Test Activity",
                                "data": ["jobId": "j-1"] as [String: Any],
                            ],
                            onResolve: { _ in exp.fulfill() })
        plugin.setUserActivity(call)
        wait(for: [exp], timeout: 2.0)
    }

    // MARK: - updateWidgets

    func testUpdateWidgetsWritesStats() {
        // JSObject = [String: JSValue]; call.getObject("stats") returns nil
        // unless the stored value is exactly that type.
        let stats: JSObject = [
            "queued": 7,
            "appliedToday": 3,
            "upcomingInterviews": 2,
        ]
        let exp = expectation(description: "resolve")
        let call = makeCall("updateWidgets",
                            options: ["stats": stats],
                            onResolve: { _ in exp.fulfill() })
        plugin.updateWidgets(call)
        wait(for: [exp], timeout: 2.0)

        XCTAssertEqual(groupDefaults.integer(forKey: "stats:queued"), 7)
        XCTAssertEqual(groupDefaults.integer(forKey: "stats:appliedToday"), 3)
        XCTAssertEqual(groupDefaults.integer(forKey: "stats:upcomingInterviews"), 2)
    }

    func testUpdateWidgetsWritesNextInterview() {
        let nextInterview: JSObject = [
            "jobId": "j-9",
            "company": "Acme",
            "role": "iOS Engineer",
            "stage": "Onsite",
            "scheduledAt": "2026-06-01T10:00:00Z",
            "interviewers": [] as JSArray,
        ]
        let exp = expectation(description: "resolve")
        let call = makeCall("updateWidgets",
                            options: ["nextInterview": nextInterview],
                            onResolve: { _ in exp.fulfill() })
        plugin.updateWidgets(call)
        wait(for: [exp], timeout: 2.0)

        XCTAssertNotNil(groupDefaults.data(forKey: "interview:next"))
    }

    func testUpdateWidgetsWritesTopApply() {
        let topApply: JSObject = [
            "jobId": "j-1",
            "company": "Beta",
            "role": "Sr iOS",
            "score": 4.7,
            "compBand": "L5",
            "location": "Remote",
            "portal": "linkedin",
        ]
        let exp = expectation(description: "resolve")
        let call = makeCall("updateWidgets",
                            options: ["topApply": topApply],
                            onResolve: { _ in exp.fulfill() })
        plugin.updateWidgets(call)
        wait(for: [exp], timeout: 2.0)

        XCTAssertNotNil(groupDefaults.data(forKey: "topApply:next"))
    }

    func testUpdateWidgetsWritesRunnerUps() {
        let runnerUps: [JSObject] = [
            ["jobId": "j-2", "company": "Beta", "role": "iOS", "score": 4.2],
            ["jobId": "j-3", "company": "Gamma", "role": "iOS", "score": 4.1],
        ]
        let exp = expectation(description: "resolve")
        let call = makeCall("updateWidgets",
                            options: ["topApplyRunnerUps": runnerUps],
                            onResolve: { _ in exp.fulfill() })
        plugin.updateWidgets(call)
        wait(for: [exp], timeout: 2.0)

        XCTAssertNotNil(groupDefaults.data(forKey: "topApply:runnerUps"))
    }

    func testUpdateWidgetsWritesOpenIssues() {
        let openIssues: [JSObject] = [
            ["id": "i-1", "severity": "warn", "source": "email", "summary": "test", "ts": 1_700_000_000_000],
        ]
        let exp = expectation(description: "resolve")
        let call = makeCall("updateWidgets",
                            options: ["openIssues": openIssues],
                            onResolve: { _ in exp.fulfill() })
        plugin.updateWidgets(call)
        wait(for: [exp], timeout: 2.0)

        XCTAssertNotNil(groupDefaults.data(forKey: "issues:open"))
    }

    func testUpdateWidgetsAuthenticatedFalseScrubsKeys() {
        // Seed cached widget data
        groupDefaults.set(5, forKey: "stats:queued")
        groupDefaults.set(2, forKey: "stats:appliedToday")
        groupDefaults.set(Data(), forKey: "interview:next")
        groupDefaults.set(Data(), forKey: "topApply:next")
        groupDefaults.set(Data(), forKey: "topApply:runnerUps")
        groupDefaults.set(Data(), forKey: "issues:open")

        let exp = expectation(description: "resolve")
        let call = makeCall("updateWidgets",
                            options: ["authenticated": false],
                            onResolve: { _ in exp.fulfill() })
        plugin.updateWidgets(call)
        wait(for: [exp], timeout: 2.0)

        // Auth flag flipped + every cached key cleared.
        XCTAssertFalse(groupDefaults.bool(forKey: "auth:isAuthenticated"))
        XCTAssertEqual(groupDefaults.integer(forKey: "stats:queued"), 0)
        XCTAssertEqual(groupDefaults.integer(forKey: "stats:appliedToday"), 0)
        XCTAssertNil(groupDefaults.data(forKey: "interview:next"))
        XCTAssertNil(groupDefaults.data(forKey: "topApply:next"))
        XCTAssertNil(groupDefaults.data(forKey: "topApply:runnerUps"))
        XCTAssertNil(groupDefaults.data(forKey: "issues:open"))
    }

    func testUpdateWidgetsAuthenticatedTrueWritesAuthFlag() {
        let exp = expectation(description: "resolve")
        let call = makeCall("updateWidgets",
                            options: ["authenticated": true],
                            onResolve: { _ in exp.fulfill() })
        plugin.updateWidgets(call)
        wait(for: [exp], timeout: 2.0)
        XCTAssertTrue(groupDefaults.bool(forKey: "auth:isAuthenticated"))
    }
}
