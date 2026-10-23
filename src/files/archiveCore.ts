// Worker side of an archive session (T12 3.7): message protocol plus ZIP / RAR dispatch. Owner: P4 group A.
// archive.worker.ts only wires this handler to the worker global, so tests can run it in-process.
import type { LibarchiveWasm } from "libarchive-wasm";
import { LibraryError, type LibraryErrorCode } from "../types/errors";
import { ARCHIVE_LIMITS, extractedMimeType, selectedItems, type ArchiveItem } from "./archivePaths";
import { extractRar, listRar } from "./rarReader";
import { extractZipEntry, listZip } from "./zipReader";

export type ArchiveFormat = "zip" | "rar";

/** Main thread → worker. */
export type ArchiveRequest =
  | { id: number; type: "open"; file: Blob; format: ArchiveFormat; wasmUrl: string }
  | { id: number; type: "extract"; paths: string[] };

/** Worker → main thread. */
export type ArchiveReply =
  | { id: number; type: "opened"; items: ArchiveItem[] }
  | { id: number; type: "progress"; done: number; total: number }
  | { id: number; type: "extracted"; files: { path: string; name: string; type: string; bytes: ArrayBuffer }[] }
  | { id: number; type: "error"; code: LibraryErrorCode; message: string };

/** An archive held in memory with its listing. */
export type OpenedArchive = {
  items: ArchiveItem[];
  extract(paths: readonly string[], onProgress?: (done: number, total: number) => void): { path: string; bytes: Uint8Array }[];
};

const ARCHIVE_CODES: readonly LibraryErrorCode[] = ["ARCHIVE_ENCRYPTED", "ARCHIVE_LIMIT", "ARCHIVE_INVALID_PATH", "ARCHIVE_UNREADABLE"];

/** Read a whole archive's listing (T12 3.5, 3.6). */
export async function openArchiveBytes(
  format: ArchiveFormat, bytes: Uint8Array, loadRar: () => Promise<LibarchiveWasm>,
): Promise<OpenedArchive> {
  if (bytes.byteLength === 0 || bytes.byteLength > ARCHIVE_LIMITS.archiveBytes) throw new LibraryError("ARCHIVE_LIMIT", "archive size");
  if (format === "zip") {
    const listing = listZip(bytes);
    return {
      items: listing.items,
      extract(paths, onProgress) {
        const chosen = selectedItems(listing.items, paths);
        return chosen.map((item, i) => {
          const out = { path: item.path, bytes: extractZipEntry(bytes, listing, item.path) };
          onProgress?.(i + 1, chosen.length);
          return out;
        });
      },
    };
  }
  const mod = await loadRar().catch((e) => {
    throw new LibraryError("ARCHIVE_UNREADABLE", "libarchive did not load: " + String(e));
  });
  const items = listRar(mod, bytes);
  return {
    items,
    extract(paths, onProgress) {
      const chosen = selectedItems(items, paths);
      const files = extractRar(mod, bytes, new Map(chosen.map((i) => [i.path, i.size])), onProgress);
      return chosen.map((i) => ({ path: i.path, bytes: files.get(i.path)! }));
    },
  };
}

/** Any error that is not one of the four archive codes is reported as unreadable (T12 3.7-8). */
export function archiveErrorReply(id: number, error: unknown): ArchiveReply {
  if (error instanceof LibraryError && ARCHIVE_CODES.includes(error.code)) return { id, type: "error", code: error.code, message: error.message };
  return { id, type: "error", code: "ARCHIVE_UNREADABLE", message: error instanceof Error ? error.message : String(error) };
}

/** Message handler for one worker (one archive). */
export function createArchiveHandler(
  post: (reply: ArchiveReply, transfer?: Transferable[]) => void,
  loadRar: (wasmUrl: string) => Promise<LibarchiveWasm>,
): (request: ArchiveRequest) => Promise<void> {
  let opened: OpenedArchive | null = null;
  return async (req) => {
    try {
      if (req.type === "open") {
        if (req.file.size === 0 || req.file.size > ARCHIVE_LIMITS.archiveBytes) throw new LibraryError("ARCHIVE_LIMIT", "archive size");
        const bytes = new Uint8Array(await req.file.arrayBuffer());
        opened = await openArchiveBytes(req.format, bytes, () => loadRar(req.wasmUrl));
        post({ id: req.id, type: "opened", items: opened.items });
        return;
      }
      if (!opened) throw new LibraryError("ARCHIVE_UNREADABLE", "archive not open");
      const files = opened.extract(req.paths, (done, total) => post({ id: req.id, type: "progress", done, total }));
      const payload = files.map((f) => {
        const name = f.path.slice(f.path.lastIndexOf("/") + 1);
        const buffer = f.bytes.byteOffset === 0 && f.bytes.byteLength === f.bytes.buffer.byteLength
          ? (f.bytes.buffer as ArrayBuffer)
          : (f.bytes.slice().buffer as ArrayBuffer);
        return { path: f.path, name, type: extractedMimeType(name), bytes: buffer };
      });
      post({ id: req.id, type: "extracted", files: payload }, payload.map((p) => p.bytes));
    } catch (e) {
      post(archiveErrorReply(req.id, e));
    }
  };
}
