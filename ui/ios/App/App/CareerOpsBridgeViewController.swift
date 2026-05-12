import Capacitor
import UIKit

/**
 * CareerOpsBridgeViewController — CAPBridgeViewController subclass that
 * explicitly registers our custom `CareerOpsNativePlugin` with the
 * Capacitor bridge.
 *
 * Why this subclass exists:
 * Capacitor 7+ auto-discovers plugins that come from `@capacitor/*` npm
 * packages (they declare themselves in `capacitor.config.json` and the
 * SPM build wires them up). Custom plugins compiled into the main App
 * target are NOT auto-discovered — the bridge has no way to know about
 * them. Without explicit registration, JS calls to
 * `Capacitor.Plugins.CareerOpsNative.*` report
 *   "CareerOpsNative" plugin is not implemented on ios
 * and the app keeps running but every Bonjour / biometric / keychain /
 * Spotlight / Handoff call no-ops.
 *
 * Wiring:
 * `App/Base.lproj/Main.storyboard` points its root view-controller's
 * `customClass` at this class (was `CAPBridgeViewController` from the
 * `Capacitor` module — now `CareerOpsBridgeViewController` from the App
 * module).
 */
class CareerOpsBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(CareerOpsNativePlugin())
    }
}
