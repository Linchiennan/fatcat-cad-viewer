// Archive sessions on the main thread (T12 3.7): one background worker per archive, one request at a time,
// 60 s timeout, cancel = terminate. Errors are LibraryError ARCHIVE_* codes; cancelling rejects with AbortError.
// Owner: P4 group A.
import { AppError, LibraryError } from "../types/errors";
import type { ArchiveFormat, ArchiveReply, ArchiveRequest } from "./archiveCore";
import type { ArchiveItem } from "./archivePaths";
import { prepareDrawingFile } from "./fileTypes";

export type { ArchiveItem } from "./archivePaths";

export const ARCHIVE_REQUEST_TIMEOUT_MS = 60_000;

/** A file taken out of an archive: path inside the archive and the file (named after the last segment). */
export type ExtractedArchiveFile = { path: string; file: File };

export type ArchiveSession = {
  readonly items: ArchiveItem[];
  readonly closed: boolean;
  extract(paths: readonly string[], signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<ExtractedArchiveFile[]>;
  /** Terminate the worker; safe to call more than once. */
  close(): void;
};

/** What the session needs from a Worker (lets tests run the worker code in-process). */
export type ArchiveWorkerLike = {
  postMessage(message: ArchiveRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<ArchiveReply>) => void) | null;
  onerror: ((event: ErrorEvent | Event) => void) | null;
};

let workerFactory: (() => ArchiveWorkerLike) | null = null;

/** Replace how workers are created (tests); null restores the real worker. */
export function setArchiveWorkerFactory(factory: (() => ArchiveWorkerLike) | null): void {
  workerFactory = factory;
}

function createWorker(): ArchiveWorkerLike {
  if (workerFactory) return workerFactory();
  return new Worker(new URL("./archive.worker.ts", import.meta.url), { type: "module" }) as unknown as ArchiveWorkerLike;
}

/** Absolute URL of the bundled libarchive WASM, from the app's base path. */
export function libarchiveWasmUrl(): string {
  const path = "runtime/libarchive/libarchive.wasm";
  try {
    const base = typeof document !== "undefined" ? document.baseURI : globalThis.location?.href;
    return base ? new URL(path, base).href : path;
  } catch {
    return path;
  }
}

const abortError = () => new DOMException("The archive operation was cancelled", "AbortError");

type Pending = {
  id: number;
  resolve(reply: ArchiveReply): void;
  reject(error: unknown): void;
  onProgress?: (done: number, total: number) => void;
  timer: ReturnType<typeof setTimeout>;
  detach(): void;
};

class WorkerSession implements ArchiveSession {
  items: ArchiveItem[] = [];
  closed = false;
  private readonly worker: ArchiveWorkerLike;
  private pending: Pending | null = null;
  private nextId = 1;

  constructor() {
    this.worker = createWorker();
    this.worker.onmessage = (event) => this.onReply(event.data);
    this.worker.onerror = () => this.fail(new LibraryError("ARCHIVE_UNREADABLE", "archive worker crashed"));
  }

  private onReply(reply: ArchiveReply): void {
    const p = this.pending;
    if (!p || reply.id !== p.id) return; // stale reply
    if (reply.type === "progress") {
      p.onProgress?.(reply.done, reply.total);
      return;
    }
    this.settle();
    if (reply.type === "error") p.reject(new LibraryError(reply.code, reply.message));
    else p.resolve(reply);
  }

  /** Clear the current request's timer and listeners. */
  private settle(): Pending | null {
    const p = this.pending;
    if (!p) return null;
    clearTimeout(p.timer);
    p.detach();
    this.pending = null;
    return p;
  }

  /** End the session with an error for the request in flight. */
  private fail(error: unknown): void {
    const p = this.settle();
    this.terminate();
    p?.reject(error);
  }

  private terminate(): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
  }

  close(): void {
    const p = this.settle();
    this.terminate();
    p?.reject(abortError());
  }

  request(message: ArchiveRequest, signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<ArchiveReply> {
    if (this.closed || signal?.aborted) return Promise.reject(abortError());
    if (this.pending) return Promise.reject(new LibraryError("ARCHIVE_UNREADABLE", "another request is running"));
    return new Promise<ArchiveReply>((resolve, reject) => {
      const onAbort = () => this.close();
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => this.fail(new LibraryError("ARCHIVE_LIMIT", "archive request timed out")), ARCHIVE_REQUEST_TIMEOUT_MS);
      this.pending = { id: message.id, resolve, reject, onProgress, timer, detach: () => signal?.removeEventListener("abort", onAbort) };
      this.worker.postMessage(message);
    });
  }

  async open(file: File, format: ArchiveFormat, signal?: AbortSignal): Promise<void> {
    const reply = await this.request({ id: this.nextId++, type: "open", file, format, wasmUrl: libarchiveWasmUrl() }, signal);
    if (reply.type !== "opened") throw new LibraryError("ARCHIVE_UNREADABLE", "unexpected reply");
    this.items = reply.items;
  }

  async extract(paths: readonly string[], signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<ExtractedArchiveFile[]> {
    const reply = await this.request({ id: this.nextId++, type: "extract", paths: [...paths] }, signal, onProgress);
    if (reply.type !== "extracted") throw new LibraryError("ARCHIVE_UNREADABLE", "unexpected reply");
    return reply.files.map((f) => ({ path: f.path, file: new File([f.bytes], f.name, { type: f.type }) }));
  }
}

/** Pre-open check for an archive; file errors become library errors the dialog can show. */
function checkArchiveFile(file: File): ArchiveFormat {
  try {
    const { format } = prepareDrawingFile(file);
    if (format === "zip" || format === "rar") return format;
  } catch (e) {
    if (e instanceof AppError && e.code === "FILE_TOO_LARGE") throw new LibraryError("FILE_TOO_LARGE", e.message);
    throw new LibraryError("ARCHIVE_UNREADABLE", e instanceof Error ? e.message : String(e));
  }
  throw new LibraryError("ARCHIVE_UNREADABLE", "not an archive");
}

/** Open an archive in its own worker and list it. A failed open closes the session. */
export async function openArchive(file: File, signal?: AbortSignal): Promise<ArchiveSession> {
  const format = checkArchiveFile(file);
  if (signal?.aborted) throw abortError();
  const session = new WorkerSession();
  try {
    await session.open(file, format, signal);
  } catch (e) {
    session.close();
    throw e;
  }
  return session;
}

/** One-shot listing (opens and closes a session). */
export async function listArchive(file: File, signal?: AbortSignal): Promise<{ items: ArchiveItem[] }> {
  const session = await openArchive(file, signal);
  session.close();
  return { items: session.items };
}

/** One-shot extraction of the given paths (opens and closes a session). */
export async function extractArchive(file: File, paths: readonly string[], signal?: AbortSignal): Promise<ExtractedArchiveFile[]> {
  const session = await openArchive(file, signal);
  try {
    return await session.extract(paths, signal);
  } finally {
    session.close();
  }
}
