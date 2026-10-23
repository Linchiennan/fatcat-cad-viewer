// MLINE (多線) → polylines per element, caps, miter lines and fill, using the MLINESTYLE it references.
// Element parameters are absolute: the first is the offset along the vertex's miter vector, the rest are
// dash start/end distances along the segment direction (two parameters = continuous element).
import colorTable from "dxf-viewer/src/parser/AutoCadColorIndex";
type Any = any;
type Tag = [number, string];
type P = { x: number; y: number };

export type MlineStyle = { flags: number; fillColor?: number; elements: { offset: number; color: number; lineType?: string }[] };

/** Parse an MLINESTYLE record's tags. */
export function mlineStyleFromTags(tags: readonly Tag[]): MlineStyle {
  const style: MlineStyle = { flags: 0, elements: [] };
  let seenCount = false;
  for (const [c, v] of tags) {
    if (c === 70) style.flags = Number(v);
    else if (c === 71) seenCount = true;
    else if (c === 62 && !seenCount) style.fillColor = Number(v);
    else if (c === 49 && seenCount) style.elements.push({ offset: Number(v), color: 256 });
    else if (c === 62 && seenCount && style.elements.length) style.elements.at(-1)!.color = Number(v);
    else if (c === 6 && seenCount && style.elements.length) style.elements.at(-1)!.lineType = v;
  }
  return style;
}

const colorFields = (index: number | undefined) =>
  index === undefined || index === 256 ? {} : index === 0 ? { colorIndex: 0 } : index >= 1 && index <= 255 ? { colorIndex: index, color: colorTable[index] } : {};
const lineTypeField = (name: string | undefined) => {
  const n = (name ?? "").toUpperCase();
  return !n || n === "BYLAYER" ? {} : n === "BYBLOCK" ? { lineType: "BYBLOCK" } : { lineType: name };
};

