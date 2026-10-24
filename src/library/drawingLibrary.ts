// Drawing library data layer on IndexedDB (T11 3, 7.1). Owner: P4 group A.
// Every function rejects with LibraryError (types/errors) on failure; a cancelled import rejects with AbortError.
import { LibraryError, type LibraryErrorCode } from "../types/errors";
import { ARCHIVE_LIMITS, buildArchiveList, normalizeArchivePath, archivePathKey, isImportableFormat } from "../files/archivePaths";
import { detectDrawingFormat, formatSizeLimit, hasForbiddenNameCharacter, isArchiveFormat, tooLargeMessage, type DrawingFormat } from "../files/fileTypes";
import { drawingIdentity, loadPosition, savePosition } from "../viewer/readingPosition";
import { diagnosticError, recordDiagnostic } from "../viewer/parseAudit";

/** New database name. The old one is only read once by migrateLegacyLibrary (T11 7.1). */
export const LIBRARY_DB_NAME = "fatcat-drawing-library";
/** parentId of items in the root folder (the root has no record). */
export const ROOT_ID = "root";
/** Longest item name (T11 3.2). */
export const MAX_NAME_LENGTH = 220;

type EntryBase = { id: string; parentId: string; name: string; createdAt: number; updatedAt: number };
export type LibraryFolderEntry = EntryBase & { kind: "folder" };
export type LibraryDrawingEntry = EntryBase & {
  kind: "drawing";
  format: DrawingFormat;
  mimeType: string;
  size: number;
  lastModified: number;
  /** Changes on every content replacement, including same-millisecond writes. */
  contentRevision?: string;
  /** 0 = never opened (not in the recent list). */
  lastOpenedAt: number;
};
export type LibraryEntry = LibraryFolderEntry | LibraryDrawingEntry;

/** One file taken out of an archive, with its path inside the archive. */
export type ArchiveImportItem = { path: string; file: File };

type ContentRecord = { id: string; blob: Blob };

// ---- names (T11 3.2) -----------------------------------------------------------------------------------

/** NFC, trimmed, runs of white space (newlines, tabs) collapsed to one space. */
export function normalizeLibraryName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Raw input has no slash / backslash / control character and normalises to 1-220 characters, not "." or "..". */
export function isValidLibraryName(raw: string): boolean {
  if (hasForbiddenNameCharacter(raw)) return false;
  const name = normalizeLibraryName(raw);
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH && name !== "." && name !== "..";
}

/** Same-folder comparison key: normalised, lower case. */
export function libraryNameKey(name: string): string {
  return normalizeLibraryName(name).toLowerCase();
}

function splitExtension(name: string, keepExtension: boolean): [string, string] {
  if (!keepExtension) return [name, ""];
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1 || name.length - dot > 32) return [name, ""];
  return [name.slice(0, dot), name.slice(dot)];
}

/** Cut a string to `max` UTF-16 units without splitting a surrogate pair. */
function cutSafely(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = Math.max(0, max);
  const code = text.charCodeAt(end - 1);
  if (end > 0 && code >= 0xd800 && code <= 0xdbff) end--;
  return text.slice(0, end);
}

/** First free "name", "name (2)", "name (3)"… among `taken` keys; drawings keep their extension. */
export function uniqueLibraryName(name: string, taken: ReadonlySet<string>, keepExtension: boolean): string {
  const clean = normalizeLibraryName(name);
  if (!taken.has(libraryNameKey(clean))) return clean;
  const [stem, ext] = splitExtension(clean, keepExtension);
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = cutSafely(stem, MAX_NAME_LENGTH - suffix.length - ext.length).trimEnd() + suffix + ext;
    if (!taken.has(libraryNameKey(candidate))) return candidate;
  }
}

// ---- database ------------------------------------------------------------------------------------------

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const byKindThenName = (a: LibraryEntry, b: LibraryEntry) =>
  a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : naturalOrder.compare(a.name, b.name);

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function idbFactory(): IDBFactory {
  const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!factory) throw new LibraryError("UNAVAILABLE", "IndexedDB is not available");
  return factory;
}

