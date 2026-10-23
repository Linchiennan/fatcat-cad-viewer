// ZIP reader (T12 3.5). The ZIP structure is parsed here; fflate is only used for Deflate and Latin-1 text.
// Runs inside the archive worker on the whole archive held in memory. Owner: P4 group A.
import { inflateSync, strFromU8 } from "fflate";
import { LibraryError } from "../types/errors";
import { ARCHIVE_LIMITS, ArchiveListBuilder, type ArchiveItem } from "./archivePaths";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_SIZE = 22;
/** 22-byte record plus the largest possible comment. */
const EOCD_SEARCH = 65_557;

type ZipRecord = { offset: number; method: number; flags: number; crc: number; compressed: number; size: number };
export type ZipListing = { items: ArchiveItem[]; records: Map<string, ZipRecord> };

const unreadable = (why: string) => new LibraryError("ARCHIVE_UNREADABLE", why);
const encrypted = () => new LibraryError("ARCHIVE_ENCRYPTED", "encrypted zip entry");

function findEndRecord(view: DataView): number {
  const len = view.byteLength;
  const lowest = Math.max(0, len - EOCD_SEARCH);
  for (let pos = len - EOCD_SIZE; pos >= lowest; pos--) {
    if (view.getUint32(pos, true) !== EOCD_SIG) continue;
    if (pos + EOCD_SIZE + view.getUint16(pos + 20, true) === len) return pos;
  }
  throw unreadable("no end of central directory");
}

const utf8Strict = () => new TextDecoder("utf-8", { fatal: true });

function decoderOrNull(label: string): TextDecoder | null {
  try {
    return new TextDecoder(label, { fatal: true });
  } catch {
    return null;
  }
}

/**
 * Names without the UTF-8 flag (待決 B-17): plain ASCII as is; otherwise the whole archive is decoded with the
 * first encoding that reads every such name cleanly — UTF-8 (tools that forget the flag), then Big5 (Taiwanese
 * Windows), then Latin-1 (old behaviour, never fails).
 */
export function decodeLegacyNames(names: readonly Uint8Array[]): string[] {
  const needsGuess = names.some((n) => n.some((b) => b >= 0x80));
  if (!needsGuess) return names.map((n) => strFromU8(n, true));
  for (const label of ["utf-8", "big5"]) {
    const decoder = decoderOrNull(label);
    if (!decoder) continue;
    try {
      return names.map((n) => decoder.decode(n));
    } catch {
      /* try the next encoding */
    }
  }
  return names.map((n) => strFromU8(n, true));
}

/** Read the central directory and apply the shared listing rules. */
export function listZip(bytes: Uint8Array): ZipListing {
  if (bytes.byteLength < EOCD_SIZE) throw unreadable("too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndRecord(view);
  const disk = view.getUint16(end + 4, true);
  const cdDisk = view.getUint16(end + 6, true);
  const onDisk = view.getUint16(end + 8, true);
  const total = view.getUint16(end + 10, true);
  const cdSize = view.getUint32(end + 12, true);
  const cdOffset = view.getUint32(end + 16, true);
  if (disk !== 0 || cdDisk !== 0 || onDisk !== total) throw unreadable("split archive");
  if (total === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw unreadable("zip64");
  if (total > ARCHIVE_LIMITS.entries) throw new LibraryError("ARCHIVE_LIMIT", "too many entries");
  if (cdOffset + cdSize > end) throw unreadable("central directory out of range");

  type Raw = { name: Uint8Array; utf8: boolean; size: number; directoryType: boolean; unixType: number; record: ZipRecord };
  const raws: Raw[] = [];
  let pos = cdOffset;
  const cdEnd = cdOffset + cdSize;
  for (let i = 0; i < total; i++) {
    if (pos + 46 > cdEnd || view.getUint32(pos, true) !== CENTRAL_SIG) throw unreadable("bad central entry");
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const compressed = view.getUint32(pos + 20, true);
    const size = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const external = view.getUint32(pos + 38, true);
    const offset = view.getUint32(pos + 42, true);
    const next = pos + 46 + nameLen + extraLen + commentLen;
    if (next > cdEnd) throw unreadable("central entry out of range");
    if (flags & 1) throw encrypted();
    const unixType = (external >>> 16) & 0xf000;
    raws.push({
      name: bytes.subarray(pos + 46, pos + 46 + nameLen),
      utf8: (flags & 0x800) !== 0,
      size,
      directoryType: unixType === 0x4000,
      unixType,
      record: { offset, method, flags, crc, compressed, size },
    });
    pos = next;
  }
  if (pos !== cdEnd) throw unreadable("central directory size mismatch");

  // Decode names: flagged ones strictly as UTF-8, the rest together (see decodeLegacyNames).
  const legacy = raws.filter((r) => !r.utf8);
  const legacyNames = decodeLegacyNames(legacy.map((r) => r.name));
  const names = new Map<Raw, string>();
  legacy.forEach((r, i) => names.set(r, legacyNames[i]));
  for (const r of raws) {
    if (!r.utf8) continue;
    try {
      names.set(r, utf8Strict().decode(r.name));
    } catch {
      throw unreadable("bad utf-8 name");
    }
  }

  const builder = new ArchiveListBuilder();
  const records = new Map<string, ZipRecord>();
  for (const r of raws) {
    const rawName = names.get(r)!;
    const directory = rawName.endsWith("/") || r.directoryType;
    const regular = r.unixType === 0 || r.unixType === 0x8000 || directory;
    const item = builder.add({ path: rawName, size: r.size, directory, regular });
    if (!directory) records.set(item.path, r.record);
  }
  return { items: builder.items, records };
}

let crcTable: Uint32Array | null = null;
/** Standard CRC-32 (IEEE). */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Extract one listed file; damaged members (length or CRC mismatch) are never returned. */
export function extractZipEntry(bytes: Uint8Array, listing: ZipListing, path: string): Uint8Array {
  const rec = listing.records.get(path);
  if (!rec) throw unreadable("path not in archive");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (rec.offset + 30 > bytes.byteLength || view.getUint32(rec.offset, true) !== LOCAL_SIG) throw unreadable("bad local header");
  if (view.getUint16(rec.offset + 6, true) & 1) throw encrypted();
  const start = rec.offset + 30 + view.getUint16(rec.offset + 26, true) + view.getUint16(rec.offset + 28, true);
  if (start + rec.compressed > bytes.byteLength) throw unreadable("data out of range");
  const data = bytes.subarray(start, start + rec.compressed);
  let out: Uint8Array;
  if (rec.method === 0) {
    out = data.slice();
  } else if (rec.method === 8) {
    try {
      out = inflateSync(data, { out: new Uint8Array(rec.size) });
    } catch {
      throw unreadable("inflate failed");
    }
  } else {
    throw unreadable("unsupported compression method");
  }
  if (out.length !== rec.size || crc32(out) !== rec.crc) throw unreadable("size or crc mismatch");
  return out;
}
