// LibreDWG's DXF writer skips some block definitions (seen on blocks with attribute definitions, e.g.
// the JK12D2D electrical symbols in 拾山 16B+16C): the BLOCK_RECORD is written, the BLOCK is not, so
// every INSERT of it draws nothing. The same library's object reader still has the entities, so the
// conversion worker rebuilds just those blocks from it in the shape DxfParser produces.
import { getAcadColor } from "dxf-viewer/src/parser/ParseHelpers.js";
import { arrowheadEntities } from "../viewer/leader";
import { wipeoutPolygon } from "../viewer/wipeout";

type Any = any;
type P = { x: number; y: number; z?: number };
const deg = (rad: number | undefined) => ((rad ?? 0) * 180) / Math.PI;
const pt = (p: P | undefined): P => ({ x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 });

/** Leader arrow size of the drawing's current dimension settings ($DIMASZ × $DIMSCALE). */
export function headerArrowSize(dxf: string): number {
  const head = dxf.slice(0, 200000);
  const value = (name: string) => {
    const at = head.indexOf("\n" + name);
    const m = at < 0 ? null : /^\r?\n\s*40\r?\n\s*([-0-9.eE+]+)/.exec(head.slice(at + 1 + name.length));
    return m ? Number(m[1]) : NaN;
  };
  const asz = value("$DIMASZ"), scale = value("$DIMSCALE");
  return (asz > 0 ? asz : 2.5) * (scale > 0 ? scale : 1);
}

/**
 * Names of blocks LibreDWG's DXF uses but does not define: a BLOCK_RECORD without its BLOCK, or an
 * INSERT whose block was left out of the table altogether (建照 A2: A-UNIT-TF_B, *U137).
 */
export function missingBlockNames(dxf: string): string[] {
  const lines = dxf.split(/\r?\n/), wanted = new Set<string>(), defined = new Set<string>();
  let section = "", table = "";
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim(), value = lines[i + 1];
    if (code !== "0") continue;
    if (value === "SECTION") { section = lines[i + 3] ?? ""; continue; }
    if (value === "TABLE") { table = lines[i + 3] ?? ""; continue; }
    const into = (section === "TABLES" && table === "BLOCK_RECORD" && value === "BLOCK_RECORD") || ((section === "ENTITIES" || section === "BLOCKS") && value === "INSERT") ? wanted
      : (section === "BLOCKS" && value === "BLOCK") ? defined : null;
    if (!into) continue;
    for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== "0"; j += 2) if (lines[j].trim() === "2") { into.add(lines[j + 1]); break; }
  }
  return [...wanted].filter((n) => n && !defined.has(n) && !/^\*(model|paper)_space/i.test(n));
}

function common(e: Any): Any {
  const out: Any = { type: e.type, handle: e.handle, layer: e.layer || "0", colorIndex: e.colorIndex ?? 256 };
  if (e.lineType) out.lineType = e.lineType;
  if (e.lineweight !== undefined && e.lineweight !== 29) out.lineweight = e.lineweight;
  if (Number.isInteger(e.color) && e.color >= 0) out.trueColor = e.color & 0xffffff;
  else out.color = getAcadColor(Math.abs(out.colorIndex));
  if (e.isVisible === false) out.hidden = true;
  // A downward normal turns circles, arcs, polylines and hatches over, as parsed entities carry it.
  const n = e.extrusionDirection;
  if (n && Number.isFinite(n.z) && n.z < 0) out.extrusionDirection = { x: n.x ?? 0, y: n.y ?? 0, z: n.z };
  return out;
}

function textFields(t: Any): Any {
  return { text: t.text ?? "", startPoint: pt(t.startPoint), endPoint: pt(t.endPoint), textHeight: t.textHeight, rotation: deg(t.rotation),
    xScale: t.xScale ?? 1, obliqueAngle: deg(t.obliqueAngle), styleName: t.styleName, halign: t.halign ?? 0, valign: t.valign ?? 0 };
}

