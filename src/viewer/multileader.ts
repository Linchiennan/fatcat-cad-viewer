// MULTILEADER (多重引線) → existing primitives: leader polylines, a filled arrowhead (SOLID) and MTEXT.
// Follows the DXF MLEADER layout: CONTEXT_DATA{ ... LEADER{ ... LEADER_LINE{ 10 points } } } then leader properties.
import { arrowheadEntities } from "./leader";
type Any = any;
type Tag = [number, string];
type Point = { x: number; y: number; z: number };

export type MultileaderResult = { entities: Any[]; notes: string[] };

export function multileaderEntities(tags: readonly Tag[], base: { handle: string; layer: string; styleName?: (handle: string) => string | undefined }): MultileaderResult {
  const notes: string[] = [];
  const leaders: { last: Point | null; dogleg: Point | null; doglegLength: number; lines: Point[][] }[] = [];
  const text: Any = {};
  let leaderType = 1, contentType = 2, enableDogleg = true, arrowSize = 0, contextArrow = 0;
  let depth = 0, seenTopLevel290 = false, seenTopLevel291 = false;
  let leader: (typeof leaders)[number] | null = null, line: Point[] | null = null;
  const point = (i: number): Point => ({ x: Number(tags[i][1]), y: Number(tags[i + 1]?.[0] === tags[i][0] + 10 ? tags[i + 1][1] : 0), z: Number(tags[i + 2]?.[0] === tags[i][0] + 20 ? tags[i + 2][1] : 0) });

  for (let i = 0; i < tags.length; i++) {
    const [code, value] = tags[i];
    if (code === 300 && value.startsWith("CONTEXT_DATA")) { depth = 1; continue; }
    if (code === 302 && value.startsWith("LEADER")) { depth = 2; leader = { last: null, dogleg: null, doglegLength: 0, lines: [] }; leaders.push(leader); continue; }
    if (code === 304 && value.startsWith("LEADER_LINE")) { depth = 3; line = []; leader?.lines.push(line); continue; }
    if (code === 305) { depth = 2; line = null; continue; }
    if (code === 303) { depth = 1; leader = null; continue; }
    if (code === 301) { depth = 0; continue; }
    if (depth === 3 && code === 10) { line!.push(point(i)); continue; }
    if (depth === 2 && leader) {
      if (code === 10) leader.last = point(i);
      else if (code === 11) leader.dogleg = point(i);
      else if (code === 40) leader.doglegLength = Number(value);
      continue;
    }
    if (depth === 1) {
      if (code === 304) text.text = value;
      else if (code === 12) text.position = point(i);
      else if (code === 13) text.direction = point(i);
      else if (code === 41) text.height = Number(value);
      else if (code === 43) text.width = Number(value);
      else if (code === 45) text.lineSpacing = Number(value);
      else if (code === 171) text.attachmentPoint = Number(value);
      else if (code === 340) text.styleHandle = value;
      else if (code === 140) contextArrow = Number(value);
      continue;
    }
    if (depth === 0) {
      if (code === 170) leaderType = Number(value);
      else if (code === 172) contentType = Number(value);
      else if (code === 42) arrowSize = Number(value);
      else if (code === 290 && !seenTopLevel290) seenTopLevel290 = true;
      else if (code === 291 && !seenTopLevel291) { seenTopLevel291 = true; enableDogleg = value !== "0"; }
    }
  }

  const entities: Any[] = [];
  const common = { layer: base.layer, lineType: "CONTINUOUS" };
  const size = contextArrow > 0 ? contextArrow : arrowSize;
  if (leaderType === 2) notes.push(`多重引線 ${base.handle} 為曲線引線，以直線近似`);
  if (leaderType !== 0) {
    leaders.forEach((l, li) => {
      for (const [ni, vertices] of l.lines.entries()) {
        const pts = [...vertices];
        if (l.last) pts.push(l.last);
        if (l.last && enableDogleg && l.dogleg && l.doglegLength > 0) pts.push({ x: l.last.x + l.dogleg.x * l.doglegLength, y: l.last.y + l.dogleg.y * l.doglegLength, z: l.last.z });
        if (pts.length < 2) continue;
        entities.push({ ...common, type: "LWPOLYLINE", handle: `${base.handle}:leader${li}.${ni}`, shape: false, vertices: pts.map((p) => ({ x: p.x, y: p.y })) });
        entities.push(...arrowheadEntities("closed", pts[0], pts[1], size, common, `${base.handle}:arrow${li}.${ni}`));
      }
    });
  }
  if (contentType === 1) notes.push(`多重引線 ${base.handle} 的圖塊內容尚未支援，只顯示引線`);
  if (contentType === 2 && text.text && text.position && text.height > 0) {
    entities.push({ type: "MTEXT", layer: base.layer, handle: `${base.handle}:text`, text: text.text, position: text.position, height: text.height,
      width: text.width > 0 ? text.width : 0, attachmentPoint: text.attachmentPoint >= 1 && text.attachmentPoint <= 9 ? text.attachmentPoint : 1,
      direction: text.direction && (text.direction.x || text.direction.y) ? text.direction : undefined, lineSpacing: text.lineSpacing > 0 ? text.lineSpacing : 1,
      styleName: (text.styleHandle && base.styleName?.(text.styleHandle)) || "STANDARD" });
  }
  return { entities, notes };
}
