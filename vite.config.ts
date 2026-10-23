import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Relative asset paths so the same build runs from the Android WebView (file-like origin) and any web folder.
export default defineConfig({
  base: process.env.VITE_FATCAT_WEB === "1" ? "/fatcat-cad-viewer/" : "./",
  plugins: [react()],
  resolve: {
    alias: [
      // @mlightcad/libredwg-web's wrapper imports its own wasm loader; the DWG worker loads the runtime from
      // public/runtime itself, so point that import at our stub and keep the 10 MB wasm out of the bundle (T13 4.5-7).
      { find: /^\.\.\/wasm\/libredwg-web\.js$/, replacement: fileURLToPath(new URL("./src/dwg/libredwgModuleStub.ts", import.meta.url)) },
    ],
  },
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 4000,
    rollupOptions: { input: process.env.VITE_FATCAT_WEB === '1' ? { app: 'index.html', usage: 'usage.html' } : 'index.html' },
  },
  // dxf-viewer sources import some files without extensions: let Vite resolve them in tests.
  // Tests run in Node by default; a test that needs a DOM opts in with a first-line comment
  // `// @vitest-environment jsdom` (jsdom is a devDependency).
  test: { environment: "node", server: { deps: { inline: ["dxf-viewer"] } } },
});
