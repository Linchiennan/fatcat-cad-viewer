// The CAD drawing with its overlays (T15): group B's engine underneath, then the measuring overlay,
// our markup layer and the search box, all following pan and zoom.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useReducer, useRef, useState } from "react";
import type { CadEngine, DrawingCanvasEvents, DrawingCanvasHandle, MeasurePreview } from "../types/engine";
import type { DrawingBounds, DrawingPoint } from "../types/drawing";
import type { MeasurableEntity, MeasurementSettings, SnapKind } from "../viewer/measurementGeometry";
import { MarkupLayer, type TextSpot } from "../components/MarkupLayer";
import { loadMarks, saveMarks, TEXT_PX, type Mark, type MarkTool } from "../viewer/markup";
import { hitView } from "../viewer/textSearch";
import { formatLabel, sheetUnits, type SheetUnits } from "../measure/measureUnits";
import { resolveMeasurePick, toleranceFor } from "../measure/resolvePick";
import { publishPickStatus, statusForPick } from "../measure/pickStatus";
import { fixedNumber, loadDecimals } from "../viewer/measureFormat";
import { useLabelUnit } from "../viewer/measureLabelStyle";
import { createCadEngine } from "../viewer/cadEngine";
import { MeasureOverlay } from "./MeasureOverlay";
import { labelSize, overlayModel, searchBox } from "./overlayModel";
import { applyMarkEdit } from "./marks";
import { exportDrawing } from "../export/exportDrawing";
import { ExportError, type ExportCapable, type ExportEngine, type ExportRequest, type ExportResult } from "../export/types";
import "./canvas.css";
import { SelectionOverlay, emptySelection, type Selection } from './SelectionOverlay';
import { removeSelected } from './selection';

type CanvasCommon = DrawingCanvasEvents & {
  /** Drawable file (DXF, converted DWG or the xref-assembled file). A new File object = load again. */
  file: File;
  /** Measuring / info state; `enabled` false when neither is on. */
  measurement: MeasurementSettings;
  selectionTool?: 'single' | 'box' | null;
  onSelectionCount?(count: number): void;
  onDeleteMeasurements?(indices: number[]): void;
  /** Long-press aiming preview (optional). */
  onPreview?(preview: MeasurePreview): void;
};

/** Everything spelled out by the App. */
type ExplicitCanvasProps = {
  /** Group B's engine factory (viewer/cadEngine createCadEngine): one engine for this canvas element. */
  createEngine(host: HTMLDivElement): CadEngine;
  /** Object picked in object / info mode; its outline is drawn. */
  pickedEntity?: MeasurableEntity | null;
  units: SheetUnits;
  decimals: number;
  /** Markup mode on: the layer handles drawing or moving user markups. */
  marking: boolean;
  markTool: MarkTool;
  markColor: string;
  /** Where the text being typed will go (paw), or null. */
  textAnchor?: TextSpot | null;
  /** The markup layer asks for text at a spot (the App opens the text dialog, then calls addTextMark). */
  onTextRequest(at: DrawingPoint, width?: number): void;
  /** A text markup was tapped: the App opens the edit dialog, then calls editTextMark. */
  onEditTextRequest(index: number): void;
};

/** Short form: engine, units, decimals and the picked outline are taken care of by the canvas. */
type CompactCanvasProps = {
  createEngine?(host: HTMLDivElement): CadEngine;
  /** Markup tool and colour while marking, else null; `textAnchor` is the spot being typed into. */
  markup: { tool: MarkTool; color: string; editingIndex?: number; textAnchor: TextSpot | null; textPx?: number } | null;
  onMarkText(at: DrawingPoint, width?: number): void;
  onEditMarkText(index: number, current: string, color: string, textPx: number, multiline: boolean): void;
};

export type DrawingCanvasProps = CanvasCommon & (ExplicitCanvasProps | CompactCanvasProps);

