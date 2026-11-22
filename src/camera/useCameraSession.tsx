// Engineering camera session (spec 009): the open batch of the drawing on screen, its points and photos, and the
// panel to work them. The App renders `panel` and hands `photoMarkers` to the canvas.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { ConfirmDialog, type ConfirmRequest } from "../components/ConfirmDialog";
import { useI18n } from "../i18n/translations";
import type { MeasurementIndex } from "../viewer/measurementGeometry";
import { plainCadText } from "../viewer/textSearch";
import {
  addPhoto, addPoint, createBatch, deleteBatch, deletePhoto, deletePoint, listBatches, listPhotos, listPoints, listSigners,
  renumberPoint, updateBatch, updatePhoto, updatePoint, type NewBatch,
} from "./batchStore";
import { markerText, photoLabels, plainLabel, rocDate } from "./numbering";
import { placeName, type PlaceText } from "./placeName";
import { PhotoList } from "./PhotoList";
import type { ExportCapable } from "../export/types";
import { ALL_PARTS, exportBatch, type ExportParts } from "./exportBatch";
import { paintPhotoMarkers } from "./alignment";
import { shareFile } from "../native/fileHandoff";
import { CameraScreen } from "./CameraScreen";
import { SignaturePad } from "./SignaturePad";
import { boardTitle } from "./whiteboard";
import { PawShape } from "../components/ViewerToolbar";
import type { CameraBatch, PhotoRecord, ShotPoint, Signer, Whiteboard } from "./types";

const LAST_KEY = "fatcat.camera.last";
type Remembered = Pick<NewBatch, "company" | "project" | "trade" | "item" | "inspector" | "signerId">;
function remembered(): Partial<Remembered> {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Partial<Remembered>; } catch { return {}; }
}
function remember(b: Remembered): void {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(b)); } catch { /* private mode */ }
}

/** Default board place and size: bottom-left, as the hand-held board in the user's photos. */
export const DEFAULT_BOARD = { x: 0.02, y: 0.6, width: 0.3 } as const;
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

export type CameraContext = {
  /** file name of the drawing (floor and batch name come from it) */
  drawingName: string;
  viewKey: string;
  space: string;
  index: MeasurementIndex | null;
  /** the sheet as PDF with `paint` drawn on (photo points), and its width in drawing units */
  exportSheet?(paint: Parameters<NonNullable<ExportCapable["exportWithOverlay"]>>[1]): Promise<{ blob: Blob; sheetWidth: number }>;
};

