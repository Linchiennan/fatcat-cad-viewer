// DWG → DXF conversion in a worker (T13). Owner: P4 group B.
// Lookups are keyed by the output DXF File (WeakMap: entries go away with the file).
import { AppError, type AppErrorCode } from "../types/errors";
import { assertFileSize, MAX_DXF_BYTES, replaceExtension, tooLargeMessage } from "../files/fileTypes";
import { registerSavedView, type SavedView } from "../viewer/savedView";
import { bindDrawingIdentity } from "../viewer/readingPosition";
import { dwgDiagnostics } from "./dwgDiagnostics";
import type { DwgReply, DwgRequest } from "./dwg.worker";

/** Fallback data from the second engine instance (T13 8-2): blocks in dxf-viewer parser shape, skipped type counts, fixed texts, failure reason. */
export type FallbackData = {
  blocks: Record<string, unknown>;
  skipped: Record<string, number>;
  texts?: Record<string, string>;
  error?: string;
};

/** Number of engine diagnostics for a converted DXF (missing = 0). */
export const conversionWarnings = new WeakMap<File, number>();

/** Fallback data for a converted DXF, if the fallback ran. */
export const conversionRebuiltBlocks = new WeakMap<File, FallbackData>();
/** Names of external references the DWG was saved with unloaded, per converted DXF File. */
export const conversionUnloadedXrefs = new WeakMap<File, string[]>();

/** Conversion time limit (T13 6-2). */
export const DWG_TIMEOUT_MS = 180_000;

type WorkerLike = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;
let workerFactory: () => WorkerLike = () =>
  new Worker(new URL("./dwg.worker.ts", import.meta.url), { type: "module", name: "fatcat-dwg-converter" });

// One worker for the session with conversions queued on it, so the engine code the browser optimised on the first
// conversion is kept (a worker per conversion paid ~430 MB each time). Dropped after a failure, timeout or cancel.
let shared: WorkerLike | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Replace how conversion workers are made (tests); null restores the real worker. */
export function setDwgWorkerFactory(factory: (() => WorkerLike) | null): void {
  workerFactory = factory ?? (() => new Worker(new URL("./dwg.worker.ts", import.meta.url), { type: "module", name: "fatcat-dwg-converter" }));
  shared?.terminate();
  shared = null;
}

const abortError = () => new DOMException("The DWG conversion was cancelled.", "AbortError");
// The same File converts once per session: opening a drawing and then applying its xrefs converted it twice.
const converted = new WeakMap<File, File>();
let requestSerial = 0;

/** Page base URL the worker uses to find public/runtime. */
function pageBase(): string {
  if (typeof document !== "undefined" && document.baseURI) return document.baseURI;
  return typeof location !== "undefined" ? location.href : "http://localhost/";
}

function parseFallback(json: string | null): FallbackData | null {
  if (!json) return null;
  try {
    const data = JSON.parse(json);
    return data && typeof data === "object" ? { blocks: data.blocks ?? {}, skipped: data.skipped ?? {}, ...(data.texts ? { texts: data.texts } : {}), ...(data.error ? { error: String(data.error) } : {}) } : null;
  } catch { return null; }
}

/**
 * Convert a DWG to a DXF file named like the source with a .dxf extension.
 * Rejects with AppError (codes in types/errors DwgErrorCode / FileErrorCode, with DWG diagnostics),
 * or with a DOMException named "AbortError" when `signal` aborts.
 * On success it registers the saved view, diagnostics count, fallback data and binds the reading
 * identity of the source DWG to the output (readingPosition.bindDrawingIdentity).
 */
export async function convertDwgToDxf(file: File, signal?: AbortSignal): Promise<File> {
  if (signal?.aborted) throw abortError();
  const done = converted.get(file);
  if (done) return done;
  const run = queue.then(() => convertOnce(file, signal));
  queue = run.catch(() => {});
  const out = await run;
  converted.set(file, out);
  return out;
}

async function convertOnce(file: File, signal?: AbortSignal): Promise<File> {
  if (signal?.aborted) throw abortError();
  assertFileSize(file.size);
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); } catch (cause) {
    if (signal?.aborted) throw abortError();
    throw new AppError("FILE_READ_FAILED", "The DWG file could not be read.", { cause });
  }
  if (signal?.aborted) throw abortError();
  const head = new Uint8Array(bytes.slice(0, 6)), size = bytes.byteLength;
  const fail = (code: AppErrorCode, message: string, engineError?: number, dgnObjects?: number) =>
    new AppError(code, message, { diagnostics: dwgDiagnostics(head, size, engineError, dgnObjects) });

  const reply = await new Promise<Extract<DwgReply, { ok: true }>>((resolve, reject) => {
    const id = ++requestSerial;
    let worker: WorkerLike;
    try { worker = shared ??= workerFactory(); } catch (cause) {
      reject(fail("DWG_RUNTIME_MISSING", "The DWG worker could not start: " + String(cause)));
      return;
    }
    let settled = false;
    // keep: true leaves the worker for the next conversion; anything else ends it.
    const finish = (run: () => void, keep = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage as EventListener);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
      if (!keep) {
        worker.terminate();
        if (shared === worker) shared = null;
      }
      run();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const onError = () => finish(() => reject(fail("DWG_RUNTIME_MISSING", "The DWG worker failed to start.")));
    const onMessageError = () => finish(() => reject(fail("DWG_CONVERSION_FAILED", "The DWG worker reply could not be read.")));
    const onMessage = (event: MessageEvent<DwgReply>) => {
      const data = event.data;
      if (!data || data.id !== id) return;
      if (data.ok) finish(() => resolve(data), true);
      else finish(() => reject(fail(data.code as AppErrorCode, data.message, data.engineError, data.dgnObjects)));
    };
    const timer = setTimeout(() => finish(() => reject(fail("DWG_CONVERSION_TIMEOUT", "The DWG conversion took too long."))), DWG_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage as EventListener);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    try {
      const request: DwgRequest = { id, bytes, base: pageBase() };
      worker.postMessage(request, [bytes]);
    } catch (error) {
      finish(() => reject(error));
    }
  });

  if (!(reply.dxf instanceof ArrayBuffer) || reply.dxf.byteLength === 0) throw fail("DWG_EXPORT_FAILED", "The DWG worker returned an empty drawing.");
  if (signal?.aborted) throw abortError();
  if (reply.dxf.byteLength > MAX_DXF_BYTES) throw fail("FILE_TOO_LARGE", tooLargeMessage(MAX_DXF_BYTES));
  const out = new File([reply.dxf], replaceExtension(file.name, "dxf"), { type: "application/dxf", lastModified: Date.now() });
  if (reply.savedView) registerSavedView(out, reply.savedView as SavedView);
  conversionWarnings.set(out, Number(reply.diagnostics) || 0);
  const fallback = parseFallback(reply.fallback);
  if (fallback) conversionRebuiltBlocks.set(out, fallback);
  if (reply.unloadedXrefs?.length) conversionUnloadedXrefs.set(out, reply.unloadedXrefs);
  await bindDrawingIdentity(file, out);
  if (signal?.aborted) throw abortError();
  return out;
}
