package tw.dafeimao.cadviewer;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/** App shell (T21 3.3): plugins, splash screen, edge-to-edge system bars with native insets. */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        // Plugins must be registered before the bridge is created in super.onCreate.
        registerPlugin(IncomingDrawingPlugin.class);
        registerPlugin(FileHandoffPlugin.class);
        registerPlugin(ScreenRotationPlugin.class);
        // The manifest locks portrait, which phones keep (用戶 2026-11-15：手機橫向超難用，只有電腦與平板可橫向).
        // A tablet (smallest width 600 dp or more) may turn freely.
        if (getResources().getConfiguration().smallestScreenWidthDp >= 600) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
        }
        super.onCreate(savedInstanceState);
        applySystemBars();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // Keep the newest file as the current intent so a recreated Activity sees it, then forward to plugins.
        setIntent(intent);
        super.onNewIntent(intent);
    }

    /** The web UI is always dark: transparent bars with light icons, content inset by bars, cutout and keyboard. */
    @SuppressWarnings("deprecation")
    private void applySystemBars() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        if (bridge == null || bridge.getWebView() == null) return;
        View container = (View) bridge.getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(container);
    }
}
