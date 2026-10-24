// The App shell (T10): four screens (home / loading / viewing / error), opening and closing drawings,
// Back / Esc order, exclusive working modes, top file bar and check strip, bottom tools. Owner: P4 group D.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { phonePreview, PREVIEW_CHANGE } from './devicePreview';
import { MODEL_SPACE, type CadSpace, type EngineReport, type LoadStage } from "../types/drawing";
import { AppError, type AppErrorCode } from "../types/errors";
import type { DrawingCanvasHandle, MeasurePick, ViewerHandle } from "../types/engine";
import type { ExportCapable } from "../export/types";
import { useI18n, type TranslationKey } from "../i18n/translations";
import { nativeErrorText } from "../i18n/nativeErrors";
import { isArchiveFormat, prepareDrawingFile, type DrawingFormat } from "../files/fileTypes";
import { convertDwgToDxf } from "../dwg/convertDwg";
import { importDrawingToLibrary, migrateLegacyLibrary } from "../library/drawingLibrary";
import { LibraryScreen } from "../library/LibraryScreen";
import { handleLibraryBack } from "../library/libraryView";
import { incomingDrawingPlugin, readIncomingDrawingFile, type IncomingDrawing } from "../native/incomingDrawing";
import { beginParse, completeParse, diagnosticPhase, failParse, recordDiagnostic, type ParseAudit } from "../viewer/parseAudit";
import { autoAssembleXrefs } from "../viewer/xrefAutoFind";
import { loadDecimals, saveDecimals } from "../viewer/measureFormat";
import { loadMarks, shareFileName, type MarkTool } from "../viewer/markup";
import type { CadEngine } from "../types/engine";
import { openFile, shareFile } from "../native/fileHandoff";
import { setExportFileActions } from "../library/exportFileActions";
import { ExportBoxLayer, ExportNote, ExportSheet, type ExportNoteState } from "../components/ExportSheet";
import { exportRequest, ExportNotReadyError, loadExportChoice, loadExportDrawing, loadSaveExport, saveExportChoice, type ExportChoice, type ExportResult, type ScreenBox } from "./exportFlow";
import type { MeasurementIndex, MeasurementSettings, MeasurementUnit } from "../viewer/measurementGeometry";
import { savePosition } from "../viewer/readingPosition";
import type { TextHit } from "../viewer/textSearch";
import { splitCadWarnings } from "../viewer/cadWarnings";
import { canKeep, hasAnything, initialMeasureState, measureReducer, toastKey, type MeasureAction, type MeasureState } from "../measure/measureState";
import { loadMeasurements, saveMeasurements } from "../measure/measurementStore";
import { formatResult, sheetUnits, type SheetUnits } from "../measure/measureUnits";
import { CadPanel, hasXrefSession, reuseXrefSession, setXrefSession } from "../components/CadPanel";
import { CloseDrawingDialog } from "../components/CloseDrawingDialog";
import { ConfirmDialog, type ConfirmRequest } from "../components/ConfirmDialog";
import { ErrorScreen } from "../components/ErrorScreen";
import { InfoPanel, infoPlacement } from "../components/InfoPanel";
import { LoadingScreen } from "../components/LoadingScreen";
import { MarkupBar, MarkupTextDialog } from "../components/MarkupBar";
import { MeasureStrip } from "../components/MeasureStrip";
import { SearchPanel, SearchStepper } from "../components/SearchPanel";
import { SnapToast } from "../components/SnapToast";
import { GloveBar, ViewerDock, type MeasureTools } from "../components/ViewerToolbar";
import { CloseIcon } from "../components/Icons";
import { backStack, decideBack, registerBackHandler, type ShellBackState, type ShellScreen } from "./backDispatch";
import { HomeScreen } from "./HomeScreen";
import { CheckStrip, FileBar, type StripTab } from "./ViewerChrome";
import { isAbort, progressFraction, readFailureCode, toAppError, viewerFailureCode } from "./shellText";
import { loadCadViewer, loadMeasurePanel, loadPdfViewer, MissingModuleError, type CadViewerParts, type MeasurePanelComponent, type PdfViewerComponent } from "./viewerModules";

// Privacy / license and source code pages: downloaded only when opened.
const LegalPage = lazy(() => import("./LegalPages").then((m) => ({ default: m.LegalPage })));

const MARK_RED = "#ff3b30";
const INCOMING_MEMORY = 100;
// CadPanel's own tab names (our component keeps them as tab ids).
const STRIP_TABS: Record<StripTab, string> = { layers: "圖層", missing: "缺件警告", xrefs: "外部參考" };
const DEFAULT_UNITS: SheetUnits = { source: "cm", display: "cm", assumed: false };