const abortError = () => new DOMException("The library operation was cancelled", "AbortError");

/** Quota → STORAGE_FULL; our own errors and cancels pass through; anything else → UNAVAILABLE (T11 5.1). */
function classify(error: unknown): unknown {
  if (error instanceof LibraryError) return error;
  if (error instanceof DOMException && error.name === "AbortError" && error.message === abortError().message) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === "QuotaExceededError") return new LibraryError("STORAGE_FULL", "storage quota exceeded", { cause: error });
  return new LibraryError("UNAVAILABLE", "library database error", { cause: error });
}

let database: Promise<IDBDatabase> | null = null;

function openLibraryDb(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = idbFactory().open(LIBRARY_DB_NAME, 1);
    } catch (e) {
      reject(classify(e));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      const entries = db.createObjectStore("entries", { keyPath: "id" });
      entries.createIndex("parentId", "parentId", { unique: false });
      db.createObjectStore("contents", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "key" });
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

type StoreName = "entries" | "contents" | "meta";

/** Run `body` in one transaction; any failure aborts it, so nothing partial is ever stored. */
async function transact<T>(
  mode: IDBTransactionMode, stores: StoreName[], body: (tx: IDBTransaction) => Promise<T>, signal?: AbortSignal,
  db?: IDBDatabase,
): Promise<T> {
  if (signal?.aborted) throw abortError();
  const handle = db ?? (await openLibraryDb());
  if (signal?.aborted) throw abortError();
  let tx: IDBTransaction;
  try {
    tx = handle.transaction(stores, mode);
  } catch (e) {
    throw classify(e);
  }
  let cancelled = false;
  const onAbort = () => {
    cancelled = true;
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? abortError());
  });
  done.catch(() => undefined);
  try {
    let result: T;
    try {
      result = await body(tx);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      await done.catch(() => undefined);
      throw cancelled ? abortError() : e;
    }
    try {
      await done;
    } catch (e) {
      throw cancelled ? abortError() : e;
    }
    return result;
  } catch (e) {
    throw classify(e);
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

const entriesOf = (tx: IDBTransaction) => tx.objectStore("entries");
const contentsOf = (tx: IDBTransaction) => tx.objectStore("contents");
const getEntry = (tx: IDBTransaction, id: string) => req(entriesOf(tx).get(id) as IDBRequest<LibraryEntry | undefined>);
const childrenOf = (tx: IDBTransaction, parentId: string) =>
  req(entriesOf(tx).index("parentId").getAll(parentId) as IDBRequest<LibraryEntry[]>);
const getContent = (tx: IDBTransaction, id: string) => req(contentsOf(tx).get(id) as IDBRequest<ContentRecord | undefined>);

const fail = (code: LibraryErrorCode, why: string) => new LibraryError(code, why);

/** The destination must be the root or an existing folder. */
async function assertFolder(tx: IDBTransaction, id: string): Promise<void> {
  if (id === ROOT_ID) return;
  const folder = await getEntry(tx, id);
  if (!folder || folder.kind !== "folder") throw fail("INVALID_DESTINATION", "destination is not a folder");
}

/** Name keys already used in a folder (optionally ignoring one entry). */
async function takenNames(tx: IDBTransaction, parentId: string, except?: string): Promise<Set<string>> {
  const children = await childrenOf(tx, parentId);
  return new Set(children.filter((c) => c.id !== except).map((c) => libraryNameKey(c.name)));
}

/** True when `folderId` is `ancestorId` or lies inside it. */
async function isInside(tx: IDBTransaction, folderId: string, ancestorId: string): Promise<boolean> {
  let id = folderId;
  for (let guard = 0; id !== ROOT_ID; guard++) {
    if (id === ancestorId) return true;
    const entry = await getEntry(tx, id);
    if (!entry || guard > 10_000) throw fail("INVALID_DESTINATION", "broken folder chain");
    id = entry.parentId;
  }
  return false;
}

/** The entry and everything below it, parents before children. */
async function subtree(tx: IDBTransaction, root: LibraryEntry): Promise<LibraryEntry[]> {
  const out: LibraryEntry[] = [root];
  for (let i = 0; i < out.length; i++) {
    if (out[i].kind === "folder") out.push(...(await childrenOf(tx, out[i].id)));
  }
  return out;
}

/** Contents must exist, be a Blob of the recorded positive size and within the format's limit. */
function checkedBlob(entry: LibraryDrawingEntry, content: ContentRecord | undefined): Blob {
  if (!content) throw fail("NOT_FOUND", "content missing");
  const blob = content.blob;
  if (!(blob instanceof Blob) || blob.size !== entry.size || entry.size <= 0) throw fail("INVALID_FILE", "content size mismatch");
  if (blob.size > formatSizeLimit(entry.format)) throw fail("FILE_TOO_LARGE", "content too large");
  return blob;
}

function asFile(entry: LibraryDrawingEntry, blob: Blob): File {
  return new File([blob], entry.name, { type: entry.mimeType, lastModified: entry.lastModified });
}

function checkIncomingFile(file: File): DrawingFormat {
  const format = detectDrawingFormat(normalizeLibraryName(file.name));
  if (!format) throw fail("INVALID_FILE", "unsupported extension");
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw fail("INVALID_FILE", "empty or bad size");
  if (file.size > formatSizeLimit(format)) throw fail("FILE_TOO_LARGE", tooLargeMessage(formatSizeLimit(format)));
  return format;
}

// ---- public API ----------------------------------------------------------------------------------------

export type ImportChoice = "update" | "copy" | "cancel";
type ImportGuard = { parentId: string; name: string; expected?: LibraryDrawingEntry };
const sourceDate = (date: number) => Number.isFinite(date) && date > 0 ? date : 0;
async function fullHash(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
}
async function assertImportGuard(tx: IDBTransaction, guard: ImportGuard): Promise<void> {
  await assertFolder(tx, guard.parentId);
  const actual = (await childrenOf(tx, guard.parentId)).find(e => e.kind === "drawing" && libraryNameKey(e.name) === libraryNameKey(guard.name));
  const token = (e?: LibraryEntry) => e ? JSON.stringify({ ...e, lastOpenedAt: 0 }) : "";
  if (token(actual) !== token(guard.expected)) throw fail("DUPLICATE_NAME", "library changed; select the file again");
}
export type ImportConflict = { existing: LibraryDrawingEntry; incoming: File; reasons: string[] };
export type ImportResult = { status: "saved" | "same"; entry: LibraryDrawingEntry } | { status: "cancelled" };

/** User-facing import: compare only the selected destination, never another project. */
export async function importDrawingWithDecision(file: File, parentId: string, decide: (conflict: ImportConflict) => Promise<ImportChoice>): Promise<ImportResult> {
  if (!isValidLibraryName(file.name)) throw fail("INVALID_NAME", "invalid name");
  checkIncomingFile(file);
  // Freeze source bytes before asking. A filesystem-backed File can become unreadable if changed.
  const frozen = new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: sourceDate(file.lastModified) });
  const sourceHash = await fullHash(frozen);
  const existing = (await listLibraryChildren(parentId)).find((e): e is LibraryDrawingEntry => e.kind === "drawing" && libraryNameKey(e.name) === libraryNameKey(file.name));
  const guard: ImportGuard = { parentId, name: file.name, expected: existing };
  if (existing) {
    const reasons: string[] = [];
    if (existing.size !== file.size) reasons.push("大小不同");
    if (!sourceDate(existing.lastModified) || !sourceDate(file.lastModified)) reasons.push("來源修改日期無法確認");
    else if (existing.lastModified !== file.lastModified) reasons.push("修改日期不同");
    if (!reasons.length) {
      const same = await fullHash(await readLibraryDrawing(existing.id)) === sourceHash;
      if (same) {
        await transact("readonly", ["entries"], tx => assertImportGuard(tx, guard));
        return { status: "same", entry: existing };
      }
      reasons.push("內容不同");
    }
    const choice = await decide({ existing, incoming: frozen, reasons });
    if (choice === "cancel") return { status: "cancelled" };
    if (await fullHash(file) !== sourceHash || sourceDate(file.lastModified) !== frozen.lastModified) throw fail("DUPLICATE_NAME", "source changed; select the file again");
    if (choice === "update") return { status: "saved", entry: await replaceLibraryDrawing(existing.id, frozen, guard) };
  }
  return { status: "saved", entry: await importDrawingToLibrary(frozen, parentId, guard) };
}

