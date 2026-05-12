package com.resistjs.careerops;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the career-ops native plugin (Brand + ErrorReporter +
        // NetworkMonitor + future Spotlight/keychain/biometric stubs)
        // before BridgeActivity initializes the WebView. Same plugin
        // name as iOS so lib/client/native-bridge.ts works cross-platform.
        registerPlugin(CareerOpsNativePlugin.class);

        // Android 8+ (API 26) requires a NotificationChannel before any
        // notification can be shown. The Capacitor LocalNotifications
        // plugin creates a "default" channel automatically; we add
        // career-ops-specific channels here so each event class has its
        // own importance / sound / badge behaviour.
        createNotificationChannels();

        super.onCreate(savedInstanceState);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return; // pre-Oreo
        NotificationManager mgr = (NotificationManager)
            getSystemService(Context.NOTIFICATION_SERVICE);
        if (mgr == null) return;

        // Each channel maps to an event class career-ops emits. Users can
        // tweak importance per channel from Android Settings → Apps →
        // career-ops → Notifications.
        createChannel(mgr, "interview-reminders", "Interview reminders",
            "Heads-up before an upcoming interview (24h + 30min before)",
            NotificationManager.IMPORTANCE_HIGH);
        createChannel(mgr, "apply-results", "Apply results",
            "Autonomous-apply outcomes: applied, blocked, or needs manual",
            NotificationManager.IMPORTANCE_DEFAULT);
        createChannel(mgr, "issues", "Inbox issues",
            "New issues in the Inbox that need attention",
            NotificationManager.IMPORTANCE_DEFAULT);
        createChannel(mgr, "system", "System events",
            "Backup completed, autopilot status, low-priority info",
            NotificationManager.IMPORTANCE_LOW);
    }

    private void createChannel(NotificationManager mgr, String id, String name,
                               String description, int importance) {
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(description);
        mgr.createNotificationChannel(ch);
    }
}
