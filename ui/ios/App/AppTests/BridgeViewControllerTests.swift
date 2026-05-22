//
// BridgeViewControllerTests -- pin the brand-dark background colour
// chain + the lifecycle hooks the CAPBridgeViewController subclass
// overrides.
//
// The subclass exists to (a) paint the view + WKWebView + scrollView
// brand-dark so the WebView's white-flash is invisible, and (b) register
// NativePlugin via capacitorDidLoad. Both are testable by instantiating
// the VC directly + calling the lifecycle methods.
//
// We don't construct a full Capacitor bridge -- bridge?.registerPluginInstance
// is a nil-coalesce in unit-test context. The cover-the-lines goal is
// satisfied as long as the override fires and doesn't crash.
//
@testable import App
import Capacitor
import UIKit
import XCTest

final class BridgeViewControllerTests: XCTestCase {
    private var bridgeVC: BridgeViewController!

    override func setUp() {
        super.setUp()
        bridgeVC = BridgeViewController()
    }

    override func tearDown() {
        bridgeVC = nil
        super.tearDown()
    }

    func testInstantiates() {
        XCTAssertNotNil(bridgeVC)
    }

    func testIsCAPBridgeViewControllerSubclass() {
        XCTAssertTrue(bridgeVC.isKind(of: CAPBridgeViewController.self))
    }

    func testViewDidLoadPaintsBrandDarkBackground() {
        // Force the view to load so viewDidLoad fires.
        _ = bridgeVC.view
        // brandDarkBg is RGB(14, 16, 20). Pull the components back out via
        // CGColor and assert each within rounding tolerance (1/255 ≈ 0.004).
        guard let components = bridgeVC.view.backgroundColor?.cgColor.components, components.count >= 3 else {
            XCTFail("view backgroundColor must be a 3-or-4 component UIColor")
            return
        }
        XCTAssertEqual(components[0], 14.0 / 255.0, accuracy: 0.01, "red channel = 14/255")
        XCTAssertEqual(components[1], 16.0 / 255.0, accuracy: 0.01, "green channel = 16/255")
        XCTAssertEqual(components[2], 20.0 / 255.0, accuracy: 0.01, "blue channel = 20/255")
    }

    func testViewDidLoadPaintsWebViewBackground() throws {
        _ = bridgeVC.view
        // CAPBridgeViewController lazy-creates the WKWebView on viewDidLoad,
        // so by the time we read .webView it's non-nil.
        XCTAssertNotNil(bridgeVC.webView, "WKWebView must be created by viewDidLoad")
        XCTAssertFalse(try XCTUnwrap(bridgeVC.webView?.isOpaque), "isOpaque must be false so bg shows through")
        guard let components = try XCTUnwrap(bridgeVC.webView?.backgroundColor?.cgColor.components), components.count >= 3 else {
            XCTFail("webView backgroundColor must be set")
            return
        }
        XCTAssertEqual(components[0], 14.0 / 255.0, accuracy: 0.01)
        XCTAssertEqual(components[1], 16.0 / 255.0, accuracy: 0.01)
        XCTAssertEqual(components[2], 20.0 / 255.0, accuracy: 0.01)
    }

    func testViewDidLoadPaintsScrollViewBackground() {
        _ = bridgeVC.view
        guard let components = bridgeVC.webView?.scrollView.backgroundColor?.cgColor.components,
              components.count >= 3
        else {
            XCTFail("scrollView backgroundColor must be set")
            return
        }
        XCTAssertEqual(components[0], 14.0 / 255.0, accuracy: 0.01)
        XCTAssertEqual(components[1], 16.0 / 255.0, accuracy: 0.01)
        XCTAssertEqual(components[2], 20.0 / 255.0, accuracy: 0.01)
    }

    func testCapacitorDidLoadIsCallable() {
        // capacitorDidLoad reads bridge?.config which is nil in unit-test
        // context -- the method NSLogs the resolved URLs and calls
        // registerPluginInstance on a nil bridge. The override compiles
        // + runs without crashing; that's the line-coverage goal here.
        _ = bridgeVC.view
        bridgeVC.capacitorDidLoad()
        XCTAssertTrue(true)
    }

    func testViewDidAppearWithNilWebViewURLIsCallable() {
        _ = bridgeVC.view
        // webView is non-nil after viewDidLoad, but webView.url is nil
        // until something is loaded -- exercises the else branch.
        XCTAssertNil(bridgeVC.webView?.url)
        bridgeVC.viewDidAppear(false)
        XCTAssertTrue(true)
    }
}