/** Add a file (name de-duplicated as "name (2).ext"); lastOpenedAt = now. */
export async function importDrawingToLibrary(file: File, parentId: string = ROOT_ID, guard?: ImportGuard): Promise<LibraryDrawingEntry> {
  if (!isValidLibraryName(file.name)) throw fail("INVALID_NAME", "invalid name");
  const format = checkIncomingFile(file);
  const mimeType = file.type || "application/octet-stream";
  const blob = file.slice(0, file.size, mimeType);
  return transact("readwrite", ["entries", "contents"], async (tx) => {
    await assertFolder(tx, parentId);
    if (guard) await assertImportGuard(tx, guard);
    const now = Date.now();
    const entry: LibraryDrawingEntry = {
      id: newId(), kind: "drawing", parentId, name: uniqueLibraryName(file.name, await takenNames(tx, parentId), true),
      createdAt: now, updatedAt: now, format, mimeType, size: file.size,
      lastModified: sourceDate(file.lastModified), lastOpenedAt: now, contentRevision: newId(),
    };
    await req(entriesOf(tx).add(entry));
    await req(contentsOf(tx).add({ id: entry.id, blob } satisfies ContentRecord));
    return entry;
  });
}

async function readDrawing(tx: IDBTransaction, id: string): Promise<{ entry: LibraryDrawingEntry; blob: Blob }> {
  const entry = await getEntry(tx, id);
  if (!entry || entry.kind !== "drawing") throw fail("NOT_FOUND", "no such drawing");
  return { entry, blob: checkedBlob(entry, await getContent(tx, id)) };
}