/** Phone layout: a coarse (touch) pointer or ?glove=1; follows pointer changes live (T10 2.7). */
export function useGloveMode(): boolean {
  const read = () => {
    if (typeof window === "undefined") return false;
    if (phonePreview() || new URLSearchParams(window.location.search).get("glove") === "1") return true;
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
  };
  const [glove, setGlove] = useState(read);
  useEffect(() => {
    const query = window.matchMedia?.("(pointer: coarse)");
    const update = () => setGlove(read());
    query?.addEventListener("change", update);
    window.addEventListener(PREVIEW_CHANGE, update);
    return () => {
      query?.removeEventListener("change", update);
      window.removeEventListener(PREVIEW_CHANGE, update);
    };
  }, []);
  return glove;
}

/**
 * Load a lazily split part. A module missing from the build reports through `onMissing` (normal error
 * screen); a failed download is thrown during render so the ErrorBoundary takes over (T20 2.5).
 */
function useLazyPart<T>(loader: () => Promise<T>, enabled: boolean, onMissing?: (error: unknown) => void): T | null {
  const [state, setState] = useState<{ value?: T; error?: unknown }>({});
  const missing = useRef(onMissing);
  missing.current = onMissing;
  useEffect(() => {
    if (!enabled || state.value || state.error) return;
    let live = true;
    loader().then(
      (value) => { if (live) setState({ value }); },
      (error) => {
        if (!live) return;
        if (error instanceof MissingModuleError) missing.current?.(error);
        else setState({ error });
      },
    );
    return () => { live = false; };
  }, [enabled, loader, state.value, state.error]);
  if (state.error) throw state.error;
  return state.value ?? null;
}

type LastDrawing = { file: File; entryId?: string; format: DrawingFormat };
type SearchState = { query: string; hits: TextHit[]; index: number };
type TextDialog = { kind: "new"; at: { x: number; y: number }; width?: number } | { kind: "edit"; index: number; initial: string };
type ShareNote = { text: string; error: boolean };

