// DWG conversion worker ("fatcat-dwg-converter"). The main thread keeps one for the session and queues
// conversions on it. The first conversion makes the browser optimise the engine's code (about 430 MB, measured
// 2026-10-25); a worker per conversion threw that away and paid it again every time. Each conversion still gets a
// fresh engine instance (libredwg keeps state between runs: a reused instance wrote different DXF for some sheets),
// built from the module compiled once. The worker is ended only after a failure.
import { convertDwgBytes, DwgFailure, type EngineFactory } from "./dwgEngine";
import { looksLikeMemory } from "./dwgDiagnostics";

export type DwgRequest = { id: number; bytes: ArrayBuffer; base: string };
export type DwgReply =
  | { id: number; ok: true; dxf: ArrayBuffer; savedView: unknown; diagnostics: number; fallback: string | null; unloadedXrefs?: string[] }
  | { id: number; ok: false; code: string; message: string; engineError?: number; dgnObjects?: number };

type Scope = { onmessage: ((event: MessageEvent<DwgRequest>) => void) | null; postMessage(message: DwgReply, transfer?: Transferable[]): void };
const scope = self as unknown as Scope;

let factory: Promise<(options: object) => Promise<unknown>> | null = null;
let compiled: Promise<WebAssembly.Module> | null = null;

/** Loads public/runtime/libredwg/libredwg-web.js once; every call makes a new engine instance. */
function engineFactory(base: string): EngineFactory {
  const folder = new URL("runtime/libredwg/", base).href;
  return async (hooks) => {
    compiled ??= compileWasm(folder + "libredwg-web.wasm");
    factory ??= import(/* @vite-ignore */ folder + "libredwg-web.js").then((m) => {
      const create = m.default ?? m.createModule;
      if (typeof create !== "function") throw new DwgFailure("DWG_RUNTIME_MISSING", "The DWG runtime has no module factory.");
      return create;
    });
    let create: (options: object) => Promise<unknown>, wasm: WebAssembly.Module;
    try { [create, wasm] = await Promise.all([factory, compiled]); } catch (error) {
      factory = compiled = null;
      if (error instanceof DwgFailure) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new DwgFailure(looksLikeMemory(message) ? "DWG_MEMORY_LIMIT" : "DWG_RUNTIME_MISSING", "DWG runtime import failed: " + message);
    }
    return create({
      locateFile: (path: string) => folder + path, print: hooks.print, printErr: hooks.printErr,
      // Emscripten hook: build this instance from the module compiled once (no second download or compile).
      instantiateWasm: (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => {
        WebAssembly.instantiate(wasm, imports).then((instance) => receive(instance, wasm));
        return {};
      },
    });
  };
}

async function compileWasm(url: string): Promise<WebAssembly.Module> {
  try { return await WebAssembly.compileStreaming(fetch(url)); } catch {
    return WebAssembly.compile(await (await fetch(url)).arrayBuffer());
  }
}

scope.onmessage = async (event) => {
  const { id, bytes, base } = event.data;
  try {
    const result = await convertDwgBytes(new Uint8Array(bytes), engineFactory(base));
    const dxf = result.dxf.byteOffset === 0 && result.dxf.byteLength === result.dxf.buffer.byteLength
      ? (result.dxf.buffer as ArrayBuffer) : (result.dxf.slice().buffer as ArrayBuffer);
    scope.postMessage({ id, ok: true, dxf, savedView: result.savedView, diagnostics: result.diagnostics, fallback: result.fallback, unloadedXrefs: result.unloadedXrefs }, [dxf]);
  } catch (error) {
    if (error instanceof DwgFailure) scope.postMessage({ id, ok: false, code: error.code, message: error.message, engineError: error.engineError, dgnObjects: error.dgnObjects });
    else scope.postMessage({ id, ok: false, code: "DWG_CONVERSION_FAILED", message: String(error instanceof Error ? error.message : error) });
  }
};
