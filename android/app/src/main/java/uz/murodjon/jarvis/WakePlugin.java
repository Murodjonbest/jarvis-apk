package uz.murodjon.jarvis;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Wake")
public class WakePlugin extends Plugin {
    static WakePlugin instance;

    @Override
    public void load() { instance = this; }

    @PluginMethod
    public void setBusy(PluginCall call) { WakeService.setBusy(call.getBoolean("busy", false)); call.resolve(); }

    /** Xiaomi, Huawei, Oppo, Vivo, Samsung — fonda ishlashga ruxsat (avtoishga tushish) oynasi */
    @PluginMethod
    public void askAutostart(PluginCall call) {
        String[][] c = {
            {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
            {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
            {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
            {"com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"},
            {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"}
        };
        for (String[] x : c) {
            try {
                Intent i = new Intent().setComponent(new android.content.ComponentName(x[0], x[1])).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i); JSObject r = new JSObject(); r.put("opened", x[0]); call.resolve(r); return;
            } catch (Exception ignored) {}
        }
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        JSObject r = new JSObject(); r.put("opened", "app"); call.resolve(r);
    }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("running", WakeService.running);
        r.put("error", WakeService.lastError);
        r.put("enabled", getContext().getSharedPreferences("jarvis", 0).getBoolean("wake", false));
        r.put("mic", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
        r.put("overlay", Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext()));
        PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        r.put("battery", Build.VERSION.SDK_INT < 23 || pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        r.put("notif", Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(), "android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED);
        return r;
    }

    @PluginMethod public void status(PluginCall call) { call.resolve(state()); }

    @PluginMethod
    public void start(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.RECORD_AUDIO}, 41);
            call.reject("Avval mikrofonga ruxsat bering va qayta bosing");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{"android.permission.POST_NOTIFICATIONS"}, 42);
        }
        getContext().getSharedPreferences("jarvis", 0).edit().putBoolean("wake", true).apply();
        Intent i = new Intent(getContext(), WakeService.class);
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i); else getContext().startService(i);
        call.resolve(state());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().getSharedPreferences("jarvis", 0).edit().putBoolean("wake", false).apply();
        getContext().stopService(new Intent(getContext(), WakeService.class));
        call.resolve(state());
    }

    @PluginMethod
    public void askOverlay(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(getContext())) {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve(state());
    }

    @PluginMethod
    public void askBattery(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            getContext().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve(state());
    }

    @PluginMethod
    public void appSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    void fireWake() { notifyListeners("wake", new JSObject()); }
}
