// Legacy LEADER (舊式引線) → polyline + arrowhead. Its note text is a separate MTEXT that already renders.
// Arrow size = DIMASZ × DIMSCALE from the per-entity DSTYLE override, else the dimension style, else CAD defaults.
type Any = any;
type Tag = [number, string];
type P = { x: number; y: number };

export type LeaderStyle = { asz?: number; scale?: number; arrowBlock?: string };
export type ArrowKind = "closed" | "closedBlank" | "open" | "dot" | "tick" | "none";

/** Map a DIMLDRBLK block name to a drawable arrow; unknown names fall back to a closed filled arrow. */
export function arrowKind(blockName: string | undefined): { kind: ArrowKind; known: boolean } {
  const n = (blockName ?? "").toUpperCase();
  if (!n || n === "_CLOSEDFILLED") return { kind: "closed", known: true };
  if (n === "_NONE") return { kind: "none", known: true };
  if (n === "_CLOSED" || n === "_CLOSEDBLANK") return { kind: "closedBlank", known: true };
  if (n === "_OPEN" || n === "_OPEN30" || n === "_OPEN90") return { kind: "open", known: true };
  if (n === "_DOT" || n === "_DOTSMALL" || n === "_DOTBLANK") return { kind: "dot", known: true };
  if (n === "_ARCHTICK" || n === "_OBLIQUE") return { kind: "tick", known: true };
  return { kind: "closed", known: false };
}

/** Arrowhead at tip, pointing away from `from`; a third as wide as long like AutoCAD's closed arrow. */
export function arrowheadEntities(kind: ArrowKind, tip: P, from: P, size: number, common: Any, handle: string): Any[] {
  const dx = tip.x - from.x, dy = tip.y - from.y, len = Math.hypot(dx, dy);
  if (kind === "none" || !(size > 0) || !(len > 0)) return [];
  const ux = dx / len, uy = dy / len, bx = tip.x - ux * size, by = tip.y - uy * size, hw = size / 6;
  const a = { x: bx - uy * hw, y: by + ux * hw }, b = { x: bx + uy * hw, y: by - ux * hw }, t = { x: tip.x, y: tip.y };
  const z = (p: P) => ({ ...p, z: 0 });
  if (kind === "closed") return [{ ...common, type: "SOLID", handle, points: [z(t), z(a), z(b), z(b)] }];
  if (kind === "closedBlank") return [{ ...common, type: "LWPOLYLINE", handle, shape: true, vertices: [t, a, b] }];
  if (kind === "open") return [{ ...common, type: "LWPOLYLINE", handle, shape: false, vertices: [a, t, b] }];
  if (kind === "tick") {
    const h = size / 2, c = Math.SQRT1_2;
    const d = { x: (ux - uy) * c * h, y: (uy + ux) * c * h };
    return [{ ...common, type: "LWPOLYLINE", handle, shape: false, vertices: [{ x: tip.x - d.x, y: tip.y - d.y }, { x: tip.x + d.x, y: tip.y + d.y }] }];
  }
  // Dot: filled 12-gon as a triangle fan around the tip.
  const r = size / 4, ring = Array.from({ length: 12 }, (_, i) => ({ x: tip.x + r * Math.cos(i * Math.PI / 6), y: tip.y + r * Math.sin(i * Math.PI / 6) }));
  return ring.map((p, i) => ({ ...common, type: "SOLID", handle: `${handle}.${i}`, points: [z(t), z(p), z(ring[(i + 1) % 12]), z(ring[(i + 1) % 12])] }));
}

/** Centripetal Catmull-Rom through the points, 16 steps a span (ends extended by reflection). */
function catmullRom(ps: P[]): P[] {
  const pts = [{ x: 2 * ps[0].x - ps[1].x, y: 2 * ps[0].y - ps[1].y }, ...ps, { x: 2 * ps.at(-1)!.x - ps.at(-2)!.x, y: 2 * ps.at(-1)!.y - ps.at(-2)!.y }];
  const out: P[] = [ps[0]];
  for (let i = 1; i + 2 < pts.length; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const t = (a: P, b: P) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-9);
    const t1 = t(p0, p1), t2 = t1 + t(p1, p2), t3 = t2 + t(p2, p3);
    for (let k = 1; k <= 16; k++) {
      const u = t1 + (t2 - t1) * k / 16;
      const lerp = (a: P, b: P, ta: number, tb: number) => ({ x: ((tb - u) * a.x + (u - ta) * b.x) / (tb - ta), y: ((tb - u) * a.y + (u - ta) * b.y) / (tb - ta) });
      const a1 = lerp(p0, p1, 0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, 0, t2), b2 = lerp(a2, a3, t1, t3);
      out.push(k === 16 ? p2 : lerp(b1, b2, t1, t2));
    }
  }
  return out;
}

/** DSTYLE xdata override pairs: 1070 dim-var code followed by its value. */
function dstyleOverrides(tags: readonly Tag[]): Map<number, string> {
  const out = new Map<number, string>();
  const start = tags.findIndex(([c, v], i) => c === 1000 && v === "DSTYLE" && tags[i - 1]?.[0] === 1001);
  if (start < 0) return out;
  for (let i = start + 1; i + 1 < tags.length; i++) {
    const [c, v] = tags[i];
    if (c === 1002 && v === "}") break;
    if (c === 1070) { out.set(Number(v), tags[i + 1][1]); i++; }
  }
  return out;
}

