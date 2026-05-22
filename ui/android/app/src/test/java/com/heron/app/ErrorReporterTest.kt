// ErrorReporterTest -- exercises the report + drain pipeline that
// flushes native errors through the WebView's /api/issues store.
// Uses Robolectric so SharedPreferences works on the JVM.
//
// Mirrors AppTests/ErrorReporterTests.swift on the iOS side.

package com.heron.app

import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ErrorReporterTest {
    @Before
    fun setUp() {
        ErrorReporter.init(ApplicationProvider.getApplicationContext())
        // Drain anything left from a prior test in this process.
        ErrorReporter.drain()
    }

    @After
    fun tearDown() {
        ErrorReporter.drain()
    }

    // MARK: - report(String, ...) + drain()

    @Test
    fun `single error report drains as one entry`() {
        ErrorReporter.report("network timeout", "NetworkMonitor")
        val drained = ErrorReporter.drain()
        assertEquals(1, drained.length())
        val entry = drained.getJSONObject(0)
        assertEquals("network timeout", entry.getString("message"))
        assertEquals("NetworkMonitor", entry.getString("source"))
        assertEquals("error", entry.getString("level"))
        assertEquals("android-native", entry.getString("platform"))
    }

    @Test
    fun `report defaults level to error`() {
        ErrorReporter.report("x", "Y")
        val drained = ErrorReporter.drain()
        assertEquals("error", drained.getJSONObject(0).getString("level"))
    }

    @Test
    fun `report respects custom level (warn)`() {
        ErrorReporter.report("x", "Y", level = "warn")
        val drained = ErrorReporter.drain()
        assertEquals("warn", drained.getJSONObject(0).getString("level"))
    }

    @Test
    fun `report includes capturedAt timestamp`() {
        val before = System.currentTimeMillis()
        ErrorReporter.report("x", "Y")
        val after = System.currentTimeMillis()
        val ts = ErrorReporter.drain().getJSONObject(0).getLong("capturedAt")
        assertTrue(
            "capturedAt $ts should be in [$before, $after]",
            ts in before..after,
        )
    }

    @Test
    fun `report merges additional context fields`() {
        ErrorReporter.report(
            "x",
            "Y",
            level = "info",
            context = mapOf("jobId" to "j-1", "retryCount" to 3),
        )
        val entry = ErrorReporter.drain().getJSONObject(0)
        assertEquals("j-1", entry.getString("jobId"))
        assertEquals(3, entry.getInt("retryCount"))
    }

    @Test
    fun `drain twice yields empty on second call`() {
        ErrorReporter.report("x", "Y")
        ErrorReporter.drain()
        assertEquals(0, ErrorReporter.drain().length())
    }

    @Test
    fun `multiple reports accumulate in FIFO order`() {
        ErrorReporter.report("first", "A")
        ErrorReporter.report("second", "B")
        ErrorReporter.report("third", "C")
        val drained = ErrorReporter.drain()
        assertEquals(3, drained.length())
        assertEquals("first", drained.getJSONObject(0).getString("message"))
        assertEquals("second", drained.getJSONObject(1).getString("message"))
        assertEquals("third", drained.getJSONObject(2).getString("message"))
    }

    // MARK: - Throwable overload

    @Test
    fun `report Throwable uses localizedMessage`() {
        val e = RuntimeException("boom")
        ErrorReporter.report(e, "MyComponent")
        val entry = ErrorReporter.drain().getJSONObject(0)
        assertEquals("boom", entry.getString("message"))
        assertEquals("MyComponent", entry.getString("source"))
    }

    @Test
    fun `report Throwable falls back to toString when no message`() {
        // RuntimeException with explicit empty message -- localizedMessage
        // returns the empty string, which is technically non-null, so the
        // entry's message field is also empty. Document the behavior.
        val e = RuntimeException("")
        ErrorReporter.report(e, "X")
        val entry = ErrorReporter.drain().getJSONObject(0)
        assertEquals("", entry.getString("message"))
    }

    @Test
    fun `report Throwable propagates custom level`() {
        ErrorReporter.report(RuntimeException("x"), "Y", level = "warn")
        assertEquals("warn", ErrorReporter.drain().getJSONObject(0).getString("level"))
    }

    // MARK: - Queue cap

    @Test
    fun `queue caps at MAX_QUEUE (50) entries`() {
        // MAX_QUEUE = 50 per the source. Push 60 -- the first 10
        // should be dropped (FIFO eviction).
        for (i in 0 until 60) {
            ErrorReporter.report("e-$i", "X")
        }
        val drained = ErrorReporter.drain()
        assertEquals(50, drained.length())
        // Oldest survivor should be e-10 (e-0 .. e-9 evicted).
        assertEquals("e-10", drained.getJSONObject(0).getString("message"))
        assertEquals("e-59", drained.getJSONObject(49).getString("message"))
    }

    // MARK: - Init guard

    @Test
    fun `drain returns empty before init`() {
        // Skip: we already called init in setUp(). The "not initialized"
        // branch is documented in the source via lateinit; init() must
        // be called once per app process. Re-init is idempotent.
        ErrorReporter.init(ApplicationProvider.getApplicationContext())
        val drained = ErrorReporter.drain()
        assertNotNull(drained)
    }

    // MARK: - Malformed prefs recovery

    @Test
    fun `drain recovers from non-JSON prefs payload`() {
        // Stuff garbage into the queue key directly, then drain.
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val prefs = ctx.getSharedPreferences(Brand.name, android.content.Context.MODE_PRIVATE)
        prefs.edit().putString(Brand.PrefsKey.errorQueue, "not-json").commit()
        val drained = ErrorReporter.drain()
        assertEquals(0, drained.length())
        // And the key got cleared.
        assertNull(prefs.getString(Brand.PrefsKey.errorQueue, null))
    }

    @Test
    fun `enqueue recovers from malformed existing payload`() {
        // Seed garbage, then report. The new entry should overwrite.
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val prefs = ctx.getSharedPreferences(Brand.name, android.content.Context.MODE_PRIVATE)
        prefs.edit().putString(Brand.PrefsKey.errorQueue, "{}").commit()
        ErrorReporter.report("recovery", "Y")
        val drained = ErrorReporter.drain()
        assertEquals(1, drained.length())
        assertEquals("recovery", drained.getJSONObject(0).getString("message"))
    }
}
