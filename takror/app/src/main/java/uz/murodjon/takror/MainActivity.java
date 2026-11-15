package uz.murodjon.takror;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Takror — audioni qayta-qayta tinglash. UI: assets/index.html (WebView). */
public class MainActivity extends Activity {
    private static final int PICK = 41;
    private WebView web;
    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#03080F"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("audio/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(i, "Audio tanlang"), PICK);
                } catch (Exception e) {
                    pending = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Takror");
        // Android 15: tizim panellari ostiga tushib qolmaslik uchun chekka bo'shliqlar
        web.setOnApplyWindowInsetsListener((v, in) -> {
            int t, bt, l, r;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets x = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                t = x.top; bt = x.bottom; l = x.left; r = x.right;
            } else {
                t = in.getSystemWindowInsetTop(); bt = in.getSystemWindowInsetBottom();
                l = in.getSystemWindowInsetLeft(); r = in.getSystemWindowInsetRight();
            }
            v.setPadding(l, t, r, bt);
            return in;
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != PICK || pending == null) return;
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            ClipData c = data.getClipData();
            if (c != null && c.getItemCount() > 0) {
                out = new Uri[c.getItemCount()];
                for (int i = 0; i < c.getItemCount(); i++) out[i] = c.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                out = new Uri[]{data.getData()};
            }
        }
        pending.onReceiveValue(out);
        pending = null;
    }

    /* Ekran o'chganda ham ijro davom etsin: WebView'ni pauza qilmaymiz. */
    @Override
    protected void onPause() { super.onPause(); }

    @Override
    public void onBackPressed() { moveTaskToBack(true); }

    @Override
    protected void onDestroy() {
        stopService(new Intent(this, PlayService.class));
        if (web != null) web.destroy();
        super.onDestroy();
    }

    class Bridge {
        @JavascriptInterface
        public void playing(boolean on, String title) {
            Intent i = new Intent(MainActivity.this, PlayService.class);
            if (on) {
                i.putExtra("title", title == null ? "" : title);
                try {
                    if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
                } catch (Exception ignored) { }
            } else {
                stopService(i);
            }
        }
    }
}
