package uz.murodjon.jarvis;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LoopbackPlugin.class);
        registerPlugin(WakePlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (bridge != null && bridge.getWebView() != null) bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        handleWake(getIntent(), 2500);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWake(intent, 400);
    }

    private void handleWake(Intent i, long delay) {
        if (i == null || !i.getBooleanExtra("jarvis_wake", false)) return;
        i.removeExtra("jarvis_wake");
        // qulflangan ekran ustida ham ochilsin
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        if (bridge != null && bridge.getWebView() != null)
            bridge.getWebView().postDelayed(() -> bridge.getWebView().evaluateJavascript("window.onNativeWake&&window.onNativeWake()", null), delay);
    }

    @Override
    public void onResume() {
        super.onResume();
        WakeService.setAppVisible(true);
    }

    @Override
    public void onPause() {
        WakeService.setAppVisible(false);
        super.onPause();
    }
}
