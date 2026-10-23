// Windows Metafile (WMF) playback onto a 2D canvas, for the preview picture Office stores in
// embedded Excel / Word objects (\u0002OlePres000). Covers the records Office and GDI write for
// tables and text; anything else is skipped and counted. Only local bytes; never fetch.
type Ctx = Pick<CanvasRenderingContext2D,
  "save" | "restore" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "rect" | "ellipse" | "clip" | "fill" | "stroke" |
  "fillRect" | "fillText" | "measureText" | "translate" | "rotate" | "setLineDash"> & {
  fillStyle: unknown; strokeStyle: unknown; lineWidth: number; lineCap: string; lineJoin: string; font: string; textBaseline: string;
};

type Pen = { kind: "pen"; style: number; width: number; color: string };
type Brush = { kind: "brush"; style: number; color: string };
type Font = { kind: "font"; height: number; weight: number; italic: boolean; underline: boolean; strike: boolean; charset: number; face: string; escapement: number };
type Obj = Pen | Brush | Font | { kind: "other" };
type Clip = { left: number; top: number; right: number; bottom: number } | null;
type State = {
  pen: Pen; brush: Brush; font: Font; textColor: string; bkColor: string; bkMode: number; textAlign: number;
  winOrg: { x: number; y: number }; winExt: { x: number; y: number }; clip: Clip; cp: { x: number; y: number }; polyFill: CanvasFillRule;
};

export type WmfInfo = { width: number; height: number; originX: number; originY: number };
export type WmfResult = { drawn: number; skipped: Record<string, number> };

const HEADER_WORDS = 9;
const MAX_RECORDS = 500_000;

function color(v: number): string {
  // COLORREF 0x00BBGGRR; the high byte only says how GDI picks a palette entry.
  return `rgb(${v & 0xff},${(v >> 8) & 0xff},${(v >> 16) & 0xff})`;
}

function* records(bytes: Uint8Array): Generator<{ fn: number; at: number; words: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < HEADER_WORDS * 2 || view.getUint16(2, true) !== HEADER_WORDS) throw Error("內嵌預覽不是可讀的 WMF");
  let at = HEADER_WORDS * 2;
  for (let n = 0; n < MAX_RECORDS && at + 6 <= bytes.length; n++) {
    const words = view.getUint32(at, true), fn = view.getUint16(at + 4, true);
    if (fn === 0) return;
    if (words < 3 || at + words * 2 > bytes.length) throw Error("內嵌預覽 WMF 資料不完整");
    yield { fn, at: at + 6, words };
    at += words * 2;
  }
}

/** Window origin and extent the metafile draws in (its own logical units). */
export function wmfInfo(bytes: Uint8Array): WmfInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let org = { x: 0, y: 0 }, ext: { x: number; y: number } | null = null;
  for (const r of records(bytes)) {
    if (r.fn === 0x020b) org = { y: view.getInt16(r.at, true), x: view.getInt16(r.at + 2, true) };
    if (r.fn === 0x020c) { ext = { y: view.getInt16(r.at, true), x: view.getInt16(r.at + 2, true) }; break; }
  }
  if (!ext || !ext.x || !ext.y) throw Error("內嵌預覽 WMF 沒有畫面範圍");
  return { width: Math.abs(ext.x), height: Math.abs(ext.y), originX: org.x, originY: org.y };
}