function hatchLoop(p: Any): Any {
  const flag = p.boundaryPathTypeFlag ?? 0, loop: Any = { type: flag, isExternal: (flag & 1) !== 0, isOutermost: (flag & 16) !== 0 };
  if (flag & 2) loop.polyline = { isClosed: !!p.isClosed, vertices: (p.vertices ?? []).map((v: Any) => ({ x: v.x, y: v.y, ...(v.bulge ? { bulge: v.bulge } : {}) })) };
  else loop.edges = (p.edges ?? []).map((g: Any) =>
    g.type === 1 ? { type: 1, start: pt(g.start), end: pt(g.end) }
      : g.type === 2 ? { type: 2, start: pt(g.center), radius: g.radius, startAngle: g.startAngle, endAngle: g.endAngle, isCcw: g.isCCW ?? g.isCcw }
      : g.type === 3 ? { type: 3, start: pt(g.center), end: pt(g.endPoint ?? g.majorAxisEndPoint), radius: g.lengthOfMinorAxis ?? g.axisRatio, startAngle: g.startAngle, endAngle: g.endAngle, isCcw: g.isCCW ?? g.isCcw }
      : { type: 4, controlPoints: (g.controlPoints ?? []).map(pt), fitPoints: (g.fitDatum ?? g.fitPoints ?? []).map(pt), knotValues: g.knots ?? g.knotValues ?? [], degreeOfSplineCurve: g.degree, rational: g.rational, periodic: g.periodic });
  return loop;
}

/** Points of a smooth curve through `p` (centripetal Catmull-Rom, 8 steps per span). */
export function throughPoints(p: P[], closed: boolean): P[] {
  const n = p.length, at = (i: number) => closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
  const out: P[] = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const d = (a: P, b: P) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-9);
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = 0; k < 8; k++) {
      const t = t1 + (t2 - t1) * k / 8;
      const lerp = (a: P, b: P, ta: number, tb: number) => ({ x: (a.x * (tb - t) + b.x * (t - ta)) / (tb - ta), y: (a.y * (tb - t) + b.y * (t - ta)) / (tb - ta) });
      const a1 = lerp(p0, p1, 0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, 0, t2), b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  if (!closed) out.push(p[n - 1]);
  return out;
}