type View = "batches" | "settings" | "work" | "photos" | "export";

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
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [message, setMessage] = useState("");
  const [renumbering, setRenumbering] = useState(false);
  const [shooting, setShooting] = useState(false);
  /** pulled down out of the way to see the drawing (用戶 2026-11-22：上方橫桿往下拉讓視窗隱藏) */
  const [collapsed, setCollapsed] = useState(false);
  const [pull, setPull] = useState(0);
  const pullFrom = useRef<{ id: number; y: number; moved: boolean } | null>(null);
  useEffect(() => { if (!open) { setCollapsed(false); setPull(0); } }, [open]);
  const grip = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); pullFrom.current = { id: e.pointerId, y: e.clientY, moved: false }; },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const f = pullFrom.current;
      if (!f || f.id !== e.pointerId) return;
      const dy = e.clientY - f.y;
      if (Math.abs(dy) > 6) f.moved = true;
      setPull(collapsed ? Math.min(0, dy) : Math.max(0, dy));
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const f = pullFrom.current;
      pullFrom.current = null;
      if (!f || f.id !== e.pointerId) return;
      const dy = e.clientY - f.y;
      if (!f.moved) setCollapsed((c) => !c); // a tap toggles
      else if (!collapsed && dy > 40) setCollapsed(true);
      else if (collapsed && dy < -30) setCollapsed(false);
      setPull(0);
    },
    onPointerCancel: () => { pullFrom.current = null; setPull(0); },
  };
  const [parts, setPartsNow] = useState<ExportParts>(() => { try { return { ...ALL_PARTS, ...(JSON.parse(localStorage.getItem("fatcat.camera.parts") ?? "{}") as Partial<ExportParts>) }; } catch { return { ...ALL_PARTS }; } });
  const setParts = (p: ExportParts) => { setPartsNow(p); try { localStorage.setItem("fatcat.camera.parts", JSON.stringify(p)); } catch { /* private mode */ } };
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** size of every marker (slider); saved to the batch a moment after the slider stops */
  const [markerScale, setMarkerScale] = useState(1);
  const saveScale = useRef<number | undefined>(undefined);
  useEffect(() => { setMarkerScale(batch?.markerScale ?? 1); }, [batch?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeScale = (v: number) => {
    setMarkerScale(v);
    window.clearTimeout(saveScale.current);
    const id = batch?.id;
    if (id) saveScale.current = window.setTimeout(() => { void updateBatch(id, { markerScale: v }).then((b) => setBatch(b)).catch(fail); }, 400);
  };

  const fail = useCallback((e: unknown) => {
    const code = (e as { code?: string } | null)?.code;
    setMessage(code === "STORAGE_FULL" ? t("camera.storageFull") : t("camera.failed", { why: e instanceof Error ? e.message : String(e) }));
  }, [t]);

  const reloadBatches = useCallback(async () => {
    const all = await listBatches();
    setBatches(all.filter((b) => b.viewKey === ctx.viewKey));
    setSigners(await listSigners());
  }, [ctx.viewKey]);

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

  // A different sheet: the open batch belongs to another drawing.
  useEffect(() => {
    if (batch && batch.viewKey !== ctx.viewKey) { setBatch(null); setView("batches"); setSelectedId(null); void reload(null); }
  }, [ctx.viewKey, batch, reload]);

  const texts: PlaceText[] = useMemo(() => {
    const out: PlaceText[] = [];
    for (const e of ctx.index?.entities ?? []) {
      const raw = e.properties?.text;
      if (typeof raw !== "string" || !raw) continue;
      const b = e.bounds;
      out.push({ text: plainCadText(raw), x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
    }
    return out;
  }, [ctx.index]);

  /** drawing width from the sheet's objects (sizes the DXF markers when no sheet PDF is made) */
  const indexWidth = useMemo(() => { let lo = Infinity, hi = -Infinity; for (const e of ctx.index?.entities ?? []) { const b = e.bounds; if (Number.isFinite(b.minX) && Number.isFinite(b.maxX)) { lo = Math.min(lo, b.minX); hi = Math.max(hi, b.maxX); } } return hi > lo ? hi - lo : 0; }, [ctx.index]);
  const labels = useMemo(() => new Map(points.map((p) => [p.id, markerText(p, photos)])), [points, photos]);
  const selected = points.find((p) => p.id === selectedId) ?? null;
  /** number the next photo of a point will get, as on the card (01, 01-2 …) */
  const nextLabel = (p: ShotPoint) => { const n = photos.filter((x) => x.pointId === p.id).length; const no = String(p.no).padStart(2, "0"); return n ? `${no}-${n + 1}` : no; };
  const unplaced = photos.filter((p) => !p.pointId).length;

  const openBatch = async (b: CameraBatch) => {
    setBatch(b); setSelectedId(null); setView("work");
    await reload(b);
  };

  const newBatchDraft = (): NewBatch => {
    const r = remembered();
    return {
      name: ctx.drawingName.replace(/\.[^.]+$/, ""), drawingName: ctx.drawingName, viewKey: ctx.viewKey, space: ctx.space,
      company: r.company ?? "", project: r.project ?? "", trade: r.trade ?? "", item: r.item ?? "", inspector: r.inspector ?? "",
      signerId: r.signerId, cardDate: "",
    };
  };

  const saveSettings = async (draft: NewBatch) => {
    try {
      remember({ company: draft.company, project: draft.project, trade: draft.trade, item: draft.item, inspector: draft.inspector, signerId: draft.signerId });
      const b = batch ? await updateBatch(batch.id, draft) : await createBatch(draft);
      await reloadBatches();
      await openBatch(b);
    } catch (e) { fail(e); }
  };

  const boardFor = (point: ShotPoint | null, when: Date): Whiteboard => ({
    item: batch?.item ?? "", place: point?.place ?? "", date: rocDate(when), inspector: batch?.inspector ?? "",
    ...(batch?.signerId ? { signerId: batch.signerId } : {}), ...loadBoardPos(),
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

  const markers = open && batch ? {
    points, labels, selectedId, placing, scale: markerScale,
    onAdd: async (at: { x: number; y: number }) => {
      try {
        const p = await addPoint(batch.id, { x: at.x, y: at.y, angle: 90, place: placeName(ctx.drawingName, at, texts) });
        setPoints((list) => [...list, p]); setSelectedId(p.id); // placing stays on: tap after tap (用戶 2026-11-22：放點要能連續放)
      } catch (e) { fail(e); }
    },
    onSelect: (id: string | null) => { setSelectedId(id); setRenumbering(false); },
    onMove: async (id: string, at: { x: number; y: number }) => {
      try {
        const p = await updatePoint(id, { x: at.x, y: at.y, place: placeName(ctx.drawingName, at, texts) });
        setPoints((list) => list.map((q) => (q.id === id ? p : q)));
      } catch (e) { fail(e); }
    },
    onTurn: async (id: string, angle: number) => {
      try {
        const p = await updatePoint(id, { angle });
        setPoints((list) => list.map((q) => (q.id === id ? p : q)));
      } catch (e) { fail(e); }
    },
  } : null;

  const askDeleteBatch = (b: CameraBatch, count: number) => setConfirm({
    message: t("camera.deleteBatchAsk", { name: b.name, photos: count }), okLabel: t("camera.deleteBatch"),
    onOk: () => void deleteBatch(b.id).then(async () => { setBatch(null); setView("batches"); await reload(null); await reloadBatches(); }).catch(fail),
  });

  let body: ReactElement | null = null;
  if (view === "batches") {
    body = (
      <div className="camera-body">
        <h3>{t("camera.batches")}</h3>
        {batches.length ? (
          <ul className="camera-batches">
            {batches.map((b) => (
              <li key={b.id}><button type="button" onClick={() => void openBatch(b)}><strong>{b.name}</strong><small>{b.item}</small></button></li>
            ))}
          </ul>
        ) : <p>{t("camera.noBatches")}</p>}
        <button type="button" className="camera-primary" onClick={() => { setBatch(null); setView("settings"); }}>{t("camera.newBatch")}</button>
      </div>
    );
  } else if (view === "settings") {
    body = <BatchSettings initial={batch ?? newBatchDraft()} signers={signers} onSave={(d) => void saveSettings(d)}
      onCancel={() => setView(batch ? "work" : "batches")}
      onDelete={batch ? () => askDeleteBatch(batch, photos.length) : undefined} />;
  } else if (view === "photos" && batch) {
    body = <PhotoList batch={batch} points={points} photos={photos} selected={selected}
      onPlace={(ph) => void updatePhoto(ph.id, { pointId: selected?.id ?? null, board: { ...ph.board, place: selected?.place ?? ph.board.place } }).then(() => reload(batch)).catch(fail)}
      onEdit={(ph, board) => void updatePhoto(ph.id, { board }).then(() => reload(batch)).catch(fail)}
      onDelete={(ph) => setConfirm({ message: t("camera.deletePhotoAsk"), okLabel: t("camera.deletePhoto"), onOk: () => void deletePhoto(ph.id).then(() => reload(batch)).catch(fail) })}
      onBack={() => setView("work")} />;
  } else if (view === "export" && batch) {
    const placedCount = photos.filter((p) => p.pointId).length;
    const run = async () => {
      setMessage(""); setProgress({ done: 0, total: placedCount + 2 });
      try {
        const sheet = parts.sheetPdf && ctx.exportSheet ? await ctx.exportSheet((c, project, _ppu, scale) => paintPhotoMarkers(c, points, labels, project, scale, markerScale)).catch(() => null) : null;
        const out = await exportBatch({ batch: { ...batch, markerScale }, points, photos, signers, sheetPdf: sheet?.blob ?? null, sheetWidth: sheet?.sheetWidth || indexWidth, parts, onProgress: (done, total) => setProgress({ done, total }) });
        await shareFile(out.blob, out.fileName, "application/zip");
        setMessage(t("camera.exported", { name: out.fileName }));
      } catch (e) { fail(e); } finally { setProgress(null); }
    };
    body = (
      <div className="camera-body">
        <h3>{t("camera.exportTitle")}</h3>
        <p className="camera-hint">{t("camera.exportWhat")}</p>
        {unplaced ? <p className="camera-batch-line"><em>{t("camera.exportUnplaced", { N: unplaced })}</em></p> : null}
        <fieldset className="camera-parts">
          {(["sheetPdf", "markerDxf", "arrowLisp", "photos", "originals", "cardDocx", "cardPdf"] as const).map((k) => (
            <label key={k} className="camera-check"><input type="checkbox" checked={parts[k]} onChange={(e) => setParts({ ...parts, [k]: e.target.checked })} />{t(`camera.part.${k}`)}</label>
          ))}
        </fieldset>
        {progress ? <p role="status">{t("camera.exporting", { done: progress.done, total: progress.total })}</p> : null}
        <div className="camera-actions">
          <button type="button" className="camera-primary" disabled={!placedCount || !!progress || !Object.values(parts).some(Boolean)} onClick={() => void run()}>{placedCount ? t("camera.exportGo") : t("camera.exportEmpty")}</button>
          <button type="button" disabled={!!progress} onClick={() => setView("work")}>{t("camera.cancel")}</button>
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
          <button type="button" aria-pressed={placing} title={t("camera.placeTip")} onClick={() => setPlacing((v) => !v)}>{I("M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21zM12 8.2v4.6M9.7 10.5h4.6")}<span>{t("camera.tool.place")}</span></button>
          <label title={t("camera.fromGallery")}>{I("M4 5h16v14H4zM4 15l4.5-4.5 4 4 3-3L20 15M15.5 9.2h.01")}<span>{t("camera.tool.gallery")}</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void keepPhotos(fs); }} />
          </label>
          <button type="button" title={t("camera.list")} onClick={() => setView("photos")}>{I("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01")}<span>{t("camera.tool.list")}</span>{unplaced ? <em className="camera-badge">{unplaced}</em> : null}</button>
          <button type="button" title={t("camera.settings")} onClick={() => setView("settings")}>{I("M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.6a7.6 7.6 0 0 1-2 1.2l-.4 2H11l-.4-2a7.6 7.6 0 0 1-2-1.2l-1.9.6-1.8-3.1 1.6-1.2a7.4 7.4 0 0 1 0-2.4L4.9 9.3l1.8-3.1 1.9.6a7.6 7.6 0 0 1 2-1.2L11 3.6h3.6l.4 2a7.6 7.6 0 0 1 2 1.2l1.9-.6 1.8 3.1-1.6 1.2a7.4 7.4 0 0 1 0 2.4z")}<span>{t("camera.tool.settings")}</span></button>
          <button type="button" title={t("camera.exportTitle")} onClick={() => { setMessage(""); setView("export"); }}>{I("M12 15V4M8 8l4-4 4 4M5 13v6h14v-6")}<span>{t("camera.tool.export")}</span></button>
        </div>
        <label className="camera-row camera-scale-row"><span>{t("camera.sizeShort", { pct: Math.round(markerScale * 100) })}</span>
          <input type="range" min={0.5} max={3} step={0.1} value={markerScale} aria-label={t("camera.markerSize", { pct: Math.round(markerScale * 100) })} onChange={(e) => changeScale(Number(e.target.value))} />
        </label>
        {selected ? (
          renumbering ? (
            <form className="camera-row" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("no")); setRenumbering(false); void renumberPoint(selected.id, v).then(() => reload(batch)).catch(fail); }}>
              <span>{t("camera.renumberShort", { no: selected.no, max: points.length })}</span>
              <input name="no" type="number" min={1} max={points.length} defaultValue={selected.no} autoFocus aria-label={t("camera.renumberAsk", { no: selected.no, max: points.length })} />
              <button type="submit">{t("camera.save")}</button>
            </form>
          ) : (
            <div className="camera-row camera-sel">
              <span>{t("camera.selected", { no: markerText(selected, photos), place: selected.place || "—" })}{count ? " · " + photos.filter((p) => p.pointId === selected.id).map((p) => plainLabel(nos.get(p.id)!)).join("、") : ""}</span>
              <button type="button" onClick={() => setRenumbering(true)}>{t("camera.renumber")}</button>
              <button type="button" className="camera-danger" onClick={() => setConfirm({ message: t("camera.deletePointAsk", { no: selected.no }), okLabel: t("camera.deletePoint"), onOk: () => void deletePoint(selected.id).then(() => { setSelectedId(null); return reload(batch); }).catch(fail) })}>{t("camera.tool.delete")}</button>
            </div>
          )
        ) : placing ? <p className="camera-hint">{t("camera.placeHintShort")}</p> : null}
      </div>
    );
  }

  const panel = open ? (
    <section className={"camera-sheet" + (collapsed ? " collapsed" : "")} aria-label={t("camera.title")}
      style={pull ? { transform: `translateY(${pull}px)`, transition: "none" } : undefined}>
      <div className="camera-grip" role="button" tabIndex={0} aria-label={t(collapsed ? "camera.gripOpen" : "camera.gripHide")} title={t(collapsed ? "camera.gripOpen" : "camera.gripHide")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCollapsed((c) => !c); } }} {...grip}><span /></div>
      <header className="camera-head"><span className="camera-titles"><strong>{t("camera.title")}</strong>{batch ? <small>{batch.name}</small> : null}</span>
        {/* the shutter sits in the title row as a cat paw, so it is there even with the panel pulled down (用戶 2026-11-22 白板 #1) */}
        {batch && view === "work" ? (
          <button type="button" className="camera-paw" title={t("camera.shootTip")} aria-label={t("camera.shoot")} onClick={() => { setPlacing(false); setShooting(true); }}>
            <PawShape className="camera-paw-shape" />
            <svg className="camera-paw-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z" /><circle cx="12" cy="13.2" r="3.4" /></svg>
            <span>{t("camera.shoot")}</span>
          </button>
        ) : <span />}
        <button type="button" className="camera-x" aria-label={t("camera.close")} title={t("camera.close")} onClick={() => { setPlacing(false); onClose(); }}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button></header>
      {body}
      {message ? <p className="camera-message" role="status">{message}</p> : null}
      {confirm ? <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} /> : null}
      {shooting && batch ? (
        <CameraScreen board={boardFor(selected, new Date())} signer={signers.find((x) => x.id === batch.signerId) ?? null}
          text={{ title: boardTitle(batch.project, batch.trade), no: selected ? nextLabel(selected) : "—" }}
          onShot={(blob, pos) => keepPhotos([blob], [Date.now()], pos)} onPos={saveBoardPos} onClose={() => setShooting(false)} />
      ) : null}
    </section>
  ) : null;

  return { photoMarkers: markers, panel, batch, points, photos, keepPhotos };
}

