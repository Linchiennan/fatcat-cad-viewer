// Layer on/off/frozen restore (T13 4.3). libredwg-web 0.7.9 writes every layer colour of some AC1032
// drawings as negative (negative colour = layer off in DXF), which would make the whole sheet blank.
// The object reader still has the right states, so the first LAYER table is rewritten from them.
import { applyEdits, latin1, scanPairs, type ByteEdit } from "./dxfLines";

/** State of one layer as read from the DWG object API. */
export type LayerState = { off: boolean; frozen: boolean; frozenInNew: boolean };

const upper = (s: string) => s.toLocaleUpperCase("en-US");

function stateFor(states: ReadonlyMap<string, LayerState>, name: string): LayerState | null {
  const exact = states.get(name);
  if (exact) return exact;
  const key = upper(name);
  for (const [n, s] of states) if (upper(n) === key) return s;
  return null;
}

type Pending = { name: string; color?: { start: number; end: number; value: number }; flags?: { start: number; end: number; value: number } };

/**
 * Rewrite colours (sign = off) and flags (bit 1 frozen, bit 2 frozen in new viewports) of the first LAYER
 * table. With no states at all every layer is turned on. Only differing values change; leading spaces kept.
 */
export function restoreLayerStates(bytes: Uint8Array, states: ReadonlyMap<string, LayerState> | null, encoding = "utf-8"): Uint8Array {
  const edits: ByteEdit[] = [];
  // Names are compared as text: an older drawing writes them in its code page (Big5 etc.), the reader gives Unicode.
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(encoding); } catch { decoder = new TextDecoder("utf-8"); }
  const known = states && states.size > 0 ? states : null;
  let inTable = false, tableName = false, record: Pending | null = null, done = false;
  const flush = () => {
    if (!record) return;
    const state = known ? stateFor(known, record.name) : null;
    if (record.color && Number.isFinite(record.color.value)) {
      const magnitude = Math.abs(record.color.value), want = state?.off ? -magnitude : magnitude;
      if (want !== record.color.value) replaceNumber(bytes, record.color, want, edits);
    }
    if (state && record.flags && Number.isFinite(record.flags.value)) {
      const want = (record.flags.value & ~3) | (state.frozen ? 1 : 0) | (state.frozenInNew ? 2 : 0);
      if (want !== record.flags.value) replaceNumber(bytes, record.flags, want, edits);
    }
    record = null;
  };
  scanPairs(bytes, (p) => {
    if (p.code === 0) {
      flush();
      if (inTable && p.value === "ENDTAB") { done = true; return false; }
      if (!inTable && p.value === "TABLE") { tableName = true; return; }
      tableName = false;
      if (inTable && p.value === "LAYER") record = { name: "" };
      return;
    }
    if (tableName && p.code === 2) { inTable = p.value === "LAYER"; tableName = false; return; }
    if (!record) return;
    if (p.code === 2 && !record.name) record.name = unescapeUnicode(decoder.decode(bytes.subarray(p.valueStart, p.valueEnd)).trim());
    else if (p.code === 62 && !record.color) record.color = { start: p.valueStart, end: p.valueEnd, value: Number(p.value) };
    else if (p.code === 70 && !record.flags) record.flags = { start: p.valueStart, end: p.valueEnd, value: Number(p.value) };
  }, (code) => code === 0 || code === 2 || code === 62 || code === 70);
  if (!done) flush();
  return applyEdits(bytes, edits);
}

/** DXF writes characters outside the code page as \U+XXXX. */
const unescapeUnicode = (s: string) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

/** Replace the number of a value line, keeping its leading whitespace. */
function replaceNumber(bytes: Uint8Array, at: { start: number; end: number }, value: number, edits: ByteEdit[]): void {
  const line = latin1(bytes, at.start, at.end), lead = /^\s*/.exec(line)![0].length;
  let end = at.end;
  while (end > at.start + lead && (bytes[end - 1] === 0x20 || bytes[end - 1] === 0x09)) end--;
  edits.push({ start: at.start + lead, end, text: String(value) });
}
