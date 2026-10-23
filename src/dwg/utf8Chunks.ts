// LibreDWG writes long MTEXT as 250-byte group 3 chunks and may cut a character in two: a UTF-8
// character ("流動" in the TOTO sheet re-saved as 2018 became "流�" + "�時") or a double-byte one
// (結構圖 S2-A03 in Big5: 不 cut after its first byte, garbling the rest of the chunk). Move the
// cut-off bytes to the start of the next chunk so the character decodes whole. MTEXT chunks are
// joined anyway, so the text itself never changes; chunks that are not cut are untouched.
const LF = 0x0a, CR = 0x0d, SPACE = 0x20;

/** Length of an incomplete UTF-8 sequence at the end of bytes[start, end), or 0. */
function danglingTail(bytes: Uint8Array, start: number, end: number): number {
  for (let k = 1; k <= 3 && end - k >= start; k++) {
    const b = bytes[end - k];
    if ((b & 0xc0) === 0x80) continue; // continuation byte, keep looking for the lead
    const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    return need > k ? k : 0;
  }
  return 0;
}

/** Lead-byte tests of double-byte code pages, by TextDecoder label. */
const DBCS_LEAD: Record<string, (b: number) => boolean> = {
  big5: (b) => b >= 0x81 && b <= 0xfe,
  gbk: (b) => b >= 0x81 && b <= 0xfe,
  gb18030: (b) => b >= 0x81 && b <= 0xfe,
  "euc-kr": (b) => b >= 0x81 && b <= 0xfe,
  shift_jis: (b) => (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc),
};

/** Whether bytes[start, end) is a group code line holding just `code` (padded with spaces). */
function isCode(bytes: Uint8Array, start: number, end: number, code: number): boolean {
  let digit = -1;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    if (b === SPACE || b === CR) continue;
    if (digit >= 0 || b !== code) return false;
    digit = b;
  }
  return digit === code;
}

/** Repair for the DXF's own encoding (UTF-8 or a double-byte code page); others are left as they are. */
export function joinSplitChunks(bytes: Uint8Array, encoding: string): { bytes: Uint8Array; joined: number } {
  const label = encoding.toLowerCase();
  if (/utf-?8/.test(label)) return joinSplitUtf8(bytes);
  const lead = DBCS_LEAD[label];
  if (!lead) return { bytes, joined: 0 };
  // Trail bytes look like lead bytes, so walk each chunk from its start, remembering whether the
  // previous chunk of the same text left half a character (whose trail byte opens this chunk).
  let carried = false;
  return joinCuts(bytes, (start, end, chained) => {
    let i = start + (chained && carried ? 1 : 0), dangling = false;
    while (i < end) {
      if (!lead(bytes[i])) { i += 1; continue; }
      if (i + 1 >= end) { dangling = true; break; }
      i += 2;
    }
    carried = dangling;
    return dangling ? 1 : 0;
  });
}

export function joinSplitUtf8(bytes: Uint8Array): { bytes: Uint8Array; joined: number } {
  return joinCuts(bytes, (start, end) => danglingTail(bytes, start, end));
}

/** Move `tailOf(start, end, chained)` bytes from the end of each MTEXT chunk into the next chunk. */
function joinCuts(bytes: Uint8Array, tailOf: (start: number, end: number, chained: boolean) => number): { bytes: Uint8Array; joined: number } {
  const lines: number[] = [0]; // line start offsets
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === LF) lines.push(i + 1);
  const end = (n: number) => { let e = n + 1 < lines.length ? lines[n + 1] - 1 : bytes.length; if (e > lines[n] && bytes[e - 1] === CR) e--; return e; };
  const THREE = 0x33, ONE = 0x31;
  const cuts = new Map<number, number>(); // value line -> bytes to move into the next value line
  let previous = -10;
  for (let n = 1; n + 2 < lines.length; n++) {
    if (!isCode(bytes, lines[n - 1], end(n - 1), THREE)) continue;
    if (!isCode(bytes, lines[n + 1], end(n + 1), THREE) && !isCode(bytes, lines[n + 1], end(n + 1), ONE)) continue;
    const tail = tailOf(lines[n], end(n), previous === n - 2);
    previous = n;
    if (tail) cuts.set(n, tail);
  }
  if (!cuts.size) return { bytes, joined: 0 };
  const parts: Uint8Array[] = [];
  let from = 0;
  for (const [n, tail] of cuts) {
    const cutAt = end(n) - tail, nextValue = lines[n + 2];
    parts.push(bytes.subarray(from, cutAt), bytes.subarray(end(n), nextValue), bytes.subarray(cutAt, end(n)));
    from = nextValue;
  }
  parts.push(bytes.subarray(from));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let k = 0;
  for (const p of parts) { out.set(p, k); k += p.length; }
  return { bytes: out, joined: cuts.size };
}
