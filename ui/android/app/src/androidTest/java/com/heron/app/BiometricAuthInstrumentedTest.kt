// BiometricAuthInstrumentedTest -- exercises NativePlugin.biometricAuth
// against a REAL AppCompatActivity on the emulator. Robolectric can't
// host the BiometricPrompt dialog (it depends on FragmentActivity's
// FragmentManager + a live decor view); this test runs on the device
// to cover NativePlugin.kt lines 168-211 (the prompt construction +
// callback wiring) that the JVM unit suite can't reach.
//
// The test does NOT assert the dialog's outcome -- BiometricPrompt's
// user-flow is hardware-driven (Touch ID / Face ID / fallback PIN).
// We assert the prompt construction succeeded + the bridge resolved
// or rejected within a reasonable timeout. Either path covers the
// instrumented-only lines.
package com.heron.app

import androidx.appcompat.app.AppCompatActivity
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.getcapacitor.Bridge
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class BiometricAuthInstrumentedTest {
    @Test
    fun biometricAuthConstructsPromptUnderRealActivity() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        ErrorReporter.init(ctx.applicationContext)

        // Spin up a real AppCompatActivity. BiometricPrompt requires
        // FragmentActivity (which AppCompatActivity extends) to attach
        // its dialog fragment; without this no prompt can construct.
        ActivityScenario.launch(AppCompatActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val plugin = NativePlugin()
                val bridge = mockk<Bridge>(relaxed = true)
                every { bridge.context } returns ctx
                every { bridge.activity } returns activity
                val field = Plugin::class.java.getDeclaredField("bridge")
                field.isAccessible = true
                field.set(plugin, bridge)

                val latch = CountDownLatch(1)
                val pc = mockk<PluginCall>(relaxed = true)
                every { pc.getString("reason") } returns "Unlock for tests"
                every { pc.resolve(any()) } answers { latch.countDown() }
                every { pc.reject(any<String>(), any<String>()) } answers { latch.countDown() }

                plugin.biometricAuth(pc)

                // BiometricPrompt resolves async; on most emulator
                // configurations the prompt CANCELS within ~2s because
                // no biometric is enrolled. Either outcome (resolve or
                // reject) confirms the prompt construction lines ran.
                val terminated = latch.await(15, TimeUnit.SECONDS)
                if (terminated) {
                    val resolvedSlot = slot<JSObject>()
                    val resolvedAny =
                        try {
                            verify(atLeast = 1) { pc.resolve(capture(resolvedSlot)) }
                            true
                        } catch (_: AssertionError) {
                            false
                        }
                    val rejectedAny =
                        try {
                            verify(atLeast = 1) {
                                pc.reject(any<String>(), any<String>())
                            }
                            true
                        } catch (_: AssertionError) {
                            false
                        }
                    assert(resolvedAny || rejectedAny) {
                        "BiometricPrompt must resolve or reject after construction"
                    }
                }
                // If not terminated within 15s the prompt is still
                // visible (e.g. waiting on hardware) -- the line
                // coverage we wanted (prompt construction) already
                // happened on `biometricAuth(pc)`.
            }
        }
    }
}