/** Open a drawing: File named as in the library, lastOpenedAt updated (read-only fallback when storage is full). */
export async function openLibraryDrawing(id: string): Promise<File> {
  try {
    return await transact("readwrite", ["entries", "contents"], async (tx) => {
      const { entry, blob } = await readDrawing(tx, id);
      await req(entriesOf(tx).put({ ...entry, lastOpenedAt: Date.now() }));
      return asFile(entry, blob);
    });
  } catch (e) {
    if (e instanceof LibraryError && e.code === "STORAGE_FULL") return readLibraryDrawing(id);
    throw e;
  }
}

/** Read a drawing without touching lastOpenedAt or anything else (xref auto-find). */
export async function readLibraryDrawing(id: string): Promise<File> {
  return transact("readonly", ["entries", "contents"], async (tx) => {
    const { entry, blob } = await readDrawing(tx, id);
    return asFile(entry, blob);
  });
}

async function allEntries(): Promise<LibraryEntry[]> {
  return transact("readonly", ["entries"], (tx) => req(entriesOf(tx).getAll() as IDBRequest<LibraryEntry[]>));
}

/** Metadata of every drawing (no contents); used by xref auto-find. */
export async function listLibraryDrawings(): Promise<LibraryDrawingEntry[]> {
  return (await allEntries()).filter((e): e is LibraryDrawingEntry => e.kind === "drawing");
}

/** Children of a folder: folders first, then natural name order. */
export async function listLibraryChildren(parentId: string): Promise<LibraryEntry[]> {
  return transact("readonly", ["entries"], async (tx) => {
    await assertFolder(tx, parentId);
    return (await childrenOf(tx, parentId)).sort(byKindThenName);
  });
}

/** Every folder, natural name order (destination dialog). */
export async function listLibraryFolders(): Promise<LibraryFolderEntry[]> {
  return (await allEntries())
    .filter((e): e is LibraryFolderEntry => e.kind === "folder")
    .sort((a, b) => naturalOrder.compare(a.name, b.name));
}

