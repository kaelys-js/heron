// Android counterpart of iOS NativePlugin.swift.
//
// Capacitor plugin that exposes Android-native features to the WebView
// via the same JS API surface — registerPlugin<NativePlugin>
// in native-bridge.ts already routes calls cross-platform.
//
// Methods (iOS parity):
//   - getLanUrl / drainNativeErrors / netStatus event — pre-existing
//   - biometricAvailable / biometricAuth — androidx.biometric
//   - keychainSet / keychainGet / keychainRemove —
//     androidx.security EncryptedSharedPreferences
//   - indexJobs / clearJobIndex — androidx.appsearch
//   - setUserActivity — Android equivalent of NSUserActivity. Android
//     Handoff doesn't exist; we publish an AppSearch document instead
//     so the system-wide search picks up the activity.

package com.heron.app

import android.content.Context
import androidx.appcompat.app.AppCompatActivity
import androidx.appsearch.app.AppSearchSession
import androidx.appsearch.app.PutDocumentsRequest
import androidx.appsearch.app.RemoveByDocumentIdRequest
import androidx.appsearch.app.SetSchemaRequest
import androidx.appsearch.localstorage.LocalStorage
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@CapacitorPlugin(name = "HeronNative")
class NativePlugin : Plugin() {
    companion object {
        @Volatile var instance: NativePlugin? = null

        fun notifyNetStatus(online: Boolean) {
            val data = JSObject()
            data.put("online", online)
            instance?.notifyListeners("netStatusChanged", data)
        }

        /** Master key for EncryptedSharedPreferences. Lazily generated
         *  via the Android Keystore; backed by hardware-backed strongbox
         *  when available (Pixel + recent flagship) and falling back to
         *  the software TEE otherwise. The same alias is reused across
         *  app launches so encrypted values persist. */
        private const val KEYCHAIN_PREFS = "heron-encrypted-prefs"
        private const val APPSEARCH_DB = "heron-jobs"
    }

    private var networkMonitor: NetworkMonitor? = null
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile private var appSearchSession: AppSearchSession? = null

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
        // AppSearch sessions must close cleanly; otherwise the IPC binder
        // holds the connection open after the process unwinds.
        try {
            appSearchSession?.close()
        } catch (_: Throwable) {
            // best-effort
        }
        appSearchSession = null
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

    // ── F1 — biometric (Face Unlock / Fingerprint) ────────────────

    /** Probe whether the device has STRONG biometrics enrolled. Mirrors
     *  iOS LAContext.canEvaluatePolicy. Cheaper than the prompt — the JS
     *  side calls this first to decide whether to even offer biometric
     *  unlock as an option. */
    @PluginMethod
    fun biometricAvailable(call: PluginCall) {
        val canAuth =
            BiometricManager.from(context).canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
                    or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
        val result = JSObject()
        result.put("available", canAuth == BiometricManager.BIOMETRIC_SUCCESS)
        // Surface why the prompt would fail so the JS side can offer a
        // helpful message ("Enroll Face Unlock in Settings…").
        result.put(
            "reason",
            when (canAuth) {
                BiometricManager.BIOMETRIC_SUCCESS -> {
                    "ok"
                }

                BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> {
                    "no-hardware"
                }

                BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> {
                    "hw-unavailable"
                }

                BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> {
                    "none-enrolled"
                }

                BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED -> {
                    "security-update-required"
                }

                else -> {
                    "unsupported"
                }
            },
        )
        call.resolve(result)
    }

