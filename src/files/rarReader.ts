// RAR4 / RAR5 reader on libarchive-wasm (T12 3.6). Runs inside the archive worker. Owner: P4 group A.
import { ArchiveReader, type LibarchiveWasm } from "libarchive-wasm";
import { LibraryError } from "../types/errors";
import { ArchiveListBuilder, normalizeArchivePath, type ArchiveItem } from "./archivePaths";
import { decodeLegacyNames } from "./zipReader";

const READ_CHUNK = 64 * 1024;
const unreadable = (why: string) => new LibraryError("ARCHIVE_UNREADABLE", why);
const encrypted = (why: string) => new LibraryError("ARCHIVE_ENCRYPTED", why);

/** Check the signature and the first header before any WASM decoding (T12 3.6-2). */
export function checkRarHeader(bytes: Uint8Array): void {
  const sig = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07];
  if (bytes.length < 14 || sig.some((b, i) => bytes[i] !== b)) throw unreadable("not a rar file");
  if (bytes[6] === 0x00) {
    // RAR4: marker block (7 bytes), then the main header: CRC (2), type (1) = 0x73, flags (2).
    if (bytes[9] !== 0x73) throw unreadable("bad rar4 main header");
    const flags = bytes[10] | (bytes[11] << 8);
    if (flags & 0x80) throw encrypted("rar4 encrypted headers");
    return;
  }
  if (bytes[6] === 0x01 && bytes[7] === 0x00) {
    // RAR5: 8-byte signature, CRC32 (4), header size (vint, up to 5 bytes), header type (vint).
    let pos = 12;
    for (let n = 0; ; n++) {
      if (pos >= bytes.length || n >= 5) throw unreadable("bad rar5 header size");
      if ((bytes[pos++] & 0x80) === 0) break;
    }
    if (pos >= bytes.length) throw unreadable("rar5 header out of range");
    if (bytes[pos] === 4) throw encrypted("rar5 encrypted headers");
    return;
  }
  throw unreadable("unknown rar version");
}

/** Decode a RAR4 "encoded Unicode" file name (OEM bytes + packed UTF-16 after a NUL). */
function decodeRar4Unicode(oem: Uint8Array, enc: Uint8Array): string {
  const out: number[] = [];
  let pos = 0;
  const high = enc[pos++] ?? 0;
  let flags = 0;
  let bits = 0;
  while (pos < enc.length) {
    if (bits === 0) {
      flags = enc[pos++];
      bits = 8;
    }
    switch (flags >> 6) {
      case 0: out.push(enc[pos++]); break;
      case 1: out.push(enc[pos++] + (high << 8)); break;
      case 2: out.push(enc[pos] | (enc[pos + 1] << 8)); pos += 2; break;
      default: {
        let length = enc[pos++];
        if (length & 0x80) {
          const correction = enc[pos++];
          for (length = (length & 0x7f) + 2; length > 0 && out.length < oem.length; length--) out.push(((oem[out.length] + correction) & 0xff) + (high << 8));
        } else {
          for (length += 2; length > 0 && out.length < oem.length; length--) out.push(oem[out.length]);
        }
      }
    }
    flags = (flags << 2) & 0xff;
    bits -= 2;
  }
  return String.fromCharCode(...out.filter((c) => c !== undefined && !Number.isNaN(c)));
}

/**
 * File names straight from the RAR4 headers, in archive order. libarchive's WASM build cannot convert
 * non-ASCII RAR4 names (it returns "***"), so these replace its names. Non-Unicode names are decoded like ZIP
 * names (UTF-8, Big5, Latin-1). Returns null when the headers can't be walked.
 */
export function rar4Names(bytes: Uint8Array): string[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  let pos = 7;
  while (pos + 7 <= bytes.length) {
    const type = bytes[pos + 2];
    const flags = view.getUint16(pos + 3, true);
    const headSize = view.getUint16(pos + 5, true);
    if (headSize < 7 || pos + headSize > bytes.length) return null;
    if (type === 0x7b) break;
    let dataSize = flags & 0x8000 && pos + 11 <= bytes.length ? view.getUint32(pos + 7, true) : 0;
    if (type === 0x74) {
      if (headSize < 32) return null;
      const large = (flags & 0x100) !== 0;
      if (large) dataSize += view.getUint32(pos + 32, true) * 2 ** 32;
      const nameSize = view.getUint16(pos + 26, true);
      const start = pos + 32 + (large ? 8 : 0);
      if (start + nameSize > pos + headSize) return null;
      const raw = bytes.subarray(start, start + nameSize);
      const zero = raw.indexOf(0);
      if (flags & 0x200 && zero >= 0) names.push(decodeRar4Unicode(raw.subarray(0, zero), raw.subarray(zero + 1)));
      else if (flags & 0x200) names.push(new TextDecoder().decode(raw));
      else names.push(decodeLegacyNames([raw])[0]);
    }
    pos += headSize + dataSize;
  }
  return names;
}

