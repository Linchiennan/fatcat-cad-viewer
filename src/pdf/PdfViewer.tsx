// PDF viewer (T17): one page at a time on one canvas, pager above the paw tile, view-only.
// pdf.js (legacy build, for old Android WebViews) is loaded only when a PDF is opened.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ComponentProps } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { ViewerEvents, ViewerHandle } from "../types/engine";
import { AppError } from "../types/errors";
import { useI18n } from "../i18n/translations";
import { canvasSize, fitPageScale, pageScale, typedPage, wheelFactor, zoomBy, zoomIn, zoomOut, zoomText } from "./pdfLayout";
import { PhotoMarkerLayer } from "../camera/PhotoMarkerLayer";
import type { DrawingPoint } from "../types/drawing";
import "./pdf.css";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsModule: Promise<PdfJs> | null = null;

/** Where the pdf.js worker and its data live (copied into public/runtime/pdfjs at build time). */
export function runtimeUrl(path: string): string {
  const base = typeof document !== "undefined" ? document.baseURI : "http://localhost/";
  return new URL(`${import.meta.env.BASE_URL ?? "./"}runtime/pdfjs/${path}`, base).href;
}

export function loadPdfJs(): Promise<PdfJs> {
  pdfjsModule ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    const lib = m as unknown as PdfJs;
    lib.GlobalWorkerOptions.workerSrc = runtimeUrl("pdf.worker.min.mjs");
    return lib;
  }).catch((e) => { pdfjsModule = null; throw e; });
  return pdfjsModule;
}

const isCancel = (e: unknown) => {
  const name = (e as { name?: string } | null)?.name;
  return name === "RenderingCancelledException" || name === "AbortException" || name === "AbortError";
};

/**
 * A PDF as the 工程相機 base (用戶 2026-11-23：「底圖如果用PDF呢?」→ 選 B 支援 PDF): spots are kept in page points of
 * the page as shown (y up from its bottom left, like a drawing), so the marker layer's maths is the CAD one.
 */
