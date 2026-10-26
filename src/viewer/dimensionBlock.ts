// Where a dimension's *D block goes. CAD inserts the block at the dimension's group-12 point, not at the origin: a
// dimension made inside a block keeps there the offset its block geometry was drawn at (超級圖庫 BOX示意圖: *D365 drawn
// around (6464, -376), group 12 at (-6474, 401), so the block lands back on the box; at the origin it stood 6,500
// units away and the whole-drawing view shrank to fit it).
type Any = any;

export function dimensionBlockOffset(e: Any): { x: number; y: number } {
  const p = e?.insertionPoint;
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : { x: 0, y: 0 };
}