export function leaderEntities(tags: readonly Tag[], base: { handle: string; layer: string; style?: LeaderStyle; blockName?: (handle: string) => string | undefined; hasBlock?: (name: string) => boolean; arrowFlagUnreliable?: boolean }): { entities: Any[]; notes: string[] } {
  const notes: string[] = [];
  const vertices: P[] = [];
  let arrow = true, spline = false, hook = false, hookSame = false;
  const horizontal = { x: 1, y: 0 };
  for (let i = 0; i < tags.length; i++) {
    const [c, v] = tags[i];
    if (c === 1001) break; // xdata follows
    if (c === 71) arrow = v !== "0";
    else if (c === 72) spline = v === "1";
    else if (c === 74) hookSame = v.trim() === "1";
    else if (c === 75) hook = v.trim() === "1";
    else if (c === 211) horizontal.x = Number(v);
    else if (c === 221) horizontal.y = Number(v);
    else if (c === 10) vertices.push({ x: Number(v), y: Number(tags[i + 1]?.[0] === 20 ? tags[i + 1][1] : 0) });
  }
  if (vertices.length < 2 || vertices.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return { entities: [], notes: [`舊式引線 ${base.handle} 頂點不足，未顯示`] };
  const over = dstyleOverrides(tags);
  const asz = over.has(41) ? Number(over.get(41)) : base.style?.asz ?? 2.5;
  const rawScale = over.has(40) ? Number(over.get(40)) : base.style?.scale ?? 1;
  const scale = rawScale > 0 ? rawScale : 1;
  const blockName = over.has(341) ? base.blockName?.(over.get(341)!) : base.style?.arrowBlock;
  const common = { layer: base.layer, lineType: "CONTINUOUS" };
  // Hook line (75=1): CAD bends into the last point along the annotation's horizontal direction (211/221), one arrow size
  // long; 74=0 means the hook comes from the opposite side. The bend itself is not stored (惠宇敦南 B4F-EE1: a leader to a
  // text turned 90° drew straight instead of dropping the last 21 units vertically).
  const hl = Math.hypot(horizontal.x, horizontal.y);
  if (hook && !spline && hl > 0 && Number.isFinite(hl) && asz * scale > 0) {
    const last = vertices[vertices.length - 1], s = (hookSame ? 1 : -1) * asz * scale / hl;
    vertices.splice(vertices.length - 1, 0, { x: last.x + horizontal.x * s, y: last.y + horizontal.y * s });
  }
  if (spline) notes.push(`舊式引線 ${base.handle} 為曲線引線，以通過各點的平滑曲線近似`);
  // LibreDWG reads 71=0 for leaders ZWCAD shows with arrows in R2018 files; follow the CAD default and say so.
  if (!arrow && base.arrowFlagUnreliable) { arrow = true; notes.push("此版本 DWG 的引線箭頭開關解析不可靠，已依 CAD 預設畫出，請與 CAD 核對"); }
  // A spline leader (72=1) runs smoothly through its vertices; a centripetal Catmull-Rom through them is close to
  // CAD's fit (喬瓏 鑫元鴻 天花板套圖-廠房-2F drew it as straight segments). The arrow keeps the first segment's direction.
  const path = spline && vertices.length > 2 ? catmullRom(vertices) : vertices;
  const entities: Any[] = [{ ...common, type: "LWPOLYLINE", handle: `${base.handle}:leader`, shape: false, vertices: path }];
  // CAD leaves the arrowhead off when the first segment is shorter than twice its size (W05 地下室水箱給水: DIMASZ 40 on
  // a 16.8 long segment drew a huge filled wedge over the note; ZWCAD draws none).
  const first = Math.hypot(vertices[1].x - vertices[0].x, vertices[1].y - vertices[0].y);
  if (arrow && first < 2 * asz * scale) arrow = false;
  if (arrow) {
    const { kind, known } = arrowKind(blockName);
    if (!known && blockName && base.hasBlock?.(blockName)) {
      // A user arrow block is drawn like CAD does: inserted at the tip, scaled by the arrow size, its +X along the
      // leader towards the tip (天正 taddot = a small open circle with a line through it; 惠宇敦南 B4F-EE1 drew a filled wedge).
      const size = asz * scale, angle = Math.atan2(vertices[0].y - vertices[1].y, vertices[0].x - vertices[1].x);
      entities.push({ ...common, type: "INSERT", handle: `${base.handle}:arrow`, name: blockName, position: { ...vertices[0], z: 0 }, xScale: size, yScale: size, zScale: size, rotation: angle * 180 / Math.PI });
    } else {
      if (!known) notes.push(`舊式引線 ${base.handle} 箭頭樣式 ${blockName} 以實心箭頭近似`);
      entities.push(...arrowheadEntities(kind, vertices[0], vertices[1], asz * scale, common, `${base.handle}:arrow`));
    }
  }
  return { entities, notes };
}