export type PdfMarkers = Omit<ComponentProps<typeof PhotoMarkerLayer>, "project" | "unproject" | "ppu" | "sheetWidth">;
export type PdfViewerProps = ViewerEvents & {
  file: File;
  /** the camera's spots on the page shown */
  photoMarkers?: PdfMarkers | null;
  /** the camera panel is open: one finger is for the spots, two fingers move the page, and the page stays (no pager) */
  camera?: boolean;
  /** the page shown and the page count, after each page is drawn */
  onPage?(page: number, pages: number): void;
  /** the words on the page shown, in page points (the camera names a spot after the room it is in) */
  onPageTexts?(texts: { text: string; x: number; y: number }[]): void;
};
/** Extra commands of the PDF viewer for the camera. */
export type PdfViewerHandle = ViewerHandle & {
  goToPage(page: number): void;
  /** bring a page point to `at` (px from the scroll area's top left) */
  centerOn(point: DrawingPoint, at: { x: number; y: number }): void;
};
/** Page size in points as shown, and CSS px per point; null until the page is drawn. */
type PageGeometry = { scale: number; width: number; height: number };
/** a phone held sideways (the camera panel stands on the right) */
const SIDEWAYS = "(orientation: landscape) and (max-height: 600px)";

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer({ file, onProgress, onReady, onError, photoMarkers, camera, onPage, onPageTexts }, ref) {
  const { t } = useI18n();
  const events = useRef({ onProgress, onReady, onError, onPage, onPageTexts });
  events.current = { onProgress, onReady, onError, onPage, onPageTexts };
  /** the page and the marker layer move and zoom together */
  const sheet = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<PageGeometry | null>(null);
  const cameraOn = useRef(false);
  cameraOn.current = !!camera || !!photoMarkers;
  const measureNow = useRef<() => void>(() => {});
  // the camera opening or closing changes the free box (its panel takes the right side when sideways)
  useEffect(() => { measureNow.current(); }, [camera]);
  const scroller = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  /** Page shown and zoom factor (1 = page width fits the scroll area). */
  const [view, setView] = useState({ page: 1, zoom: 1 });
  const { page, zoom } = view;
  const setPage = (n: number) => setView((v) => ({ ...v, page: n }));
  const setZoom = (f: (z: number) => number) => setView((v) => ({ ...v, zoom: f(v.zoom) }));
  const [width, setWidth] = useState(0);
  /** sideways with the camera open: the whole page fits between the buttons on the left and the panel on the right
   * (用戶 2026-11-23：「PDF也有做橫向模式嗎?」); null: the page width fits the scroll area as before */
  const [fitBox, setFitBox] = useState<{ w: number; h: number } | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [typed, setTyped] = useState("1");
  const reported = useRef(false);
  const readyOnce = useRef(false);
  /** Current zoom for the gesture listeners, and where a finished zoom should keep its focus point. */
  const zoomNow = useRef(1);
  zoomNow.current = zoom;
  const pendingFocus = useRef<{ px: number; py: number; fx: number; fy: number; k: number } | null>(null);

  const fail = (code: "PDF_OPEN_FAILED" | "PDF_PASSWORD", cause?: unknown) => {
    if (reported.current) return; // one error per opening
    reported.current = true;
    events.current.onError(new AppError(code, code === "PDF_PASSWORD" ? "PDF needs a password" : "PDF open or render failed", { cause }));
  };
  const toTop = () => scroller.current?.scrollTo?.({ left: 0, top: 0 });

  // Open: read the bytes, hand them to pdf.js. A new file resets everything.
  useEffect(() => {
    let cancelled = false;
    let task: { destroy(): Promise<void>; promise: Promise<PDFDocumentProxy>; onPassword: unknown } | null = null;
    reported.current = false;
    readyOnce.current = false;
    setDoc(null); setView({ page: 1, zoom: 1 }); setTyped("1"); setDrawing(true);
    events.current.onProgress("reading", 0, file.size);
    (async () => {
      const bytes = await file.arrayBuffer();
      if (cancelled) return;
      const data = new Uint8Array(bytes);
      events.current.onProgress("parsing", 0, 0);
      const pdfjs = await loadPdfJs();
      if (cancelled) return;
      const loading = pdfjs.getDocument({
        data, cMapUrl: runtimeUrl("cmaps/"), cMapPacked: true, standardFontDataUrl: runtimeUrl("standard_fonts/"),
        wasmUrl: runtimeUrl("wasm/"), iccUrl: runtimeUrl("iccs/"), enableXfa: false,
      });
      task = loading as unknown as typeof task;
      // A password-protected PDF stops at once (no password prompt in this version).
      loading.onPassword = () => { fail("PDF_PASSWORD"); void loading.destroy().catch(() => {}); };
      const pdf = await loading.promise;
      if (cancelled) return;
      events.current.onProgress("preparing", 0, pdf.numPages);
      setDoc(pdf);
    })().catch((e) => { if (!cancelled && !isCancel(e)) fail(((e as { name?: string })?.name === "PasswordException") ? "PDF_PASSWORD" : "PDF_OPEN_FAILED", e); });
    return () => {
      cancelled = true;
      if (task) void task.destroy().catch(() => {});
    };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll area width: redraw when the phone turns or the window is resized.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      const sideways = cameraOn.current && typeof matchMedia === "function" && matchMedia(SIDEWAYS).matches;
      if (!sideways) { setFitBox(null); return; }
      const cs = getComputedStyle(el), px = (v: string) => parseFloat(v) || 0;
      const w = el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight), h = el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom);
      setFitBox((old) => (w > 0 && h > 0 ? (old && Math.abs(old.w - w) < 1 && Math.abs(old.h - h) < 1 ? old : { w, h }) : null));
    };
    measureNow.current = measure;
    measure();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw the current page; the previous drawing is cancelled and finished before the canvas is reused.
  const running = useRef<RenderTask | null>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!doc || !c || !(width > 0)) return;
    let stale = false;
    setDrawing(true);
    (async () => {
      const previous = running.current;
      if (previous) { previous.cancel(); await previous.promise.catch(() => {}); }
      if (stale) return;
      const p = await doc.getPage(page);
      if (stale) return;
      const base = p.getViewport({ scale: 1 });
      const scale = fitBox ? fitPageScale(fitBox.w, fitBox.h, base.width, base.height, zoom) : pageScale(width, base.width, zoom);
      const css = p.getViewport({ scale });
      const size = canvasSize(css.width, css.height, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
      // Drawn off screen and copied in at once, so a zoom keeps its live preview until the sharp page is ready.
      const off = document.createElement("canvas");
      off.width = size.width; off.height = size.height;
      const task = p.render({ canvas: off, viewport: p.getViewport({ scale: scale * size.ratio }), background: "#ffffff" });
      running.current = task;
      await task.promise;
      if (running.current === task) running.current = null;
      if (stale) return;
      c.width = size.width; c.height = size.height;
      c.style.width = `${css.width}px`; c.style.height = `${css.height}px`;
      c.getContext("2d")?.drawImage(off, 0, 0);
      const s = sheet.current;
      if (s) { s.style.transform = ""; s.style.transformOrigin = ""; }
      setGeo({ scale, width: base.width, height: base.height });
      // keep the point under the fingers / the cursor where it was
      const f = pendingFocus.current;
      pendingFocus.current = null;
      if (f && scroller.current) {
        const r = c.getBoundingClientRect();
        scroller.current.scrollBy?.({ left: r.left + f.px * f.k - f.fx, top: r.top + f.py * f.k - f.fy });
      }
      setDrawing(false);
      events.current.onProgress("preparing", page, doc.numPages);
      events.current.onPage?.(page, doc.numPages);
      if (events.current.onPageTexts) void import("../camera/pdfSheet").then((m) => m.pdfPageTexts(p)).then((x) => { if (!stale) events.current.onPageTexts?.(x); }).catch(() => {});
      if (!readyOnce.current) { readyOnce.current = true; events.current.onReady(); }
    })().catch((e) => { if (!stale && !isCancel(e)) fail("PDF_OPEN_FAILED", e); });
    return () => { stale = true; };
  }, [doc, page, zoom, width, fitBox]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom by hand (用戶 2026-10-27：看 PDF 時畫面要能縮放): wheel at the cursor, two-finger pinch at the fingers' middle;
  // one finger or a mouse drag moves the page. While zooming the page is scaled as a live preview, then drawn sharp at the
  // new zoom with the same point under the cursor / fingers (render effect above).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const touches = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; left: number; top: number } | null = null;
    let gesture: { px: number; py: number; fx: number; fy: number; k: number; dist: number; x0: number; y0: number; left: number; top: number } | null = null;
    let wheelTimer = 0;
    const begin = (fx: number, fy: number, dist = 0) => {
      const c = sheet.current;
      if (!c) return null;
      c.style.transform = "";
      const r = c.getBoundingClientRect();
      const px = fx - r.left, py = fy - r.top;
      c.style.transformOrigin = `${px}px ${py}px`;
      return { px, py, fx, fy, k: 1, dist, x0: fx, y0: fy, left: el.scrollLeft, top: el.scrollTop };
    };
    const preview = (g: NonNullable<typeof gesture>) => {
      const c = sheet.current, z = zoomNow.current;
      if (c) c.style.transform = `scale(${zoomBy(z, g.k) / z})`;
    };
    const commit = (g: NonNullable<typeof gesture>) => {
      const c = sheet.current, z = zoomNow.current, target = zoomBy(z, g.k), k = target / z;
      if (Math.abs(k - 1) < 0.01) { if (c) c.style.transform = ""; return; }
      pendingFocus.current = { px: g.px, py: g.py, fx: g.fx, fy: g.fy, k };
      setZoom(() => target);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      gesture ??= begin(e.clientX, e.clientY);
      if (!gesture) return;
      gesture.k *= wheelFactor(e.deltaY * (e.deltaMode === 1 ? 33 : 1));
      preview(gesture);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => { if (gesture) commit(gesture); gesture = null; }, 160);
    };
    const pair = () => { const [a, b] = [...touches.values()]; return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
    const down = (e: PointerEvent) => {
      // a spot being moved or turned is the marker layer's, not a page move
      if ((e.target as Element | null)?.closest?.("[data-photo-marker]")) return;
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      } else {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        // with the camera open one finger places and picks spots, as on a CAD drawing; two fingers move and zoom
        if (touches.size === 1 && !cameraOn.current) drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        if (touches.size === 2) { drag = null; const q = pair(); gesture = begin(q.mx, q.my, q.d); }
      }
      // with the camera open a tap is the marker layer's: holding the pointer here kept its lift from the page, and no
      // spot was placed
      if (!cameraOn.current) el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture && gesture.dist > 0 && touches.size >= 2) {
        const q = pair();
        gesture.k = q.d / gesture.dist;
        preview(gesture);
        // two fingers also move the page; the point under them stays under them when the zoom is drawn sharp
        el.scrollLeft = gesture.left - (q.mx - gesture.x0);
        el.scrollTop = gesture.top - (q.my - gesture.y0);
        gesture.fx = q.mx; gesture.fy = q.my;
      } else if (drag) {
        el.scrollLeft = drag.left - (e.clientX - drag.x);
        el.scrollTop = drag.top - (e.clientY - drag.y);
      }
    };
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (gesture && gesture.dist > 0 && touches.size < 2) { commit(gesture); gesture = null; }
      if (e.pointerType === "mouse" || touches.size === 0) drag = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      window.clearTimeout(wheelTimer);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, []);

  // Leaving the PDF: stop drawing (the loading task, destroyed on close, frees the document).
  useEffect(() => () => { running.current?.cancel(); }, [doc]);

  const goTo = (n: number) => {
    if (!doc) return;
    const next = Math.min(doc.numPages, Math.max(1, n));
    setTyped(String(next));
    if (next !== page) { setPage(next); toTop(); }
  };

  const geoNow = useRef<PageGeometry | null>(null);
  geoNow.current = geo;
  const pagesNow = useRef(0);
  pagesNow.current = doc?.numPages ?? 0;
  useImperativeHandle(ref, () => ({
    command(command) {
      if (command === "zoom-in") setZoom(zoomIn);
      else if (command === "zoom-out") setZoom(zoomOut);
      else { setZoom(() => 1); toTop(); }
    },
    goToPage(n) {
      const total = pagesNow.current;
      if (!(total > 0)) return;
      const next = Math.min(total, Math.max(1, Math.round(n)));
      setTyped(String(next));
      setView((v) => (v.page === next ? v : { ...v, page: next }));
    },
    centerOn(point, at) {
      const g = geoNow.current, el = scroller.current, s = sheet.current;
      if (!g || !el || !s) return;
      el.scrollTo?.({ left: s.offsetLeft + point.x * g.scale - at.x, top: s.offsetTop + (g.height - point.y) * g.scale - at.y });
    },
  }), []);

  // page points (y up) ↔ px in the page box
  const project = useCallback((pts: readonly DrawingPoint[]) => {
    const g = geoNow.current;
    return pts.map((p) => (g ? { x: p.x * g.scale, y: (g.height - p.y) * g.scale } : { x: NaN, y: NaN }));
  }, []);
  const unproject = useCallback((x: number, y: number) => {
    const g = geoNow.current;
    return g ? { x: x / g.scale, y: g.height - y / g.scale } : { x: NaN, y: NaN };
  }, []);

  const pages = doc?.numPages ?? 0;
  return (
    <div className="pdf-viewer">
      <div ref={scroller} className="pdf-scroll">
        <div ref={sheet} className="pdf-sheet">
          <canvas ref={canvas} className="pdf-page" aria-label={`${t("pdf.page")} ${page}`} />
          {photoMarkers && geo ? <PhotoMarkerLayer {...photoMarkers} project={project} unproject={unproject} ppu={geo.scale} sheetWidth={geo.width} /> : null}
        </div>
      </div>
      {drawing && doc ? <div className="pdf-rendering" role="status">{t("pdf.rendering")}</div> : null}
      {/* one project is one page: no page change while the camera is open */}
      <nav className="pdf-pager" hidden={!!camera || !!photoMarkers}>
        <button type="button" aria-label={t("pdf.prev")} title={t("pdf.prev")} disabled={!doc || page <= 1} onClick={() => goTo(page - 1)}>‹</button>
        <span>{t("pdf.page")}</span>
        <input type="text" inputMode="numeric" value={typed} disabled={!doc} aria-label={t("pdf.page")}
          onChange={(e) => { const n = typedPage(e.target.value, pages); setTyped(n === null ? e.target.value : String(n)); if (n !== null && n !== page) { setPage(n); toTop(); } }}
          onBlur={() => setTyped(String(page))} />
        <span>/ {pages || "—"}</span>
        <button type="button" aria-label={t("pdf.next")} title={t("pdf.next")} disabled={!doc || page >= pages} onClick={() => goTo(page + 1)}>›</button>
        <span className="pdf-zoom" aria-label={t("pdf.zoom")}>{zoomText(zoom)}</span>
      </nav>
    </div>
  );
});
