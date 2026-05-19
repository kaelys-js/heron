// Android counterpart of iOS ErrorReporter.swift + JS error-reporter.ts.
//
// Captures errors from native code (NSD discovery, biometric, background
// sync, network monitor) and routes them through the same /api/issues
// store the WebView + iOS use. State queued in SharedPreferences so
// surviving across app restarts.
//
// Pattern mirrors ErrorReporter.swift line-by-line:
//   - report(msg, source, level) → log + enqueue
//   - drain() → return + clear queue (HeronNative plugin exposes
//     this to JS, which forwards to /api/issues during flush cycles)

package com.heron.app

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

object ErrorReporter {
    private const val TAG = "heron:error"
    private const val MAX_QUEUE = 50

    private lateinit var appContext: Context

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun report(
        message: String,
        source: String,
        level: String = "error",
        context: Map<String, Any?> = emptyMap(),
    ) {
        Log.e(TAG, "[$level] [$source] $message")
        if (!::appContext.isInitialized) return
        val entry =
            JSONObject().apply {
                put("message", message)
                put("source", source)
                put("level", level)
                put("capturedAt", System.currentTimeMillis())
                put("platform", "android-native")
                for ((k, v) in context) put(k, v)
            }
        enqueue(entry)
    }

    fun report(
        error: Throwable,
        source: String,
        level: String = "error",
    ) {
        report(error.localizedMessage ?: error.toString(), source, level)
    }

    fun drain(): JSONArray {
        if (!::appContext.isInitialized) return JSONArray()
        val prefs = prefs()
        val raw = prefs.getString(Brand.PrefsKey.errorQueue, null) ?: return JSONArray()
        prefs.edit().remove(Brand.PrefsKey.errorQueue).apply()
        return try {
            JSONArray(raw)
        } catch (_: Exception) {
            JSONArray()
        }
    }

    private fun enqueue(entry: JSONObject) {
        val prefs = prefs()
        val raw = prefs.getString(Brand.PrefsKey.errorQueue, null)
        val arr =
            if (raw != null) {
                try {
                    JSONArray(raw)
                } catch (_: Exception) {
                    JSONArray()
                }
            } else {
                JSONArray()
            }
        arr.put(entry)
        // Cap at MAX_QUEUE — drop oldest entries
        while (arr.length() > MAX_QUEUE) {
            arr.remove(0)
        }
        prefs.edit().putString(Brand.PrefsKey.errorQueue, arr.toString()).apply()
    }

    private fun prefs(): SharedPreferences =
        appContext.getSharedPreferences(Brand.name, Context.MODE_PRIVATE)
}
