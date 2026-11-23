// Engineering camera storage (spec 009 定案 8): everything stays on the phone, in its own IndexedDB database so the
// drawing library schema is untouched. Originals are kept once, uncompressed; whiteboards are data, drawn at export.
import { LibraryError } from "../types/errors";
import { closeGap, moveToNumber, nextNumber } from "./numbering";
import type { CameraBatch, PhotoRecord, ShotPoint, Signer } from "./types";

export const CAMERA_DB_NAME = "fatcat-camera";
const STORES = ["batches", "points", "photos", "blobs", "signers"] as const;
type StoreName = (typeof STORES)[number];

function classify(error: unknown): unknown {
  if (error instanceof LibraryError) return error;
  if ((error as { name?: string } | null)?.name === "QuotaExceededError") return new LibraryError("STORAGE_FULL", "storage quota exceeded", { cause: error });
  return new LibraryError("UNAVAILABLE", "camera database error", { cause: error });
}

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

let database: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!factory) { reject(new LibraryError("UNAVAILABLE", "IndexedDB is not available")); return; }
    const request = factory.open(CAMERA_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("batches", { keyPath: "id" });
      db.createObjectStore("points", { keyPath: "id" }).createIndex("batchId", "batchId");
      db.createObjectStore("photos", { keyPath: "id" }).createIndex("batchId", "batchId");
      db.createObjectStore("blobs", { keyPath: "id" });
      db.createObjectStore("signers", { keyPath: "id" });
    };
    request.onblocked = () => reject(new LibraryError("UNAVAILABLE", "database upgrade blocked"));
    request.onerror = () => reject(classify(request.error));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = null; };
      resolve(db);
    };
  });
  database.catch(() => { database = null; });
  return database;
}

/** Test helper: forget the open connection (fake-indexeddb is reset between tests). */
export function resetCameraDbForTests(): void { database = null; }

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

type Stores = Record<StoreName, IDBObjectStore>;
async function tx<T>(mode: IDBTransactionMode, body: (s: Stores) => Promise<T>): Promise<T> {
  const db = await openDb();
  let t: IDBTransaction;
  try { t = db.transaction([...STORES], mode); } catch (e) { throw classify(e); }
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new DOMException("aborted", "AbortError"));
  });
  done.catch(() => undefined);
  try {
    const stores = Object.fromEntries(STORES.map((n) => [n, t.objectStore(n)])) as Stores;
    const result = await body(stores);
    await done;
    return result;
  } catch (e) {
    try { t.abort(); } catch { /* finished */ }
    throw classify(e);
  }
}

const inBatch = <T>(store: IDBObjectStore, batchId: string) => req(store.index("batchId").getAll(batchId) as IDBRequest<T[]>);
const notFound = (what: string) => new LibraryError("NOT_FOUND", `no such ${what}`);

// ---------- batches ----------
export type NewBatch = Omit<CameraBatch, "id" | "createdAt" | "updatedAt">;

export async function createBatch(fields: NewBatch): Promise<CameraBatch> {
  const now = Date.now();
  const batch: CameraBatch = { ...fields, id: newId(), createdAt: now, updatedAt: now };
  await tx("readwrite", (s) => req(s.batches.add(batch)));
  return batch;
}

export async function updateBatch(id: string, patch: Partial<NewBatch>): Promise<CameraBatch> {
  return tx("readwrite", async (s) => {
    const old = (await req(s.batches.get(id))) as CameraBatch | undefined;
    if (!old) throw notFound("batch");
    const next = { ...old, ...patch, id, updatedAt: Date.now() };
    await req(s.batches.put(next));
    return next;
  });
}

export async function listBatches(): Promise<CameraBatch[]> {
  const all = await tx("readonly", (s) => req(s.batches.getAll() as IDBRequest<CameraBatch[]>));
  // newest first; the demo project always last, below the customer's own
  return all.sort((a, b) => Number(!!a.demo) - Number(!!b.demo) || b.updatedAt - a.updatedAt);
}

