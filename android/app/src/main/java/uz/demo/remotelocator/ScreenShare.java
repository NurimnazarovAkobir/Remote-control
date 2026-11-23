package uz.demo.remotelocator;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Rozilikka asoslangan ekran ulashish plagini.
 *
 * start() -> Android majburiy "ekranni yozib olish?" ruxsat oynasini ko'rsatadi.
 * Foydalanuvchi rozi bo'lsa, ScreenCaptureService ishga tushadi (doimiy bildirishnoma bilan)
 * va ekran kadrlarini JPEG sifatida "frame" hodisasi orqali JS'ga yuboradi.
 *
 * Yashirin rejim yo'q: tizim ruxsat oynasi va doimiy bildirishnoma hamisha ko'rinadi.
 */
@CapacitorPlugin(name = "ScreenShare")
public class ScreenShare extends Plugin {

    private static ScreenShare instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void start(PluginCall call) {
        MediaProjectionManager mpm =
            (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mpm == null) {
            call.reject("MediaProjection mavjud emas");
            return;
        }
        Intent intent = mpm.createScreenCaptureIntent();
        startActivityForResult(call, intent, "projectionResult");
    }

    @ActivityCallback
    private void projectionResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Ekran ulashishga ruxsat berilmadi");
            return;
        }

        Intent svc = new Intent(getContext(), ScreenCaptureService.class);
        svc.putExtra("resultCode", result.getResultCode());
        svc.putExtra("data", result.getData());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(svc);
        } else {
            getContext().startService(svc);
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ScreenCaptureService.class));
        call.resolve();
    }

    /** ScreenCaptureService shu metod orqali kadrlarni JS'ga uzatadi. */
    static void deliverFrame(final String base64DataUrl) {
        final ScreenShare p = instance;
        if (p == null || p.getActivity() == null) {
            return;
        }
        p.getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                JSObject data = new JSObject();
                data.put("data", base64DataUrl);
                p.notifyListeners("frame", data);
            }
        });
    }
}
