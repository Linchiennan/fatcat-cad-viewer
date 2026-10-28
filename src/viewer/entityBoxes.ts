// Survey hook (debug=1 only, see engineDebug): where each top-level entity of the sheet is actually drawn, by
// handle, so scripted checks can compare it with ZWCAD's bounding box of the same entity. Upside-down text, a
// mirrored block or a shifted dimension moves its box even when the entity count matches (用戶 2026-10-28).
type Any = any;

/** Box per handle: [minX, minY, maxX, maxY] in drawing units, model or the sheet's own paper space. */
export type EntityBoxes = Record<string, [number, number, number, number]>;

/** Wrap the scene so that, while `cadBoxes` is set, each top-level entity's drawn points widen its own box. */
export function installEntityBoxes(p: Any): void {
  if (p.cadEntityBoxesInstalled) return;
  p.cadEntityBoxesInstalled = true;
  const processEntity = p._ProcessDxfEntity, updateBounds = p._UpdateBounds;
  p._ProcessDxfEntity = function (e: Any, ctx: Any = null) {
    // block definitions (ctx set) are drawn once and placed by INSERT, which counts its placed corners
    if (!this.cadBoxes || ctx || !e?.handle) return processEntity.call(this, e, ctx);
    const previous = this.cadBoxHandle;
    this.cadBoxHandle = String(e.handle);
    try { return processEntity.call(this, e, ctx); } finally { this.cadBoxHandle = previous; }
  };
  p._UpdateBounds = function (v: Any) {
    const h = this.cadBoxHandle;
    if (h && this.cadBoxes && Number.isFinite(v?.x) && Number.isFinite(v?.y)) {
      const b = this.cadBoxes[h];
      if (!b) this.cadBoxes[h] = [v.x, v.y, v.x, v.y];
      else { if (v.x < b[0]) b[0] = v.x; if (v.y < b[1]) b[1] = v.y; if (v.x > b[2]) b[2] = v.x; if (v.y > b[3]) b[3] = v.y; }
    }
    return updateBounds.call(this, v);
  };
}
