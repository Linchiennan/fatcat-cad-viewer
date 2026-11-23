package tw.dafeimao.cadviewer;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets a phone turn sideways while the camera is open (用戶 2026-11-23：「進到拍照模式下，支援螢幕橫向自動轉向」), and
 * puts it back upright after: phones are otherwise portrait (manifest + MainActivity), tablets always turn freely.
 * Web side: src/native/screenRotation.ts.
 */
@CapacitorPlugin(name = "ScreenRotation")
public class ScreenRotationPlugin extends Plugin {

    @PluginMethod
    public void allow(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        boolean tablet = activity.getResources().getConfiguration().smallestScreenWidthDp >= 600;
        int mode = on || tablet ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        activity.runOnUiThread(() -> {
            activity.setRequestedOrientation(mode);
            call.resolve();
        });
    }
}