function BatchSettings({ initial, signers: initialSigners, onSave, onCancel, onDelete }: {
  initial: NewBatch; signers: readonly Signer[]; onSave(d: NewBatch): void; onCancel(): void; onDelete?(): void;
}) {
  const { t } = useI18n();
  const [d, setD] = useState<NewBatch>(initial);
  const [signers, setSigners] = useState<readonly Signer[]>(initialSigners);
  const [signing, setSigning] = useState(false);
  const field = (key: keyof NewBatch, label: string) => (
    <label key={key}>{label}<input value={String(d[key] ?? "")} onChange={(e) => setD({ ...d, [key]: e.target.value })} /></label>
  );
  return (
    <form className="camera-body camera-settings" onSubmit={(e) => { e.preventDefault(); if (d.name.trim()) onSave({ ...d, name: d.name.trim() }); }}>
      <h3>{t("camera.settings")}</h3>
      {field("name", t("camera.field.name"))}
      {field("company", t("camera.field.company"))}
      {field("project", t("camera.field.project"))}
      {field("trade", t("camera.field.trade"))}
      {field("item", t("camera.field.item"))}
      {field("inspector", t("camera.field.inspector"))}
      <label>{t("camera.field.signer")}
        <select value={d.signerId ?? ""} onChange={(e) => setD({ ...d, signerId: e.target.value || undefined })}>
          <option value="">{t("camera.field.noSigner")}</option>
          {signers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => setSigning(true)}>{t("camera.signNew")}</button>
      {signing ? <SignaturePad initialName={d.inspector} onCancel={() => setSigning(false)}
        onSaved={(s) => { setSigning(false); setSigners([...signers.filter((x) => x.id !== s.id), s]); setD({ ...d, signerId: s.id, inspector: d.inspector || s.name }); }} /> : null}
      {field("cardDate", t("camera.field.cardDate"))}
      <div className="camera-actions">
        <button type="submit" className="camera-primary">{t("camera.save")}</button>
        <button type="button" onClick={onCancel}>{t("camera.cancel")}</button>
        {onDelete ? <button type="button" className="camera-danger" onClick={onDelete}>{t("camera.deleteBatch")}</button> : null}
      </div>
    </form>
  );
}
