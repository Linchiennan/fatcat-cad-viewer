// Demo drawings (web/demo) in the library: the guest gets them in a throw-away library, and the signed-in web version
// keeps them too (用戶 2026-11-23：「有登入的正式版，依樣保留範例，而且不讓客戶刪除」). They are marked demo, so the
// library never deletes or replaces them, and dated 2026-10-29 so the customer's own files sort above them.
import { DEMO_FILES } from "../auth/guestMode";
import { importDrawingToLibrary, listLibraryDrawings, migrateLegacyLibrary, readLibraryDrawing, ROOT_ID } from "./drawingLibrary";
import { drawingIdentity, sheetKey } from "../viewer/readingPosition";
import type { BoardStage, CameraBatch, PhotoRecord, ShotPoint, Whiteboard } from "../camera/types";

/** The day the demos were made: older than anything a customer adds, so 最新優先 keeps them at the bottom. */
export const DEMO_DATE = Date.UTC(2026, 9, 29);

/**
 * Add the demo drawings that are not in the library yet; returns how many were added. A missing file is skipped.
 * `opened` puts them in 最近開啟 (the guest starts with them there).
 */
export async function seedDemoDrawings(opened = false): Promise<number> {
  // an old library moves over only into an empty one: let that happen first
  await migrateLegacyLibrary().catch(() => {});
  const have = new Set((await listLibraryDrawings()).filter((e) => e.demo).map((e) => e.name));
  let n = 0;
  for (const name of [...DEMO_FILES].reverse()) { // the plan last, so it heads 最近開啟
    if (have.has(name)) continue;
    try {
      const res = await fetch(`./demo/${encodeURIComponent(name)}`);
      if (!res.ok) continue;
      const blob = await res.blob();
      await importDrawingToLibrary(new File([blob], name, { type: blob.type, lastModified: DEMO_DATE }), ROOT_ID, undefined, { at: DEMO_DATE, opened });
      n++;
    } catch { /* the other demos still come */ }
  }
  await seedDemoProject().catch(() => false);
  return n;
}

/** The demo 工程相機 project: four spots on the demo plan, one demo site photo each (用戶 2026-11-23：「這專案畫面沒看到範例」). */
const DEMO_PLAN = "示範-住宅平面.dwg";
const DEMO_SPOTS: readonly { x: number; y: number; angle: number; place: string; stage: BoardStage }[] = [
  { x: 1426, y: 8518, angle: 90, place: "主浴", stage: "before" },
  { x: 5686, y: 9077, angle: 90, place: "浴室", stage: "during" },
  { x: 8088, y: 7541, angle: 180, place: "臥室1", stage: "during" },
  { x: 9108, y: 3350, angle: 0, place: "餐廳・廚房", stage: "after" },
];

/** Add the demo project once, on the demo plan; false when it is there already or the plan is missing. */
export async function seedDemoProject(): Promise<boolean> {
  const store = await import("../camera/batchStore");
  if (await store.hasDemoBatch()) return false;
  const plan = (await listLibraryDrawings()).find((e) => e.demo && e.name === DEMO_PLAN);
  if (!plan) return false;
  // the same sheet key the viewer gives the plan, so the project opens on it
  const viewKey = sheetKey(await drawingIdentity(await readLibraryDrawing(plan.id)), "Model");
  const { batchName, rocDate } = await import("../camera/numbering");
  const item = "輕隔間配管", inspector = "大肥貓", id = store.newId();
  const batch: CameraBatch = {
    id, name: batchName(DEMO_DATE, item), drawingId: plan.id, drawingName: plan.name, viewKey, space: "Model",
    company: "大肥貓營造", project: "示範集合住宅新建工程", trade: "水電工程", item, inspector, cardDate: "",
    boardFont: "hand", boardWeight: "hairline", markerScale: 2, demo: true, createdAt: DEMO_DATE, updatedAt: DEMO_DATE,
  };
  const points: ShotPoint[] = DEMO_SPOTS.map((s, i) => ({ id: store.newId(), batchId: id, no: i + 1, x: s.x, y: s.y, angle: s.angle, place: s.place, demo: true }));
  const photos: { photo: PhotoRecord; blob: Blob }[] = [];
  for (const [i, s] of DEMO_SPOTS.entries()) {
    const res = await fetch(`./demo/camera/demo-photo-${i + 1}.jpg`);
    if (!res.ok) continue;
    const blob = await res.blob();
    const board: Whiteboard = { item, place: s.place, date: rocDate(new Date(DEMO_DATE)), inspector, x: 0, y: 1, width: 0.3, font: "hand", weight: "hairline", stage: s.stage };
    photos.push({ blob, photo: { id: store.newId(), batchId: id, pointId: points[i].id, takenAt: DEMO_DATE + i * 60_000, width: 1600, height: 1200, bytes: blob.size, board, demo: true } });
  }
  await store.seedDemoBatch(batch, points, photos);
  return true;
}