/** Most recently opened drawings (default 6; negative → 0; non-finite → 5; fractions floored). */
export async function listRecentDrawings(count = 6): Promise<LibraryDrawingEntry[]> {
  const limit = !Number.isFinite(count) ? 5 : count < 0 ? 0 : Math.floor(count);
  if (limit === 0) return [];
  return (await listLibraryDrawings())
    .filter((d) => d.lastOpenedAt > 0)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, limit);
}

/** Path from the root to a folder (root excluded). */
export async function libraryBreadcrumb(folderId: string): Promise<LibraryFolderEntry[]> {
  if (folderId === ROOT_ID) return [];
  return transact("readonly", ["entries"], async (tx) => {
    const path: LibraryFolderEntry[] = [];
    const seen = new Set<string>();
    let id = folderId;
    while (id !== ROOT_ID) {
      if (seen.has(id)) throw fail("INVALID_DESTINATION", "folder loop");
      seen.add(id);
      const entry = await getEntry(tx, id);
      if (!entry) throw fail("NOT_FOUND", "missing folder");
      if (entry.kind !== "folder") throw fail("INVALID_DESTINATION", "not a folder");
      path.unshift(entry);
      id = entry.parentId;
    }
    return path;
  });
}

export async function createLibraryFolder(parentId: string, name: string): Promise<LibraryFolderEntry> {
  if (!isValidLibraryName(name)) throw fail("INVALID_NAME", "invalid name");
  const clean = normalizeLibraryName(name);
  return transact("readwrite", ["entries"], async (tx) => {
    await assertFolder(tx, parentId);
    if ((await takenNames(tx, parentId)).has(libraryNameKey(clean))) throw fail("DUPLICATE_NAME", "name exists");
    const now = Date.now();
    const folder: LibraryFolderEntry = { id: newId(), kind: "folder", parentId, name: clean, createdAt: now, updatedAt: now };
    await req(entriesOf(tx).add(folder));
    return folder;
  });
}

export async function renameLibraryEntry(id: string, name: string): Promise<LibraryEntry> {
  if (!isValidLibraryName(name)) throw fail("INVALID_NAME", "invalid name");
  const clean = normalizeLibraryName(name);
  return transact("readwrite", ["entries"], async (tx) => {
    const entry = await getEntry(tx, id);
    if (!entry) throw fail("NOT_FOUND", "no such entry");
    if (entry.kind === "drawing" && detectDrawingFormat(clean) !== entry.format) throw fail("INVALID_NAME", "format would change");
    if ((await takenNames(tx, entry.parentId, id)).has(libraryNameKey(clean))) throw fail("DUPLICATE_NAME", "name exists");
    const next: LibraryEntry = { ...entry, name: clean, updatedAt: Date.now() };
    await req(entriesOf(tx).put(next));
    return next;
  });
}

export async function moveLibraryEntry(id: string, destinationId: string): Promise<LibraryEntry> {
  return transact("readwrite", ["entries"], async (tx) => {
    const entry = await getEntry(tx, id);
    if (!entry) throw fail("NOT_FOUND", "no such entry");
    await assertFolder(tx, destinationId);
    if (entry.parentId === destinationId) return entry;
    if (entry.kind === "folder" && (await isInside(tx, destinationId, entry.id))) throw fail("INVALID_DESTINATION", "into itself");
    const name = uniqueLibraryName(entry.name, await takenNames(tx, destinationId, id), entry.kind === "drawing");
    const next: LibraryEntry = { ...entry, parentId: destinationId, name, updatedAt: Date.now() };
    await req(entriesOf(tx).put(next));
    return next;
  });
}

