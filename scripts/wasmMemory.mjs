// Read / lower the initial size of a wasm module's own memory (memory section), in place.
// libredwg-web.wasm asks for 1024 MB at start (16384 pages, growth allowed up to 4 GB): every DWG conversion
// committed a gigabyte even for a 98 KB drawing (measured 2026-10-25), which a phone cannot afford. Its static data
// and stack end near 2 MB, so a small start that grows on demand converts the same (DXF output checked byte for byte).
// The page count is rewritten with the same number of LEB128 bytes (padded), so no offset in the file moves.

/** Pages of 64 KiB. */
export const PAGE = 65536;

function readLeb(b, p) {
  let value = 0, shift = 0, byte;
  const start = p;
  do { byte = b[p++]; value += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128);
  return { value, start, length: p - start };
}

/** First defined memory: initial / maximum pages and where the initial count is written. */
export function wasmMemoryLimits(bytes) {
  if (bytes.readUInt32LE(0) !== 0x6d736100) throw new Error("not a wasm module");
  let p = 8;
  while (p < bytes.length) {
    const id = bytes[p++];
    const size = readLeb(bytes, p);
    p += size.length;
    const end = p + size.value;
    if (id === 5) {
      const count = readLeb(bytes, p);
      p += count.length;
      if (!count.value) return null;
      const flags = bytes[p++];
      const initial = readLeb(bytes, p);
      p += initial.length;
      const maximum = flags & 1 ? readLeb(bytes, p).value : null;
      return { initial: initial.value, maximum, at: initial.start, width: initial.length };
    }
    p = end;
  }
  return null;
}

/** Rewrite the initial page count in place; returns the old value. Refuses a count that needs more bytes. */
export function setWasmInitialPages(bytes, pages) {
  const limits = wasmMemoryLimits(bytes);
  if (!limits) throw new Error("no memory section");
  if (limits.maximum !== null && pages > limits.maximum) throw new Error("initial above maximum");
  if (pages >= 2 ** (7 * limits.width)) throw new Error("page count does not fit the existing bytes");
  let v = pages;
  for (let i = 0; i < limits.width; i++) {
    const last = i === limits.width - 1;
    bytes[limits.at + i] = (v & 127) | (last ? 0 : 128);
    v = Math.floor(v / 128);
  }
  return limits.initial;
}