/** DxfParser-shaped entities for one converter entity (an INSERT brings its ATTRIBs along). */
export function viewerEntities(e: Any, arrowSize = 2.5): Any[] {
  const c = common(e);
  switch (e.type) {
    case "LINE": return [{ ...c, vertices: [pt(e.startPoint), pt(e.endPoint)] }];
    case "CIRCLE": return [{ ...c, center: pt(e.center), radius: e.radius }];
    case "ARC": return [{ ...c, center: pt(e.center), radius: e.radius, startAngle: e.startAngle, endAngle: e.endAngle }];
    case "ELLIPSE": return [{ ...c, center: pt(e.center), majorAxisEndPoint: pt(e.majorAxisEndPoint), axisRatio: e.axisRatio, startAngle: e.startAngle, endAngle: e.endAngle }];
    case "POINT": return [{ ...c, position: pt(e.position) }];
    case "SOLID": return [{ ...c, points: [e.corner1, e.corner2, e.corner3, e.corner4 ?? e.corner3].map(pt) }];
    case "LWPOLYLINE": return [{ ...c, shape: ((e.flag ?? 0) & 512) !== 0, ...(e.constantWidth ? { width: e.constantWidth } : {}), elevation: e.elevation,
      vertices: (e.vertices ?? []).map((v: Any) => ({ x: v.x, y: v.y, ...(v.bulge ? { bulge: v.bulge } : {}), ...(v.startWidth ? { startWidth: v.startWidth } : {}), ...(v.endWidth ? { endWidth: v.endWidth } : {}) })) }];
    case "WIPEOUT": { // 上晴 B區-2: 78 in rebuilt blocks; masked like a parsed one once the blocks are merged
      const clip = (e.clippingBoundaryPath ?? []).map(pt);
      return [{ ...c, type: "WIPEOUT", polygon: wipeoutPolygon({ position: pt(e.position), u: pt(e.uPixel), v: pt(e.vPixel), clip }) }];
    }
    case "POLYLINE2D": // 惠宇 B14: 1436 of them in rebuilt blocks; drawn as the light polyline it is (spline-frame vertices left out)
    case "POLYLINE3D": { // 上晴 B區-2: 32; seen from above, as CAD's plan view shows it
      const at = (v: Any, k: "startWidth" | "endWidth") => v[k] || e[k] || 0;
      const vertices = (e.vertices ?? []).filter((v: Any) => ((v.flag ?? 0) & 16) === 0).map((v: Any) => ({ x: v.x, y: v.y,
        ...(v.bulge ? { bulge: v.bulge } : {}), ...(at(v, "startWidth") ? { startWidth: at(v, "startWidth") } : {}), ...(at(v, "endWidth") ? { endWidth: at(v, "endWidth") } : {}) }));
      return vertices.length < 2 ? [] : [{ ...c, type: "LWPOLYLINE", shape: ((e.flag ?? 0) & 1) !== 0, elevation: e.elevation, vertices }];
    }
    case "SPLINE": { // 惠宇 B14: 109 in rebuilt blocks
      const flag = e.flag ?? 0;
      // The reader gives a fit-point spline (上晴 B區-2: 21 in rebuilt blocks) no control points; CAD's curve passes
      // through every fit point, so draw a smooth curve through them (centripetal Catmull-Rom, close to CAD's shape).
      if ((e.controlPoints ?? []).length < 2) {
        const fit = (e.fitPoints ?? []).map(pt);
        return fit.length < 2 ? [] : [{ ...c, type: "LWPOLYLINE", shape: (flag & 1) !== 0, vertices: throughPoints(fit, (flag & 1) !== 0) }];
      }
      return [{ ...c, controlPoints: e.controlPoints.map(pt), degreeOfSplineCurve: e.degree, knotValues: e.knots ?? [],
        fitPoints: (e.fitPoints ?? []).map(pt), ...(e.weights?.length ? { weights: e.weights } : {}), closed: (flag & 1) !== 0, periodic: (flag & 2) !== 0, rational: (flag & 4) !== 0 }];
    }
    case "TEXT": return [{ ...c, ...textFields(e) }];
    case "MTEXT": return [{ ...c, text: e.text ?? "", position: pt(e.insertionPoint), height: e.textHeight, width: e.rectWidth, rotation: deg(e.rotation),
      ...(e.direction && (e.direction.x || e.direction.y) ? { direction: pt(e.direction) } : {}), styleName: e.styleName, attachmentPoint: e.attachmentPoint, drawingDirection: e.drawingDirection, lineSpacing: e.lineSpacing }];
    case "INSERT": {
      const insert = { ...c, name: e.name, position: pt(e.insertionPoint), xScale: e.xScale ?? 1, yScale: e.yScale ?? 1, zScale: e.zScale ?? 1, rotation: deg(e.rotation),
        ...(e.columnCount > 1 ? { columnCount: e.columnCount, columnSpacing: e.columnSpacing } : {}), ...(e.rowCount > 1 ? { rowCount: e.rowCount, rowSpacing: e.rowSpacing } : {}) };
      const attribs = (e.attribs ?? []).map((a: Any) => {
        const t = textFields(a.text ?? {});
        return { ...common(a), type: "ATTRIB", tag: a.tag, text: t.text, startPoint: t.startPoint, endPoint: pt(a.alignmentPoint ?? t.endPoint), textHeight: t.textHeight, rotation: t.rotation,
          scale: t.xScale, obliqueAngle: t.obliqueAngle, textStyle: t.styleName, horizontalJustification: t.halign, verticalJustification: t.valign, hidden: ((a.flags ?? 0) & 1) !== 0 };
      });
      return [insert, ...attribs];
    }
    case "HATCH": return [{ ...c, patternName: e.patternName, isSolid: !!e.solidFill, hatchStyle: e.hatchStyle, patternType: e.patternType, patternAngle: e.patternAngle ?? 0, patternScale: e.patternScale ?? 1,
      boundaryLoops: (e.boundaryPaths ?? []).map(hatchLoop),
      definitionLines: (e.definitionLines ?? []).map((l: Any) => ({ angle: l.angle, base: { x: l.base?.x ?? 0, y: l.base?.y ?? 0 }, offset: { x: l.offset?.x ?? 0, y: l.offset?.y ?? 0 }, ...(l.dashLengths?.length ? { dashes: l.dashLengths } : {}) })),
      seedPoints: (e.seedPoints ?? []).map(pt) }];
    case "DIMENSION": // drawn through its *D block, like a parsed dimension
      return e.name ? [{ ...c, block: e.name, dimensionType: e.dimensionType, anchorPoint: pt(e.definitionPoint), middleOfText: pt(e.textPoint), text: e.text ?? "",
        styleName: e.styleName, linearOrAngularPoint1: pt(e.subDefinitionPoint1), linearOrAngularPoint2: pt(e.subDefinitionPoint2), angle: deg(e.rotationAngle) }] : [];
    case "LEADER": {
      const v = (e.vertices ?? []).map(pt);
      if (v.length < 2) return [];
      const line = { ...c, type: "LWPOLYLINE", vertices: v.map((p: P) => ({ x: p.x, y: p.y })) };
      return e.isArrowheadEnabled === false ? [line] : [line, ...arrowheadEntities("closed", v[0], v[1], arrowSize, c, (e.handle ?? "") + ":arrow")];
    }
    default: return []; // ATTDEF is not drawn in an INSERT; others are counted as skipped.
  }
}

