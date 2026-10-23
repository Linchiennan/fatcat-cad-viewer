// Shared archive rules (T12 3.4): limits, path normalisation, duplicates, supported entries. Owner: P4 group A.
// Pure functions: used inside the archive worker and again by the library import (T11 3.15).
import { LibraryError } from "../types/errors";
import { detectDrawingFormat, MAX_ARCHIVE_BYTES, MAX_DRAWING_BYTES, type DrawingFormat } from "./fileTypes";

export const ARCHIVE_LIMITS = {
  archiveBytes: MAX_ARCHIVE_BYTES,
  entries: 1000,
  entryBytes: MAX_DRAWING_BYTES,
  totalBytes: MAX_DRAWING_BYTES,
  depth: 16,
  pathLength: 2048,
  segmentLength: 220,
} as const;

/** One archive entry as listed for the dialog (T12 3.4.4). */
export type ArchiveItem = {
  /** Normalised path, "/"-separated, no trailing "/". */
  path: string;
  /** Last path segment. */
  name: string;
  /** Uncompressed bytes. */
  size: number;
  directory: boolean;
  /** Format from the name; null for directories and non-regular entries. */
  format: DrawingFormat | null;
  /** Regular non-empty DXF / DWG / PDF file. */
  supported: boolean;
  /** Always false in a listed archive: any encrypted entry rejects the whole archive. */
  encrypted: boolean;
};

/** Raw entry from a reader before the shared rules are applied. */
export type RawArchiveEntry = { path: string; size: number; directory: boolean; regular: boolean };

const IMPORTABLE: readonly DrawingFormat[] = ["dxf", "dwg", "pdf"];

export function isImportableFormat(format: DrawingFormat | null): boolean {
  return format !== null && IMPORTABLE.includes(format);
}

const invalidPath = (why: string) => new LibraryError("ARCHIVE_INVALID_PATH", why);
const overLimit = (why: string) => new LibraryError("ARCHIVE_LIMIT", why);

/** Normalise a path inside an archive, relative to the new library folder; throws ARCHIVE_INVALID_PATH. */
export function normalizeArchivePath(raw: string): string {
  if (!raw || raw.length > ARCHIVE_LIMITS.pathLength) throw invalidPath("empty or too long");
  if (raw.startsWith("/") || raw.startsWith("\\")) throw invalidPath("absolute");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f:]/.test(raw)) throw invalidPath("control character or colon");
  const segments: string[] = [];
  for (const part of raw.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    const clean = part.normalize("NFC").trim().replace(/\s+/g, " ");
    if (clean === "" || clean === "." || clean === "..") throw invalidPath("bad segment");
    if (clean.length > ARCHIVE_LIMITS.segmentLength) throw invalidPath("segment too long");
    segments.push(clean);
  }
  if (segments.length === 0 || segments.length > ARCHIVE_LIMITS.depth) throw invalidPath("depth");
  return segments.join("/");
}

/** Case-insensitive (English rules) comparison key for a normalised path. */
export function archivePathKey(path: string): string {
  return path.toLocaleLowerCase("en");
}

/**
 * Apply every T12 3.4 rule to a raw listing, before anything is extracted. Count and per-entry limits are
 * checked as entries are added so a huge listing stops early.
 */
export class ArchiveListBuilder {
  readonly items: ArchiveItem[] = [];
  private readonly keys = new Set<string>();
  private total = 0;

  add(entry: RawArchiveEntry): ArchiveItem {
    if (this.items.length >= ARCHIVE_LIMITS.entries) throw overLimit("too many entries");
    const path = normalizeArchivePath(entry.path);
    const key = archivePathKey(path);
    if (this.keys.has(key)) throw invalidPath("duplicate path");
    this.keys.add(key);
    const size = entry.directory ? 0 : entry.size;
    if (!Number.isSafeInteger(size) || size < 0) throw new LibraryError("ARCHIVE_UNREADABLE", "bad entry size");
    if (size > ARCHIVE_LIMITS.entryBytes) throw overLimit("entry too large");
    this.total += size;
    if (this.total > ARCHIVE_LIMITS.totalBytes) throw overLimit("total too large");
    const name = path.slice(path.lastIndexOf("/") + 1);
    const format = entry.directory || !entry.regular ? null : detectDrawingFormat(name);
    const supported = !entry.directory && entry.regular && size > 0 && isImportableFormat(format);
    const item: ArchiveItem = { path, name, size, directory: entry.directory, format, supported, encrypted: false };
    this.items.push(item);
    return item;
  }
}

/** Run the whole listing through the shared rules. */
export function buildArchiveList(entries: Iterable<RawArchiveEntry>): ArchiveItem[] {
  const builder = new ArchiveListBuilder();
  for (const e of entries) builder.add(e);
  return builder.items;
}

/** MIME type of an extracted file (T12 3.4.5). */
export function extractedMimeType(name: string): string {
  return detectDrawingFormat(name) === "pdf" ? "application/pdf" : "application/octet-stream";
}

/** Check a selection against the listing: every path must be listed and supported, and at least one chosen. */
export function selectedItems(items: readonly ArchiveItem[], paths: readonly string[]): ArchiveItem[] {
  if (paths.length === 0) throw new LibraryError("ARCHIVE_UNREADABLE", "nothing selected");
  const byPath = new Map(items.map((i) => [i.path, i]));
  const seen = new Set<string>();
  const out: ArchiveItem[] = [];
  for (const p of paths) {
    const item = byPath.get(p);
    if (!item || !item.supported || seen.has(p)) throw new LibraryError("ARCHIVE_UNREADABLE", "path not available");
    seen.add(p);
    out.push(item);
  }
  return out;
}