/** Whether the demo project is there. */
export async function hasDemoBatch(): Promise<boolean> {
  return (await listBatches()).some((b) => b.demo);
}

/** Take the demo project away with everything in it (to put it back fresh). */
export async function removeDemoBatches(): Promise<void> {
  await tx("readwrite", async (s) => {
    for (const b of (await req(s.batches.getAll())) as CameraBatch[]) {
      if (!b.demo) continue;
      for (const p of await inBatch<ShotPoint>(s.points, b.id)) await req(s.points.delete(p.id));
      for (const p of await inBatch<PhotoRecord>(s.photos, b.id)) { await req(s.photos.delete(p.id)); await req(s.blobs.delete(p.id)); }
      await req(s.batches.delete(b.id));
    }
  });
}

/** Write the demo project as given (ids, numbers and flags included), in one go. */
export async function seedDemoBatch(batch: CameraBatch, points: readonly ShotPoint[], photos: readonly { photo: PhotoRecord; blob: Blob }[]): Promise<void> {
  await tx("readwrite", async (s) => {
    await req(s.batches.add(batch));
    for (const p of points) await req(s.points.add(p));
    for (const { photo, blob } of photos) { await req(s.photos.add(photo)); await req(s.blobs.add({ id: photo.id, blob })); }
  });
}

export async function getBatch(id: string): Promise<CameraBatch | null> {
  return ((await tx("readonly", (s) => req(s.batches.get(id)))) as CameraBatch | undefined) ?? null;
}

/** The demo project itself is never deleted (用戶 2026-11-23); its spots and photos may be — it is put back as it was
 * (用戶 2026-11-23：「範例內的照片也要能刪除，定點也是，只是不能存檔」). */
const demoKept = () => new LibraryError("PROTECTED", "demo content");

/** Delete a batch with its points, photos and originals (asked first in the UI); not the demo project. */
export async function deleteBatch(id: string): Promise<void> {
  await tx("readwrite", async (s) => {
    if (((await req(s.batches.get(id))) as CameraBatch | undefined)?.demo) throw demoKept();
    for (const p of await inBatch<ShotPoint>(s.points, id)) await req(s.points.delete(p.id));
    for (const p of await inBatch<PhotoRecord>(s.photos, id)) { await req(s.photos.delete(p.id)); await req(s.blobs.delete(p.id)); }
    await req(s.batches.delete(id));
  });
}

async function touch(s: Stores, batchId: string): Promise<void> {
  const b = (await req(s.batches.get(batchId))) as CameraBatch | undefined;
  if (b) await req(s.batches.put({ ...b, updatedAt: Date.now() }));
}

// ---------- points ----------
export async function listPoints(batchId: string): Promise<ShotPoint[]> {
  const all = await tx("readonly", (s) => inBatch<ShotPoint>(s.points, batchId));
  return all.sort((a, b) => a.no - b.no);
}

/** A new point gets the next number. */
export async function addPoint(batchId: string, at: { x: number; y: number; angle: number; place: string }): Promise<ShotPoint> {
  return tx("readwrite", async (s) => {
    const existing = await inBatch<ShotPoint>(s.points, batchId);
    const point: ShotPoint = { id: newId(), batchId, no: nextNumber(existing), ...at };
    await req(s.points.add(point));
    await touch(s, batchId);
    return point;
  });
}

/** Move a point or turn its arrow (the number is changed with renumberPoint). */
export async function updatePoint(id: string, patch: Partial<Pick<ShotPoint, "x" | "y" | "angle" | "place">>): Promise<ShotPoint> {
  return tx("readwrite", async (s) => {
    const old = (await req(s.points.get(id))) as ShotPoint | undefined;
    if (!old) throw notFound("point");
    const next = { ...old, ...patch };
    await req(s.points.put(next));
    await touch(s, old.batchId);
    return next;
  });
}

/** Delete a point with its photos (用戶 2026-11-23：「刪除定點後，清單內也要刪除」; they used to become 未定位); later
 * points move up a number. Returns how many photos went with it. */
