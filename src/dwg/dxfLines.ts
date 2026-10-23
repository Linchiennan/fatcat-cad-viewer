// Byte-level reading of DXF group code / value pairs, so small edits can be made without decoding the
// whole file (the text encoding is not known yet, and every byte not edited must stay as it was).
// Lines may end in CRLF, LF or CR.

/** One group code / value pair with byte offsets into the source. */
export type DxfPair = {
  code: number;
  /** Value text (ASCII view; bytes above 0x7f are kept as Latin-1 characters). */
  value: string;
  /** Start of the code line. */
  codeStart: number;
  /** Start / end (exclusive, before the line break) of the value line. */
  valueStart: number;
  valueEnd: number;
};

const CR = 0x0d, LF = 0x0a;

/** Byte ranges [start, end) of every line, line breaks excluded. */
export function lineRanges(bytes: Uint8Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== CR && b !== LF) continue;
    out.push([start, i]);
    if (b === CR && bytes[i + 1] === LF) i++;
    start = i + 1;
  }
  if (start < bytes.length) out.push([start, bytes.length]);
  return out;
}

/** Latin-1 view of a byte range (1 char per byte, so offsets stay valid). */
export function latin1(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i += 8192) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 8192)));
  return s;
}

/** End of the line starting at `start` (index of its line break, or the file end). */
function lineEnd(bytes: Uint8Array, start: number): number {
  let i = start;
  while (i < bytes.length && bytes[i] !== CR && bytes[i] !== LF) i++;
  return i;
}

/** Start of the next line after a line ending at `end`. */
function nextLine(bytes: Uint8Array, end: number): number {
  if (end >= bytes.length) return bytes.length;
  return bytes[end] === CR && bytes[end + 1] === LF ? end + 2 : end + 1;
}

/** Group code of a short line: digits with optional spaces, else NaN (no string building for long lines). */
function codeOf(bytes: Uint8Array, start: number, end: number): number {
  let n = 0, digits = 0, sign = 1;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    if (b === 0x20 || b === 0x09) continue;
    if (b === 0x2d && digits === 0 && sign === 1) { sign = -1; continue; }
    if (b < 0x30 || b > 0x39 || digits > 6) return NaN;
    n = n * 10 + (b - 0x30); digits++;
  }
  return digits ? n * sign : NaN;
}

/**
 * Walk the pairs from `from` on; `visit` returns false to stop. Values are only turned into strings
 * for the codes `wanted` accepts (so a 100 MB DXF is not copied into millions of strings).
 */
export function scanPairs(bytes: Uint8Array, visit: (p: DxfPair) => boolean | void, wanted: (code: number) => boolean = () => true, from = 0): void {
  let at = from;
  while (at < bytes.length) {
    const ce = lineEnd(bytes, at), vs = nextLine(bytes, ce);
    if (vs >= bytes.length) return;
    const ve = lineEnd(bytes, vs), code = codeOf(bytes, at, ce);
    const value = wanted(code) ? latin1(bytes, vs, ve).trim() : "";
    if (visit({ code, value, codeStart: at, valueStart: vs, valueEnd: ve }) === false) return;
    at = nextLine(bytes, ve);
  }
}

/** Every pair of the file in order; a trailing lone code line is ignored. */
export function dxfPairs(bytes: Uint8Array): DxfPair[] {
  const out: DxfPair[] = [];
  scanPairs(bytes, (p) => { out.push(p); });
  return out;
}

/** Whether the ASCII text occurs in the bytes. */
export function containsAscii(bytes: Uint8Array, text: string, start = 0, end = bytes.length): boolean {
  const first = text.charCodeAt(0), n = text.length;
  outer: for (let i = start; i + n <= end; i++) {
    if (bytes[i] !== first) continue;
    for (let k = 1; k < n; k++) if (bytes[i + k] !== text.charCodeAt(k)) continue outer;
    return true;
  }
  return false;
}

/** Group pairs into records: each record starts at a code 0 pair. */
export function dxfRecords(pairs: DxfPair[]): DxfPair[][] {
  const out: DxfPair[][] = [];
  for (const p of pairs) {
    if (p.code === 0 || !out.length) out.push([p]);
    else out[out.length - 1].push(p);
  }
  return out;
}

/** Edit list applied in one pass: insert text at an offset, or replace [start, end). */
export type ByteEdit = { start: number; end: number; text: string };

export function applyEdits(bytes: Uint8Array, edits: ByteEdit[]): Uint8Array {
  if (!edits.length) return bytes;
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const encoder = new TextEncoder(), parts: Uint8Array[] = [];
  let at = 0, size = 0;
  for (const e of sorted) {
    if (e.start < at) continue; // overlapping edit: keep the first
    parts.push(bytes.subarray(at, e.start));
    const text = encoder.encode(e.text);
    parts.push(text);
    size += e.start - at + text.length;
    at = e.end;
  }
  parts.push(bytes.subarray(at));
  size += bytes.length - at;
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
