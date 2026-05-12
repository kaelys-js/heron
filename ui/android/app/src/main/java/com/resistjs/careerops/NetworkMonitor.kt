// Android counterpart of iOS NetworkMonitor.swift.
//
// Uses ConnectivityManager.NetworkCallback (Android 5.0+) — pushes
// online/offline transitions to the WebView via the CareerOpsNative
// Capacitor plugin, which fires the same `<brand>:net-status` event
// online-status.svelte.ts subscribes to on every platform.
//
// Parity goals (matches iOS NWPathMonitor):
//   - Authoritative path state (vs flaky navigator.onLine)
//   - State stored in SharedPreferences so background-fetch
//     workers can short-circuit when offline
//   - Single-line forward to JS

package com.resistjs.careerops

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log

class NetworkMonitor(private val context: Context) {
    private val connectivityManager: ConnectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    @Volatile var isOnline: Boolean = true
        private set

    private var callback: ConnectivityManager.NetworkCallback? = null
    private var notifyJs: ((Boolean) -> Unit)? = null

    fun start(onChange: (Boolean) -> Unit) {
        notifyJs = onChange
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            .build()
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                set(true)
            }
            override fun onLost(network: Network) {
                set(false)
            }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                set(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))
            }
        }
        callback = cb
        try {
            connectivityManager.registerNetworkCallback(request, cb)
            Log.i("career-ops:net", "monitor started")
        } catch (e: SecurityException) {
            ErrorReporter.report(e, "NetworkMonitor", "warn")
        }
    }

    fun stop() {
        callback?.let { cb ->
            try {
                connectivityManager.unregisterNetworkCallback(cb)
            } catch (_: Exception) {
                // already-unregistered, OK
            }
        }
        callback = null
        notifyJs = null
    }

    private fun set(online: Boolean) {
        if (online == isOnline) return
        isOnline = online
        context.getSharedPreferences(Brand.name, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(Brand.PrefsKey.online, online)
            .apply()
        Log.i("career-ops:net", "status → ${if (online) "online" else "offline"}")
        notifyJs?.invoke(online)
    }
}