export async function deletePoint(id: string): Promise<number> {
  return tx("readwrite", async (s) => {
    const old = (await req(s.points.get(id))) as ShotPoint | undefined;
    if (!old) throw notFound("point");
    await req(s.points.delete(id));
    for (const p of closeGap(await inBatch<ShotPoint>(s.points, old.batchId), old.no)) await req(s.points.put(p));
    let gone = 0;
    for (const ph of await inBatch<PhotoRecord>(s.photos, old.batchId)) if (ph.pointId === id) { await req(s.photos.delete(ph.id)); await req(s.blobs.delete(ph.id)); gone++; }
    await touch(s, old.batchId);
    return gone;
  });
}

/** Give a point another number; the ones in between shift so numbers stay 1..n. */
export async function renumberPoint(id: string, target: number): Promise<void> {
  await tx("readwrite", async (s) => {
    const old = (await req(s.points.get(id))) as ShotPoint | undefined;
    if (!old) throw notFound("point");
    for (const p of moveToNumber(await inBatch<ShotPoint>(s.points, old.batchId), id, target)) await req(s.points.put(p));
    await touch(s, old.batchId);
  });
}

// ---------- photos ----------
export async function listPhotos(batchId: string): Promise<PhotoRecord[]> {
  const all = await tx("readonly", (s) => inBatch<PhotoRecord>(s.photos, batchId));
  return all.sort((a, b) => a.takenAt - b.takenAt || a.id.localeCompare(b.id));
}

/** Keep a photo: the original once, as taken. */
export async function addPhoto(record: Omit<PhotoRecord, "id" | "bytes">, original: Blob): Promise<PhotoRecord> {
  if (!(original instanceof Blob) || original.size <= 0) throw new LibraryError("INVALID_FILE", "empty photo");
  return tx("readwrite", async (s) => {
    const photo: PhotoRecord = { ...record, id: newId(), bytes: original.size };
    await req(s.photos.add(photo));
    await req(s.blobs.add({ id: photo.id, blob: original }));
    await touch(s, record.batchId);
    return photo;
  });
}

export async function updatePhoto(id: string, patch: Partial<Pick<PhotoRecord, "pointId" | "board">>): Promise<PhotoRecord> {
  return tx("readwrite", async (s) => {
    const old = (await req(s.photos.get(id))) as PhotoRecord | undefined;
    if (!old) throw notFound("photo");
    const next = { ...old, ...patch, board: patch.board ? { ...old.board, ...patch.board } : old.board };
    await req(s.photos.put(next));
    await touch(s, old.batchId);
    return next;
  });
}

export async function deletePhoto(id: string): Promise<void> {
  await tx("readwrite", async (s) => {
    const old = (await req(s.photos.get(id))) as PhotoRecord | undefined;
    if (!old) throw notFound("photo");
    await req(s.photos.delete(id));
    await req(s.blobs.delete(id));
    await touch(s, old.batchId);
  });
}

export async function readPhotoOriginal(id: string): Promise<Blob> {
  const row = (await tx("readonly", (s) => req(s.blobs.get(id)))) as { blob: Blob } | undefined;
  if (!row) throw notFound("photo");
  return row.blob;
}

// ---------- signers ----------
export async function listSigners(): Promise<Signer[]> {
  const all = await tx("readonly", (s) => req(s.signers.getAll() as IDBRequest<Signer[]>));
  return all.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

/** Add a signer, or re-sign one (same id keeps the batches that chose it). */
export async function saveSigner(signer: Omit<Signer, "id" | "createdAt"> & { id?: string }): Promise<Signer> {
  const row: Signer = { ...signer, id: signer.id ?? newId(), createdAt: Date.now() };
  await tx("readwrite", (s) => req(s.signers.put(row)));
  return row;
}

export async function deleteSigner(id: string): Promise<void> {
  await tx("readwrite", (s) => req(s.signers.delete(id)));
}