/** Deep copy; returns the new top entry. */
export async function copyLibraryEntry(id: string, destinationId: string): Promise<LibraryEntry> {
  return transact("readwrite", ["entries", "contents"], async (tx) => {
    const top = await getEntry(tx, id);
    if (!top) throw fail("NOT_FOUND", "no such entry");
    await assertFolder(tx, destinationId);
    if (top.kind === "folder" && (await isInside(tx, destinationId, top.id))) throw fail("INVALID_DESTINATION", "into itself");
    const tree = await subtree(tx, top);
    // Check every content first so a failure leaves no partial copy.
    const blobs = new Map<string, Blob>();
    for (const e of tree) if (e.kind === "drawing") blobs.set(e.id, checkedBlob(e, await getContent(tx, e.id)));
    const now = Date.now();
    const ids = new Map(tree.map((e) => [e.id, newId()]));
    const topName = uniqueLibraryName(top.name, await takenNames(tx, destinationId), top.kind === "drawing");
    let result: LibraryEntry | null = null;
    for (const e of tree) {
      const copy: LibraryEntry = e.kind === "drawing"
        ? { ...e, lastOpenedAt: 0, id: ids.get(e.id)!, createdAt: now, updatedAt: now, parentId: e === top ? destinationId : ids.get(e.parentId)!, name: e === top ? topName : e.name }
        : { ...e, id: ids.get(e.id)!, createdAt: now, updatedAt: now, parentId: e === top ? destinationId : ids.get(e.parentId)!, name: e === top ? topName : e.name };
      await req(entriesOf(tx).add(copy));
      const blob = blobs.get(e.id);
      if (blob) await req(contentsOf(tx).add({ id: copy.id, blob } satisfies ContentRecord));
      result ??= copy;
    }
    return result!;
  });
}

/** Delete an entry and its whole subtree. */
export async function deleteLibraryEntry(id: string): Promise<void> {
  await transact("readwrite", ["entries", "contents"], async (tx) => {
    const entry = await getEntry(tx, id);
    if (!entry) throw fail("NOT_FOUND", "no such entry");
    for (const e of await subtree(tx, entry)) {
      await req(entriesOf(tx).delete(e.id));
      if (e.kind === "drawing") await req(contentsOf(tx).delete(e.id));
    }
  });
}

/** Replace a drawing's contents in place (same id, name, parent, createdAt, lastOpenedAt). */
export async function replaceLibraryDrawing(id: string, file: File, guard?: ImportGuard): Promise<LibraryDrawingEntry> {
  const format = detectDrawingFormat(normalizeLibraryName(file.name));
  if (!format || (isArchiveFormat(format) && !guard)) throw fail("INVALID_FILE", "unsupported replacement");
  checkIncomingFile(file);
  recordDiagnostic("library.replace.start", { key: id, name: file.name, bytes: file.size });
  try {
    // Reading preferences are keyed by the old contents: take them out before replacing (T11 3.14-5).
    let previous: Awaited<ReturnType<typeof loadPosition>> = null;
    let current: File | null = null;
    try {
      current = await readLibraryDrawing(id);
    } catch (e) {
      if (!(e instanceof LibraryError) || e.code === "UNAVAILABLE" || e.code === "STORAGE_FULL") throw e;
      // Missing or damaged old contents: the replacement can still repair the entry.
    }
    if (current) previous = await loadPosition(await drawingIdentity(current)).catch(() => null);
    const mimeType = file.type || "application/octet-stream";
    const blob = file.slice(0, file.size, mimeType);
    const updated = await transact("readwrite", ["entries", "contents"], async (tx) => {
      if (guard) await assertImportGuard(tx, guard);
      const entry = await getEntry(tx, id);
      if (!entry || entry.kind !== "drawing") throw fail("NOT_FOUND", "no such drawing");
      if ((isArchiveFormat(entry.format) && !guard) || entry.format !== format) throw fail("INVALID_FILE", "format differs");
      const now = Date.now();
      const next: LibraryDrawingEntry = {
        ...entry, size: file.size, mimeType, updatedAt: now,
        lastModified: sourceDate(file.lastModified), contentRevision: newId(),
      };
      await req(entriesOf(tx).put(next));
      await req(contentsOf(tx).put({ id, blob } satisfies ContentRecord));
      return next;
    });
    if (previous) {
      try {
        savePosition(await drawingIdentity(asFile(updated, blob)), previous);
      } catch {
        /* reading preferences are best effort */
      }
    }
    recordDiagnostic("library.replace.complete", { key: id, name: updated.name, bytes: file.size });
    return updated;
  } catch (e) {
    recordDiagnostic("library.replace.failed", { key: id, name: file.name, bytes: file.size, ...diagnosticError(e) }, true);
    throw e;
  }
}

