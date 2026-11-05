// Census tools (010-BUG檢查/工具) import App modules straight into the page; Vite then pre-bundles deep dxf-viewer
// imports that the App only loads in its worker, which broke the App's own dev server (DefaultOptions undefined).
// They run on their own server with their own dependency cache: node node_modules/vite/bin/vite.js --config vite.census.config.ts --port 5198
import base from "./vite.config";
export default { ...base, cacheDir: "node_modules/.vite-census" };
