// Engineering camera session (spec 009): the open batch of the drawing on screen, its points and photos, and the
// panel to work them. The App renders `panel` and hands `photoMarkers` to the canvas.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { ConfirmDialog, type ConfirmRequest } from "../components/ConfirmDialog";
import { useI18n } from "../i18n/translations";
import type { MeasurementIndex } from "../viewer/measurementGeometry";
import { plainCadText } from "../viewer/textSearch";
import {
  addPhoto, addPoint, addPoints, createBatch, deleteAllPhotos, deleteAllPoints, deleteBatch, deletePhoto, deletePoint, getBatch, listBatches, listPhotos, listPoints, listSigners,
  renumberPoint, updateBatch, updatePhoto, updatePoint, type NewBatch,
} from "./batchStore";
import { batchName, cardNo, markerText, MAX_POINTS, photoLabels, plainLabel, rocDate } from "./numbering";
import { placeName, type PlaceText } from "./placeName";
import { PhotoList } from "./PhotoList";
import type { ExportCapable } from "../export/types";
import { ALL_PARTS, exportBatch, exportBatchFiles, type ExportParts } from "./exportBatch";
import { useLongPress } from "./longPress";
import { alignSnap, applyTransform, composeTransform, copiedPlace, startTransform, transformFromPairs, transformTurn, type SpotTransform } from "./copySpots";
import type { DrawingPoint } from "../types/drawing";
import type { SheetMark } from "./sheetLinks";
import { ARROW_TIP } from "./PhotoMarkerLayer";
import { allowRotation } from "../native/screenRotation";
import { markerUnitRadius, paintPhotoMarkers } from "./alignment";
import { shareFile, shareFiles } from "../native/fileHandoff";
import { CameraScreen } from "./CameraScreen";
import { SignaturePad } from "./SignaturePad";
import { BOARD_WEIGHTS, boardTitle, DEFAULT_WEIGHT, drawBoardValue, drawSignature, ensureHandFont } from "./whiteboard";
import { PawShape } from "../components/ViewerToolbar";
import type { BoardFont, BoardStage, BoardWeight, CameraBatch, PhotoRecord, ShotPoint, Signer, Whiteboard } from "./types";

const LAST_KEY = "fatcat.camera.last";
type Remembered = Pick<NewBatch, "company" | "project" | "trade" | "item" | "inspector" | "signerId">;
function remembered(): Partial<Remembered> {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Partial<Remembered>; } catch { return {}; }
}
function remember(b: Remembered): void {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(b)); } catch { /* private mode */ }
}

/** Default board place and size: flush in the bottom-left corner (用戶 2026-11-23：「預設白板都是靠最左下」). x 0 / y 1 are
 * clamped to the picture by boardRect, so the board sits in the corner whatever the picture's shape (upright or sideways). */


/** 符號 slider range (用戶 2026-11-23：「符號大小要從10%到200%」; was 50–300 %); older batches above it are capped */
const MARKER_SCALE_MIN = 0.1, MARKER_SCALE_MAX = 2;
const clampScale = (v: number) => Math.min(MARKER_SCALE_MAX, Math.max(MARKER_SCALE_MIN, v));

/** a phone held sideways (the same test as the camera screen's landscape layout) */
const SIDEWAYS = "(orientation: landscape) and (max-height: 600px)";

/** The demo drawings shipped for trying the app (web/demo, 「示範-…」). */
const isDemoDrawing = (name: string) => /^示範-/.test(name.replace(/^.*[\\/]/, ""));
const DEMO_MARKER_SCALE = 2;
// 施工前／中／後 ticked on the board in the camera, kept per batch on this device (用戶 2026-11-23); a new batch starts
// with 施工後 ticked (用戶 2026-11-23：「預設是施工後打勾」), and an untick is kept as "none"
const STAGE_KEY = (batchId: string) => `fatcat.camera.stage.${batchId}`;
const isStage = (v: string | null): v is BoardStage => v === "before" || v === "during" || v === "after";
function loadStage(batchId: string): BoardStage | undefined {
  try { const v = localStorage.getItem(STAGE_KEY(batchId)); return v === null ? "after" : isStage(v) ? v : undefined; } catch { return "after"; }
}
function saveStage(batchId: string, stage: BoardStage | undefined): void {
  try { localStorage.setItem(STAGE_KEY(batchId), stage ?? "none"); } catch { /* private mode */ }
}
export const DEFAULT_BOARD = { x: 0, y: 1, width: 0.3 } as const;
const BOARD_KEY = "fatcat.camera.board";
type BoardPos = Pick<Whiteboard, "x" | "y" | "width">;
/** Where the user last left the board in the camera (用戶 2026-11-22：調整後的白板位置跟大小要自動記憶). */
export function loadBoardPos(): BoardPos {
  try {
    const v = JSON.parse(localStorage.getItem(BOARD_KEY) ?? "null") as Partial<BoardPos> | null;
    if (v && [v.x, v.y, v.width].every((n) => typeof n === "number" && Number.isFinite(n))) return { x: v.x!, y: v.y!, width: v.width! };
  } catch { /* private mode */ }
  return { ...DEFAULT_BOARD };
}
export function saveBoardPos(p: BoardPos): void {
  try { localStorage.setItem(BOARD_KEY, JSON.stringify({ x: p.x, y: p.y, width: p.width })); } catch { /* private mode */ }
}

/** What the home page's 工程相機 asked for: open this batch, or start a new one (用戶 2026-11-23：工程相機自己獨立). */
/** copyFrom: a project whose spots are laid on this drawing (用戶 2026-11-24：複製到另一張圖) */
export type CameraLaunch = { batchId?: string; space?: string; newBatch?: boolean; copyFrom?: string };

export type CameraContext = {
  /** move the drawing so this point (drawing units) shows above the panel (用戶 2026-11-23：清單與箭頭雙向跳) */
  focusPoint?: (x: number, y: number) => void;
  /** the X on the camera's own page: leave the drawing for the 工程相機 project list (用戶 2026-11-23：「按X返回專案，不是到
   * 看圖模式」); without it the X only closes the panel */
  onProjects?: () => void;
  /** file name of the drawing (floor and batch name come from it) */
  drawingName: string;
  /** its 我的圖面 entry, kept on the batch so the home page can open the drawing again */
  drawingId?: string;
  /** a start from the home page, done once the batches of this sheet are known */
  launch?: CameraLaunch | null;
  onLaunched?(): void;
  viewKey: string;
  space: string;
  index: MeasurementIndex | null;
  /** the base is a PDF page (用戶 2026-11-23 選 B 支援 PDF): no CAD files in the export, names from the page's words */
  pdf?: boolean;
  /** words on a PDF page and how near a spot they count (page points) */
  placeTexts?: PlaceText[];
  placeRadius?: { room: number; unit: number };
  /** the page as a box (a PDF base): copied spots that fall outside start fitted into it */
  sheetBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  /** the sheet as PDF with `paint` drawn on (photo points), and its width in drawing units */
  exportSheet?(paint: Parameters<NonNullable<ExportCapable["exportWithOverlay"]>>[1], mode: "color" | "mono"): Promise<{ blob: Blob; sheetWidth: number }>;
};

