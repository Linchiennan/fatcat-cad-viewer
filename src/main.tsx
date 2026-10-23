import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/translations";
// Build-time branch removes Firebase entirely from ordinary/native bundles.
const Entry = import.meta.env.VITE_FATCAT_WEB === '1'
  ? lazy(() => import('./auth/WebEntry'))
  : lazy(() => import('./app/App').then(m => ({ default: m.App })));
import { ErrorBoundary } from "./components/ErrorBoundary";
import { IS_WEB_BUILD } from "./app/platform";
import { installDiagnosticHandlers } from "./viewer/parseAudit";
import "./components/app.css";

installDiagnosticHandlers();

// Bundled Noto Sans CJK TC under our own family name (T10 2.1-2); loaded relative to the page so the same
// build works from the Android WebView and any web folder. Fallback: system sans-serif.
if (typeof FontFace !== "undefined" && document.fonts) {
  document.fonts.add(new FontFace("FatCat Sans", "url(./fonts/NotoSansCJKtc-Regular.otf)", { display: "swap", weight: "100 900" }));
}

// Web build only: offline cache from the service worker next to index.html (T10 6.1-2). The APK never registers it.
if (IS_WEB_BUILD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" }).then(registration => registration.update()).catch(() => { /* Access still requires the server; caching is optional. */ });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <Suspense fallback={<p role="status">正在載入 / Loading…</p>}><Entry /></Suspense>
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