export function App() {
  const { t, locale } = useI18n();
  const glove = useGloveMode();
  const nativeApp = Capacitor.isNativePlatform();

  // Screens and the drawing being opened
  const [screen, setScreen] = useState<ShellScreen>("home");
  const [stage, setStage] = useState<LoadStage>("reading");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [last, setLast] = useState<LastDrawing | null>(null);
  const [drawable, setDrawable] = useState<File | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [audit, setAudit] = useState<ParseAudit | null>(null);

  // Overlays: confirms, the full file name card, problem report, and the library with an archive to show
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [nameCard, setNameCard] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [legal, setLegal] = useState<"privacy" | "source" | null>(null);
  const closeLegal = useCallback(() => setLegal(null), []);
  const [incomingArchive, setIncomingArchive] = useState<File | null>(null);

  // Engine output
  const [report, setReport] = useState<EngineReport | null>(null);
  const [spaces, setSpaces] = useState<CadSpace[]>([]);
  const [space, setSpace] = useState<string>(MODEL_SPACE);
  const [switching, setSwitching] = useState(false);
  const [index, setIndex] = useState<MeasurementIndex | null>(null);
  const [cadTab, setCadTab] = useState<StripTab | null>(null);

  // Working modes: measuring / info state lives in group C's reducer
  const [measure, setMeasure] = useState<MeasureState>(initialMeasureState);
  const measureRef = useRef(measure);
  const measurementKey = useRef("");
  const [measureSaveFailed, setMeasureSaveFailed] = useState(false);
  const applyMeasure = useCallback((next: MeasureState, persist = true) => {
    if (persist && measurementKey.current && next.settings.kept !== measureRef.current.settings.kept) {
      setMeasureSaveFailed(!saveMeasurements(measurementKey.current, next.settings.kept));
    }
    measureRef.current = next;
    setMeasure(next);
  }, []);
  const dispatch = useCallback((action: MeasureAction) => applyMeasure(measureReducer(measureRef.current, action), action.type !== 'reset'), [applyMeasure]);
  const setSettings = useCallback((next: MeasurementSettings) => applyMeasure({ ...measureRef.current, settings: next }), [applyMeasure]);
  const [measureDetail, setMeasureDetail] = useState(false);
  const [cardPlace, setCardPlace] = useState<{ onTop: boolean; maxHeight: number } | null>(null);
  const [units, setUnits] = useState<SheetUnits>(DEFAULT_UNITS);
  const [decimals, setDecimals] = useState(loadDecimals);
  const [marking, setMarking] = useState(false);
  const [markTool, setMarkTool] = useState<MarkTool>("pen");
  const [markColor, setMarkColor] = useState(MARK_RED);
  const [markCount, setMarkCount] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<ShareNote | null>(null);
  const [textDialog, setTextDialog] = useState<TextDialog | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState<SearchState | null>(null);
  // Export (spec 005): dialog → (area selection) → working → saved note with 分享／打開
  const [exportStage, setExportStage] = useState<"sheet" | "box" | null>(null);
  const [exportChoice, setExportChoice] = useState<ExportChoice>(loadExportChoice);
  const [exportNote, setExportNote] = useState<ExportNoteState | null>(null);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const engineRef = useRef<CadEngine | null>(null);

  const settings = measure.settings;
  const measuring = settings.enabled && !settings.info;
  const inspecting = settings.info;

  const canvasRef = useRef<DrawingCanvasHandle | null>(null);
  const pdfRef = useRef<ViewerHandle | null>(null);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const pendingImport = useRef(false);
  const xrefsTried = useRef(new WeakSet<File>());
  const lastRef = useRef<LastDrawing | null>(null);
  lastRef.current = last;
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const isPdf = last?.format === "pdf";

  // ---- resetting --------------------------------------------------------------------------------------
  const resetDrawingState = useCallback(() => {
    measurementKey.current = ""; setMeasureSaveFailed(false);
    setSaveFailed(false); setReport(null); setSpaces([]); setSpace(MODEL_SPACE); setSwitching(false); setIndex(null);
    setCadTab(null); dispatch({ type: "reset" }); setMeasureDetail(false); setCardPlace(null); setUnits(DEFAULT_UNITS);
    setMarking(false); setTextDialog(null); setShareNote(null); setMarkCount(0); setSearchOpen(false); setSearch(null);
    setNameCard(false); setIncomingArchive(null); setConfirm(null); setAudit(null);
    setExportStage(null); setExportNote(null); setLastExport(null);
  }, [dispatch]);

  const cancelWork = useCallback(() => {
    request.current += 1;
    abort.current?.abort();
    abort.current = null;
  }, []);

  /** Close the drawing for good (after the confirm, T10 4.4-2). */
  const goHome = useCallback(() => {
    const was = lastRef.current;
    cancelWork();
    setLibraryOpen(false); setCloseConfirm(false);
    resetDrawingState();
    pendingImport.current = false;
    setLast(null); setDrawable(null); setError(null); setScreen("home");
    if (was) recordDiagnostic("drawing.close", { name: was.file.name.replace(/^.*[\\/]/, "") });
  }, [cancelWork, resetDrawingState]);

  const fail = useCallback((serial: number, err: unknown, fallback: AppErrorCode, stageName: string, file?: File) => {
    if (serial !== request.current || isAbort(err)) return;
    failParse(file, err, stageName);
    setDrawable(null);
    setError(toAppError(err, fallback));
    setScreen("error");
  }, []);

  // ---- opening (T10 3.2) -----------------------------------------------------------------------------
  const openDrawing = useCallback(async (file: File, entryId?: string) => {
    const previous = lastRef.current;
    cancelWork();
    const serial = request.current;
    const controller = new AbortController();
    abort.current = controller;
    resetDrawingState();
    setError(null);
    const id = entryId || undefined;
    recordDiagnostic("open.request", {
      name: file.name.replace(/^.*[\\/]/, ""), bytes: file.size, key: id ?? null,
      source: id ? "library-reopen-or-replace" : "import", stage: "validate",
    });

    let format: DrawingFormat;
    try {
      format = prepareDrawingFile(file).format;
    } catch (err) {
      fail(serial, err, "UNSUPPORTED_FORMAT", "validate", file);
      return;
    }
    if (isArchiveFormat(format)) {
      setDrawable(null); setLast(null); setScreen("home");
      setIncomingArchive(file); setLibraryOpen(true);
      return;
    }

    setLast({ file, entryId: id, format });
    pendingImport.current = !id;
    setLibraryOpen(false);
    setDrawable(null);
    setStage(format === "dwg" ? "converting" : "reading");
    setProgress(null);
    setScreen("loading");
    diagnosticPhase(format === "dwg" ? "converting" : "reading");
    void beginParse(file, id).then((a) => { if (serial === request.current) setAudit(a); }).catch(() => {});

    try {
      let ready: File | null = null;
      if (id && previous?.entryId === id && hasXrefSession(previous.file)) {
        ready = await reuseXrefSession(previous.file, file).catch(() => null);
      }
      if (!ready) ready = format === "dwg" ? await convertDwgToDxf(file, controller.signal) : file;
      if (serial !== request.current) return;
      setStage("loading");
      diagnosticPhase("loading");
      setDrawable(ready);
    } catch (err) {
      fail(serial, err, readFailureCode(format), "convert", file);
    }
  }, [cancelWork, fail, resetDrawingState]);

  const retry = useCallback(() => {
    const was = lastRef.current;
    if (was) void openDrawing(was.file, was.entryId);
  }, [openDrawing]);

  // ---- viewer events ---------------------------------------------------------------------------------
  const onProgress = useCallback((next: LoadStage, done: number, total: number) => {
    if (screenRef.current !== "loading") return;
    setStage(next);
    setProgress(progressFraction(done, total));
    diagnosticPhase(next);
  }, []);

  const onReady = useCallback(() => {
    const serial = request.current;
    const was = lastRef.current;
    if (!was) return;
    void completeParse(was.file).then((a) => { if (a && serial === request.current) setAudit(a); }).catch(() => {});
    if (pendingImport.current) {
      pendingImport.current = false;
      importDrawingToLibrary(was.file).then((entry) => {
        if (serial !== request.current) return;
        setLast((cur) => (cur && cur.file === was.file ? { ...cur, entryId: entry.id } : cur));
        recordDiagnostic("library.saved", { key: entry.id });
      }).catch(() => { if (serial === request.current) setSaveFailed(true); });
    }
    setScreen("viewing");
  }, []);

  const onViewerError = useCallback((err: unknown) => {
    const was = lastRef.current;
    fail(request.current, err, viewerFailureCode(was?.format ?? null), "render", was?.file);
  }, [fail]);

  const onMissingViewer = useCallback((err: unknown) => {
    const was = lastRef.current;
    fail(request.current, new AppError("RENDER_FAILED", String(err), { cause: err }), "RENDER_FAILED", "render", was?.file);
  }, [fail]);

  // A sheet became ready: clear points, results and search; units for this sheet (T10 3.5, 4.2-7).
  const onMeasurementIndex = useCallback((next: MeasurementIndex) => {
    setIndex(next);
    measurementKey.current = next.viewKey ?? "";
    const state = measureReducer(measureRef.current, { type: "sheet-ready" });
    applyMeasure({ ...state, settings: { ...state.settings, kept: loadMeasurements(measurementKey.current) } }, false);
    setSearch(null); setSearchOpen(false);
    canvasRef.current?.clearSearchHit();
    setUnits(sheetUnits(next.viewKey ?? "", next.unit));
  }, [applyMeasure]);

  const onSpaces = useCallback((list: CadSpace[], current: string, busy: boolean) => {
    setSpaces(list); setSpace(current); setSwitching(busy);
  }, []);

  // Xref auto-find, once per original file (T10 3.3).
  useEffect(() => {
    const was = last;
    if (screen !== "viewing" || !report || !was || was.format === "pdf") return;
    if (xrefsTried.current.has(was.file) || hasXrefSession(was.file)) return;
    xrefsTried.current.add(was.file);
    const paths = [
      ...report.xrefs.filter((x) => !x.loaded && !x.disabled).map((x) => x.path),
      ...(report.images ?? []).map((i) => i.path),
    ].filter(Boolean);
    if (!paths.length) return;
    const serial = request.current;
    autoAssembleXrefs(was.file, paths, was.entryId).then((found) => {
      if (!found || serial !== request.current) return;
      setXrefSession(was.file, found.files, found.statuses);
      setDrawable(found.file);
    }).catch(() => { /* silent (T10 3.3) */ });
  }, [screen, report, last]);

  // ---- modes (T10 4.2) --------------------------------------------------------------------------------
  const endMarkup = useCallback(() => { setMarking(false); setTextDialog(null); setShareNote(null); }, []);
  const endMeasure = useCallback(() => { dispatch({ type: "close" }); setMeasureDetail(false); setCardPlace(null); }, [dispatch]);
  const clearSearch = useCallback(() => { setSearch(null); canvasRef.current?.clearSearchHit(); }, []);

  const toggleMeasure = useCallback(() => {
    setCadTab(null); setSearchOpen(false); endMarkup();
    if (measuring) setMeasureDetail(false);
    setCardPlace(null);
    dispatch({ type: "toggle-measure" });
  }, [measuring, endMarkup, dispatch]);

  const toggleInspect = useCallback(() => {
    if (isPdf) return;
    setCadTab(null); setSearchOpen(false); endMarkup(); setMeasureDetail(false); setCardPlace(null);
    dispatch({ type: "toggle-info" });
  }, [isPdf, endMarkup, dispatch]);

  const toggleMarkup = useCallback(() => {
    if (isPdf) return;
    setCadTab(null); setSearchOpen(false); endMeasure(); setShareNote(null); setTextDialog(null);
    if (marking) { setMarking(false); return; }
    setMarkTool("pen"); setMarkColor(MARK_RED); setMarking(true);
  }, [isPdf, marking, endMeasure]);

  const toggleSearch = useCallback(() => {
    if (isPdf) return;
    setCadTab(null); endMarkup(); endMeasure();
    if (searchOpen || search) { setSearchOpen(false); clearSearch(); return; }
    setSearchOpen(true);
  }, [isPdf, endMarkup, endMeasure, searchOpen, search, clearSearch]);

  const viewCommand = useCallback((command: Parameters<ViewerHandle["command"]>[0]) => {
    (isPdf ? pdfRef.current : canvasRef.current)?.command(command);
  }, [isPdf]);

  const onPick = useCallback((pick: MeasurePick) => {
    if (inspecting) setCardPlace(infoPlacement(pick.screenY, pick.canvasHeight));
    dispatch({ type: "pick", pick });
  }, [inspecting, dispatch]);

  const format = useCallback((value: number, area?: boolean) => formatResult(units, decimals)(value, area), [units, decimals]);

  const askClearAll = useCallback(() => {
    setConfirm({ message: t("measure.clearAllConfirm"), okLabel: t("measure.clearAllOk"), onOk: () => dispatch({ type: "clear-all" }) });
  }, [t, dispatch]);

  // ---- export (spec 005) ---------------------------------------------------------------------------------------
  const sheetName = space === MODEL_SPACE ? t("viewer.spaceModel") : space;
  const errorReason = useCallback((err: unknown) => {
    if (err instanceof ExportNotReadyError) return t("export.notReady");
    const code = (err as { code?: unknown } | null)?.code;
    if (typeof code === "string" && /^EXPORT_/.test(code)) return t(`export.err.${code}` as TranslationKey) || code;
    if (typeof code === "string" && /^HANDOFF_/.test(code)) return t(`handoff.err.${code}` as TranslationKey) || code;
    return nativeErrorText(locale, err) ?? (err instanceof Error ? err.message : String(err));
  }, [t, locale]);

  /** Make the file with group C's exportDrawing, keep it in 輸出成果 (group A), then show the note. */
  const runExport = useCallback(async (choice: ExportChoice, box?: ScreenBox): Promise<ExportResult | null> => {
    const was = lastRef.current;
    if (!was) return null;
    setExportStage(null);
    setExportNote({ kind: "working" });
    try {
      const request = exportRequest(choice, was.file.name, sheetName, box);
      // The canvas handle exports with its own engine and markups (group C); else group C's function on the engine.
      const handle = canvasRef.current as (DrawingCanvasHandle & Partial<ExportCapable>) | null;
      let result: ExportResult;
      if (handle?.exportDrawing) result = await handle.exportDrawing(request);
      else {
        const exportDrawing = await loadExportDrawing();
        const engine = engineRef.current;
        if (!engine) throw new ExportNotReadyError("engine");
        result = await exportDrawing(engine, request, loadMarks(index?.viewKey ?? ""));
      }
      // The library may rename a clash ("… (2).png"): show the name it kept.
      let saved = true, name = result.fileName;
      try {
        const entry = await (await loadSaveExport())(result) as { name?: unknown } | null;
        if (entry && typeof entry.name === "string") name = entry.name;
      } catch { saved = false; }
      setLastExport({ ...result, fileName: name });
      setExportNote({ kind: "done", name, saved, downscaled: result.downscaled ? { w: result.widthPx, h: result.heightPx, dpi: result.dpi } : undefined });
      return result;
    } catch (err) {
      setExportNote({ kind: "error", key: "export.failed", reason: errorReason(err) });
      return null;
    }
  }, [sheetName, index, errorReason]);

  const handOff = useCallback(async (how: "share" | "open", result: ExportResult | null = lastExport) => {
    if (!result) return;
    try { await (how === "share" ? shareFile : openFile)(result.blob, result.fileName, result.mime); }
    catch (err) { setExportNote({ kind: "error", key: "export.handoffFailed", reason: errorReason(err) }); }
  }, [lastExport, errorReason]);

  const openExport = useCallback(() => {
    setCadTab(null); setSearchOpen(false); endMarkup(); endMeasure(); setExportNote(null);
    setExportStage("sheet");
  }, [endMarkup, endMeasure]);

  const startExport = useCallback(() => {
    saveExportChoice(exportChoice);
    if (exportChoice.range === "box") setExportStage("box");
    else void runExport(exportChoice);
  }, [exportChoice, runExport]);

  const closeExport = useCallback(() => { setExportStage(null); setExportNote((n) => (n?.kind === "working" ? n : null)); }, []);

  // ---- markup share (T10 8-11) ---------------------------------------------------------------------------
  const share = useCallback(async () => {
    const was = lastRef.current, canvas = canvasRef.current;
    if (!was || !canvas || sharing) return;
    setSharing(true); setShareNote(null);
    try {
      const ready = !!(canvas as { exportDrawing?: unknown }).exportDrawing || await loadExportDrawing().then(() => !!engineRef.current, () => false);
      if (ready) {
        const result = await runExport({ range: "view", format: "png", paper: "A4" });
        if (result) await handOff("share", result);
        return;
      }
      const sheet = space === MODEL_SPACE ? t("viewer.spaceModel") : space;
      const time = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      const blob = await canvas.shareImage(`${was.file.name} · ${sheet} · ${time}`);
      const name = shareFileName(was.file.name);
      // Group E's hand-off: Android share sheet, Web Share, or a download on the web.
      const outcome = await shareFile(blob, name, "image/png");
      if (outcome === "downloaded") setShareNote({ text: t("share.saved", { "檔名": name }), error: false });
      else if (outcome !== "cancelled") setShareNote({ text: t("share.opened"), error: false });
    } catch (err) {
      setShareNote({ text: t("share.failed", { "原因": errorReason(err) }), error: true });
    } finally {
      setSharing(false);
    }
  }, [sharing, space, t, runExport, handOff, errorReason]);

  // ---- library -------------------------------------------------------------------------------------------
  const openLibrary = useCallback(() => setLibraryOpen(true), []);
  const closeLibrary = useCallback(() => { setLibraryOpen(false); setIncomingArchive(null); }, []);

  // ---- Back / Esc (T10 4.3) -------------------------------------------------------------------------------
  const backState: ShellBackState = {
    screen, closeConfirmOpen: closeConfirm, confirmOpen: !!confirm, exportOpen: !!exportStage || (!!exportNote && exportNote.kind !== "working"), markupTextOpen: !!textDialog, marking,
    searchPanelOpen: searchOpen, hasSearchResults: !!search, libraryOpen, cadPanelOpen: !!cadTab, measuring, inspecting, nativeApp,
  };
  const backRef = useRef(backState);
  backRef.current = backState;
  const handleBack = useCallback(() => {
    const state = backRef.current;
    // The library overlay handles its own levels first (dialogs, search, parent folder, then itself).
    if (state.libraryOpen && !state.closeConfirmOpen && !state.confirmOpen && handleLibraryBack()) return;
    switch (decideBack(state)) {
      case "close-close-confirm": setCloseConfirm(false); break;
      case "close-confirm": setConfirm(null); break;
      case "close-export": closeExport(); break;
      case "close-markup-text": setTextDialog(null); break;
      case "end-markup": endMarkup(); break;
      case "close-search-panel": setSearchOpen(false); break;
      case "clear-search": clearSearch(); break;
      case "close-library": closeLibrary(); break;
      case "close-cad-panel": setCadTab(null); break;
      case "end-measure": endMeasure(); break;
      case "ask-close-drawing": setCloseConfirm(true); break;
      case "go-home": goHome(); break;
      case "exit-app": void incomingDrawingPlugin.exitApp().catch(() => {}); break;
      case "none": break;
    }
  }, [endMarkup, clearSearch, closeLibrary, endMeasure, goHome, closeExport]);

  useEffect(() => registerBackHandler(handleBack), [handleBack]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (backStack.dispatch()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- start-up: old library, Android back key and incoming files (T10 3.1-3) ---------------------------------
  useEffect(() => { void migrateLegacyLibrary().catch(() => {}); }, []);
  // The exports list shares / opens through group E's hand-off.
  useEffect(() => {
    setExportFileActions({
      shareFile: async (blob, name, mime) => void (await shareFile(blob, name, mime)),
      openFile: async (blob, name, mime) => void (await openFile(blob, name, mime)),
    });
  }, []);
  const openRef = useRef(openDrawing);
  openRef.current = openDrawing;
  useEffect(() => {
    if (!nativeApp) return;
    const seen: string[] = [];
    const handles: { remove(): Promise<void> }[] = [];
    let live = true;
    const take = async (drawing: IncomingDrawing | null) => {
      if (!drawing || seen.includes(drawing.id)) return;
      seen.push(drawing.id);
      if (seen.length > INCOMING_MEMORY) seen.shift();
      try {
        const file = await readIncomingDrawingFile(drawing);
        if (live) void openRef.current(file);
      } catch (err) {
        if (live && !isAbort(err)) { setError(toAppError(err, "FILE_READ_FAILED")); setScreen("error"); }
      } finally {
        void incomingDrawingPlugin.acknowledgeDrawing({ id: drawing.id }).catch(() => {});
      }
    };
    (async () => {
      handles.push(await incomingDrawingPlugin.addListener("backKey", () => backStack.dispatch()));
      handles.push(await incomingDrawingPlugin.addListener("incomingFile", (d) => void take(d)));
      const pending = await incomingDrawingPlugin.getPendingDrawing();
      await take(pending.drawing);
    })().catch((err) => console.warn("incoming drawing bridge", err));
    return () => { live = false; for (const h of handles) void h.remove(); };
  }, [nativeApp]);

  // ---- lazily loaded viewers -------------------------------------------------------------------------------
  const showing = screen === "loading" || screen === "viewing";
  const cad = useLazyPart<CadViewerParts>(loadCadViewer, !!drawable && !isPdf && showing, onMissingViewer);
  const Pdf = useLazyPart<PdfViewerComponent>(loadPdfViewer, !!drawable && isPdf && showing, onMissingViewer);
  const Panel = useLazyPart<MeasurePanelComponent>(loadMeasurePanel, measuring && (measureDetail || !glove));

  // ---- render ----------------------------------------------------------------------------------------------
  const blocked = libraryOpen || closeConfirm;
  const missingCount = report ? splitCadWarnings(report.warnings).missing.length : 0;
  const xrefsUnloaded = report ? report.xrefs.filter((x) => !x.loaded && !x.disabled).length : 0;
  const showStrip = screen === "viewing" && !!report && !isPdf && !inspecting && !marking;
  const searching = searchOpen || !!search;

  let viewer: ReactNode = null;
  if (drawable && showing) {
    if (isPdf) {
      viewer = Pdf ? <Pdf ref={pdfRef} file={drawable} onProgress={onProgress} onReady={onReady} onError={onViewerError} /> : null;
    } else if (cad) {
      viewer = (
        <cad.Canvas ref={canvasRef} file={drawable} createEngine={cad.createEngine} measurement={settings}
          markup={marking ? { tool: markTool, color: markColor, editingIndex: textDialog?.kind === "edit" ? textDialog.index : undefined, textAnchor: textDialog?.kind === "new" ? { at: textDialog.at, width: textDialog.width } : null } : null}
          onMarkText={(at, width) => setTextDialog({ kind: "new", at, width })}
          onEditMarkText={(i, initial, color) => { if (!marking) return; setMarkColor(color); setTextDialog({ kind: "edit", index: i, initial }); }}
          onEngine={(engine) => { engineRef.current = engine; }}
          onProgress={onProgress} onReady={onReady} onError={onViewerError} onPick={onPick}
          onMeasurementIndex={onMeasurementIndex} onSpaces={onSpaces} onMarkCount={setMarkCount} onReport={setReport} />
      );
    }
  }

  const measureTools: MeasureTools | undefined = measuring ? {
    mode: settings.mode,
    onMode: () => {},
    onPickMode: (mode) => dispatch({ type: "mode", mode }),
    onUndo: () => dispatch({ type: "undo" }),
    canUndo: hasAnything(settings),
    onKeep: () => dispatch({ type: "keep" }),
    canKeep: canKeep(settings),
    onClearAll: askClearAll,
    canClearAll: hasAnything(settings),
  } : undefined;

  const askClearMarks = () => setConfirm({ message: t("markup.clearAllConfirm"), okLabel: t("markup.clearAllOk"), onOk: () => canvasRef.current?.clearMarks() });
  const toolbarProps = {
    onCommand: viewCommand, canMeasure: !isPdf, onMeasure: toggleMeasure, onMarkup: toggleMarkup, onSearch: toggleSearch,
    onInspect: toggleInspect, measuring, marking, searching, inspecting, measureTools,
    onClearMarks: askClearMarks, canClearMarks: markCount > 0,
  };

  return (
    <div className={`app${glove ? " is-glove" : " is-desk"}${showing ? " is-viewing" : ""}`} data-viewer-shell="">
      {showing ? (
        <div className="viewer-stage" inert={blocked} aria-hidden={blocked || undefined}>{viewer}</div>
      ) : null}

      <div className="app-content" hidden={libraryOpen} inert={closeConfirm}>
        {screen === "home" ? <HomeScreen onLibrary={openLibrary} onLegal={setLegal} /> : null}

        {screen === "error" && error ? (
          <ErrorScreen error={error} onLibrary={openLibrary} onRetry={last ? retry : undefined} onBack={goHome} />
        ) : null}

        {screen === "viewing" && last ? (
          <>
            <FileBar name={last.file.name} size={last.file.size} file={last.file} entryId={last.entryId} cardOpen={nameCard} onCard={setNameCard}
              onLibrary={openLibrary} onClose={() => setCloseConfirm(true)} />
            {showStrip ? (
              <CheckStrip spaces={spaces} space={space} switching={switching} missing={missingCount} xrefsUnloaded={xrefsUnloaded}
                onSpace={(name) => { setSwitching(true); canvasRef.current?.switchSpace(name); }}
                onTab={(tab) => { setSearchOpen(false); setCadTab(tab); }} onExport={openExport} />
            ) : null}

            {marking ? (
              <MarkupBar tool={markTool} color={markColor} count={markCount} sharing={sharing}
                onTool={setMarkTool} onColor={setMarkColor} onUndo={() => canvasRef.current?.undoMark()}
                onShare={() => void share()} onDone={endMarkup} />
            ) : null}
            {marking && textDialog ? (
              <MarkupTextDialog multiline={textDialog.kind === "new" ? textDialog.width !== undefined : textDialog.initial.includes(String.fromCharCode(10))}
                initial={textDialog.kind === "edit" ? textDialog.initial : undefined} color={markColor}
                onCancel={() => setTextDialog(null)}
                onOk={(text) => {
                  const d = textDialog;
                  setTextDialog(null);
                  if (d.kind === "edit") canvasRef.current?.editTextMark(d.index, text, markColor);
                  else if (text.trim()) canvasRef.current?.addTextMark(d.at, text, d.width);
                }} />
            ) : null}

            {searchOpen && index ? (
              <SearchPanel entities={index.entities} limited={index.limited} initialQuery={search?.query ?? ""}
                onClose={() => setSearchOpen(false)}
                onPick={(hits, i, query) => {
                  setSearch({ hits, index: i, query }); setSearchOpen(false);
                  const hit = hits[i];
                  canvasRef.current?.showSearchHit(hit.bounds, hit.textHeight, hit.at);
                }} />
            ) : null}
            {search && !searchOpen && !measuring && !inspecting ? (
              <SearchStepper query={search.query} index={search.index} total={search.hits.length}
                onOpen={() => setSearchOpen(true)} onClose={clearSearch}
                onStep={(delta) => {
                  const n = search.hits.length, i = ((search.index + delta) % n + n) % n;
                  setSearch({ ...search, index: i });
                  const hit = search.hits[i];
                  canvasRef.current?.showSearchHit(hit.bounds, hit.textHeight, hit.at);
                }} />
            ) : null}

            {inspecting ? (
              <InfoPanel entity={measure.entity} onTop={cardPlace?.onTop} maxHeight={cardPlace?.maxHeight} format={format}
                onClose={endMeasure}
                onHideLayer={(layer) => { canvasRef.current?.showLayer(layer, false); dispatch({ type: "undo-point" }); }} />
            ) : null}

            {measuring && glove && !measureDetail ? (
              <MeasureStrip settings={settings} decimals={decimals} unitAssumed={units.assumed} format={format} onDetail={() => setMeasureDetail(true)} />
            ) : null}
            {measuring && Panel && (measureDetail || !glove) ? (
              <Panel settings={settings} onSettings={setSettings} sourceUnit={units.source} displayUnit={units.display}
                onUnits={(source: MeasurementUnit, display: MeasurementUnit) => {
                  const key = index?.viewKey ?? "";
                  if (key) savePosition(key, { sourceUnit: source, displayUnit: display });
                  setUnits({ source, display, assumed: index?.unit === "drawing" && source === "cm" });
                }}
                decimals={decimals} onDecimals={(n: number) => { setDecimals(n); saveDecimals(n); }}
                unitAssumed={units.assumed} snapLimited={!!index?.limited} picked={measure.entity} glove={glove} format={format}
                onClearAll={askClearAll} onClose={() => (glove ? setMeasureDetail(false) : endMeasure())} />
            ) : null}

            <SnapToast text={measure.toast ? t(toastKey(measure.toast.kind)) : null} serial={measure.toast?.serial ?? 0} />

            {shareNote ? (
              <div className={`share-note${shareNote.error ? " is-error" : ""}`} role="status">
                <span>{shareNote.text}</span>
                <button type="button" aria-label={t("share.close")} onClick={() => setShareNote(null)}><CloseIcon /></button>
              </div>
            ) : null}
            {saveFailed ? <p className="save-failed" role="status">{t("viewer.librarySaveFailed")}</p> : null}
            {measureSaveFailed ? <p className="save-failed" role="status">量測保存失敗；目前仍顯示，關閉圖面前請確認裝置儲存空間。</p> : null}

            {exportStage === "box" ? null : glove ? <GloveBar {...toolbarProps} /> : <ViewerDock {...toolbarProps} />}

            {exportStage === "sheet" ? (
              <ExportSheet choice={exportChoice} onChange={(next) => { setExportChoice(next); saveExportChoice(next); }} onExport={startExport} onClose={closeExport} />
            ) : null}
            {exportStage === "box" ? <ExportBoxLayer onConfirm={(box) => void runExport(exportChoice, box)} onCancel={closeExport} /> : null}
            {exportNote ? <ExportNote note={exportNote} onShare={() => void handOff("share")} onOpen={() => void handOff("open")} onClose={() => setExportNote(null)} /> : null}

            {cadTab && report && last ? (
              <CadPanel report={report} audit={audit} source={last.file} initialTab={STRIP_TABS[cadTab]}
                onLayer={(name, visible) => canvasRef.current?.showLayer(name, visible)}
                onReload={(file) => setDrawable(file)} onClose={() => setCadTab(null)} />
            ) : null}
          </>
        ) : null}
      </div>

      {screen === "loading" && last ? (
        <LoadingScreen stage={stage} progress={progress} fileName={last.file.name} onCancel={() => setCloseConfirm(true)} />
      ) : null}

      {libraryOpen ? (
        <LibraryScreen onOpen={(file, entryId) => void openDrawing(file, entryId)} onClose={closeLibrary}
          incomingArchive={incomingArchive} onArchiveTaken={() => setIncomingArchive(null)} />
      ) : null}

      {legal && screen === "home" ? <Suspense fallback={null}><LegalPage kind={legal} onClose={closeLegal} /></Suspense> : null}
      {confirm ? <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} /> : null}
      {closeConfirm ? <CloseDrawingDialog onKeep={() => setCloseConfirm(false)} onClose={goHome} /> : null}
    </div>
  );
}