const ENCODING: Record<number, string> = { 128: "shift_jis", 129: "euc-kr", 134: "gbk", 136: "big5", 161: "windows-1253", 162: "windows-1254", 177: "windows-1255", 178: "windows-1256", 186: "windows-1257", 204: "windows-1251", 222: "windows-874", 238: "windows-1250" };
const DBCS: Record<number, (b: number) => boolean> = {
  128: (b) => (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc),
  129: (b) => b >= 0x81 && b <= 0xfe, 134: (b) => b >= 0x81 && b <= 0xfe, 136: (b) => b >= 0x81 && b <= 0xfe,
};
const SYMBOL_UPPER = "ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ", SYMBOL_LOWER = "αβχδεφγηιϕκλμνοπθρστυϖωξψζ";
const SYMBOL_EXTRA: Record<number, string> = { 0xa3: "≤", 0xb0: "°", 0xb1: "±", 0xb3: "≥", 0xb4: "×", 0xb8: "÷", 0xb9: "≠", 0xbb: "≈", 0xd6: "√", 0xa5: "∞", 0xae: "→", 0xac: "←", 0xad: "↑", 0xaf: "↓", 0xb6: "∂", 0xe5: "∑", 0xf2: "∫", 0xd0: "∠", 0xb7: "•" };
const decoders = new Map<string, TextDecoder>();
const decoder = (label: string) => { let d = decoders.get(label); if (!d) { d = new TextDecoder(label); decoders.set(label, d); } return d; };

/** Characters with the byte range each came from, so the per-byte advance array lines up. */
export function decodeWmfText(raw: Uint8Array, charset: number, face: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  if (charset === 2 || /^symbol$/i.test(face)) {
    raw.forEach((b, i) => {
      const t = b >= 0x41 && b <= 0x5a ? SYMBOL_UPPER[b - 0x41] : b >= 0x61 && b <= 0x7a ? SYMBOL_LOWER[b - 0x61] : SYMBOL_EXTRA[b] ?? String.fromCharCode(b);
      out.push({ text: t, start: i, end: i + 1 });
    });
    return out;
  }
  const label = ENCODING[charset] ?? "windows-1252", lead = DBCS[charset];
  for (let i = 0; i < raw.length;) {
    const n = lead && lead(raw[i]) && i + 1 < raw.length ? 2 : 1;
    out.push({ text: decoder(label).decode(raw.subarray(i, i + n)), start: i, end: i + n });
    i += n;
  }
  return out;
}

const FACE_ALIAS: Record<string, string> = { "新細明體": "PMingLiU", "細明體": "MingLiU", "標楷體": "DFKai-SB", "微軟正黑體": "Microsoft JhengHei", "宋体": "SimSun", "黑体": "SimHei", "ＭＳ 明朝": "MS Mincho", "ＭＳ ゴシック": "MS Gothic" };
function cssFont(f: Font, px: number): string {
  const serif = /明|楷|宋|Times|Mincho|Roman|Serif/i.test(f.face) && !/Sans/i.test(f.face);
  const families = [f.face, FACE_ALIAS[f.face]].filter(Boolean).map((n) => `"${n!.replace(/"/g, "")}"`);
  families.push(serif ? '"Noto Serif CJK TC","Noto Serif TC",serif' : '"Noto Sans CJK TC","Noto Sans TC",sans-serif');
  return `${f.italic ? "italic " : ""}${f.weight >= 600 ? "bold " : ""}${Math.max(1, px).toFixed(2)}px ${families.join(",")}`;
}

