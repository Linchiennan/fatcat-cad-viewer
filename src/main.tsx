import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/translations";
import { Capacitor } from '@capacitor/core';
import { shouldHostPreview } from './app/devicePreview';
const previewHost = shouldHostPreview(Capacitor.isNativePlatform());
// The desktop parent hosts only the selector. Its single persistent child runs the original entry.
// Build-time branch removes Firebase entirely from ordinary/native bundles.
const Entry = previewHost
  ? lazy(() => import('./app/DevicePreviewHost'))
  : import.meta.env.VITE_FATCAT_WEB === '1'
  ? lazy(() => import('./auth/WebEntry'))
  : lazy(() => import('./app/App').then(m => ({ default: m.App })));
import { ErrorBoundary } from "./components/ErrorBoundary";
import { IS_WEB_BUILD } from "./app/platform";
import { installDiagnosticHandlers } from "./viewer/parseAudit";
import "./components/app.css";
import "./components/ui3d.css";
import { applyUiStyle, readUiStyle, UiStyleDefs } from "./app/uiStyle";
import { IS_GUEST } from "./auth/guestMode";

// the saved interface style before the first paint, so the page never shows flat for a frame
applyUiStyle(readUiStyle());

// Bundled Noto Sans CJK TC under our own family name (T10 2.1-2); loaded relative to the page so the same
// build works from the Android WebView and any web folder. Fallback: system sans-serif.
if (typeof FontFace !== "undefined" && document.fonts) {
  document.fonts.add(new FontFace("FatCat Sans", "url(./fonts/NotoSansCJKtc-Regular.otf)", { display: "swap", weight: "100 900" }));
}

// Web build only: offline cache from the service worker next to index.html (T10 6.1-2). The APK never registers it.
if (!previewHost && IS_WEB_BUILD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" }).then(registration => registration.update()).catch(() => { /* Online use remains possible; the gate reports offline resources as not ready. */ });
  });
}

async function start() {
  // 訪客試用：記憶體儲存要在任何資料庫打開之前換上，示範圖放進那個空圖庫後才開畫面。
  if (IS_GUEST && !previewHost) {
    const guest = await import("./auth/guestStorage");
    guest.installGuestStorage();
    await guest.seedDemoLibrary();
  }
  installDiagnosticHandlers();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <I18nProvider>
        <ErrorBoundary>
          <UiStyleDefs />
          <Suspense fallback={<p role="status">正在載入 / Loading…</p>}><Entry /></Suspense>
        </ErrorBoundary>
      </I18nProvider>
    </StrictMode>,
  );
}
void start();
