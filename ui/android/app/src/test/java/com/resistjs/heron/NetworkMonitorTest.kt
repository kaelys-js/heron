// NetworkMonitorTest -- exercises start/stop lifecycle, transition
// dedup, and SharedPreferences mirror. Uses MockK to stub
// ConnectivityManager + Context.
//
// Mirrors AppTests/NetworkMonitorTests.swift on the iOS side.

package com.resistjs.heron

import android.content.Context
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.test.core.app.ApplicationProvider
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NetworkMonitorTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        // Clear any leftover state from prior tests.
        context
            .getSharedPreferences(Brand.name, Context.MODE_PRIVATE)
            .edit()
            .remove(Brand.PrefsKey.online)
            .commit()
    }

    @After
    fun tearDown() {
        context
            .getSharedPreferences(Brand.name, Context.MODE_PRIVATE)
            .edit()
            .remove(Brand.PrefsKey.online)
            .commit()
    }

    @Test
    fun `initial isOnline defaults to true`() {
        val monitor = NetworkMonitor(context)
        assertTrue(monitor.isOnline)
    }

    @Test
    fun `start registers a NetworkCallback with the connectivity manager`() {
        // Use MockK on a Context that returns a mocked ConnectivityManager.
        // Robolectric provides a default working CM, so we just verify
        // start doesn't throw on a healthy context.
        val monitor = NetworkMonitor(context)
        var observed: Boolean? = null
        monitor.start { online -> observed = online }
        // Initial start doesn't fire onChange (no transition yet).
        assertEquals(null, observed)
        monitor.stop()
    }

    @Test
    fun `stop is safe to call before start`() {
        val monitor = NetworkMonitor(context)
        // Should NOT throw.
        monitor.stop()
        assertTrue(monitor.isOnline) // initial state unchanged
    }

    @Test
    fun `stop after start clears callback`() {
        val monitor = NetworkMonitor(context)
        monitor.start { }
        monitor.stop()
        // Calling stop again should be a no-op (no callback to unregister).
        monitor.stop()
    }

    @Test
    fun `transition deduplication via stubbed callback`() {
        // Build a NetworkMonitor with a mocked Context that returns a
        // mocked ConnectivityManager. The mocked CM lets us drive the
        // callback directly without a real network.
        val mockCtx = mockk<Context>(relaxed = true)
        val mockCM = mockk<ConnectivityManager>(relaxed = true)
        val mockPrefs = mockk<SharedPreferences>(relaxed = true)
        val mockEditor = mockk<SharedPreferences.Editor>(relaxed = true)
        every { mockCtx.getSystemService(Context.CONNECTIVITY_SERVICE) } returns mockCM
        every { mockCtx.applicationContext } returns mockCtx
        every { mockCtx.getSharedPreferences(any(), any()) } returns mockPrefs
        every { mockPrefs.edit() } returns mockEditor
        every { mockEditor.putBoolean(any(), any()) } returns mockEditor

        // Capture the callback the monitor registers.
        val capturedCb = slot<ConnectivityManager.NetworkCallback>()
        every { mockCM.registerNetworkCallback(any<NetworkRequest>(), capture(capturedCb)) } returns
            Unit

        val monitor = NetworkMonitor(mockCtx)
        var transitions = mutableListOf<Boolean>()
        monitor.start { online -> transitions.add(online) }

        // The captured callback is the inner object NetworkMonitor created.
        val cb = capturedCb.captured
        val net = mockk<Network>(relaxed = true)

        // initial isOnline = true. onLost should flip to false (1 transition).
        cb.onLost(net)
        assertEquals(listOf(false), transitions)
        assertFalse(monitor.isOnline)

        // onLost again -- no new transition.
        cb.onLost(net)
        assertEquals(listOf(false), transitions)

        // onAvailable flips back to true.
        cb.onAvailable(net)
        assertEquals(listOf(false, true), transitions)

        // onAvailable again -- no transition.
        cb.onAvailable(net)
        assertEquals(listOf(false, true), transitions)

        monitor.stop()
    }

    @Test
    fun `transition writes to SharedPreferences`() {
        val mockCtx = mockk<Context>(relaxed = true)
        val mockCM = mockk<ConnectivityManager>(relaxed = true)
        val mockPrefs = mockk<SharedPreferences>(relaxed = true)
        val mockEditor = mockk<SharedPreferences.Editor>(relaxed = true)
        every { mockCtx.getSystemService(Context.CONNECTIVITY_SERVICE) } returns mockCM
        every { mockCtx.applicationContext } returns mockCtx
        every { mockCtx.getSharedPreferences(Brand.name, Context.MODE_PRIVATE) } returns mockPrefs
        every { mockPrefs.edit() } returns mockEditor
        every { mockEditor.putBoolean(any(), any()) } returns mockEditor

        val capturedCb = slot<ConnectivityManager.NetworkCallback>()
        every { mockCM.registerNetworkCallback(any<NetworkRequest>(), capture(capturedCb)) } returns
            Unit

        val monitor = NetworkMonitor(mockCtx)
        monitor.start { }

        capturedCb.captured.onLost(mockk(relaxed = true))

        verify { mockEditor.putBoolean(Brand.PrefsKey.online, false) }
        verify { mockEditor.apply() }
        monitor.stop()
    }

    @Test
    fun `onCapabilitiesChanged reflects VALIDATED capability`() {
        val mockCtx = mockk<Context>(relaxed = true)
        val mockCM = mockk<ConnectivityManager>(relaxed = true)
        val mockPrefs = mockk<SharedPreferences>(relaxed = true)
        val mockEditor = mockk<SharedPreferences.Editor>(relaxed = true)
        every { mockCtx.getSystemService(Context.CONNECTIVITY_SERVICE) } returns mockCM
        every { mockCtx.applicationContext } returns mockCtx
        every { mockCtx.getSharedPreferences(any(), any()) } returns mockPrefs
        every { mockPrefs.edit() } returns mockEditor
        every { mockEditor.putBoolean(any(), any()) } returns mockEditor

        val capturedCb = slot<ConnectivityManager.NetworkCallback>()
        every { mockCM.registerNetworkCallback(any<NetworkRequest>(), capture(capturedCb)) } returns
            Unit

        val monitor = NetworkMonitor(mockCtx)
        var transitions = mutableListOf<Boolean>()
        monitor.start { online -> transitions.add(online) }

        // Caps WITH VALIDATED: stays online (no transition since initial=true).
        val caps = mockk<NetworkCapabilities>(relaxed = true)
        every { caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) } returns true
        capturedCb.captured.onCapabilitiesChanged(mockk(relaxed = true), caps)
        assertEquals(emptyList<Boolean>(), transitions)

        // Caps WITHOUT VALIDATED: transitions to offline.
        val capsNoValid = mockk<NetworkCapabilities>(relaxed = true)
        every { capsNoValid.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) } returns
            false
        capturedCb.captured.onCapabilitiesChanged(mockk(relaxed = true), capsNoValid)
        assertEquals(listOf(false), transitions)

        monitor.stop()
    }

    @Test
    fun `SecurityException during registration goes to ErrorReporter`() {
        val mockCtx = mockk<Context>(relaxed = true)
        val mockCM = mockk<ConnectivityManager>(relaxed = true)
        val mockPrefs = mockk<SharedPreferences>(relaxed = true)
        val mockEditor = mockk<SharedPreferences.Editor>(relaxed = true)
        every { mockCtx.getSystemService(Context.CONNECTIVITY_SERVICE) } returns mockCM
        every { mockCtx.applicationContext } returns mockCtx
        every { mockCtx.getSharedPreferences(any(), any()) } returns mockPrefs
        every { mockPrefs.edit() } returns mockEditor
        every { mockEditor.putBoolean(any(), any()) } returns mockEditor
        every { mockEditor.putString(any(), any()) } returns mockEditor

        every {
            mockCM.registerNetworkCallback(
                any<NetworkRequest>(),
                any<ConnectivityManager.NetworkCallback>(),
            )
        } throws SecurityException("permission denied")

        ErrorReporter.init(mockCtx)
        // Should NOT throw -- the exception is caught + reported.
        val monitor = NetworkMonitor(mockCtx)
        monitor.start { }
    }
}

// MockK slot helper -- compatible with the io.mockk API.
private inline fun <reified T : Any> slot(): io.mockk.CapturingSlot<T> = io.mockk.slot()
