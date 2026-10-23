// Exports area (輸出成果, spec 005): every PNG / PDF the viewer produces is kept here until the user deletes it.
// Own IndexedDB database so the drawing library schema stays unchanged. Errors are LibraryError. Owner: P4 group A.
import { LibraryError } from "../types/errors";
import type { ExportResult } from "./exportTypes";
import { MAX_NAME_LENGTH, isValidLibraryName, libraryNameKey, normalizeLibraryName, uniqueLibraryName } from "./drawingLibrary";

export const EXPORTS_DB_NAME = "fatcat-exports";
/** Above this total the list shows a warning; nothing is ever deleted automatically (spec 005-7). */
export const EXPORTS_WARNING_BYTES = 500 * 1024 * 1024;

export type ExportFormat = "png" | "pdf";
export type ExportEntry = {
  id: string;
  /** File name shown and used when sharing (keeps its .png / .pdf extension). */
  name: string;
  format: ExportFormat;
  mime: string;
  /** Bytes of the file itself. */
  size: number;
  /** Bytes of the stored preview. */
  thumbnailSize: number;
  widthPx: number;
  heightPx: number;
  dpi: number;
  downscaled: boolean;
  createdAt: number;
  updatedAt: number;
};
type ExportContent = { id: string; blob: Blob; thumbnail: Blob | null };

const fail = (code: "INVALID_NAME" | "DUPLICATE_NAME" | "INVALID_FILE" | "NOT_FOUND", why: string) => new LibraryError(code, why);

function classify(error: unknown): unknown {
  if (error instanceof LibraryError) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === "QuotaExceededError") return new LibraryError("STORAGE_FULL", "storage quota exceeded", { cause: error });
  return new LibraryError("UNAVAILABLE", "exports database error", { cause: error });
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

let database: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!factory) {
      reject(new LibraryError("UNAVAILABLE", "IndexedDB is not available"));
      return;
    }
    const request = factory.open(EXPORTS_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("exports", { keyPath: "id" });
      request.result.createObjectStore("files", { keyPath: "id" });
    };
    request.onblocked = () => reject(new LibraryError("UNAVAILABLE", "database upgrade blocked"));
    request.onerror = () => reject(classify(request.error));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = null;
      };
      resolve(db);
    };
  });
  database.catch(() => {
    database = null;
  });
  return database;
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** One transaction over both stores; a failure anywhere aborts it. */
async function withStores<T>(mode: IDBTransactionMode, body: (meta: IDBObjectStore, files: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  let tx: IDBTransaction;
  try {
    tx = db.transaction(["exports", "files"], mode);
  } catch (e) {
    throw classify(e);
  }
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("aborted", "AbortError"));
  });
  done.catch(() => undefined);
  try {
    const result = await body(tx.objectStore("exports"), tx.objectStore("files"));
    await done;
    return result;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    throw classify(e);
  }
}

const allEntries = (meta: IDBObjectStore) => req(meta.getAll() as IDBRequest<ExportEntry[]>);

/** A usable file name: no path or reserved characters, right extension, at most 220 characters. */
export function exportFileName(raw: string, format: ExportFormat): string {
  const ext = `.${format}`;
  // eslint-disable-next-line no-control-regex
  let base = normalizeLibraryName(raw.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "_"));
  if (base.toLowerCase().endsWith(ext)) base = base.slice(0, -ext.length);
  base = base.replace(/[. ]+$/, "").slice(0, MAX_NAME_LENGTH - ext.length) || "export";
  return base + ext;
}

function formatOf(mime: string, fileName: string): ExportFormat | null {
  if (mime === "application/pdf" || /\.pdf$/i.test(fileName)) return "pdf";
  if (mime === "image/png" || /\.png$/i.test(fileName)) return "png";
  return null;
}