type View = "batches" | "settings" | "work" | "photos" | "export" | "copy";

/** A copy on its way: the source project and spots, the pairs lined up so far, and the step of 兩點對齊. */
type CopyState = { source: CameraBatch; points: ShotPoint[]; start: SpotTransform; pairs: { from: DrawingPoint; to: DrawingPoint }[]; step: "look" | "pickSpot" | "pickPlace"; picked: string | null; snapped: (DrawingPoint & { kind: string | null }) | null };

export function useCameraSession(open: boolean, ctx: CameraContext, onClose: () => void) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("batches");
  const [batches, setBatches] = useState<CameraBatch[]>([]);
  const [batch, setBatch] = useState<CameraBatch | null>(null);
  const [points, setPoints] = useState<ShotPoint[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  // an unplaced photo being put on the drawing: the next tap on an arrow or an empty spot takes it (用戶 2026-11-24)
  const [locating, setLocating] = useState<PhotoRecord | null>(null);
  useEffect(() => { if (view !== "work" || !open) setLocating(null); }, [view, open]);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [message, setMessage] = useState("");
  // a note belongs to the screen it was said on: switching screens clears it (the 清單 showed the spot-lock note, cut off)
  // a page change clears the note, unless one was left for the new page
  const noteForPage = useRef<string | null>(null);
  const pageNoteShown = useRef(false);
  useEffect(() => { pageNoteShown.current = noteForPage.current !== null; setMessage(noteForPage.current ?? ""); noteForPage.current = null; }, [view]);
  // on the demo project's own page, say that nothing tried here is kept (runs after the clearing above)
  useEffect(() => {
    if (pageNoteShown.current) { pageNoteShown.current = false; return; } // a note left for this page comes first
    if (view === "work" && batch?.demo) setMessage(t("camera.demoNote"));
  }, [view, batch?.id, batch?.demo, t]);
  const [renumbering, setRenumbering] = useState(false);
  const [shooting, setShooting] = useState(false);
  /** pulled down out of the way to see the drawing (用戶 2026-11-22：上方橫桿往下拉讓視窗隱藏) */
  const [collapsed, setCollapsed] = useState(false);
  /** pulled up to fill the screen (用戶 2026-11-23：「橫桿怎麼不能拉到最上面，滿畫面?」) */
  const [full, setFull] = useState(false);
  const [pull, setPull] = useState(0);
  /** the panel's height while the grip is dragged up (or down from full), following the finger */
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const pullFrom = useRef<{ id: number; y: number; moved: boolean; h0: number; max: number } | null>(null);
  /** how far a hidden panel is pulled up before it opens */
  const OPEN_PULL = 30;
  /** how far the grip goes before letting go switches between normal and full screen */
  const FULL_PULL = 60;
  useEffect(() => { if (!open) { setCollapsed(false); setFull(false); setPull(0); setDragHeight(null); } }, [open]);
  // sideways: the phone may turn while the panel is open, and the panel stands on the right without a grip, never
  // hidden or full (用戶 2026-11-23：「工程相機增加橫向模式，下半部這些按鈕全部轉向」「橫向模式取消橫桿」)
  useEffect(() => { if (!open) return; allowRotation(true); return () => allowRotation(false); }, [open]);
  const [sideways, setSideways] = useState(() => typeof matchMedia === "function" && matchMedia(SIDEWAYS).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const q = matchMedia(SIDEWAYS), on = () => setSideways(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  useEffect(() => { if (sideways) { setCollapsed(false); setFull(false); setPull(0); setDragHeight(null); } }, [sideways]);
  const grip = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const s = sheetRef.current, holder = s?.offsetParent as HTMLElement | null;
      pullFrom.current = { id: e.pointerId, y: e.clientY, moved: false, h0: s?.getBoundingClientRect().height ?? 0, max: (holder?.clientHeight ?? window.innerHeight) - 16 };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const f = pullFrom.current;
      if (!f || f.id !== e.pointerId) return;
      const dy = e.clientY - f.y;
      if (Math.abs(dy) > 6) f.moved = true;
      // pulled up while hidden: open it at once and stop there — following the finger carried the empty strip up the
      // whole screen (用戶 2026-11-23：「清單的橫桿拉動，動作錯誤，拉到最上會變空的」); pulling on grows it
      if (collapsed) {
        if (dy < -OPEN_PULL) { setCollapsed(false); f.y = e.clientY; f.h0 = 0; setPull(0); return; }
        setPull(Math.max(-OPEN_PULL, Math.min(0, dy)));
        return;
      }
      // open: up (or down from full) changes the height with the finger; down from normal slides it out of the way
      if (dy < 0 || full) {
        const h0 = f.h0 || (sheetRef.current?.getBoundingClientRect().height ?? 0);
        f.h0 = h0;
        setPull(0);
        setDragHeight(Math.max(120, Math.min(f.max, h0 - dy)));
        return;
      }
      setDragHeight(null);
      setPull(Math.max(0, dy));
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const f = pullFrom.current;
      pullFrom.current = null;
      if (!f || f.id !== e.pointerId) return;
      const dy = e.clientY - f.y;
      if (!f.moved) { setCollapsed((c) => !c); setFull(false); } // a tap hides or opens
      else if (collapsed && dy < -OPEN_PULL) setCollapsed(false);
      else if (!collapsed && !full && dy < -FULL_PULL) setFull(true);
      else if (full && dy > FULL_PULL) setFull(false);
      else if (!collapsed && !full && dy > 40) setCollapsed(true);
      setPull(0); setDragHeight(null);
    },
    onPointerCancel: () => { pullFrom.current = null; setPull(0); setDragHeight(null); },
  };
  const [parts, setPartsNow] = useState<ExportParts>(() => { try { return { ...ALL_PARTS, ...(JSON.parse(localStorage.getItem("fatcat.camera.parts") ?? "{}") as Partial<ExportParts>) }; } catch { return { ...ALL_PARTS }; } });
  const setParts = (p: ExportParts) => { setPartsNow(p); try { localStorage.setItem("fatcat.camera.parts", JSON.stringify(p)); } catch { /* private mode */ } };
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** size of every marker (slider); saved to the batch a moment after the slider stops */
  const [markerScale, setMarkerScale] = useState(1);
  const saveScale = useRef<number | undefined>(undefined);
  useEffect(() => { setMarkerScale(clampScale(batch?.markerScale ?? 1)); }, [batch?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeScale = (v: number) => {
    setMarkerScale(v);
    window.clearTimeout(saveScale.current);
    const id = batch?.id;
    if (id) saveScale.current = window.setTimeout(() => { void updateBatch(id, { markerScale: v }).then((b) => setBatch(b)).catch(fail); }, 400);
  };

  const fail = useCallback((e: unknown) => {
    const code = (e as { code?: string } | null)?.code;
    setMessage(code === "STORAGE_FULL" ? t("camera.storageFull") : code === "PROTECTED" ? t("camera.demoKept") : t("camera.failed", { why: e instanceof Error ? e.message : String(e) }));
  }, [t]);

  const reloadBatches = useCallback(async () => {
    const all = await listBatches();
    const mine = all.filter((b) => b.viewKey === ctx.viewKey);
    setBatches(mine);
    setSigners(await listSigners());
    setLoadedFor(ctx.viewKey);
    return mine;
  }, [ctx.viewKey]);
  const [loadedFor, setLoadedFor] = useState("");

  const reload = useCallback(async (b: CameraBatch | null) => {
    if (!b) { setPoints([]); setPhotos([]); return; }
    setPoints(await listPoints(b.id));
    setPhotos(await listPhotos(b.id));
  }, []);

  useEffect(() => {
    if (!open) { setPlacing(false); return; }
    setMessage("");
    void reloadBatches().catch(fail);
  }, [open, reloadBatches, fail]);

  // Leaving the demo project puts it back as it was: what was tried in it is not kept (用戶 2026-11-23：「範例內的照片也要
  // 能刪除，定點也是，只是不能存檔」)
  const shownDemo = useRef<string | null>(null);
  useEffect(() => {
    const now = open && batch?.demo ? batch.id : null;
    if (shownDemo.current && shownDemo.current !== now) {
      void import("../library/demoSeed").then((m) => m.resetDemoProject()).then(() => reloadBatches()).catch(() => {});
    }
    shownDemo.current = now;
  }, [open, batch?.id, batch?.demo, reloadBatches]);

  // A different sheet: the open batch belongs to another drawing.
  useEffect(() => {
    if (batch && batch.viewKey !== ctx.viewKey) { setBatch(null); setView("batches"); setSelectedId(null); void reload(null); }
  }, [ctx.viewKey, batch, reload]);

  const texts: PlaceText[] = useMemo(() => {
    if (ctx.placeTexts) return ctx.placeTexts;
    const out: PlaceText[] = [];
    for (const e of ctx.index?.entities ?? []) {
      const raw = e.properties?.text;
      if (typeof raw !== "string" || !raw) continue;
      const b = e.bounds;
      out.push({ text: plainCadText(raw), x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
    }
    return out;
  }, [ctx.index, ctx.placeTexts]);

  /** drawing width from the sheet's objects (sizes the DXF markers when no sheet PDF is made) */
  const indexWidth = useMemo(() => { let lo = Infinity, hi = -Infinity; for (const e of ctx.index?.entities ?? []) { const b = e.bounds; if (Number.isFinite(b.minX) && Number.isFinite(b.maxX)) { lo = Math.min(lo, b.minX); hi = Math.max(hi, b.maxX); } } return hi > lo ? hi - lo : 0; }, [ctx.index]);
  const labels = useMemo(() => new Map(points.map((p) => [p.id, markerText(p, photos)])), [points, photos]);
  /** points with at least one photo: shown green on the drawing */
  const done = useMemo(() => new Set(photos.flatMap((p) => (p.pointId ? [p.pointId] : []))), [photos]);
  const selected = points.find((p) => p.id === selectedId) ?? null;
  /** number the next photo of a point will get, as on the card (01, 01-2 …) */
  const nextLabel = (p: ShotPoint) => { const n = photos.filter((x) => x.pointId === p.id).length; const no = cardNo(p.no); return n ? `${no}-${n + 1}` : no; };
  const unplaced = photos.filter((p) => !p.pointId).length;

  /** Open a batch on its work view; `keep` is a point to stay selected (after saving 設定, 用戶 2026-11-23). */
  const openBatch = async (b: CameraBatch, keep: string | null = null) => {
    setBatch(b); setSelectedId(keep); setView("work");
    await reload(b);
    // older batches did not keep their 我的圖面 entry: note it now, so the home page can open them
    if (!b.drawingId && ctx.drawingId) void updateBatch(b.id, { drawingId: ctx.drawingId }).then(setBatch).catch(() => {});
  };

  // A start from the home page: the batch picked there, or a new batch's settings.
  useEffect(() => {
    const go = ctx.launch;
    if (!open || !go || loadedFor !== ctx.viewKey) return;
    ctx.onLaunched?.();
    if (go.newBatch) { setBatch(null); setView("settings"); return; }
    // 複製到另一張圖: the spots of that project, see-through on this drawing, until 確定
    if (go.copyFrom) {
      void Promise.all([getBatch(go.copyFrom), listPoints(go.copyFrom)]).then(([source, pts]) => {
        if (!source) return;
        setBatch(null); setSelectedId(null); setPlacing(false);
        // the drawing's extent: the page of a PDF, or what is drawn on a CAD sheet
        let box = ctx.sheetBounds ?? null;
        if (!box && ctx.index?.entities.length) { box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }; for (const e of ctx.index.entities) { const q = e.bounds; if ([q.minX, q.minY, q.maxX, q.maxY].every(Number.isFinite)) { box.minX = Math.min(box.minX, q.minX); box.minY = Math.min(box.minY, q.minY); box.maxX = Math.max(box.maxX, q.maxX); box.maxY = Math.max(box.maxY, q.maxY); } } }
        setCopy({ source, points: pts, start: startTransform(pts, box && Number.isFinite(box.minX) ? box : null), pairs: [], step: "look", picked: null, snapped: null }); setView("copy");
      }).catch(fail);
      return;
    }
    // read it again: the list here may predate a rename on the home page (用戶 2026-11-23：長按專案→修改名稱)
    if (go.batchId) void getBatch(go.batchId).then((b) => { if (b) return openBatch(b); }).catch(fail);
  }, [open, ctx.launch, loadedFor, ctx.viewKey, batches]); // eslint-disable-line react-hooks/exhaustive-deps

  const newBatchDraft = (): NewBatch => {
    const r = remembered();
    return {
      name: "", drawingName: ctx.drawingName, ...(ctx.drawingId ? { drawingId: ctx.drawingId } : {}), viewKey: ctx.viewKey, space: ctx.space,
      company: r.company ?? "", project: r.project ?? "", trade: r.trade ?? "", item: r.item ?? "", inspector: r.inspector ?? "",
      signerId: r.signerId, cardDate: "",
      // the demo drawings are a bare plan without a title block, so the arrows came out tiny: twice the size there
      // (用戶 2026-11-23：「你範例的箭頭太小了 放大2倍」)
      ...(isDemoDrawing(ctx.drawingName) ? { markerScale: DEMO_MARKER_SCALE } : {}),
    };
  };

  const saveSettings = async (draft: NewBatch) => {
    try {
      remember({ company: draft.company, project: draft.project, trade: draft.trade, item: draft.item, inspector: draft.inspector, signerId: draft.signerId });
      const b = batch ? await updateBatch(batch.id, draft) : await createBatch(draft);
      await reloadBatches();
      // the spot picked before opening 設定 stays picked, so the next photo is placed there (用戶 2026-11-23：「存完設定仍
      // 保持原本選中的定點」); before, it was dropped and the photo landed unplaced
      await openBatch(b, batch && selected ? selected.id : null);
    } catch (e) { fail(e); }
  };

  const boardFor = (point: ShotPoint | null, when: Date): Whiteboard => ({
    item: batch?.item ?? "", place: point?.place ?? "", date: rocDate(when), inspector: batch?.inspector ?? "",
    ...(batch?.signerId ? { signerId: batch.signerId } : {}), ...loadBoardPos(), font: batch?.boardFont ?? "hand", weight: batch?.boardWeight ?? DEFAULT_WEIGHT, ...(batch && loadStage(batch.id) ? { stage: loadStage(batch.id) } : {}),
  });

  // 放點 held: offer 刪除全部定點, and ask once more before anything goes (用戶 2026-11-23：「長按放點，出現刪除全部點位的
  // 選項，要有再度確認」); a spot takes its photos with it
  const placeHold = useLongPress<null>(() => {
    if (!batch) return;
    if (!points.length) { setMessage(t("camera.noPointsToDelete")); return; }
    const n = points.length, m = photos.filter((p) => p.pointId).length, b = batch;
    setConfirm({ message: t("camera.deleteAllPointsOffer", { N: n }), okLabel: t("camera.deleteAllPoints"),
      onOk: () => setConfirm({ message: t("camera.deleteAllPointsAsk", { N: n, M: m }), okLabel: t("camera.deleteAllPoints"),
        onOk: () => void deleteAllPoints(b.id).then(async (r) => { setSelectedId(null); setPlacing(false); await reload(b); setMessage(t("camera.deletedAllPoints", { N: r.points, M: r.photos })); }).catch(fail) }) });
  });

  /** Keep photos (from the camera or the gallery) for the selected point, or unplaced. */
  const keepPhotos = async (files: readonly Blob[], takenAt: number[] = [], pos?: Pick<Whiteboard, "x" | "y" | "width">) => {
    if (!batch) return;
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const bmp = await createImageBitmap(f);
        const when = new Date(takenAt[i] ?? (f instanceof File ? f.lastModified : Date.now()));
        await addPhoto({ batchId: batch.id, pointId: selected?.id ?? null, takenAt: when.getTime(), width: bmp.width, height: bmp.height, board: { ...boardFor(selected, when), ...(pos ?? {}) } }, f);
        bmp.close();
      }
      await reload(batch);
    } catch (e) { fail(e); }
  };

  const [copy, setCopy] = useState<CopyState | null>(null);
  // where the spots start (as they are, or fitted into the page), then the pairs lined up from there
  const copyT = useMemo(() => (copy ? composeTransform(copy.start, transformFromPairs(copy.pairs)) : transformFromPairs([])), [copy]);
  const copyPoints = useMemo(() => (copy ? copy.points.map((p) => ({ ...p, ...applyTransform(copyT, p), angle: p.angle + transformTurn(copyT) })) : []), [copy, copyT]);
  /** 確定: a new project on this drawing with the copied spots and the source's settings and signature */
  const makeCopy = async () => {
    if (!copy) return;
    const src = copy.source, turn = transformTurn(copyT);
    try {
      const fields: NewBatch = {
        name: batchName(Date.now(), src.item), drawingName: ctx.drawingName, ...(ctx.drawingId ? { drawingId: ctx.drawingId } : {}), viewKey: ctx.viewKey, space: ctx.space,
        company: src.company, project: src.project, trade: src.trade, item: src.item, inspector: src.inspector, ...(src.signerId ? { signerId: src.signerId } : {}),
        cardDate: "", ...(src.boardFont ? { boardFont: src.boardFont } : {}), ...(src.boardWeight ? { boardWeight: src.boardWeight } : {}), ...(src.markerScale ? { markerScale: src.markerScale } : {}),
      };
      const made = await createBatch(fields);
      const stage = loadStage(src.id);
      if (stage) saveStage(made.id, stage);
      await addPoints(made.id, copy.points.map((p) => {
        const q = applyTransform(copyT, p);
        return { x: q.x, y: q.y, angle: (((p.angle + turn) % 360) + 360) % 360, place: copiedPlace(placeName(ctx.drawingName, q, texts, ctx.placeRadius), p.place, src.drawingName, ctx.drawingName) };
      }));
      setCopy(null);
      await reloadBatches();
      noteForPage.current = t("camera.copyDone", { N: copy.points.length, name: src.name });
      await openBatch(made);
    } catch (e) { fail(e); }
  };
  const copyMarkers = open && view === "copy" && copy ? {
    points: copyPoints, labels: new Map(copy.points.map((p) => [p.id, String(p.no)])), selectedId: copy.picked, placing: copy.step === "pickPlace",
    scale: copy.source.markerScale ?? markerScale, done: new Set<string>(), ghost: true,
    pins: [
      ...(ctx.pdf ? [] : [{ x: 0, y: 0, label: t("camera.copyBase"), color: "#2f8cff" }]),
      ...(copy.snapped ? [{ x: copy.snapped.x, y: copy.snapped.y, label: copy.snapped.kind ? t("camera.copySnapped") : t("camera.copyHere"), color: "#ffb547" }] : []),
    ],
    onAdd: (at: { x: number; y: number }, ppu?: number) => {
      if (copy.step !== "pickPlace" || !copy.picked) return;
      const from = copy.points.find((p) => p.id === copy.picked);
      if (!from) return;
      // pulled onto a column corner or grid crossing within about a fingertip (as when measuring)
      const s = ctx.pdf ? { ...at, kind: null } : alignSnap(ctx.index, at, ppu && ppu > 0 ? 24 / ppu : 0);
      setCopy({ ...copy, pairs: [...copy.pairs, { from: applyTransform(copy.start, from), to: { x: s.x, y: s.y } }].slice(-2), step: "look", picked: null, snapped: s });
    },
    onSelect: (id: string | null) => { if (copy.step === "pickSpot" && id) setCopy({ ...copy, picked: id, step: "pickPlace" }); },
    onMove: () => {}, onTurn: () => {},
  } : null;

  /** The photo being located joins spot pt: the board's place follows the spot, the spot gets picked. */
  const locateTo = async (ph: PhotoRecord, pt: ShotPoint) => {
    if (!batch) return;
    setLocating(null); setPlacing(false);
    try {
      await updatePhoto(ph.id, { pointId: pt.id, board: { ...ph.board, place: pt.place } });
      setSelectedId(pt.id);
      await reload(batch);
      setMessage(t("camera.located", { no: cardNo(pt.no) }));
    } catch (e) { fail(e); }
  };

  const markers = copyMarkers ?? (open && batch ? {
    points, labels, selectedId, placing: placing || !!locating, scale: markerScale, done,
    onAdd: async (at: { x: number; y: number }) => {
      if (locating) {
        // an empty spot: a new arrow there takes the photo
        if (points.length >= MAX_POINTS) { setLocating(null); setMessage(t("camera.batchFull", { N: MAX_POINTS })); return; }
        try {
          const p = await addPoint(batch.id, { x: at.x, y: at.y, angle: 90, place: placeName(ctx.drawingName, at, texts, ctx.placeRadius) });
          setPoints((list) => [...list, p]);
          await locateTo(locating, p);
        } catch (e) { fail(e); }
        return;
      }
      // 001–999 in a batch; beyond that a new batch (用戶 2026-11-23)
      if (points.length >= MAX_POINTS) { setPlacing(false); setMessage(t("camera.batchFull", { N: MAX_POINTS })); return; }
      try {
        const p = await addPoint(batch.id, { x: at.x, y: at.y, angle: 90, place: placeName(ctx.drawingName, at, texts, ctx.placeRadius) });
        setPoints((list) => [...list, p]); setSelectedId(p.id); // placing stays on: tap after tap (用戶 2026-11-22：放點要能連續放)
      } catch (e) { fail(e); }
    },
    onSelect: (id: string | null) => {
      const pt = locating && id ? points.find((q) => q.id === id) : undefined;
      if (locating && pt) { void locateTo(locating, pt); return; }
      setSelectedId(id); setRenumbering(false);
    },
    onMove: async (id: string, at: { x: number; y: number }) => {
      try {
        const p = await updatePoint(id, { x: at.x, y: at.y, place: placeName(ctx.drawingName, at, texts, ctx.placeRadius) });
        setPoints((list) => list.map((q) => (q.id === id ? p : q)));
      } catch (e) { fail(e); }
    },
    onTurn: async (id: string, angle: number) => {
      try {
        const p = await updatePoint(id, { angle });
        setPoints((list) => list.map((q) => (q.id === id ? p : q)));
      } catch (e) { fail(e); }
    },
    onLocked: () => setMessage(t("camera.pointLocked")),
  } : null);

  /** New place name for a spot; its photos that showed the old name on the board follow. */
  const renamePlace = async (p: ShotPoint, place: string) => {
    if (!batch || place === p.place) return;
    try {
      await updatePoint(p.id, { place });
      for (const ph of photos) if (ph.pointId === p.id && ph.board.place === p.place) await updatePhoto(ph.id, { board: { ...ph.board, place } });
      await reload(batch);
    } catch (e) { fail(e); }
  };

  const askDeleteBatch = (b: CameraBatch, count: number) => setConfirm({
    message: t("camera.deleteBatchAsk", { name: b.name, photos: count }), okLabel: t("camera.deleteBatch"),
    onOk: () => void deleteBatch(b.id).then(async () => { setBatch(null); setView("batches"); await reload(null); await reloadBatches(); }).catch(fail),
  });

  let body: ReactElement | null = null;
  if (view === "batches") {
    body = (
      // the batches of this sheet, short (用戶 2026-11-23 白板 #10：「美化跟精簡」): no heading (拍照批次 sits in the head),
      // a card per batch, or one line when there is none; then 新增批次
      <div className="camera-body camera-batch-view">
        {batches.length ? (
          <ul className="camera-batches camera-batch-cards">
            {batches.map((b) => (
              <li key={b.id}><button type="button" onClick={() => void openBatch(b)}><strong>{b.demo ? <em className="camera-demo-tag">{t("camera.demoTag")}</em> : null}{b.name || t("camera.homeUnnamed")}</strong>
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg></button></li>
            ))}
          </ul>
        ) : (
          <p className="camera-empty"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z" /><circle cx="12" cy="13.2" r="3.4" /></svg>{t("camera.noBatches")}</p>
        )}
        <button type="button" className="camera-primary camera-batch-new" onClick={() => { setBatch(null); setView("settings"); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>{t("camera.newBatch")}</button>
      </div>
    );
  } else if (view === "copy" && copy) {
    const step = copy.step === "pickSpot" ? t("camera.copyPickSpot") : copy.step === "pickPlace" ? t("camera.copyPickPlace")
      : copy.pairs.length ? t("camera.copyAligned", { N: copy.pairs.length }) : t(ctx.pdf ? "camera.copyLookPdf" : "camera.copyLook");
    body = (
      <div className="camera-body camera-copy">
        <p className="camera-copy-what">{t("camera.copyWhat", { name: copy.source.name, N: copy.points.length })}</p>
        <p className="camera-message camera-message-box camera-copy-step" role="status">{step}</p>
        <div className="camera-copy-actions">
          <button type="button" className="camera-primary" disabled={copy.step !== "look"} onClick={() => void makeCopy()}>{t("camera.copyMake")}</button>
          <button type="button" onClick={() => setCopy({ ...copy, step: copy.step === "look" ? "pickSpot" : "look", picked: null })}>{copy.step === "look" ? t(copy.pairs.length ? "camera.copyAlignMore" : "camera.copyAlign") : t("confirm.cancel")}</button>
          {copy.pairs.length ? <button type="button" onClick={() => setCopy({ ...copy, pairs: [], step: "look", picked: null, snapped: null })}>{t("camera.copyReset")}</button> : null}
        </div>
      </div>
    );
  } else if (view === "settings") {
    body = <BatchSettings initial={batch ?? newBatchDraft()} createdAt={batch?.createdAt} signers={signers} onSave={(d) => void saveSettings(d)}
      onCancel={() => setView(batch ? "work" : "batches")}
      onDelete={batch && !batch.demo ? () => askDeleteBatch(batch, photos.length) : undefined} />;
  } else if (view === "photos" && batch) {
    body = <PhotoList batch={batch} points={points} photos={photos} current={selectedId}
      onDeleteAll={() => setConfirm({ message: t("camera.deleteAllPhotosAsk", { N: photos.length }), okLabel: t("camera.deleteAllPhotos"),
        onOk: () => void deleteAllPhotos(batch.id).then(async (n) => { await reload(batch); noteForPage.current = t("camera.deletedAllPhotos", { N: n }); setView("work"); }).catch(fail) })}
      onFocus={(ph) => {
        // a photo tapped: its spot picked and shown on the drawing (用戶 2026-11-23：「有開啟清單時，點箭頭跟底下的照片，要做雙向跳」)
        const pt = points.find((q) => q.id === ph.pointId);
        if (!pt) return;
        const wasFull = full;
        setSelectedId(pt.id); setFull(false);
        // from full screen, wait for the panel to settle (0.22 s) so the spot lands above where it ends up
        if (wasFull) window.setTimeout(() => ctx.focusPoint?.(pt.x, pt.y), 280);
        else requestAnimationFrame(() => ctx.focusPoint?.(pt.x, pt.y));
      }}
      onEdit={(ph, board) => void updatePhoto(ph.id, { board }).then(() => reload(batch)).catch(fail)}
      onLocate={(ph) => { setLocating(ph); setPlacing(false); setSelectedId(null); setFull(false); setCollapsed(false); setMessage(""); setView("work"); }}
      onDelete={(ph) => setConfirm({ message: t("camera.deletePhotoAsk"), okLabel: t("camera.deletePhoto"), onOk: () => void deletePhoto(ph.id).then(async () => {
        await reload(batch);
        // the last one gone: back to the camera's page with its tools, not an empty list (用戶 2026-11-23：「我刪光照片 怎麼
        // 功能就不見了」), with a note that survives the page change
        if (photos.length <= 1) { noteForPage.current = t("camera.allPhotosDeleted"); setView("work"); }
      }).catch(fail) })} />;
  } else if (view === "export" && batch) {
    const placedCount = photos.filter((p) => p.pointId).length;
    /** zip: 「一鍵壓縮打包」 one ZIP; otherwise the files one by one (用戶 2026-11-22：可不包 ZIP) */
    const run = async (asZip: boolean) => {
      setMessage(""); setProgress({ done: 0, total: placedCount + 2 });
      try {
        // the spots as they land on the sheet picture, for the arrows' links to their photos (用戶 2026-11-24 選 A)
        let sheetMarks: SheetMark[] = [];
        const paint: Parameters<NonNullable<CameraContext["exportSheet"]>>[0] = (c, project, ppu, scale, sheetWidth) => {
          const radius = markerUnitRadius(sheetWidth || indexWidth, markerScale) * ppu, W = c.canvas.width, H = c.canvas.height;
          sheetMarks = points.flatMap((p) => { const [q] = project([{ x: p.x, y: p.y }]); return Number.isFinite(q.x) && Number.isFinite(q.y) && W > 0 && H > 0 ? [{ pointId: p.id, fx: (q.x * scale) / W, fy: (q.y * scale) / H, fr: (ARROW_TIP * radius * scale) / W }] : []; });
          paintPhotoMarkers(c, points, labels, project, scale, radius);
        };
        // 黑白 and 彩色 白底 對位圖, each when ticked (用戶 2026-11-23)
        const mono = parts.sheetMono && ctx.exportSheet ? await ctx.exportSheet(paint, "mono").catch(() => null) : null;
        const sheet = parts.sheetPdf && ctx.exportSheet ? await ctx.exportSheet(paint, "color").catch(() => null) : null;
        const input = { batch: { ...batch, markerScale }, points, photos, signers, sheetPdf: sheet?.blob ?? null, sheetMonoPdf: mono?.blob ?? null, sheetWidth: mono?.sheetWidth || sheet?.sheetWidth || indexWidth, sheetMarks, parts: ctx.pdf ? { ...parts, markerDxf: false, arrowLisp: false } : parts, onProgress: (done: number, total: number) => setProgress({ done, total }) };
        if (asZip) {
          const out = await exportBatch(input);
          await shareFile(out.blob, out.fileName, "application/zip");
          setMessage(t("camera.exported", { name: out.fileName }));
        } else {
          const files = await exportBatchFiles(input);
          await shareFiles(files);
          setMessage(t("camera.exportedFiles", { N: files.length }));
        }
      } catch (e) { fail(e); } finally { setProgress(null); }
    };
    body = (
      <div className="camera-body">
        {/* the title sits in the head row; one short line here, so every option and both buttons show (用戶 2026-11-23：
            「點匯出要完整顯示所有選項，上方文字去調整」) */}
        <p className="camera-hint camera-export-what">{t("camera.exportWhat")}</p>
        {unplaced ? <p className="camera-batch-line"><em>{t("camera.exportUnplaced", { N: unplaced })}</em></p> : null}
        <fieldset className="camera-parts">
          {/* a PDF base has no CAD coordinates to line the DXF / LISP up with (用戶 2026-11-23 選 B) */}
          {(["sheetMono", "sheetPdf", "sheetLinks", "markerDxf", "arrowLisp", "photos", "originals", "cardDocx", "cardPdf"] as const).filter((k) => !(ctx.pdf && (k === "markerDxf" || k === "arrowLisp"))).map((k) => (
            <label key={k} className={k === "sheetLinks" ? "camera-check camera-check-sub" + (parts.sheetMono || parts.sheetPdf ? "" : " off") : "camera-check"} title={k === "sheetMono" || k === "sheetPdf" || k === "sheetLinks" ? t(`camera.part.${k}.tip`) : undefined}><input type="checkbox" checked={parts[k]} disabled={k === "sheetLinks" && !(parts.sheetMono || parts.sheetPdf)} onChange={(e) => setParts({ ...parts, [k]: e.target.checked })} />{t(`camera.part.${k}`)}</label>
          ))}
        </fieldset>
        {progress ? <p role="status">{t("camera.exporting", { done: progress.done, total: progress.total })}</p> : null}
        <div className="camera-actions">
          <button type="button" className="camera-primary" disabled={!placedCount || !!progress || !Object.values(parts).some(Boolean)} onClick={() => void run(false)}>{placedCount ? t("camera.exportGo") : t("camera.exportEmpty")}</button>
          <button type="button" className="camera-zip" title={t("camera.exportZipTip")} disabled={!placedCount || !!progress || !Object.values(parts).some(Boolean)} onClick={() => void run(true)}>{t("camera.exportZip")}</button>
        </div>
      </div>
    );
  } else if (view === "work" && batch && locating) {
    // 定位 one photo: only the step and 取消, like the copy steps
    body = (
      <div className="camera-body camera-copy camera-locating">
        <p className="camera-message camera-message-box camera-copy-step" role="status">{t("camera.locateStep")}</p>
        <div className="camera-copy-actions">
          <button type="button" onClick={() => { setLocating(null); setView("photos"); }}>{t("confirm.cancel")}</button>
        </div>
      </div>
    );
  } else if (view === "work" && batch) {
    const nos = photoLabels(points, photos);
    const count = selected ? photos.filter((p) => p.pointId === selected.id).length : 0;
    const I = (d: string) => <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
    body = (
      <div className="camera-body camera-compact">
        {/* compact tool row (用戶 2026-11-22 白板 #2：精簡美化，太佔空間) */}
        <div className="camera-tools">
          <button type="button" aria-pressed={placing} title={t("camera.placeTip")} {...placeHold.bind(null)} onClick={() => { if (placeHold.consumed()) return; setPlacing((v) => !v); }}>{I("M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21zM12 8.2v4.6M9.7 10.5h4.6")}<span>{t("camera.tool.place")}</span></button>
          <label title={t("camera.fromGallery")}>{I("M4 5h16v14H4zM4 15l4.5-4.5 4 4 3-3L20 15M15.5 9.2h.01")}<span>{t("camera.tool.gallery")}</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void keepPhotos(fs); }} />
          </label>
          <button type="button" title={t("camera.list")} onClick={() => setView("photos")}>{I("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01")}<span>{t("camera.tool.list")}</span>{unplaced ? <em className="camera-badge">{unplaced}</em> : null}</button>
          <button type="button" title={t("camera.settings")} onClick={() => setView("settings")}>{I("M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.6a7.6 7.6 0 0 1-2 1.2l-.4 2H11l-.4-2a7.6 7.6 0 0 1-2-1.2l-1.9.6-1.8-3.1 1.6-1.2a7.4 7.4 0 0 1 0-2.4L4.9 9.3l1.8-3.1 1.9.6a7.6 7.6 0 0 1 2-1.2L11 3.6h3.6l.4 2a7.6 7.6 0 0 1 2 1.2l1.9-.6 1.8 3.1-1.6 1.2a7.4 7.4 0 0 1 0 2.4z")}<span>{t("camera.tool.settings")}</span></button>
          <button type="button" title={t("camera.exportTitle")} onClick={() => { setMessage(""); setView("export"); }}>{I("M12 15V4M8 8l4-4 4 4M5 13v6h14v-6")}<span>{t("camera.tool.export")}</span></button>
        </div>
        {/* the selected spot and its place name, tap to rename; full width here, swapped with the 符號 slider (用戶 2026-11-23：
            「新版的把位置跟符號的拉桿交換」) */}
        {selected ? <PlaceField key={selected.id} label={t("camera.spotNo", { no: markerText(selected, photos) })} place={selected.place}
          photos={photos.filter((p) => p.pointId === selected.id).map((p) => plainLabel(nos.get(p.id)!)).join("、")} onSave={(v) => void renamePlace(selected, v)} /> : null}
        {selected ? (
          renumbering ? (
            <form className="camera-row" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("no")); setRenumbering(false); void renumberPoint(selected.id, v).then(() => reload(batch)).catch(fail); }}>
              <span>{t("camera.renumberShort", { no: selected.no, max: points.length })}</span>
              <input name="no" type="number" min={1} max={points.length} defaultValue={selected.no} autoFocus aria-label={t("camera.renumberAsk", { no: selected.no, max: points.length })} />
              <button type="submit">{t("camera.save")}</button>
            </form>
          ) : (
            <div className="camera-row camera-sel">
              {/* the status note as a box where the place text was, as tall as 改號 (用戶 2026-11-23) */}
              <p className="camera-message camera-message-box" role="status" title={message}>{message}</p>
              <button type="button" onClick={() => setRenumbering(true)}>{t("camera.renumber")}</button>
              {/* both delete at once, no confirm (用戶 2026-11-23：「刪除定點跟刪除照片 就直接刪，不需確認」); a one-line note says what went */}
              <button type="button" className="camera-danger" onClick={() => {
                const no = selected.no;
                void deletePoint(selected.id).then((n) => { setSelectedId(null); setMessage(t("camera.deletedPoint", { no, N: n })); return reload(batch); }).catch(fail);
              }}>{t("camera.deletePointShort")}</button>
              {/* the photos of this spot, right here (用戶 2026-11-23：最右邊加「刪除照片」，不用到清單才能刪) */}
              <button type="button" className="camera-danger" disabled={!count} onClick={() => {
                const own = photos.filter((p) => p.pointId === selected.id), no = selected.no;
                void (async () => { for (const ph of own) await deletePhoto(ph.id); setMessage(t("camera.deletedPhotos", { no, N: own.length })); await reload(batch); })().catch(fail);
              }}>{t("camera.deletePhotoShort")}</button>
            </div>
          )
        ) : null /* no hint under the tools while 放點 is on (用戶 2026-11-23：「點選到放點，下方不要出現說明」) */}
      </div>
    );
  }

  const subView = view === "settings" || view === "photos" || view === "export";
  // sideways the panel is a column on the right: a fitted drawing stays left of it (用戶 2026-11-23 橫向)
  const panel = open ? (
    <section ref={sheetRef} data-fit={sideways ? "corner" : undefined} className={"camera-sheet" + (collapsed ? " collapsed" : "") + (full && !collapsed ? " full" : "") + (view === "export" ? " exporting" : "") + (view === "photos" ? " listing" : "") + (view === "work" ? " working" : "")} aria-label={t("camera.title")}
      style={dragHeight !== null ? { height: dragHeight, maxHeight: "none", transition: "none" } : pull ? { transform: `translateY(${pull}px)`, transition: "none" } : undefined}>
      <div className="camera-grip" role="button" tabIndex={0} aria-label={t(collapsed ? "camera.gripOpen" : "camera.gripHide")} title={t(collapsed ? "camera.gripOpen" : "camera.gripHide")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCollapsed((c) => !c); } }} {...grip}><span /></div>
      <header className="camera-head">{/* no title text (用戶 2026-11-23 白板 #1「刪除」); the 符號 slider sits there (swapped with the place name,
            用戶 2026-11-23) */}
        {view === "batches" ? <span className="camera-head-label">{t("camera.batchesShort")}</span> : view === "copy" ? <span className="camera-head-label">{t("camera.copyTitle")}</span> : view === "export" ? <span className="camera-head-label">{t("camera.exportTitle")}</span> : batch && view === "work" ? (
          <label className="camera-head-scale"><span>{t("camera.sizeShort", { pct: Math.round(markerScale * 100) })}</span>
            <input type="range" min={MARKER_SCALE_MIN} max={MARKER_SCALE_MAX} step={0.1} value={markerScale} aria-label={t("camera.markerSize", { pct: Math.round(markerScale * 100) })} onChange={(e) => changeScale(Number(e.target.value))} />
          </label>
        ) : <span className="camera-head-space" aria-hidden="true" />}
        {/* the shutter sits in the title row as a cat paw, so it is there even with the panel pulled down (用戶 2026-11-22 白板 #1) */}
        {batch && view === "work" ? (
          <button type="button" className="camera-paw" title={t("camera.shootTip")} aria-label={t("camera.shoot")} onClick={() => { setPlacing(false); setLocating(null); setShooting(true); }}>
            <PawShape className="camera-paw-shape" />
            <svg className="camera-paw-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z" /><circle cx="12" cy="13.2" r="3.4" /></svg>
            <span>{t("camera.shoot")}</span>
          </button>
        ) : <span />}
        {/* on 設定 / 清單 / 匯出 the X goes back to the camera, only there it closes the panel (用戶 2026-11-23：「設定的X是要
            返回工程相機，不是整個關閉」) */}
        {/* no X on the camera page itself (用戶 2026-11-23：「貓爪右邊的X」拿掉); 設定／清單／匯出 keep theirs to go back */}
        {view === "work" ? <span className="camera-head-space" aria-hidden="true" /> : (
          <button type="button" className="camera-x" aria-label={t(subView ? "camera.backToCamera" : ctx.onProjects ? "camera.toProjects" : "camera.close")} title={t(subView ? "camera.backToCamera" : ctx.onProjects ? "camera.toProjects" : "camera.close")}
          onClick={() => { if (view === "copy") { setCopy(null); setView("batches"); return; } if (subView) { setView(batch ? "work" : "batches"); return; } setPlacing(false); if (ctx.onProjects) ctx.onProjects(); else onClose(); }}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        )}</header>
      {body}
      {message && !(view === "work" && selected && !renumbering) ? <p className="camera-message camera-message-box camera-message-bottom" role="status" title={message}>{message}</p> : null}
      {confirm ? <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} /> : null}
      {shooting && batch ? (
        <CameraScreen board={boardFor(selected, new Date())} signer={signers.find((x) => x.id === batch.signerId) ?? null}
          text={{ title: boardTitle(batch.project, batch.trade), no: selected ? nextLabel(selected) : "—" }}
          onShot={(blob, pos) => keepPhotos([blob], [Date.now()], pos)} onPos={saveBoardPos} onClose={() => setShooting(false)} onStage={(s) => saveStage(batch.id, s)} />
      ) : null}
    </section>
  ) : null;

  return { photoMarkers: markers, panel, batch, points, photos, keepPhotos };
}