export type RebuiltBlocks = { blocks: Record<string, Any>; skipped: Record<string, number> };

/** Rebuild the named blocks from the converter's database. */
export function rebuildBlocks(db: Any, names: readonly string[], arrowSize = 2.5): RebuiltBlocks {
  const want = new Set(names), blocks: Record<string, Any> = {}, skipped: Record<string, number> = {};
  for (const r of db?.tables?.BLOCK_RECORD?.entries ?? []) {
    if (!want.has(r.name)) continue;
    const entities: Any[] = [];
    for (const e of r.entities ?? []) {
      const out = viewerEntities(e, arrowSize);
      if (!out.length && e.type !== "ATTDEF") skipped[e.type] = (skipped[e.type] ?? 0) + 1;
      entities.push(...out);
    }
    blocks[r.name] = { name: r.name, handle: r.handle, layer: "0", type: r.flags ?? 0, position: pt(r.basePoint), entities, cadRebuilt: true };
  }
  return { blocks, skipped };
}

// LibreDWG's DXF writer also mis-decodes some text in older CJK-codepage drawings (R2004 Big5 MTEXT in
// 15A/15C/16C 客變圖 came out as "\U+015CepU…"), while its object reader decodes it correctly. Garbage
// shows up as escapes into Latin Extended…Arabic/Syriac blocks that a Chinese drawing does not use
// (Greek is excluded: φ/α are normal on drawings).
const SUSPECT = /\U\+0(?:[12][0-9A-Fa-f]{2}|3[0-6][0-9A-Fa-f]|[4-7][0-9A-Fa-f]{2})/g;
const CJK_CODEPAGE = /^\s*ANSI_(932|936|949|950)\s*$/;
// Text the writer turns into old multibyte codes ("\M+5B4C5") sometimes gets bytes read past its end appended
// (":磁簧防盜感應器" came out with "L\x06" after it; 上晴 D 區 had 733 such texts, all with \M+ codes). The object
// reader has the same text without the tail. Long ones (over ~250 characters, 上晴 A/D 區 material notes) come out as
// only their last part behind leftovers of an earlier string, so any text the reader holds in these codes is taken
// from the reader.
const MIF_CODE = /\\M\+[1-5][0-9A-Fa-f]{4}/;
// A tail can also be a cut-off piece of such a code ("Yoga\PRoom" came out with "+5C0FD\" after it, 上晴 D 區).
const MIF_PIECE = /\+[1-5][0-9A-Fa-f]{4}/;

export const suspectTextCount = (text: string) => (text.match(SUSPECT) ?? []).length;

/** True when a converted DXF looks like it carries mis-decoded text worth re-reading. */
export function needsTextRecovery(dxf: string): boolean {
  const head = dxf.slice(0, 20000).split(/\r?\n/), i = head.findIndex((l) => l === "$DWGCODEPAGE");
  return i >= 0 && CJK_CODEPAGE.test(head[i + 2] ?? "") && (suspectTextCount(dxf) >= 3 || MIF_CODE.test(dxf));
}

/** Text of every text-bearing entity by handle, from the object reader. */
export function readerTexts(db: Any): Record<string, string> {
  const out: Record<string, string> = {};
  const take = (e: Any) => {
    const t = typeof e.text === "string" ? e.text : e.text?.text;
    if (e.handle && typeof t === "string" && t) out[e.handle] = e.type === "MTEXT" ? t.replace(/\r?\n/g, "\\P") : t;
    for (const a of e.attribs ?? []) take(a);
  };
  for (const e of db?.entities ?? []) take(e);
  for (const r of db?.tables?.BLOCK_RECORD?.entries ?? []) for (const e of r.entities ?? []) take(e);
  return out;
}

/**
 * Replace mis-decoded text with the reader's: text with garbage escapes, or the reader's text with a tail appended
 * after old multibyte codes (bytes read past the end of the string). Returns how many entities were fixed.
 */
export function applyReaderTexts(doc: Any, texts: Record<string, string>): number {
  let fixed = 0;
  const all = [...(doc.entities ?? []), ...Object.values(doc.blocks ?? {}).flatMap((b: Any) => b.entities ?? [])];
  for (const e of all) {
    const better = e.handle && texts[e.handle];
    if (!better || typeof e.text !== "string" || better === e.text) continue;
    if (suspectTextCount(e.text) > 0 || MIF_CODE.test(better) || (e.text.startsWith(better) && (MIF_CODE.test(e.text) || MIF_PIECE.test(e.text.slice(better.length))))) { e.text = better; fixed++; }
  }
  return fixed;
}
