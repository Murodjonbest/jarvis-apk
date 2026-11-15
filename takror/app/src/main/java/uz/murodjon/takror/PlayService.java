package uz.murodjon.takror;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Ijro paytida ilova fonda o'chirib qo'yilmasligi uchun oldingi rejim xizmati. */
public class PlayService extends Service {
    private static final String CH = "takror";
    private PowerManager.WakeLock lock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra("title") : null;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm.getNotificationChannel(CH) == null) {
                nm.createNotificationChannel(new NotificationChannel(CH, "Ijro", NotificationManager.IMPORTANCE_LOW));
            }
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        Notification n = nb.setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("🔁 Takror ijro etmoqda")
                .setContentText(title == null || title.isEmpty() ? "Audio qayta-qayta o'qilmoqda" : title)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, n);
        if (lock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "takror:play");
            lock.setReferenceCounted(false);
        }
        lock.acquire(3 * 60 * 60 * 1000L);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (lock != null && lock.isHeld()) lock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) { return null; }
}
