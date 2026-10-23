// Find text on the current sheet: TEXT, MTEXT, attributes and dimension text, inside blocks too,
// using the measurement geometry (already in drawing coordinates). Formatting codes are removed
// and full-width / half-width and letter case are treated alike, so "FB" finds "ＦＢ" and "fb".
import type { DrawingBounds } from "./savedView";
import type { MeasurableEntity } from "./measurementGeometry";

export type TextHit = { text: string; layer: string; bounds: DrawingBounds; textHeight?: number; at?: number };

/** Plain text of a CAD string: MTEXT codes, %% codes and \U+ escapes resolved. */
export function plainCadText(raw: string): string {
  return raw
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[Pp]|\\[Nn]|\^J/g, " ")
    .replace(/\\S([^;]*?)[#^/]([^;]*);/g, "$1/$2")
    .replace(/\\[ACcFfHhQTWpLlOoKkXx][^;\\{}]*;?|\\[LlOoKk]/g, "")
    .replace(/\\~/g, " ")
    .replace(/\\([\\{}])/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%[uUoO]/g, "").replace(/%%%/g, "%")
    .replace(/\s+/g, " ")
    .trim();
}

// Letter height as drawn: a block can scale its text, so a single line uses its drawn bounds; an MTEXT
// paragraph uses its own height, kept within what its bounds allow.
function shownHeight(e: MeasurableEntity): number | undefined {
  const hb = e.bounds.maxY - e.bounds.minY, own = Number(e.properties?.textHeight) || 0;
  if (!(hb > 0)) return own || undefined;
  if (e.kind !== "MTEXT" || !own) return hb / 1.2;
  return Math.min(Math.max(own, hb / 40), hb);
}

const fold = (s: string) => s.normalize("NFKC").toLocaleLowerCase("zh-TW").replace(/\s+/g, "");

export function searchTexts(entities: readonly MeasurableEntity[], query: string, limit = 500): TextHit[] {
  const q = fold(query);
  if (!q) return [];
  type Group = TextHit & { area: number; union: DrawingBounds };
  const groups: Group[] = [], byPlace = new Set<string>(), dims = new Map<string, Group[]>();
  const area = (b: DrawingBounds) => (b.maxX - b.minX) * (b.maxY - b.minY);
  const touches = (a: DrawingBounds, b: DrawingBounds, eps: number) =>
    a.minX - eps <= b.maxX && b.minX - eps <= a.maxX && a.minY - eps <= b.maxY && b.minY - eps <= a.maxY;
  for (const e of entities) {
    const raw = e.properties?.text;
    if (typeof raw !== "string" || !raw) continue;
    const text = plainCadText(raw);
    if (!fold(text).includes(q)) continue;
    const b = e.bounds;
    if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) continue;
    const handle = e.properties?.handle;
    if (e.kind === "DIMENSION" && typeof handle === "string") {
      // A dimension is drawn as lines, arrows and its text, all carrying the text: one hit per
      // dimension (pieces that touch), shown at its largest piece, which is the text.
      const list = dims.get(handle) ?? [], h = Number(e.properties?.textHeight) || 0;
      const g = list.find((x) => touches(x.union, b, Math.max(h, 1e-6)));
      if (g) {
        g.union = { minX: Math.min(g.union.minX, b.minX), minY: Math.min(g.union.minY, b.minY), maxX: Math.max(g.union.maxX, b.maxX), maxY: Math.max(g.union.maxY, b.maxY) };
        if (area(b) > g.area) Object.assign(g, { bounds: b, area: area(b), layer: e.layer ?? "" });
        continue;
      }
      if (groups.length >= limit) break;
      const created: Group = { text, layer: e.layer ?? "", bounds: b, area: area(b), union: b, textHeight: h || undefined };
      list.push(created); dims.set(handle, list); groups.push(created);
      continue;
    }
    const key = `${text}|${Math.round(b.minX)}|${Math.round(b.minY)}`;
    if (byPlace.has(key)) continue;
    if (groups.length >= limit) break;
    byPlace.add(key);
    // Where the match sits along a single line (0..1), so a long line is shown around the word.
    const f = fold(text), at = e.kind === "MTEXT" ? undefined : (f.indexOf(q) + q.length / 2) / Math.max(f.length, 1);
    groups.push({ text, layer: e.layer ?? "", bounds: b, area: area(b), union: b, textHeight: shownHeight(e), at });
  }
  const hits: TextHit[] = groups.map(({ text, layer, bounds, textHeight, at }) => ({ text, layer, bounds, ...(textHeight ? { textHeight } : {}), ...(at !== undefined ? { at } : {}) }));
  // Reading order: top to bottom, then left to right (rows by text height).
  return hits.sort((a, b) => {
    const row = Math.max(a.bounds.maxY - a.bounds.minY, b.bounds.maxY - b.bounds.minY, 1e-9);
    const dy = Math.round((b.bounds.maxY - a.bounds.maxY) / row);
    return dy || a.bounds.minX - b.bounds.minX;
  });
}

/**
 * Bounds to show a hit so its letters are readable on a phone: about 24 text heights across
 * (a line longer than that is centred and can be panned), never tighter than 12 text heights.
 */
export function hitView(b: DrawingBounds, textHeight?: number, at?: number): DrawingBounds {
  const w = b.maxX - b.minX, hb = b.maxY - b.minY;
  const h = textHeight && textHeight > 0 ? textHeight : Math.max(Math.min(hb, w), 1e-6);
  const across = Math.min(Math.max(w + 4 * h, 12 * h), 24 * h), cy = (b.minY + b.maxY) / 2;
  // Centre on the matched word when the line does not fit, without leaving the line.
  const want = at !== undefined && w > across ? b.minX + at * w : (b.minX + b.maxX) / 2;
  const cx = w > across ? Math.min(Math.max(want, b.minX + across / 2 - 2 * h), b.maxX - across / 2 + 2 * h) : want;
  const half = { x: across / 2, y: Math.max(across, hb + 4 * h) / 2 };
  return { minX: cx - half.x, maxX: cx + half.x, minY: cy - half.y, maxY: cy + half.y };
}
