package uz.demo.remotelocator;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import androidx.annotation.Nullable;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/**
 * Foreground service: ekranni MediaProjection orqali oladi, kichraytirib JPEG qiladi,
 * va ScreenShare.deliverFrame() orqali JS'ga uzatadi. Doimiy bildirishnoma ko'rsatadi.
 */
public class ScreenCaptureService extends Service {

    private static final String CHANNEL_ID = "screen_share";
    private static final int NOTIF_ID = 4711;
    private static final int MAX_WIDTH = 540;      // kichraytirish (trafik/tezlik uchun)
    private static final long MIN_INTERVAL_MS = 400; // ~2.5 kadr/soniya

    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread thread;
    private Handler handler;
    private long lastFrameAt = 0;
    private int width;
    private int height;
    private int density;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();
        startForegroundCompat();

        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        int resultCode = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED);
        Intent data;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            data = intent.getParcelableExtra("data", Intent.class);
        } else {
            data = intent.getParcelableExtra("data");
        }
        if (data == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        MediaProjectionManager mpm =
            (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        projection = mpm.getMediaProjection(resultCode, data);
        if (projection == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                cleanup();
                stopSelf();
            }
        }, null);

        setupCapture();
        return START_NOT_STICKY;
    }

    private void setupCapture() {
        DisplayMetrics metrics = new DisplayMetrics();
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        wm.getDefaultDisplay().getRealMetrics(metrics);
        density = metrics.densityDpi;

        float scale = Math.min(1f, (float) MAX_WIDTH / metrics.widthPixels);
        width = Math.max(2, Math.round(metrics.widthPixels * scale));
        height = Math.max(2, Math.round(metrics.heightPixels * scale));
        // Juft qiymat (ba'zi enkoderlar uchun qulay)
        width = width - (width % 2);
        height = height - (height % 2);

        thread = new HandlerThread("screencap");
        thread.start();
        handler = new Handler(thread.getLooper());

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        imageReader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
            @Override
            public void onImageAvailable(ImageReader reader) {
                processImage(reader);
            }
        }, handler);

        virtualDisplay = projection.createVirtualDisplay(
            "screencap", width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(), null, handler);
    }

    private void processImage(ImageReader reader) {
        Image image = null;
        Bitmap bitmap = null;
        Bitmap cropped = null;
        try {
            image = reader.acquireLatestImage();
            if (image == null) {
                return;
            }
            long now = System.currentTimeMillis();
            if (now - lastFrameAt < MIN_INTERVAL_MS) {
                return;
            }
            lastFrameAt = now;

            Image.Plane[] planes = image.getPlanes();
            if (planes == null || planes.length == 0) {
                return;
            }
            ByteBuffer buffer = planes[0].getBuffer();
            if (buffer == null) {
                return;
            }
            buffer.rewind();

            int pixelStride = planes[0].getPixelStride();
            int rowStride = planes[0].getRowStride();
            int rowPadding = rowStride - pixelStride * width;
            int bmpWidth = width + (pixelStride > 0 ? rowPadding / pixelStride : 0);

            bitmap = Bitmap.createBitmap(bmpWidth, height, Bitmap.Config.ARGB_8888);
            bitmap.copyPixelsFromBuffer(buffer);
            cropped = (rowPadding == 0) ? bitmap : Bitmap.createBitmap(bitmap, 0, 0, width, height);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            cropped.compress(Bitmap.CompressFormat.JPEG, 40, baos);
            String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            ScreenShare.deliverFrame("data:image/jpeg;base64," + b64);
        } catch (Exception ignored) {
            // bitta kadr xatosi — jim o'tamiz
        } finally {
            if (cropped != null && cropped != bitmap) {
                cropped.recycle();
            }
            if (bitmap != null) {
                bitmap.recycle();
            }
            if (image != null) {
                image.close();
            }
        }
    }

    private void startForegroundCompat() {
        Notification n;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            n = new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Masofaviy Lokator — ekran ulashilmoqda")
                .setContentText("Ekraningiz real vaqtda ko'rsatilmoqda. To'xtatish uchun ilovani oching.")
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setOngoing(true)
                .build();
        } else {
            n = new Notification.Builder(this)
                .setContentTitle("Masofaviy Lokator — ekran ulashilmoqda")
                .setContentText("Ekraningiz real vaqtda ko'rsatilmoqda. To'xtatish uchun ilovani oching.")
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setOngoing(true)
                .build();
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Ekran ulashish", NotificationManager.IMPORTANCE_LOW);
            if (nm != null) {
                nm.createNotificationChannel(ch);
            }
        }
    }

    private void cleanup() {
        try { if (virtualDisplay != null) virtualDisplay.release(); } catch (Exception ignored) {}
        try { if (imageReader != null) imageReader.close(); } catch (Exception ignored) {}
        try { if (projection != null) projection.stop(); } catch (Exception ignored) {}
        try { if (thread != null) thread.quitSafely(); } catch (Exception ignored) {}
        virtualDisplay = null;
        imageReader = null;
        projection = null;
        thread = null;
    }

    @Override
    public void onDestroy() {
        cleanup();
        super.onDestroy();
    }
}
