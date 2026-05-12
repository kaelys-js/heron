package com.resistjs.careerops;

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
        super.onCreate(savedInstanceState);
    }
}
