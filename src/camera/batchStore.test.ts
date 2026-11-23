import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPhoto, addPoint, createBatch, deleteBatch, deletePhoto, deletePoint, deleteSigner, listBatches, listPhotos, listPoints,
  listSigners, readPhotoOriginal, renumberPoint, resetCameraDbForTests, saveSigner, updateBatch, updatePhoto, updatePoint,
} from "./batchStore";
import type { Whiteboard } from "./types";

beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); resetCameraDbForTests(); });
afterEach(() => vi.unstubAllGlobals());

const board: Whiteboard = { item: "輕隔間配管", place: "8F-A 戶 主浴", date: "109.10.15", inspector: "大肥貓", x: 0.02, y: 0.6, width: 0.3 };
const batchFields = {
  name: "8F室內隔間配管完成", drawingName: "8F-室內隔間對位圖.dwg", viewKey: "k", space: "Model", company: "威德水電工程有限公司",
  project: "PARK23 集合住宅新建工程", trade: "水電工程", item: "輕隔間配管", inspector: "大肥貓", cardDate: "",
};
const jpg = (n = 10) => new Blob([new Uint8Array(n)], { type: "image/jpeg" });

describe("batchStore", () => {
  it("keeps batches, points and photos per batch", async () => {
    const b = await createBatch(batchFields);
    const other = await createBatch({ ...batchFields, name: "13F" });
    const p1 = await addPoint(b.id, { x: 1, y: 2, angle: 90, place: "8F-A 戶 主浴" });
    const p2 = await addPoint(b.id, { x: 3, y: 4, angle: 0, place: "" });
    await addPoint(other.id, { x: 0, y: 0, angle: 0, place: "" });
    expect([p1.no, p2.no]).toEqual([1, 2]);
    const ph = await addPhoto({ batchId: b.id, pointId: p1.id, takenAt: 1, width: 3264, height: 1840, board }, jpg(1234));
    expect(ph.bytes).toBe(1234);
    expect((await readPhotoOriginal(ph.id)).size).toBe(1234);
    expect((await listPoints(b.id)).map((p) => p.no)).toEqual([1, 2]);
    expect(await listPhotos(other.id)).toEqual([]);
    expect((await updateBatch(b.id, { cardDate: "109 年 10 月 21 日" })).cardDate).toBe("109 年 10 月 21 日");
    expect((await listBatches()).length).toBe(2);
  });

  it("closes the number gap and deletes the point's photos with it (用戶 2026-11-23)", async () => {
    const b = await createBatch(batchFields);
    const [a, , c] = [await addPoint(b.id, { x: 0, y: 0, angle: 0, place: "" }), await addPoint(b.id, { x: 0, y: 0, angle: 0, place: "" }), await addPoint(b.id, { x: 0, y: 0, angle: 0, place: "" })];
    const ph = await addPhoto({ batchId: b.id, pointId: a.id, takenAt: 1, width: 1, height: 1, board }, jpg());
    const kept = await addPhoto({ batchId: b.id, pointId: c.id, takenAt: 2, width: 1, height: 1, board }, jpg());
    expect(await deletePoint(a.id)).toBe(1);
    const left = await listPoints(b.id);
    expect(left.map((p) => p.no)).toEqual([1, 2]);
    expect(left.find((p) => p.id === c.id)!.no).toBe(2);
    expect((await listPhotos(b.id)).map((p) => p.id)).toEqual([kept.id]);
    expect(ph.id).not.toBe(kept.id);
  });

  it("renumbers, moves points and edits whiteboards", async () => {
    const b = await createBatch(batchFields);
    const pts = [];
    for (let i = 0; i < 4; i++) pts.push(await addPoint(b.id, { x: i, y: 0, angle: 0, place: "" }));
    await renumberPoint(pts[3].id, 1);
    expect((await listPoints(b.id)).map((p) => p.x)).toEqual([3, 0, 1, 2]);
    expect((await updatePoint(pts[0].id, { angle: 45 })).angle).toBe(45);
    const ph = await addPhoto({ batchId: b.id, pointId: null, takenAt: 1, width: 1, height: 1, board }, jpg());
    const moved = await updatePhoto(ph.id, { pointId: pts[1].id, board: { ...board, place: "8F-A 戶 公浴" } });
    expect([moved.pointId, moved.board.place, moved.board.item]).toEqual([pts[1].id, "8F-A 戶 公浴", "輕隔間配管"]);
    await deletePhoto(ph.id);
    await expect(readPhotoOriginal(ph.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes a batch with everything in it", async () => {
    const b = await createBatch(batchFields);
    const p = await addPoint(b.id, { x: 0, y: 0, angle: 0, place: "" });
    const ph = await addPhoto({ batchId: b.id, pointId: p.id, takenAt: 1, width: 1, height: 1, board }, jpg());
    await deleteBatch(b.id);
    expect(await listBatches()).toEqual([]);
    expect(await listPoints(b.id)).toEqual([]);
    await expect(readPhotoOriginal(ph.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses empty photos and keeps signers", async () => {
    const b = await createBatch(batchFields);
    await expect(addPhoto({ batchId: b.id, pointId: null, takenAt: 1, width: 1, height: 1, board }, jpg(0))).rejects.toMatchObject({ code: "INVALID_FILE" });
    const s = await saveSigner({ name: "大肥貓", aspect: 3, strokes: [[0, 0, 1, 1]] });
    await saveSigner({ id: s.id, name: "大肥貓", aspect: 3, strokes: [[0, 1, 1, 0]] });
    expect((await listSigners()).map((x) => x.strokes[0])).toEqual([[0, 1, 1, 0]]);
    await deleteSigner(s.id);
    expect(await listSigners()).toEqual([]);
  });
});
