import type { CapacitorConfig } from "@capacitor/cli";

// T21 3.2-7. The server origin is left at Capacitor's default (https://localhost): the drawing library and
// every other IndexedDB / localStorage record belongs to that origin, so changing it would hide them.
const config: CapacitorConfig = {
  appId: "tw.dafeimao.cadviewer",
  appName: "大肥貓CAD看圖",
  webDir: "dist",
  android: {
    minWebViewVersion: 64,
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // Dark style (light icons), bars shown; insets are applied natively by MainActivity, not in CSS.
    SystemBars: { style: "DARK", hidden: false, insetsHandling: "disable" },
  },
};

export default config;
