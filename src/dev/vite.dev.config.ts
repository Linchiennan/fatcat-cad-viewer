// Build of the engine test page (src/dev/engine.html) into dist-dev; the app's own config is reused as is.
import { mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import base from "../../vite.config";

export default mergeConfig(base, {
  build: {
    outDir: fileURLToPath(new URL("../../dist-dev", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: { input: { engine: fileURLToPath(new URL("./engine.html", import.meta.url)) } },
  },
});