/** Engines may report failures after the drawing is shown (group B's FatcatCadEngine.onError). */
type ErrorChannel = { onError?(handler: (error: unknown) => void): () => void };

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(function DrawingCanvas(props, ref) {
  const host = useRef<HTMLDivElement | null>(null);
  const engine = useRef<CadEngine | null>(null);
  const events = useRef(props);
  events.current = props;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  readyRef.current = ready;
  const [marks, setMarks] = useState<Mark[]>([]);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const changeSelection = useCallback((next: Selection) => {
    selectionRef.current = next; setSelection(next);
    events.current.onSelectionCount?.(next.marks.length + next.measures.length);
  }, []);
  useEffect(() => { changeSelection(emptySelection()); }, [props.selectionTool, props.file, marks, props.measurement.kept, changeSelection]);
  const [preview, setPreview] = useState<MeasurePreview>(null);
  /** Last object pick, for the outline when the App does not pass pickedEntity. */
  const [picked, setPicked] = useState<MeasurableEntity | null>(null);
  const [searchHit, setSearchHit] = useState<{ bounds: DrawingBounds; serial: number } | null>(null);
  const viewKey = useRef("");
  const switching = useRef(false);

  /** A sheet is on screen: hand its index, report and spaces to the App and load its markups. */
  const sheetReady = useCallback((e: CadEngine) => {
    viewKey.current = e.viewKey();
    const loaded = loadMarks(viewKey.current);
    setMarks(loaded);
    events.current.onMarkCount(loaded.length);
    const report = e.report();
    if (report) events.current.onReport(report);
    const index = e.measurementIndex();
    if (index) events.current.onMeasurementIndex(index);
    events.current.onSpaces(e.spaces(), e.currentSpace(), false);
    setSearchHit(null);
    setPreview(null);
    setPicked(null);
    publishPickStatus("plane");
    redraw();
  }, []);

  // One engine per file; a new file starts over with empty overlays (T15 4-6).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ctrl = new AbortController();
    let e: CadEngine;
    try { e = (props.createEngine ?? createCadEngine)(el); } catch (err) { events.current.onError(err); return; }
    engine.current = e;
    setReady(false); setMarks([]); setSearchHit(null);
    const off = [
      e.onViewChanged(() => redraw()),
      e.onPick((pick) => {
        const s = events.current.measurement;
        publishPickStatus(statusForPick(s, pick));
        if (s.info || s.mode === "object") setPicked(pick.entity);
        events.current.onPick(pick);
      }),
      e.onPreview((p) => { setPreview(p); events.current.onPreview?.(p); }),
      (e as ErrorChannel).onError?.((err) => { if (!ctrl.signal.aborted) events.current.onError(err); }) ?? (() => {}),
    ];
    e.setMeasurement(events.current.measurement);
    e.load(props.file, (stage, done, total) => events.current.onProgress(stage, done, total), undefined, ctrl.signal)
      .then(() => {
        if (ctrl.signal.aborted) return;
        setReady(true);
        sheetReady(e);
        events.current.onReady();
      })
      .catch((err) => { if (!ctrl.signal.aborted && !isAbort(err)) events.current.onError(err); });
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => redraw()) : null;
    resize?.observe(el);
    return () => {
      ctrl.abort();
      resize?.disconnect();
      for (const f of off) f();
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.file, props.createEngine, sheetReady]);

  const m = props.measurement;
  useEffect(() => { engine.current?.setMeasurement(m); }, [m]);
  useEffect(() => { if (!m.enabled) setPreview(null); }, [m.enabled]);
  useEffect(() => { setPicked(null); }, [m.enabled, m.mode, m.info]);

  const updateMarks = useCallback((next: Mark[]) => {
    setMarks(next);
    saveMarks(viewKey.current, next); // storage refused: still drawn, just not kept (T15 5-2)
    events.current.onMarkCount(next.length);
  }, []);

  /** Output with the sheet's markups (005); needs the engine's region drawing (group B). */
  const runExport = useCallback(async (request: ExportRequest): Promise<ExportResult> => {
    const e = engine.current as (CadEngine & Partial<ExportEngine>) | null;
    if (!e || !readyRef.current || typeof e.renderRegion !== "function" || !e.sheetBounds || !e.viewBounds || !e.screenToDrawing) {
      throw new ExportError("EXPORT_NOT_READY");
    }
    return exportDrawing(e as CadEngine & ExportEngine, request, marksRef.current);
  }, []);

  useImperativeHandle(ref, (): DrawingCanvasHandle & ExportCapable => ({
    command: (c) => engine.current?.command(c),
    addTextMark(at, text, width, textPx = TEXT_PX) {
      const ppu = engine.current?.pixelsPerUnit() ?? 0;
      // One-line text is centred on the tapped spot (where the paw was): its top-left moves half a character up-left.
      if (!width && engine.current && ppu > 0) {
        const [s] = engine.current.project([at]);
        const moved = engine.current.unproject(s.x - textPx / 2, s.y - textPx / 2);
        if (Number.isFinite(moved.x) && Number.isFinite(moved.y)) at = moved;
      }
      const p = events.current, color = "markup" in p ? p.markup?.color ?? "#ff3b30" : p.markColor;
      const next = applyMarkEdit(marksRef.current, { add: { at, text, width, color, size: ppu > 0 ? textPx / ppu : 0 } });
      if (next !== marksRef.current) updateMarks(next);
    },
    editTextMark(index, text, color, textPx) {
      const ppu = engine.current?.pixelsPerUnit() ?? 0;
      const next = applyMarkEdit(marksRef.current, { edit: { index, text, color, size: textPx && ppu > 0 ? textPx / ppu : undefined } });
      if (next !== marksRef.current) updateMarks(next);
    },
    undoMark() { if (marksRef.current.length) updateMarks(marksRef.current.slice(0, -1)); },
    clearMarks() { if (marksRef.current.length) updateMarks([]); },
    deleteSelection() {
      if (!events.current.selectionTool) return;
      const s = selectionRef.current;
      if (s.marks.length) updateMarks(removeSelected(marksRef.current, s.marks));
      if (s.measures.length) events.current.onDeleteMeasurements?.(s.measures);
      changeSelection(emptySelection());
    },
    async shareImage(caption) {
      // 標註「存成圖片／分享」goes through the output engine (005 定案 8): view, PNG, markups only (待決 B-13).
      const r = await runExport({ range: "view", format: "png", title: caption, sheet: "" });
      return r.blob;
    },
    exportDrawing: (request: ExportRequest) => runExport(request),
    showSearchHit(bounds, textHeight, at) {
      const e = engine.current;
      if (!e) return;
      e.zoomTo(hitView(bounds, textHeight, at), bounds);
      setSearchHit((h) => ({ bounds, serial: (h?.serial ?? 0) + 1 }));
    },
    clearSearchHit: () => setSearchHit(null),
    switchSpace(name) {
      const e = engine.current;
      if (!e || switching.current || name === e.currentSpace()) return;
      switching.current = true;
      setSearchHit(null);
      events.current.onSpaces(e.spaces(), e.currentSpace(), true);
      e.load(events.current.file, () => {}, name)
        .then(() => { if (engine.current === e) sheetReady(e); })
        .catch((err) => { if (engine.current === e && !isAbort(err)) events.current.onError(err); })
        .finally(() => {
          switching.current = false;
          if (engine.current === e) events.current.onSpaces(e.spaces(), e.currentSpace(), false);
        });
    },
    showLayer(name, visible) {
      const e = engine.current;
      if (!e) return;
      e.showLayer(name, visible).then((rebuilt) => {
        if (engine.current !== e) return;
        if (rebuilt) sheetReady(e); else redraw();
      }).catch((err) => { if (engine.current === e && !isAbort(err)) events.current.onError(err); });
    },
    captureDiagnostics: () => engine.current?.captureDiagnostics() ?? null,
  }), [sheetReady, updateMarks, runExport, changeSelection]);

  const labelUnit = useLabelUnit();
  const e = ready ? engine.current : null;
  const project = useCallback((pts: readonly DrawingPoint[]) => (engine.current ? engine.current.project(pts) : pts.map(() => ({ x: NaN, y: NaN }))), []);
  const unproject = useCallback((x: number, y: number) => engine.current?.unproject(x, y) ?? { x: NaN, y: NaN }, []);
  const ppu = e?.pixelsPerUnit() ?? 0;
  const index = e?.measurementIndex() ?? null;

  let model = null;
  let aim: DrawingPoint | null = null, snapAt: (DrawingPoint & { kind: SnapKind; perpendicularFrom?: DrawingPoint }) | null = null;
  if (e && (m.enabled || m.kept.length)) {
    // Without units / decimals from the App they are read here, so a panel change shows at once.
    const units = "units" in props ? props.units : sheetUnits(viewKey.current, index?.unit ?? "drawing");
    const decimals = "decimals" in props ? props.decimals : loadDecimals();
    const entity = "pickedEntity" in props && props.pickedEntity !== undefined ? props.pickedEntity : picked;
    model = overlayModel({ settings: m, entity, project, labelPx: labelSize(e.measureLabelHeight(), ppu), label: (value, area) => formatLabel(value, units, decimals, labelUnit, area), angle: value => `${fixedNumber(value, decimals)}°` });
    // Long-press aim: crosshair at the aim, snap marker on the snap itself (T15 2.2-7).
    if (m.enabled && preview) {
      [aim] = project([preview.point]);
      if (preview.snap) {
        const hidden = new Set((e.report()?.layers ?? []).filter((l) => !l.visible).map((l) => l.name));
        const r = resolveMeasurePick(index, m, preview.point, toleranceFor(ppu), hidden);
        const [p] = project([r?.snap?.kind === preview.snap ? r.snap : preview.point]);
        const anchor = m.points.at(-1);
        snapAt = { x: p.x, y: p.y, kind: preview.snap, ...(preview.snap === 'perpendicular' && anchor ? { perpendicularFrom: project([anchor])[0] } : {}) };
      }
    }
  }
  const box = e && searchHit ? searchBox(searchHit.bounds, project) : null;
  const markup = "markup" in props ? props.markup : props.marking ? { tool: props.markTool, color: props.markColor, textAnchor: props.textAnchor ?? null } : null;
  const textAnchor = "markup" in props ? props.markup?.textAnchor ?? null : props.textAnchor ?? null;
  const askText = (at: DrawingPoint, width?: number) => { const p = events.current; if ("onMarkText" in p) p.onMarkText(at, width); else p.onTextRequest(at, width); };
  const askEdit = (i: number) => {
    if (!markup || editingIndex !== undefined) return;
    const p = events.current, mk = marksRef.current[i];
    if ("onEditMarkText" in p) { if (mk?.kind === "text") p.onEditMarkText(i, mk.text, mk.color, Math.round((mk.size * (engine.current?.pixelsPerUnit() ?? 0)) || TEXT_PX), !!(mk.width && mk.width > 0) || mk.text.includes(String.fromCharCode(10))); } else p.onEditTextRequest(i);
  };

  // Preview only: cancellation drops the draft without writing persisted marks.
  const editingIndex = "markup" in props ? props.markup?.editingIndex : undefined;
  const editPx = "markup" in props ? props.markup?.textPx : undefined;
  // While a text is being edited it shows the colour and size being chosen.
  const visibleMarks = editingIndex === undefined ? marks : marks.map((mark, i) => i === editingIndex && mark.kind === "text" ? { ...mark, color: markup!.color, ...(editPx && ppu > 0 ? { size: editPx / ppu } : {}) } : mark);
  return (
    <div className={`drawing-canvas${m.enabled ? " measuring" : ""}`}>
      <div ref={host} className="drawing-engine" />
      {model ? <MeasureOverlay model={model} aim={aim} snapAt={snapAt} /> : null}
      {e && (markup || marks.length) ? (
        <MarkupLayer active={!!markup && markup.tool !== "none" && editingIndex === undefined} marks={visibleMarks} tool={markup?.tool ?? "move"} color={markup?.color ?? "#ff3b30"} project={project} unproject={unproject} ppu={ppu}
          onMove={(index, mark) => updateMarks(marksRef.current.map((m, i) => i === index ? mark : m))}
          onAdd={(mark) => updateMarks([...marksRef.current, mark])} onText={askText} onEditText={askEdit}
          onPan={(dx, dy) => { if (ppu > 0) engine.current?.panBy(dx, dy); }} onZoom={(x, y, factor) => { if (ppu > 0) engine.current?.zoomAt(x, y, factor); }} textAnchor={textAnchor} textPx={editPx} />
      ) : null}
      {e && props.selectionTool ? <SelectionOverlay tool={props.selectionTool} marks={marks} model={model} project={project} ppu={ppu} selected={selection} onChange={changeSelection} /> : null}
      {box ? <div key={searchHit?.serial} className="search-hit-box" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} /> : null}
    </div>
  );
});
