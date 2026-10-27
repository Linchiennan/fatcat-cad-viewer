// Named layer states (CAD 圖層狀態管理員, LAYERSTATE). They live in the DXF as XRECORDs listed by the ACAD_LAYERSTATES
// dictionary; each record has, per layer, group 330 (the LAYER handle as LibreDWG writes it) or 8 (the layer name, as
// AutoCAD writes it), 90 flags (1 off, 2 frozen), 62 colour (negative = off), 420 true colour. The viewer reads them so
// the layer panel can restore one, as the CAD dialog's 還原 does (用戶 2026-10-27：圖層狀態切換，開關凍結顏色照 CAD).
import { getAcadColor } from "dxf-viewer/src/parser/ParseHelpers.js";

/** One layer as a state saves it: shown or not, and its colour (ACI and RGB). */
export type LayerStateEntry = { visible: boolean; colorIndex: number; color: number };
export type CadLayerState = { name: string; layers: Record<string, LayerStateEntry> };

type Pair = [code: string, value: string];

function pairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/), out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([lines[i].trim(), lines[i + 1].trim()]);
  return out;
}

/** Objects of the DXF as their group pairs, keyed by handle (group 5, or 105 for DIMSTYLE). */
function objectsByHandle(all: Pair[]): Map<string, { type: string; body: Pair[] }> {
  const map = new Map<string, { type: string; body: Pair[] }>();
  for (let i = 0; i < all.length; i++) {
    if (all[i][0] !== "0") continue;
    const type = all[i][1], body: Pair[] = [];
    let j = i + 1;
    for (; j < all.length && all[j][0] !== "0"; j++) body.push(all[j]);
    const handle = body.find(([c]) => c === "5" || c === "105")?.[1];
    if (handle) map.set(handle.toUpperCase(), { type, body });
    i = j - 1;
  }
  return map;
}

/** Layer states of a DXF text, in the dictionary's order; [] when it has none or they cannot be read. */
export function readLayerStates(text: string): CadLayerState[] {
  if (!text.includes("ACAD_LAYERSTATES")) return [];
  try {
    const all = pairs(text);
    const objects = objectsByHandle(all);
    const layerName = new Map<string, string>();
    for (const [handle, o] of objects) if (o.type === "LAYER") {
      const name = o.body.find(([c]) => c === "2")?.[1];
      if (name) layerName.set(handle, name);
    }
    // The dictionary named ACAD_LAYERSTATES (an entry "3 ACAD_LAYERSTATES" followed by 350/360 handle).
    let dictHandle = "";
    for (let i = 0; i + 1 < all.length && !dictHandle; i++) {
      if (all[i][0] === "3" && all[i][1] === "ACAD_LAYERSTATES" && (all[i + 1][0] === "360" || all[i + 1][0] === "350")) dictHandle = all[i + 1][1].toUpperCase();
    }
    const dict = objects.get(dictHandle);
    if (!dict) return [];
    const states: CadLayerState[] = [];
    for (let i = 0; i + 1 < dict.body.length; i++) {
      const [code, name] = dict.body[i];
      if (code !== "3" || (dict.body[i + 1][0] !== "350" && dict.body[i + 1][0] !== "360")) continue;
      const record = objects.get(dict.body[i + 1][1].toUpperCase());
      if (!record || record.type !== "XRECORD") continue;
      const layers: Record<string, LayerStateEntry> = {};
      let current: { name: string; flags: number; aci: number; rgb: number | null } | null = null;
      const flush = () => {
        if (!current?.name) return;
        const aci = Math.abs(current.aci) || 7;
        layers[current.name] = { visible: !(current.flags & 1) && !(current.flags & 2) && current.aci >= 0, colorIndex: aci, color: current.rgb ?? getAcadColor(aci) };
      };
      // Per-layer data starts after the record's own header (280 / 91 / 301 / 290 / 302); 330 or 8 opens each layer.
      let started = false;
      for (const [c, v] of record.body) {
        if (c === "100" && v === "AcDbXrecord") { started = true; continue; }
        if (!started) continue;
        if (c === "330" || c === "8") {
          const n = c === "8" ? v : layerName.get(v.toUpperCase());
          if (c === "330" && !n) continue; // the record's owner pointer, not a layer
          flush();
          current = { name: n ?? "", flags: 0, aci: 7, rgb: null };
        } else if (current) {
          if (c === "90") current.flags = Number(v) || 0;
          else if (c === "62") current.aci = Number(v) || 7;
          else if (c === "420") current.rgb = (Number(v) >>> 0) & 0xffffff;
        }
      }
      flush();
      if (Object.keys(layers).length) states.push({ name, layers });
    }
    return states;
  } catch {
    return [];
  }
}

/**
 * Layers whose current on/off or colour differs from what `state` saved (layers it does not list are not compared,
 * as restoring it would not touch them). Empty = the drawing shows exactly this state (用戶：顯示與目前圖層相符或不符).
 */
export function layerStateDiff(state: CadLayerState, layers: readonly { name: string; visible: boolean; color: number }[]): string[] {
  const now = new Map(layers.map((l) => [l.name, l]));
  return Object.entries(state.layers)
    .filter(([name, saved]) => { const l = now.get(name); return !!l && (l.visible !== saved.visible || (l.color & 0xffffff) !== (saved.color & 0xffffff)); })
    .map(([name]) => name);
}