/** Play the metafile so its window fills a canvas of width x height pixels. */
export function renderWmf(bytes: Uint8Array, ctx: Ctx, width: number, height: number): WmfResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const i16 = (o: number) => view.getInt16(o, true), u16 = (o: number) => view.getUint16(o, true), u32 = (o: number) => view.getUint32(o, true);
  const header = new DataView(bytes.buffer, bytes.byteOffset, HEADER_WORDS * 2);
  const objects: (Obj | null)[] = new Array(Math.max(1, header.getUint16(10, true))).fill(null);
  const defaultPen: Pen = { kind: "pen", style: 0, width: 0, color: color(0) };
  const defaultBrush: Brush = { kind: "brush", style: 0, color: color(0xffffff) };
  const defaultFont: Font = { kind: "font", height: -12, weight: 400, italic: false, underline: false, strike: false, charset: 0, face: "Arial", escapement: 0 };
  let s: State = { pen: defaultPen, brush: defaultBrush, font: defaultFont, textColor: color(0), bkColor: color(0xffffff), bkMode: 2, textAlign: 0,
    winOrg: { x: 0, y: 0 }, winExt: { x: width, y: height }, clip: null, cp: { x: 0, y: 0 }, polyFill: "evenodd" };
  const stack: State[] = [];
  const result: WmfResult = { drawn: 0, skipped: {} };
  const skip = (fn: number) => { const k = "0x" + fn.toString(16); result.skipped[k] = (result.skipped[k] ?? 0) + 1; };
  const sx = () => width / s.winExt.x, sy = () => height / s.winExt.y;
  const X = (x: number) => (x - s.winOrg.x) * sx(), Y = (y: number) => (y - s.winOrg.y) * sy();
  const put = (o: Obj) => { let i = objects.indexOf(null); if (i < 0) { i = objects.length; objects.push(null); } objects[i] = o; };
  const withClip = (draw: () => void) => {
    ctx.save();
    if (s.clip) { ctx.beginPath(); ctx.rect(X(s.clip.left), Y(s.clip.top), X(s.clip.right) - X(s.clip.left), Y(s.clip.bottom) - Y(s.clip.top)); ctx.clip(); }
    draw();
    ctx.restore();
    result.drawn++;
  };
  const strokePen = () => {
    if (s.pen.style === 5) return false;
    ctx.strokeStyle = s.pen.color;
    ctx.lineWidth = Math.max(1, s.pen.width * Math.abs(sx()));
    ctx.lineCap = s.pen.width > 1 ? "round" : "butt";
    ctx.lineJoin = s.pen.width > 1 ? "round" : "miter";
    const unit = ctx.lineWidth;
    ctx.setLineDash(({ 1: [6, 2], 2: [1, 2], 3: [6, 2, 1, 2], 4: [6, 2, 1, 2, 1, 2] } as Record<number, number[]>)[s.pen.style & 0xf]?.map((d) => d * unit * 1.5) ?? []);
    return true;
  };
  const fillBrush = () => { if (s.brush.style === 1) return false; ctx.fillStyle = s.brush.color; return true; };
  const points = (at: number, n: number) => { const p: [number, number][] = []; for (let i = 0; i < n; i++) p.push([X(i16(at + i * 4)), Y(i16(at + i * 4 + 2))]); return p; };
  const path = (polys: [number, number][][], close: boolean) => { ctx.beginPath(); for (const p of polys) { p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); } };
  const shape = (build: () => void) => withClip(() => { build(); if (fillBrush()) ctx.fill(s.polyFill); build(); if (strokePen()) ctx.stroke(); });
  const fillRect = (left: number, top: number, right: number, bottom: number, style: string) =>
    withClip(() => { ctx.fillStyle = style; ctx.fillRect(X(left), Y(top), X(right) - X(left), Y(bottom) - Y(top)); });

  const text = (x: number, y: number, raw: Uint8Array, dx: number[] | null, options: number, rect: Clip) => {
    const f = s.font, em = Math.abs(f.height) * (f.height < 0 ? 1 : 0.86) * Math.abs(sy());
    const chars = decodeWmfText(raw, f.charset, f.face);
    ctx.font = cssFont(f, em);
    const advance = chars.map((c) => dx ? dx.slice(c.start, c.end).reduce((a, b) => a + b, 0) * sx() : ctx.measureText(c.text).width);
    const total = advance.reduce((a, b) => a + b, 0);
    const align = s.textAlign, h = align & 6, v = align & 24;
    if (align & 1) { x = s.cp.x; y = s.cp.y; }
    const px = X(x), py = Y(y);
    const start = h === 6 ? -total / 2 : h === 2 ? -total : 0;
    withClip(() => {
      if (rect && (options & 4)) { ctx.beginPath(); ctx.rect(X(rect.left), Y(rect.top), X(rect.right) - X(rect.left), Y(rect.bottom) - Y(rect.top)); ctx.clip(); }
      if (rect && (options & 2)) { ctx.fillStyle = s.bkColor; ctx.fillRect(X(rect.left), Y(rect.top), X(rect.right) - X(rect.left), Y(rect.bottom) - Y(rect.top)); }
      ctx.translate(px, py);
      if (f.escapement) ctx.rotate((-f.escapement / 10) * Math.PI / 180 * Math.sign(sx() * sy()));
      ctx.textBaseline = v === 24 ? "alphabetic" : v === 8 ? "bottom" : "top";
      const top = v === 24 ? -em * 0.86 : v === 8 ? -em : 0;
      if (s.bkMode === 2 && !(options & 2)) { ctx.fillStyle = s.bkColor; ctx.fillRect(start, top, total, em); }
      ctx.fillStyle = s.textColor;
      let cx = start;
      chars.forEach((c, i) => { if (c.text.trim()) ctx.fillText(c.text, cx, 0); cx += advance[i]; });
      if (f.underline || f.strike) {
        ctx.fillStyle = s.textColor;
        const t = Math.max(1, em / 16);
        if (f.underline) ctx.fillRect(start, top + em * 0.98, total, t);
        if (f.strike) ctx.fillRect(start, top + em * 0.55, total, t);
      }
    });
    if (align & 1) s.cp = { x: x + total / sx(), y };
  };

  for (const r of records(bytes)) {
    const a = r.at, nParams = r.words - 3;
    switch (r.fn) {
      case 0x0103: case 0x0104: case 0x0626: case 0x020d: case 0x020e: case 0x0107: case 0x0105: case 0x0108: case 0x0231: case 0x0211: break;
      case 0x0102: s.bkMode = u16(a); break;
      case 0x0106: s.polyFill = u16(a) === 2 ? "nonzero" : "evenodd"; break;
      case 0x0201: s.bkColor = color(u32(a)); break;
      case 0x0209: s.textColor = color(u32(a)); break;
      case 0x012e: s.textAlign = u16(a); break;
      case 0x020b: s.winOrg = { y: i16(a), x: i16(a + 2) }; break;
      case 0x020f: s.winOrg = { y: s.winOrg.y + i16(a), x: s.winOrg.x + i16(a + 2) }; break;
      case 0x020c: { const y = i16(a), x = i16(a + 2); if (x && y) s.winExt = { x, y }; break; }
      case 0x001e: stack.push({ ...s }); break;
      case 0x0127: {
        const n = i16(a), target = n < 0 ? stack.length + n : n - 1;
        if (target >= 0 && target < stack.length) { s = stack[target]; stack.length = target; }
        break;
      }
      case 0x02fa: put({ kind: "pen", style: u16(a), width: Math.abs(i16(a + 2)), color: color(u32(a + 6)) }); break;
      case 0x02fc: put({ kind: "brush", style: u16(a), color: color(u32(a + 2)) }); break;
      case 0x02fb: {
        const face = bytes.subarray(a + 18, a + 18 + Math.min(32, nParams * 2 - 18));
        const end = face.indexOf(0), charset = bytes[a + 13];
        const name = decoder(ENCODING[charset] ?? "windows-1252").decode(face.subarray(0, end < 0 ? face.length : end));
        put({ kind: "font", height: i16(a) || -12, escapement: i16(a + 4), weight: i16(a + 8), italic: !!bytes[a + 10], underline: !!bytes[a + 11], strike: !!bytes[a + 12], charset, face: name });
        break;
      }
      case 0x00f7: case 0x0142: case 0x01f9: case 0x06ff: put({ kind: "other" }); break;
      case 0x012d: {
        const o = objects[u16(a)];
        if (o?.kind === "pen") s.pen = o; else if (o?.kind === "brush") s.brush = o; else if (o?.kind === "font") s.font = o;
        break;
      }
      case 0x01f0: { const i = u16(a); if (i < objects.length) objects[i] = null; break; }
      case 0x012c: s.clip = null; break; // SelectClipRgn without a region object resets the clip
      case 0x0416: {
        const c = { bottom: i16(a), right: i16(a + 2), top: i16(a + 4), left: i16(a + 6) };
        s.clip = s.clip ? { left: Math.max(s.clip.left, c.left), top: Math.max(s.clip.top, c.top), right: Math.min(s.clip.right, c.right), bottom: Math.min(s.clip.bottom, c.bottom) } : c;
        break;
      }
      case 0x0214: s.cp = { y: i16(a), x: i16(a + 2) }; break;
      case 0x0213: {
        const to = { y: i16(a), x: i16(a + 2) }, from = s.cp;
        withClip(() => { if (strokePen()) { ctx.beginPath(); ctx.moveTo(X(from.x), Y(from.y)); ctx.lineTo(X(to.x), Y(to.y)); ctx.stroke(); } });
        s.cp = to;
        break;
      }
      case 0x0324: { const p = points(a + 2, i16(a)); shape(() => path([p], true)); break; }
      case 0x0325: { const p = points(a + 2, i16(a)); withClip(() => { if (strokePen()) { path([p], false); ctx.stroke(); } }); break; }
      case 0x0538: {
        const n = u16(a), counts = Array.from({ length: n }, (_, i) => u16(a + 2 + i * 2));
        let at = a + 2 + n * 2; const polys = counts.map((c) => { const p = points(at, c); at += c * 4; return p; });
        shape(() => path(polys, true));
        break;
      }
      case 0x041b: { const b = i16(a), rt = i16(a + 2), t = i16(a + 4), l = i16(a + 6); shape(() => { ctx.beginPath(); ctx.rect(X(l), Y(t), X(rt) - X(l), Y(b) - Y(t)); }); break; }
      case 0x061c: { const b = i16(a + 4), rt = i16(a + 6), t = i16(a + 8), l = i16(a + 10); shape(() => { ctx.beginPath(); ctx.rect(X(l), Y(t), X(rt) - X(l), Y(b) - Y(t)); }); break; }
      case 0x0418: {
        const b = i16(a), rt = i16(a + 2), t = i16(a + 4), l = i16(a + 6);
        shape(() => { ctx.beginPath(); ctx.ellipse((X(l) + X(rt)) / 2, (Y(t) + Y(b)) / 2, Math.abs(X(rt) - X(l)) / 2, Math.abs(Y(b) - Y(t)) / 2, 0, 0, Math.PI * 2); });
        break;
      }
      case 0x0940: case 0x0b41: {
        // Without a bitmap the blit only paints a pattern: PATCOPY with the brush, BLACKNESS, WHITENESS.
        const rop = u32(a), withBitmap = r.fn === 0x0940 ? nParams > 9 : nParams > 11;
        if (withBitmap) { skip(r.fn); break; }
        const o = r.fn === 0x0940 ? a + 10 : a + 14;
        const h = i16(o), w = i16(o + 2), y = i16(o + 4), x = i16(o + 6);
        if (rop === 0x00f00021) { if (s.brush.style !== 1) fillRect(x, y, x + w, y + h, s.brush.color); }
        else if (rop === 0x00000042) fillRect(x, y, x + w, y + h, color(0));
        else if (rop === 0x00ff0062) fillRect(x, y, x + w, y + h, color(0xffffff));
        else if (rop !== 0x00aa0029) skip(r.fn);
        break;
      }
      case 0x0a32: {
        const y = i16(a), x = i16(a + 2), len = i16(a + 4), options = u16(a + 6);
        let at = a + 8, rect: Clip = null;
        if (options & 6) { rect = { left: i16(at), top: i16(at + 2), right: i16(at + 4), bottom: i16(at + 6) }; at += 8; }
        const raw = bytes.subarray(at, at + len);
        at += len + (len & 1);
        const end = r.at + nParams * 2, dx = end - at >= len * 2 ? Array.from({ length: len }, (_, i) => i16(at + i * 2)) : null;
        text(x, y, raw, dx, options, rect);
        break;
      }
      case 0x0521: { const len = i16(a), at = a + 2 + len + (len & 1); text(i16(at + 2), i16(at), bytes.subarray(a + 2, a + 2 + len), null, 0, null); break; }
      default: skip(r.fn);
    }
  }
  return result;
}
