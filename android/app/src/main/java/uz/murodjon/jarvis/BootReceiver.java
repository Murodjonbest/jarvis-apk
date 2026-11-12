package uz.murodjon.jarvis;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Telefon qayta yoqilganda "Jarvis" tinglashni o'zi tiklaydi (agar yoqilgan bo'lsa). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (!c.getSharedPreferences("jarvis", 0).getBoolean("wake", false)) return;
        try {
            Intent i = new Intent(c, WakeService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) {}
    }
}
