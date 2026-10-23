// DWG conversion worker ("fatcat-dwg-converter"). One worker per conversion; the main thread
// terminates it when done, which is how the wasm memory is released (T13 4.1).
import { convertDwgBytes, DwgFailure, type EngineFactory } from "./dwgEngine";
import { looksLikeMemory } from "./dwgDiagnostics";

export type DwgRequest = { id: number; bytes: ArrayBuffer; base: string };
export type DwgReply =
  | { id: number; ok: true; dxf: ArrayBuffer; savedView: unknown; diagnostics: number; fallback: string | null }
  | { id: number; ok: false; code: string; message: string; engineError?: number };

type Scope = { onmessage: ((event: MessageEvent<DwgRequest>) => void) | null; postMessage(message: DwgReply, transfer?: Transferable[]): void };
const scope = self as unknown as Scope;

/** Loads public/runtime/libredwg/libredwg-web.js; every call makes a new engine instance. */
function engineFactory(base: string): EngineFactory {
  const folder = new URL("runtime/libredwg/", base).href;
  let factory: Promise<(options: object) => Promise<unknown>> | null = null;
  return async (hooks) => {
    factory ??= import(/* @vite-ignore */ folder + "libredwg-web.js").then((m) => {
      const create = m.default ?? m.createModule;
      if (typeof create !== "function") throw new DwgFailure("DWG_RUNTIME_MISSING", "The DWG runtime has no module factory.");
      return create;
    });
    let create: (options: object) => Promise<unknown>;
    try { create = await factory; } catch (error) {
      if (error instanceof DwgFailure) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new DwgFailure(looksLikeMemory(message) ? "DWG_MEMORY_LIMIT" : "DWG_RUNTIME_MISSING", "DWG runtime import failed: " + message);
    }
    return create({ locateFile: (path: string) => folder + path, print: hooks.print, printErr: hooks.printErr });
  };
}

scope.onmessage = async (event) => {
  const { id, bytes, base } = event.data;
  try {
    const result = await convertDwgBytes(new Uint8Array(bytes), engineFactory(base));
    const dxf = result.dxf.byteOffset === 0 && result.dxf.byteLength === result.dxf.buffer.byteLength
      ? (result.dxf.buffer as ArrayBuffer) : (result.dxf.slice().buffer as ArrayBuffer);
    scope.postMessage({ id, ok: true, dxf, savedView: result.savedView, diagnostics: result.diagnostics, fallback: result.fallback }, [dxf]);
  } catch (error) {
    if (error instanceof DwgFailure) scope.postMessage({ id, ok: false, code: error.code, message: error.message, engineError: error.engineError });
    else scope.postMessage({ id, ok: false, code: "DWG_CONVERSION_FAILED", message: String(error instanceof Error ? error.message : error) });
  }
};