function BatchSettings({ initial, createdAt, signers: initialSigners, onSave, onCancel, onDelete }: {
  initial: NewBatch; createdAt?: number; signers: readonly Signer[]; onSave(d: NewBatch): void; onCancel(): void; onDelete?(): void;
}) {
  const { t } = useI18n();
  const [d, setD] = useState<NewBatch>(initial);
  const [signers, setSigners] = useState<readonly Signer[]>(initialSigners);
  const [signing, setSigning] = useState(false);
  const field = (key: keyof NewBatch, label: string, extra?: { required?: boolean }) => (
    <label key={key} className={extra?.required && !String(d[key] ?? "").trim() ? "camera-missing" : undefined}><span>{label}{extra?.required ? <em className="camera-required">{t("camera.required")}</em> : null}</span>
      <input value={String(d[key] ?? "")} required={extra?.required} onChange={(e) => setD({ ...d, [key]: e.target.value })} /></label>
  );
  // 查驗人員 is required and the signature is bound to that name (用戶 2026-11-23：「查驗人員設定成一定要輸入人名，並且
  // 綁訂電子簽名」): the signature saved under the same name is used, and signing saves it under this name.
  const inspector = d.inspector.trim();
  const bound = inspector ? signers.find((s) => s.name.trim() === inspector) : undefined;
  // the name is made, not typed: the day the batch was made (now for a new one) and the 施工項目
  const [made] = useState(() => createdAt ?? Date.now());
  // made from the date and 施工項目, unless the project was renamed by hand
  const name = d.nameEdited && d.name.trim() ? d.name : batchName(made, d.item);
  const ready = !!inspector;
  return (
    <form className="camera-body camera-settings" onSubmit={(e) => { e.preventDefault(); if (ready) onSave({ ...d, name, inspector, signerId: bound?.id }); }}>
      <h3>{t("camera.settings")}</h3>
      <p className="camera-batch-name"><span>{t(d.nameEdited ? "camera.field.nameOwn" : "camera.field.name")}</span><strong>{name}</strong></p>
      {field("company", t("camera.field.company"))}
      {field("project", t("camera.field.project"))}
      {field("trade", t("camera.field.trade"))}
      {field("item", t("camera.field.item"))}
      {field("inspector", t("camera.field.inspector"), { required: true })}
      {!inspector ? <p className="camera-required-hint" role="alert">{t("camera.inspectorRequired")}</p> : null}
      <div className="camera-sign-row">
        {bound ? <SignaturePreview signer={bound} /> : null}
        <span className="camera-sign-status">{!inspector ? t("camera.signNeedName") : bound ? t("camera.signBound", { name: inspector }) : t("camera.signNone", { name: inspector })}</span>
        <button type="button" disabled={!inspector} onClick={() => setSigning(true)}>{bound ? t("camera.signAgain") : t("camera.signDo")}</button>
      </div>
      {signing && inspector ? <SignaturePad initialName={inspector} signer={bound} onCancel={() => setSigning(false)}
        onSaved={(s) => { setSigning(false); setSigners([...signers.filter((x) => x.id !== s.id), s]); }} /> : null}
      {field("cardDate", t("camera.field.cardDate"))}
      <BoardSetup font={d.boardFont ?? "hand"} weight={d.boardWeight ?? DEFAULT_WEIGHT} sample={d.item.trim() || "輕隔間配管"}
        onChange={(boardFont, boardWeight) => setD({ ...d, boardFont, boardWeight })} />
      <div className="camera-actions">
        <button type="submit" className="camera-primary" disabled={!ready}>{t("camera.save")}</button>
        <button type="button" onClick={onCancel}>{t("camera.cancel")}</button>
        {onDelete ? <button type="button" className="camera-danger" onClick={onDelete}>{t("camera.deleteBatch")}</button> : null}
      </div>
    </form>
  );
}

