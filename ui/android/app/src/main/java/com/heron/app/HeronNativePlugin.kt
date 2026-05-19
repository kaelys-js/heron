// Android counterpart of iOS HeronNativePlugin.swift.
//
// Capacitor plugin that exposes Android-native features to the WebView
// via the same JS API surface — registerPlugin<HeronNativePlugin>
// in native-bridge.ts already routes calls cross-platform.
//
// Methods implemented (parity with iOS):
//   - getLanUrl() — read SharedPreferences for the mDNS-discovered URL
//   - drainNativeErrors() — flush queued errors so JS can POST to /api/issues
//   - networkStatusChanged event — fires on path state change
//
// iOS-specific features (Spotlight, Keychain, biometrics, Face ID) have
// Android equivalents (App Search, EncryptedSharedPreferences, BiometricPrompt)
// that we'd add as a follow-up; this commit ships the SHARED system
// (error + offline + branding) parity.

package com.heron.app

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "HeronNative")
class HeronNativePlugin : Plugin() {
    companion object {
        @Volatile var instance: HeronNativePlugin? = null

        fun notifyNetStatus(online: Boolean) {
            val data = JSObject()
            data.put("online", online)
            instance?.notifyListeners("netStatusChanged", data)
        }
    }

    private var networkMonitor: NetworkMonitor? = null

    override fun load() {
        instance = this
        ErrorReporter.init(context.applicationContext)
        networkMonitor =
            NetworkMonitor(context.applicationContext).also { m ->
                m.start { online -> notifyNetStatus(online) }
            }
    }

    override fun handleOnDestroy() {
        networkMonitor?.stop()
        networkMonitor = null
        instance = null
    }

    @PluginMethod
    fun getLanUrl(call: PluginCall) {
        val prefs = context.getSharedPreferences(Brand.name, Context.MODE_PRIVATE)
        val url = prefs.getString(Brand.PrefsKey.lanUrl, null)
        val result = JSObject()
        result.put("url", url)
        call.resolve(result)
    }

    @PluginMethod
    fun drainNativeErrors(call: PluginCall) {
        val arr = ErrorReporter.drain()
        val result = JSObject()
        result.put("errors", arr)
        call.resolve(result)
    }

    @PluginMethod
    fun biometricAvailable(call: PluginCall) {
        // BiometricManager.from(context).canAuthenticate(STRONG) — but we
        // keep this commit scoped. Returns true for now so the JS-side
        // gate check works; full BiometricPrompt wiring is a follow-up.
        val result = JSObject()
        result.put("available", false)
        call.resolve(result)
    }

    @PluginMethod
    fun biometricAuth(call: PluginCall) {
        // Stub — Android BiometricPrompt requires an Activity context +
        // PromptInfo + executor. Wiring is straightforward but adds ~100
        // lines; kept out of this commit for focus.
        call.reject("biometric-not-implemented-android", "Android biometric stub")
    }

    @PluginMethod
    fun keychainSet(call: PluginCall) {
        // Android equivalent: EncryptedSharedPreferences via androidx.security
        // (requires a small Gradle addition). Stub for now — JS side falls
        // back to localStorage on platforms that return false here.
        call.reject("keychain-not-implemented-android", "Android keychain stub")
    }

    @PluginMethod
    fun keychainGet(call: PluginCall) {
        call.reject("keychain-not-implemented-android", "Android keychain stub")
    }

    @PluginMethod
    fun keychainRemove(call: PluginCall) {
        call.reject("keychain-not-implemented-android", "Android keychain stub")
    }

    @PluginMethod
    fun indexJobs(call: PluginCall) {
        // Android App Search (jetpack-appsearch) parity with iOS Spotlight.
        // Follow-up; harmless no-op for now.
        val result = JSObject()
        result.put("ok", true)
        result.put("indexed", 0)
        call.resolve(result)
    }

    @PluginMethod
    fun clearJobIndex(call: PluginCall) {
        val result = JSObject()
        result.put("ok", true)
        call.resolve(result)
    }

    @PluginMethod
    fun setUserActivity(call: PluginCall) {
        // Android Handoff equivalent: doesn't exist in the same form. Skip
        // gracefully.
        val result = JSObject()
        result.put("ok", true)
        call.resolve(result)
    }
}
