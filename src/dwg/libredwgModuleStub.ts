// @mlightcad/libredwg-web's wrapper imports its own wasm loader, which makes Vite bundle and
// precache the 10 MB wasm a second time. The DWG worker already loads the runtime from public/runtime
// and hands it to LibreDwg.createByWasmInstance, so the wrapper's loader is never called.
export default function createModule(): never {
  throw Error("LibreDWG runtime is loaded by the DWG worker");
}