/** Store a finished export (spec 005-5); the name gets " (2)" when it is already used. */
export async function saveExport(result: ExportResult): Promise<ExportEntry> {
  const format = formatOf(result.mime, result.fileName);
  if (!format || !(result.blob instanceof Blob) || result.blob.size <= 0) throw fail("INVALID_FILE", "not a PNG / PDF export");
  const mime = format === "pdf" ? "application/pdf" : "image/png";
  const thumbnail = result.thumbnail instanceof Blob && result.thumbnail.size > 0 ? result.thumbnail : null;
  return withStores("readwrite", async (meta, files) => {
    const taken = new Set((await allEntries(meta)).map((e) => libraryNameKey(e.name)));
    const now = Date.now();
    const entry: ExportEntry = {
      id: newId(), name: uniqueLibraryName(exportFileName(result.fileName, format), taken, true), format, mime,
      size: result.blob.size, thumbnailSize: thumbnail?.size ?? 0, widthPx: result.widthPx, heightPx: result.heightPx,
      dpi: result.dpi, downscaled: !!result.downscaled, createdAt: now, updatedAt: now,
    };
    await req(meta.add(entry));
    await req(files.add({ id: entry.id, blob: result.blob, thumbnail } satisfies ExportContent));
    return entry;
  });
}

/** Every export, newest first. */
export async function listExports(): Promise<ExportEntry[]> {
  const list = await withStores("readonly", (meta) => allEntries(meta));
  return list.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}

/** Bytes used by all exports, previews included (shown at the top of the list). */
export async function exportsTotalBytes(): Promise<number> {
  return (await listExports()).reduce((sum, e) => sum + e.size + e.thumbnailSize, 0);
}

export function exportsOverWarning(totalBytes: number): boolean {
  return totalBytes > EXPORTS_WARNING_BYTES;
}

/** The export as a File (for share / open). */
export async function readExport(id: string): Promise<File> {
  return withStores("readonly", async (meta, files) => {
    const entry = (await req(meta.get(id))) as ExportEntry | undefined;
    const content = (await req(files.get(id))) as ExportContent | undefined;
    if (!entry || !content) throw fail("NOT_FOUND", "no such export");
    return new File([content.blob], entry.name, { type: entry.mime, lastModified: entry.createdAt });
  });
}

/** Preview images for the list, by id (missing ones left out). */
export async function readExportThumbnails(ids: readonly string[]): Promise<Map<string, Blob>> {
  return withStores("readonly", async (_meta, files) => {
    const out = new Map<string, Blob>();
    for (const id of ids) {
      const content = (await req(files.get(id))) as ExportContent | undefined;
      if (content?.thumbnail) out.set(id, content.thumbnail);
    }
    return out;
  });
}

/** Rename; the extension (format) can't change and names stay unique. */
export async function renameExport(id: string, name: string): Promise<ExportEntry> {
  if (!isValidLibraryName(name)) throw fail("INVALID_NAME", "invalid name");
  return withStores("readwrite", async (meta) => {
    const entry = (await req(meta.get(id))) as ExportEntry | undefined;
    if (!entry) throw fail("NOT_FOUND", "no such export");
    const clean = normalizeLibraryName(name);
    const finalName = clean.toLowerCase().endsWith(`.${entry.format}`) ? clean : `${clean}.${entry.format}`;
    if (finalName.length > MAX_NAME_LENGTH || !isValidLibraryName(finalName)) throw fail("INVALID_NAME", "invalid name");
    const others = (await allEntries(meta)).filter((e) => e.id !== id);
    if (others.some((e) => libraryNameKey(e.name) === libraryNameKey(finalName))) throw fail("DUPLICATE_NAME", "name exists");
    const next = { ...entry, name: finalName, updatedAt: Date.now() };
    await req(meta.put(next));
    return next;
  });
}

/** Delete one export (only when the user asks; never automatic). */
export async function deleteExport(id: string): Promise<void> {
  await withStores("readwrite", async (meta, files) => {
    if (!(await req(meta.get(id)))) throw fail("NOT_FOUND", "no such export");
    await req(meta.delete(id));
    await req(files.delete(id));
  });
}