export function mlineEntities(tags: readonly Tag[], base: { handle: string; layer: string; color?: Any; style?: MlineStyle; elementByBlockUnreliable?: boolean }): { entities: Any[]; notes: string[] } {
  const notes: string[] = [];
  let flags = 0;
  const vertices: { p: P; dir: P; miter: P; params: number[][] }[] = [];
  for (let i = 0; i < tags.length; i++) {
    const [c, v] = tags[i];
    if (c === 1001) break;
    if (c === 71) flags = Number(v);
    else if (c === 11) vertices.push({ p: { x: Number(v), y: Number(tags[i + 1][1]) }, dir: { x: 1, y: 0 }, miter: { x: 0, y: 1 }, params: [] });
    else if (c === 12 && vertices.length) vertices.at(-1)!.dir = { x: Number(v), y: Number(tags[i + 1][1]) };
    else if (c === 13 && vertices.length) vertices.at(-1)!.miter = { x: Number(v), y: Number(tags[i + 1][1]) };
    else if (c === 74 && vertices.length) vertices.at(-1)!.params.push([]);
    else if (c === 41 && vertices.length && vertices.at(-1)!.params.length) vertices.at(-1)!.params.at(-1)!.push(Number(v));
  }
  if (vertices.length < 2) return { entities: [], notes: [`多線 ${base.handle} 頂點不足，未顯示`] };
  const closed = (flags & 2) !== 0, elementCount = Math.max(...vertices.map((x) => x.params.length));
  const style = base.style ?? { flags: 0, elements: [] };
  const at = (k: number, e: number): P => { const x = vertices[k], o = x.params[e]?.[0] ?? 0; return { x: x.p.x + x.miter.x * o, y: x.p.y + x.miter.y * o }; };
  // LibreDWG reports 0 (BYBLOCK) for element colors ZWCAD writes as 256 (BYLAYER) in R2010+ files.
  const elementColor = (c: number | undefined) => (c === 0 && base.elementByBlockUnreliable ? 256 : c);
  const common = (e: number) => ({ layer: base.layer, ...base.color, ...colorFields(elementColor(style.elements[e]?.color)), ...lineTypeField(style.elements[e]?.lineType) });
  const out: Any[] = [];
  const segs = closed ? vertices.length : vertices.length - 1;
  let dashed = false;
  for (let e = 0; e < elementCount; e++) {
    if (vertices.every((x) => (x.params[e]?.length ?? 0) <= 2)) {
      const pts = vertices.map((_, k) => at(k, e));
      out.push({ ...common(e), type: "LWPOLYLINE", handle: `${base.handle}:e${e}`, shape: closed, vertices: pts });
      continue;
    }
    // Broken element: draw only the listed dash ranges of each segment.
    dashed = true;
    for (let k = 0; k < segs; k++) {
      const a = at(k, e), b = at((k + 1) % vertices.length, e), len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(len > 0)) continue;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len, ps = vertices[k].params[e]?.slice(1) ?? [];
      for (let d = 0; d < ps.length; d += 2) {
        const s = Math.max(0, ps[d]), t = Math.min(len, d + 1 < ps.length ? ps[d + 1] : len);
        if (t > s) out.push({ ...common(e), type: "LWPOLYLINE", handle: `${base.handle}:e${e}.${k}.${d}`, shape: false, vertices: [{ x: a.x + ux * s, y: a.y + uy * s }, { x: a.x + ux * t, y: a.y + uy * t }] });
      }
    }
  }
  if (dashed) notes.push(`多線 ${base.handle} 含斷開段，依參數分段繪製`);
  // Outermost elements bound caps, miters and fill.
  const offs = vertices[0].params.map((p) => p[0] ?? 0);
  if (offs.length >= 2) {
    const lo = offs.indexOf(Math.min(...offs)), hi = offs.indexOf(Math.max(...offs));
    const capLine = (k: number, tag: string) => out.push({ layer: base.layer, ...base.color, type: "LWPOLYLINE", handle: `${base.handle}:${tag}`, shape: false, vertices: [at(k, lo), at(k, hi)] });
    const roundCap = (k: number, outward: P, tag: string) => {
      const a = at(k, lo), b = at(k, hi), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      const a0 = Math.atan2(a.y - c.y, a.x - c.x), sweep = (outward.x * (a.y - c.y) - outward.y * (a.x - c.x)) > 0 ? -Math.PI : Math.PI;
      out.push({ layer: base.layer, ...base.color, type: "LWPOLYLINE", handle: `${base.handle}:${tag}`, shape: false, vertices: Array.from({ length: 17 }, (_, i) => ({ x: c.x + r * Math.cos(a0 + sweep * i / 16), y: c.y + r * Math.sin(a0 + sweep * i / 16) })) });
    };
    if (!closed) {
      const first = vertices[0].dir, last = vertices[vertices.length - 2].dir;
      if (!(flags & 4)) { if (style.flags & 16) capLine(0, "start"); if (style.flags & 64) roundCap(0, { x: -first.x, y: -first.y }, "startRound"); }
      if (!(flags & 8)) { if (style.flags & 256) capLine(vertices.length - 1, "end"); if (style.flags & 1024) roundCap(vertices.length - 1, last, "endRound"); }
      if ((style.flags & (32 | 512)) !== 0) notes.push(`多線 ${base.handle} 的內弧端蓋尚未支援，未繪製`);
    }
    if (style.flags & 2) for (let k = closed ? 0 : 1; k < (closed ? vertices.length : vertices.length - 1); k++) capLine(k, `miter${k}`);
    if (style.flags & 1) {
      const fill = colorFields(style.fillColor ?? 256);
      for (let k = 0; k < segs; k++) {
        const n = (k + 1) % vertices.length, z = (p: P) => ({ ...p, z: 0 });
        out.push({ layer: base.layer, ...base.color, ...fill, type: "SOLID", handle: `${base.handle}:fill${k}`, points: [z(at(k, lo)), z(at(k, hi)), z(at(n, lo)), z(at(n, hi))] });
      }
    }
  }
  return { entities: out, notes };
}
