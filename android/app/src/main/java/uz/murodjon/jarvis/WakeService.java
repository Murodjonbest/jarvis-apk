package uz.murodjon.jarvis;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

/**
 * Ekran o'chiq yoki ilova yopiq bo'lsa ham "Jarvis" so'zini telefon ichida (internetsiz, Vosk) tinglaydi.
 * So'z eshitilganda Jarvis'ni ekranga chiqaradi va buyruqni tinglashni boshlaydi.
 */
public class WakeService extends Service implements RecognitionListener {
    static final String TAG = "JarvisWake";
    static final String CH = "jarvis_wake";
    static volatile boolean running = false;
    static volatile boolean appVisible = false;
    static volatile String lastError = "";
    static volatile long lastHit = 0;
    static WakeService self;

    private Model model;
    private SpeechService speech;
    private PowerManager.WakeLock cpu;

    @Override
    public void onCreate() {
        super.onCreate();
        self = this;
        running = true;
        startFg();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        cpu = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jarvis:wake");
        cpu.setReferenceCounted(false);
        cpu.acquire();
        StorageService.unpack(this, "vosk-model", "model", m -> {
            model = m;
            startListening();
        }, e -> {
            lastError = "Model yuklanmadi: " + e.getMessage();
            Log.e(TAG, lastError);
        });
    }

    private void startFg() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CH, "Jarvis tinglash", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("\"Jarvis\" so'zini kutish");
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
            NotificationChannel c2 = new NotificationChannel(CH + "_hit", "Jarvis chaqirildi", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(c2);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop = new Intent(this, WakeService.class).setAction("STOP");
        PendingIntent ps = PendingIntent.getService(this, 2, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setContentTitle("JARVIS tinglayapti")
            .setContentText("\"Jarvis\" deng — ekran o'chiq bo'lsa ham eshitaman")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(pi)
            .addAction(new Notification.Action.Builder(null, "To'xtatish", ps).build());
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 30) startForeground(77, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(77, n);
    }

    private void startListening() {
        try {
            if (speech != null) { speech.stop(); speech.shutdown(); }
            Recognizer rec = new Recognizer(model, 16000.0f, "[\"jarvis\", \"hey jarvis\", \"[unk]\"]");
            speech = new SpeechService(rec, 16000.0f);
            speech.startListening(this);
            speech.setPause(appVisible);
            lastError = "";
        } catch (Exception e) {
            lastError = "Mikrofon ochilmadi: " + e.getMessage();
            Log.e(TAG, lastError);
        }
    }

    /** Ilova ekranda bo'lsa — mikrofonni ilovaning o'ziga bo'shatamiz. */
    static void setAppVisible(boolean v) {
        appVisible = v;
        WakeService s = self;
        if (s != null && s.speech != null) {
            try { s.speech.setPause(v); } catch (Exception ignored) {}
        }
    }

    private void check(String json, String field) {
        try {
            String t = new JSONObject(json).optString(field, "");
            if (t.contains("jarvis")) hit();
        } catch (Exception ignored) {}
    }

    private void hit() {
        long now = System.currentTimeMillis();
        if (now - lastHit < 4000 || appVisible) return;
        lastHit = now;
        try { if (speech != null) speech.setPause(true); } catch (Exception ignored) {}
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        @SuppressWarnings("deprecation")
        PowerManager.WakeLock screen = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "jarvis:screen");
        screen.acquire(8000);
        Intent i = new Intent(this, MainActivity.class).putExtra("jarvis_wake", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try { startActivity(i); } catch (Exception e) { Log.e(TAG, "activity: " + e.getMessage()); }
        // zaxira: to'liq ekranli bildirishnoma (fon cheklovi bo'lsa)
        try {
            PendingIntent pi = PendingIntent.getActivity(this, 3, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH + "_hit") : new Notification.Builder(this);
            b.setContentTitle("JARVIS").setContentText("Eshitaman, ser…").setSmallIcon(R.mipmap.ic_launcher)
                .setCategory(Notification.CATEGORY_CALL).setAutoCancel(true)
                .setFullScreenIntent(pi, true).setContentIntent(pi);
            if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(6000);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(78, b.build());
        } catch (Exception ignored) {}
    }

    @Override public void onPartialResult(String h) { check(h, "partial"); }
    @Override public void onResult(String h) { check(h, "text"); }
    @Override public void onFinalResult(String h) { check(h, "text"); }
    @Override public void onError(Exception e) { lastError = e.getMessage(); startListening(); }
    @Override public void onTimeout() { startListening(); }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            getSharedPreferences("jarvis", MODE_PRIVATE).edit().putBoolean("wake", false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        self = null;
        try { if (speech != null) { speech.stop(); speech.shutdown(); } } catch (Exception ignored) {}
        try { if (cpu != null && cpu.isHeld()) cpu.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