/** 白板 in 設定: 字體 落雁體／黑體 and, for 落雁體, 粗細 原字／超細／細, with a sample written as on the board. */
function BoardSetup({ font, weight, sample, onChange }: { font: BoardFont; weight: BoardWeight; sample: string; onChange(font: BoardFont, weight: BoardWeight): void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; void ensureHandFont().then(() => live && setReady(true)); return () => { live = false; }; }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth || 300, h = c.clientHeight || 48;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fbfbf8"; ctx.fillRect(0, 0, c.width, c.height);
    drawBoardValue(ctx, { font, weight }, `${sample}  115.11.23  001-1`, 10 * dpr, c.height / 2, 20 * dpr);
  }, [font, weight, sample, ready]);
  const seg = <K extends string>(value: K, options: readonly K[], label: (k: K) => string, pick: (k: K) => void, disabled = false) => (
    <div className="camera-seg" role="group">
      {options.map((k) => <button key={k} type="button" aria-pressed={value === k} disabled={disabled} onClick={() => pick(k)}>{label(k)}</button>)}
    </div>
  );
  return (
    <div className="camera-board-setup">
      <h4>{t("camera.boardSetup")}</h4>
      <div className="camera-seg-row"><span>{t("camera.boardFont")}</span>{seg<BoardFont>(font, ["hand", "sans"], (k) => t(`camera.boardFont.${k}` as "camera.boardFont.hand"), (k) => onChange(k, weight))}</div>
      <div className="camera-seg-row"><span>{t("camera.boardWeight")}</span>{seg<BoardWeight>(weight, BOARD_WEIGHTS.map(([k]) => k), (k) => t(`camera.boardWeight.${k}` as "camera.boardWeight.fine"), (k) => onChange(font, k), font !== "hand")}</div>
      <canvas ref={ref} className="camera-board-sample" aria-hidden="true" />
    </div>
  );
}

