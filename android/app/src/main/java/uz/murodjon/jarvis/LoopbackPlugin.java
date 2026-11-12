package uz.murodjon.jarvis;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/** Google bilan kirish uchun: 127.0.0.1 da vaqtinchalik server ochib, Google qaytargan kodni ushlaydi. */
@CapacitorPlugin(name = "Loopback")
public class LoopbackPlugin extends Plugin {
    private ServerSocket server;
    private PluginCall waiting;
    private String received;

    @PluginMethod
    public void start(PluginCall call) {
        try {
            stopServer();
            received = null;
            server = new ServerSocket(0, 5, InetAddress.getByName("127.0.0.1"));
            final ServerSocket s = server;
            new Thread(() -> serve(s)).start();
            JSObject r = new JSObject();
            r.put("port", s.getLocalPort());
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    private void serve(ServerSocket s) {
        try {
            while (!s.isClosed()) {
                Socket c = s.accept();
                BufferedReader in = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8));
                String line = in.readLine();
                String q = "";
                if (line != null) {
                    String[] p = line.split(" ");
                    if (p.length > 1 && p[1].contains("?")) q = p[1].substring(p[1].indexOf('?') + 1);
                }
                boolean got = q.contains("code=") || q.contains("error=");
                String html = "<html><head><meta name=viewport content='width=device-width'></head><body style='font-family:sans-serif;background:#03080f;color:#8be9ff;text-align:center;padding-top:80px'><h2>JARVIS: Google ulandi ✓</h2><p>Jarvis ilovasiga qayting.</p></body></html>";
                byte[] b = html.getBytes(StandardCharsets.UTF_8);
                OutputStream o = c.getOutputStream();
                o.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                o.write(b);
                o.flush();
                c.close();
                if (got) {
                    deliver(q);
                    stopServer();
                    bringToFront();
                    return;
                }
            }
        } catch (Exception ignored) {
        }
    }

    private synchronized void deliver(String q) {
        received = q;
        if (waiting != null) {
            JSObject r = new JSObject();
            r.put("query", q);
            waiting.resolve(r);
            waiting = null;
        }
    }

    private void bringToFront() {
        try {
            Intent i = new Intent(getContext(), MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            getContext().startActivity(i);
        } catch (Exception ignored) {
        }
    }

    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    public synchronized void waitCode(PluginCall call) {
        if (received != null) {
            JSObject r = new JSObject();
            r.put("query", received);
            received = null;
            call.resolve(r);
            return;
        }
        call.setKeepAlive(true);
        waiting = call;
    }

    private void stopServer() {
        try {
            if (server != null) server.close();
        } catch (Exception ignored) {
        }
        server = null;
    }
}
