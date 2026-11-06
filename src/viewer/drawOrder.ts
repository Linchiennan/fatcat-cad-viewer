// Draw order across render batches. dxf-viewer keeps its batches sorted by layer name, colour and kind, and the
// renderer draws them in that order (sortObjects off), so whether a tree hatch covered a note depended on the layer
// names, not on the drawing (惠宇敦南 排水竣工圖-1: tree blocks on top of「污水下水管放流口標示牌」, which ZWCAD
// draws over them). Each batch now goes where its entities sit in CAD's draw order (SORTENTSTABLE, else handle).
type Any = any;

/** CAD draw-order key of a top-level entity: cadDocument stamps cadDrawOrder from SORTENTSTABLE, else its handle. */
export function drawOrderKey(e: Any): number | null {
  if (Number.isFinite(e?.cadDrawOrder)) return e.cadDrawOrder;
  const h = parseInt(String(e?.handle ?? ""), 16);
  return Number.isFinite(h) ? h : null;
}

/**
 * Stable sort of serialized batches by the latest draw order of the entities in each; batches no top-level entity
 * reached (block definitions) keep their place at the end. A batch mixes entities from all over the drawing, so one
 * number stands for it: the latest, because notes are added after what they label. With the mean, the first line of
 * the 排水竣工圖-1 note still sat under the trees.
 */
export function sortBatches<T>(batches: T[], orders: (number | undefined)[]): T[] {
  const key = (o: number | undefined) => (o === undefined ? Infinity : o);
  return batches.map((b, i) => ({ b, i, o: key(orders[i]) })).sort((x, y) => (x.o - y.o) || (x.i - y.i)).map((x) => x.b);
}

export function installDrawOrder(p: Any): void {
  if (p.cadDrawOrderInstalled) return;
  p.cadDrawOrderInstalled = true;
  const processEntity = p._ProcessDxfEntity, getBatch = p._GetBatch, buildScene = p._BuildScene;
  p._ProcessDxfEntity = function (e: Any, ctx: Any = null) {
    // Block definitions are drawn where their INSERT is; only top-level entities set the order.
    if (ctx) return processEntity.call(this, e, ctx);
    const previous = this.cadDrawOrderNow;
    this.cadDrawOrderNow = drawOrderKey(e);
    try { return processEntity.call(this, e, ctx); } finally { this.cadDrawOrderNow = previous; }
  };
  p._GetBatch = function (key: Any) {
    // A map in front of the batch tree: the tree compared layer and block names for every primitive (上晴 D區0418: 2.6 s).
    // Nested by key field, no string built per call.
    if (this.cadBatchTree !== this.batches) { this.cadBatchTree = this.batches; this.cadBatchMap = new Map(); }
    let level: Map<unknown, Any> = this.cadBatchMap;
    for (const part of [key.layerName, key.blockName, key.geometryType, key.color]) {
      let next = level.get(part);
      if (!next) level.set(part, next = new Map());
      level = next;
    }
    let batch = level.get(key.lineType);
    if (!batch) { batch = getBatch.call(this, key); level.set(key.lineType, batch); }
    const k = this.cadDrawOrderNow;
    if (k !== null && k !== undefined && !(batch.cadDrawOrder >= k)) batch.cadDrawOrder = k;
    return batch;
  };
  p._BuildScene = function () {
    const scene = buildScene.call(this), orders: (number | undefined)[] = [];
    // _BuildScene serialized the batches in this same tree order.
    this.batches.each((b: Any) => { orders.push(b.cadDrawOrder); });
    if (orders.length === scene.batches.length) scene.batches = sortBatches(scene.batches, orders);
    return scene;
  };
}