/** The bound signature, small, in the same pen ink as on the whiteboard. */
function SignaturePreview({ signer }: { signer: Signer }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1, w = 96, h = 32;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fbfbf8"; ctx.fillRect(0, 0, c.width, c.height);
    drawSignature(ctx, signer, 4 * dpr, 2 * dpr, c.width - 8 * dpr, c.height - 4 * dpr);
  }, [signer]);
  return <canvas ref={ref} className="camera-sign-preview" aria-hidden="true" />;
}

/** The selected spot in the panel head: its number and place name; tap the name to rename it. */
function PlaceField({ label, place, photos, onSave }: { label: string; place: string; photos: string; onSave(v: string): void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(place);
  useEffect(() => { if (!editing) setV(place); }, [place, editing]);
  const done = () => { setEditing(false); const s = v.trim(); if (s !== place) onSave(s); };
  if (editing) {
    return (
      <form className="camera-place editing" onSubmit={(e) => { e.preventDefault(); done(); }}>
        <span>{label}</span>
        <input autoFocus value={v} aria-label={t("camera.placeEditLabel")} onChange={(e) => setV(e.target.value)} onBlur={done}
          onKeyDown={(e) => { if (e.key === "Escape") { setV(place); setEditing(false); } }} />
      </form>
    );
  }
  return (
    <button type="button" className="camera-place" title={t("camera.placeEditTip") + (photos ? "（" + photos + "）" : "")} onClick={() => setEditing(true)}>
      <span>{label}</span><strong>{place || "—"}</strong><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>
    </button>
  );
}