/** Folder name for an extracted archive: its name without .zip / .rar, else "Archive". */
export function archiveFolderName(archiveName: string): string {
  const base = normalizeLibraryName(archiveName.replace(/\.(zip|rar)\s*$/i, ""));
  return base && isValidLibraryName(base) ? base : "Archive";
}

/** Import checked archive items into a new folder (one transaction, all or nothing). */
export async function importArchiveToLibrary(
  items: readonly ArchiveImportItem[], parentId: string, archiveName: string, signal?: AbortSignal,
): Promise<{ folder: LibraryFolderEntry; drawings: LibraryDrawingEntry[] }> {
  if (signal?.aborted) throw abortError();
  if (items.length === 0) throw fail("INVALID_FILE", "nothing to import");
  const prepared = items.map((item) => {
    const path = normalizeArchivePath(item.path);
    const name = path.slice(path.lastIndexOf("/") + 1);
    const format = detectDrawingFormat(name);
    if (!isImportableFormat(format) || !Number.isSafeInteger(item.file.size) || item.file.size <= 0 || item.file.name !== name) {
      throw fail("INVALID_FILE", "bad archive item");
    }
    return { path, name, format: format!, file: item.file };
  });
  buildArchiveList(prepared.map((p) => ({ path: p.path, size: p.file.size, directory: false, regular: true })));
  if (prepared.length > ARCHIVE_LIMITS.entries) throw fail("ARCHIVE_LIMIT", "too many entries");
  const fileKeys = new Set(prepared.map((p) => archivePathKey(p.path)));
  for (const p of prepared) {
    const parts = p.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      if (fileKeys.has(archivePathKey(parts.slice(0, i).join("/")))) throw fail("INVALID_FILE", "file used as a folder");
    }
  }
  return transact("readwrite", ["entries", "contents"], async (tx) => {
    await assertFolder(tx, parentId);
    const now = Date.now();
    const folder: LibraryFolderEntry = {
      id: newId(), kind: "folder", parentId, createdAt: now, updatedAt: now,
      name: uniqueLibraryName(archiveFolderName(archiveName), await takenNames(tx, parentId), false),
    };
    await req(entriesOf(tx).add(folder));
    const folders = new Map<string, string>([["", folder.id]]);
    const drawings: LibraryDrawingEntry[] = [];
    for (const p of prepared) {
      const parts = p.path.split("/");
      let parent = folder.id;
      for (let i = 1; i < parts.length; i++) {
        const key = archivePathKey(parts.slice(0, i).join("/"));
        let sub = folders.get(key);
        if (!sub) {
          const created: LibraryFolderEntry = { id: newId(), kind: "folder", parentId: parent, name: parts[i - 1], createdAt: now, updatedAt: now };
          await req(entriesOf(tx).add(created));
          folders.set(key, (sub = created.id));
        }
        parent = sub;
      }
      const mimeType = p.file.type || "application/octet-stream";
      const entry: LibraryDrawingEntry = {
        id: newId(), kind: "drawing", parentId: parent, name: p.name, createdAt: now, updatedAt: now,
        format: p.format, mimeType, size: p.file.size, lastModified: sourceDate(p.file.lastModified), lastOpenedAt: 0,
      };
      await req(entriesOf(tx).add(entry));
      await req(contentsOf(tx).add({ id: entry.id, blob: p.file.slice(0, p.file.size, mimeType) } satisfies ContentRecord));
      drawings.push(entry);
    }
    return { folder, drawings };
  }, signal);
}

// ---- migration from the old library (T11 7.1, 待決 C-25) -----------------------------------------------

/** 舊版資料位置：舊版圖面庫的 IndexedDB 名稱（版本 1），只在遷移時唯讀開啟，不升級、不刪除。 */
export const LEGACY_DB_NAME = "izcad-drawing-library"; // 舊版資料位置（只供遷移讀取）