type Entry = { path: string; size: number; type: string; hardlink: boolean; encrypted: boolean };

function openReader(mod: LibarchiveWasm, bytes: Uint8Array): ArchiveReader {
  try {
    return new ArchiveReader(mod, new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch (e) {
    throw unreadable("libarchive open failed: " + String(e));
  }
}

function errorText(mod: LibarchiveWasm, reader: ArchiveReader): string {
  try {
    return mod.error_string(reader.archive) || "";
  } catch {
    return "";
  }
}

function readEntry(reader: ArchiveReader, ptr: number): Entry {
  let hardlink = false;
  try {
    hardlink = !!reader.getHardlinkTarget(ptr);
  } catch {
    hardlink = false;
  }
  return {
    path: reader.getEntryPathname(ptr),
    size: reader.getEntrySize(ptr),
    type: reader.getEntryFiletype(ptr),
    hardlink,
    encrypted: reader.isEntryEncrypted(ptr),
  };
}

/** Walk every entry; `visit` may read the entry's data. The reader is always freed. */
function walk(mod: LibarchiveWasm, bytes: Uint8Array, visit: (entry: Entry, reader: ArchiveReader) => void): boolean | null {
  checkRarHeader(bytes);
  const names = bytes[6] === 0x00 ? rar4Names(bytes) : null;
  const reader = openReader(mod, bytes);
  try {
    for (let index = 0; ; index++) {
      let ptr: number;
      try {
        ptr = reader.nextEntryPointer();
      } catch (e) {
        throw unreadable("libarchive: " + String(e));
      }
      if (!ptr) break;
      const entry = readEntry(reader, ptr);
      if (names && index < names.length) entry.path = names[index];
      visit(entry, reader);
    }
    const err = errorText(mod, reader);
    if (err) throw unreadable("libarchive: " + err);
    return reader.hasEncryptedData();
  } catch (e) {
    if (e instanceof LibraryError) throw e;
    throw unreadable("libarchive: " + String(e));
  } finally {
    try {
      reader.free();
    } catch {
      /* already freed */
    }
  }
}

/** List a RAR archive with the shared rules. */
export function listRar(mod: LibarchiveWasm, bytes: Uint8Array): ArchiveItem[] {
  const builder = new ArchiveListBuilder();
  const hasEncrypted = walk(mod, bytes, (e) => {
    if (e.encrypted) throw encrypted("encrypted rar entry");
    const directory = e.type === "Directory";
    builder.add({ path: e.path, size: e.size, directory, regular: e.type === "File" && !e.hardlink });
  });
  if (hasEncrypted) throw encrypted("rar has encrypted data");
  return builder.items;
}

/** Extract the chosen (already validated) paths, reporting progress after each file. */
export function extractRar(
  mod: LibarchiveWasm, bytes: Uint8Array, wanted: ReadonlyMap<string, number>,
  onProgress?: (done: number, total: number) => void,
): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  walk(mod, bytes, (e, reader) => {
    if (e.type !== "File") return;
    let path: string;
    try {
      path = normalizeArchivePath(e.path);
    } catch {
      return;
    }
    const size = wanted.get(path);
    if (size === undefined || out.has(path)) return;
    const data = new Uint8Array(size);
    let filled = 0;
    while (filled < size) {
      const chunk = reader.readData(Math.min(READ_CHUNK, size - filled));
      if (chunk.length === 0) throw unreadable("short read");
      data.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length), filled);
      filled += chunk.length;
    }
    if (reader.readData(1).length > 0) throw new LibraryError("ARCHIVE_LIMIT", "entry larger than listed");
    out.set(path, data);
    onProgress?.(out.size, wanted.size);
  });
  if (out.size !== wanted.size) throw unreadable("not every selected file was found");
  return out;
}
