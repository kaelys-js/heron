//
// ErrorReporterTests — verify the native-side queue/drain semantics
// that hand errors to the JS error-reporter via the Capacitor plugin.
//
import XCTest
@testable import App

final class ErrorReporterTests: XCTestCase {

    override func setUp() {
        super.setUp()
        // Drain anything left over from earlier tests / runs
        _ = ErrorReporter.shared.drain()
    }

    override func tearDown() {
        super.tearDown()
        _ = ErrorReporter.shared.drain()
    }

    func testReportEnqueuesAnEntry() {
        ErrorReporter.shared.report(message: "boom", source: "test")
        let drained = ErrorReporter.shared.drain()
        XCTAssertEqual(drained.count, 1)
    }

    func testEnqueuedEntryHasRequiredFields() {
        ErrorReporter.shared.report(message: "boom", source: "test")
        let drained = ErrorReporter.shared.drain()
        let entry = drained[0]
        XCTAssertEqual(entry["message"] as? String, "boom")
        XCTAssertEqual(entry["source"] as? String, "test")
        XCTAssertEqual(entry["level"] as? String, "error")
        XCTAssertEqual(entry["platform"] as? String, "ios-native")
        XCTAssertNotNil(entry["capturedAt"])
    }

    func testCustomLevel() {
        ErrorReporter.shared.report(message: "soft", source: "test", level: "warn")
        let drained = ErrorReporter.shared.drain()
        XCTAssertEqual(drained.first?["level"] as? String, "warn")
    }

    func testContextFieldsPreserved() {
        ErrorReporter.shared.report(
            message: "x", source: "test", level: "error",
            context: ["jobId": "j1", "code": 42]
        )
        let drained = ErrorReporter.shared.drain()
        XCTAssertEqual(drained.first?["jobId"] as? String, "j1")
        XCTAssertEqual(drained.first?["code"] as? Int, 42)
    }

    func testErrorOverloadFormatsLocalizedDescription() {
        struct Bork: LocalizedError {
            var errorDescription: String? { "borked: x=1" }
        }
        ErrorReporter.shared.report(Bork(), source: "test")
        let drained = ErrorReporter.shared.drain()
        XCTAssertEqual(drained.first?["message"] as? String, "borked: x=1")
    }

    func testDrainEmptiesTheQueue() {
        ErrorReporter.shared.report(message: "a", source: "test")
        ErrorReporter.shared.report(message: "b", source: "test")
        XCTAssertEqual(ErrorReporter.shared.drain().count, 2)
        XCTAssertEqual(ErrorReporter.shared.drain().count, 0)
    }

    func testMultipleEntriesPreserveOrder() {
        ErrorReporter.shared.report(message: "first", source: "test")
        ErrorReporter.shared.report(message: "second", source: "test")
        ErrorReporter.shared.report(message: "third", source: "test")
        let drained = ErrorReporter.shared.drain()
        XCTAssertEqual(drained.count, 3)
        XCTAssertEqual(drained[0]["message"] as? String, "first")
        XCTAssertEqual(drained[1]["message"] as? String, "second")
        XCTAssertEqual(drained[2]["message"] as? String, "third")
    }

    func testCapturedAtIsRecentEpochMs() {
        let before = Int(Date().timeIntervalSince1970 * 1000)
        ErrorReporter.shared.report(message: "t", source: "test")
        let drained = ErrorReporter.shared.drain()
        let ts = drained.first?["capturedAt"] as? Int ?? 0
        XCTAssertGreaterThanOrEqual(ts, before)
        XCTAssertLessThanOrEqual(ts, before + 5_000) // within 5 sec
    }
}