/** Open the old database read-only if it exists; never creates or upgrades it. */
async function openLegacyDb(): Promise<IDBDatabase | null> {
  const factory = idbFactory();
  if (typeof factory.databases === "function") {
    try {
      const list = await factory.databases();
      if (!list.some((d) => d.name === LEGACY_DB_NAME)) return null; // 舊版資料位置
    } catch {
      /* fall back to the open below */
    }
  }
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    let created = false;
    const request = factory.open(LEGACY_DB_NAME); // 舊版資料位置：不帶版本號開啟，不會觸發升級
    request.onupgradeneeded = () => {
      // The old database does not exist: cancel so it is not created.
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        resolve(null);
      } else resolve(request.result);
    };
    request.onerror = (event) => {
      if (created) {
        event.preventDefault();
        resolve(null);
      } else reject(request.error);
    };
  });
}

async function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  const tx = db.transaction(store, "readonly");
  return req(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

/** Copy the old library into the new database once (ids unchanged, verified); the old database is kept. */
export async function migrateLegacyLibrary(): Promise<"migrated" | "nothing-to-migrate" | "already-migrated"> {
  const db = await openLibraryDb();
  const state = await transact("readonly", ["entries", "meta"], async (tx) => ({
    marker: await req(tx.objectStore("meta").get("migration")),
    count: await req(entriesOf(tx).count()),
  }), undefined, db);
  if (state.marker) return "already-migrated";
  if (state.count > 0) return "nothing-to-migrate";

  let legacy: IDBDatabase | null;
  let entries: LibraryEntry[];
  let contents: ContentRecord[];
  try {
    legacy = await openLegacyDb();
    if (!legacy) return "nothing-to-migrate";
    try {
      if (!legacy.objectStoreNames.contains("entries") || !legacy.objectStoreNames.contains("contents")) return "nothing-to-migrate";
      entries = await readAll<LibraryEntry>(legacy, "entries");
      contents = await readAll<ContentRecord>(legacy, "contents");
    } finally {
      legacy.close();
    }
  } catch (e) {
    throw classify(e);
  }
  if (entries.length === 0) return "nothing-to-migrate";

  // One transaction: everything or nothing.
  await transact("readwrite", ["entries", "contents"], async (tx) => {
    if ((await req(entriesOf(tx).count())) > 0) throw fail("UNAVAILABLE", "library changed during migration");
    for (const e of entries) await req(entriesOf(tx).put(e));
    for (const c of contents) await req(contentsOf(tx).put(c));
  });

  // Verify item by item before marking the migration done; on mismatch empty the new library (retry next time).
  const sizes = new Map(contents.map((c) => [c.id, c.blob instanceof Blob ? c.blob.size : -1]));
  const ok = await transact("readonly", ["entries", "contents"], async (tx) => {
    const copied = await req(entriesOf(tx).getAll() as IDBRequest<LibraryEntry[]>);
    if (copied.length !== entries.length) return false;
    const ids = new Set(copied.map((e) => e.id));
    if (!entries.every((e) => ids.has(e.id))) return false;
    for (const e of entries) {
      if (e.kind !== "drawing" || !sizes.has(e.id)) continue;
      const c = await getContent(tx, e.id);
      if (!c || !(c.blob instanceof Blob) || c.blob.size !== sizes.get(e.id)) return false;
    }
    return true;
  });
  if (!ok) {
    await transact("readwrite", ["entries", "contents"], async (tx) => {
      await req(entriesOf(tx).clear());
      await req(contentsOf(tx).clear());
    });
    throw fail("UNAVAILABLE", "migration check failed");
  }
  await transact("readwrite", ["meta"], async (tx) => {
    await req(tx.objectStore("meta").put({ key: "migration", at: Date.now(), entries: entries.length }));
  });
  return "migrated";
}

/** Ask the browser to keep the library's storage (no prompt; failures ignored) (T11 3.16). */
export function requestPersistentStorage(): void {
  try {
    const storage = (globalThis.navigator as Navigator | undefined)?.storage;
    void storage?.persist?.().catch(() => undefined);
  } catch {
    /* not supported */
  }
}