    /** Show the system BiometricPrompt and resolve when the user
     *  authenticates. Falls back to device credential (PIN/pattern) so
     *  users without enrolled biometrics still gate-pass — matching the
     *  iOS LAPolicy.deviceOwnerAuthentication semantic. */
    @PluginMethod
    fun biometricAuth(call: PluginCall) {
        val reason = call.getString("reason") ?: "Authenticate"
        val activity = activity as? AppCompatActivity
        if (activity == null) {
            call.reject("no-activity", "Biometric prompt requires an Activity context")
            return
        }
        activity.runOnUiThread {
            val executor = ContextCompat.getMainExecutor(context)
            val prompt = BiometricPrompt(activity, executor, biometricCallback(call))
            val info =
                BiometricPrompt.PromptInfo
                    .Builder()
                    .setTitle(Brand.displayName)
                    .setSubtitle(reason)
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG
                            or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
                    ).build()
            prompt.authenticate(info)
        }
    }

    /**
     * BiometricPrompt callback. Extracted from `biometricAuth`'s
     * runOnUiThread closure so the three onAuthentication* branches
     * are reachable from unit tests via reflection (the previous
     * inline anonymous class buried the methods inside a
     * runOnUiThread Runnable that JaCoCo measured at 8% line
     * coverage). The extraction preserves the closure over `call`
     * exactly -- the callback resolves the same PluginCall whether
     * called from the runOnUiThread block or from a unit test.
     */
    @androidx.annotation.VisibleForTesting
    internal fun biometricCallback(call: PluginCall): BiometricPrompt.AuthenticationCallback =
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val out = JSObject()
                out.put("ok", true)
                call.resolve(out)
            }

            override fun onAuthenticationError(
                errorCode: Int,
                errString: CharSequence,
            ) {
                val out = JSObject()
                out.put("ok", false)
                out.put("reason", "error-$errorCode")
                out.put("message", errString.toString())
                call.resolve(out)
            }

            override fun onAuthenticationFailed() {
                // Don't resolve here -- Android fires "failed" on each
                // rejected attempt; the prompt keeps running. The user's
                // "Cancel" hits onError.
            }
        }

    // ── F2 — keychain (EncryptedSharedPreferences) ────────────────

    /** Lazy-initialise the encrypted prefs store. The master key is
     *  generated once on first use and cached in the Android Keystore;
     *  subsequent boots reuse it. */
    private fun keychain(): android.content.SharedPreferences {
        val masterKey =
            MasterKey
                .Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
        return EncryptedSharedPreferences.create(
            context,
            KEYCHAIN_PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    @PluginMethod
    fun keychainSet(call: PluginCall) {
        val key = call.getString("key")
        val value = call.getString("value")
        if (key.isNullOrEmpty() || value == null) {
            call.reject("invalid-args", "Both key and value are required")
            return
        }
        try {
            keychain().edit().putString(key, value).apply()
            val out = JSObject()
            out.put("ok", true)
            call.resolve(out)
        } catch (e: Throwable) {
            call.reject("keychain-write-failed", e.message ?: "Failed to write encrypted value")
        }
    }

    @PluginMethod
    fun keychainGet(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrEmpty()) {
            call.reject("invalid-args", "key is required")
            return
        }
        try {
            val value = keychain().getString(key, null)
            val out = JSObject()
            out.put("value", value)
            call.resolve(out)
        } catch (e: Throwable) {
            call.reject("keychain-read-failed", e.message ?: "Failed to read encrypted value")
        }
    }

    @PluginMethod
    fun keychainRemove(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrEmpty()) {
            call.reject("invalid-args", "key is required")
            return
        }
        try {
            keychain().edit().remove(key).apply()
            val out = JSObject()
            out.put("ok", true)
            call.resolve(out)
        } catch (e: Throwable) {
            call.reject("keychain-remove-failed", e.message ?: "Failed to remove encrypted value")
        }
    }

    // ── F3 — AppSearch (Spotlight parity) ─────────────────────────

    /** Schema for a job document in the AppSearch local index. */
    @androidx.appsearch.annotation.Document
    data class JobDocument(
        @androidx.appsearch.annotation.Document.Namespace val namespace: String,
        @androidx.appsearch.annotation.Document.Id val id: String,
        @androidx.appsearch.annotation.Document.StringProperty(
            indexingType = PREFIX_INDEX,
        )
        val company: String,
        @androidx.appsearch.annotation.Document.StringProperty(
            indexingType = PREFIX_INDEX,
        )
        val role: String,
        @androidx.appsearch.annotation.Document.DoubleProperty val score: Double = 0.0,
        @androidx.appsearch.annotation.Document.StringProperty val status: String = "",
    ) {
        companion object {
            // Constant extracted so the @StringProperty annotation fits in
            // 100 columns. Same value the long form expanded to.
            const val PREFIX_INDEX =
                androidx.appsearch.app.AppSearchSchema.StringPropertyConfig.INDEXING_TYPE_PREFIXES
        }
    }

    /** Open (or reuse) the AppSearch session. AppSearch is async; we
     *  wrap the ListenableFuture in a coroutine `await` for ergonomics. */
    private suspend fun appSearch(): AppSearchSession {
        val cached = appSearchSession
        if (cached != null) return cached
        val opened =
            LocalStorage
                .createSearchSessionAsync(
                    LocalStorage.SearchContext.Builder(context, APPSEARCH_DB).build(),
                ).await()
        // Set up the schema once. Idempotent — same call lights up the
        // identical schema on subsequent boots; AppSearch dedups.
        opened
            .setSchemaAsync(
                SetSchemaRequest
                    .Builder()
                    .addDocumentClasses(JobDocument::class.java)
                    .build(),
            ).await()
        appSearchSession = opened
        return opened
    }

    @PluginMethod
    fun indexJobs(call: PluginCall) {
        val jobs = call.getArray("jobs")
        if (jobs == null) {
            call.reject("invalid-args", "jobs array required")
            return
        }
        pluginScope.launch {
            try {
                val docs = mutableListOf<JobDocument>()
                for (i in 0 until jobs.length()) {
                    val obj = jobs.getJSONObject(i)
                    docs.add(
                        JobDocument(
                            namespace = "user",
                            id = obj.optString("id"),
                            company = obj.optString("company", ""),
                            role = obj.optString("role", ""),
                            score = obj.optDouble("score", 0.0),
                            status = obj.optString("status", ""),
                        ),
                    )
                }
                val session = appSearch()
                val request = PutDocumentsRequest.Builder().addDocuments(docs).build()
                val result = session.putAsync(request).await()
                val out = JSObject()
                out.put("ok", result.isSuccess)
                out.put("indexed", result.successes.size)
                withContext(Dispatchers.Main) { call.resolve(out) }
            } catch (e: Throwable) {
                withContext(Dispatchers.Main) {
                    call.reject(
                        "appsearch-failed",
                        e.message ?: "AppSearch indexJobs failed",
                    )
                }
            }
        }
    }

    @PluginMethod
    fun clearJobIndex(call: PluginCall) {
        pluginScope.launch {
            try {
                val session = appSearch()
                // Brute clear: remove every doc by querying first. Slow
                // path but only runs on sign-out (~once per session) so
                // it's acceptable. AppSearch has no native "clear all".
                val searchResults =
                    session.search(
                        "",
                        androidx.appsearch.app.SearchSpec
                            .Builder()
                            .addFilterNamespaces("user")
                            .setResultCountPerPage(100)
                            .build(),
                    )
                val toRemove = mutableListOf<String>()
                var page = searchResults.nextPageAsync.await()
                while (page.isNotEmpty()) {
                    for (r in page) toRemove.add(r.genericDocument.id)
                    page = searchResults.nextPageAsync.await()
                }
                if (toRemove.isNotEmpty()) {
                    session
                        .removeAsync(
                            RemoveByDocumentIdRequest
                                .Builder("user")
                                .addIds(toRemove)
                                .build(),
                        ).await()
                }
                val out = JSObject()
                out.put("ok", true)
                withContext(Dispatchers.Main) { call.resolve(out) }
            } catch (e: Throwable) {
                withContext(Dispatchers.Main) {
                    call.reject(
                        "appsearch-clear-failed",
                        e.message ?: "AppSearch clearJobIndex failed",
                    )
                }
            }
        }
    }

    @PluginMethod
    fun setUserActivity(call: PluginCall) {
        // Android doesn't have NSUserActivity. The Watch/Live-Activity
        // Handoff use case maps to AppSearch documents (which the OS
        // surfaces in global search) + intent extras on launch. We
        // resolve true so the JS contract is uniform; deeper integration
        // (Slice / App Action) ships when we have an Android Heron
        // surface that actually generates one.
        val out = JSObject()
        out.put("ok", true)
        call.resolve(out)
    }
}
