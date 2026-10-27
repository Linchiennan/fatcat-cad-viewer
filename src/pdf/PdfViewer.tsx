// PDF viewer (T17): one page at a time on one canvas, pager above the paw tile, view-only.
// pdf.js (legacy build, for old Android WebViews) is loaded only when a PDF is opened.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { ViewerEvents, ViewerHandle } from "../types/engine";
import { AppError } from "../types/errors";
import { useI18n } from "../i18n/translations";
import { canvasSize, pageScale, typedPage, wheelFactor, zoomBy, zoomIn, zoomOut, zoomText } from "./pdfLayout";
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

export type PdfViewerProps = ViewerEvents & { file: File };

export const PdfViewer = forwardRef<ViewerHandle, PdfViewerProps>(function PdfViewer({ file, onProgress, onReady, onError }, ref) {
  const { t } = useI18n();
  const events = useRef({ onProgress, onReady, onError });
  events.current = { onProgress, onReady, onError };
  const scroller = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  /** Page shown and zoom factor (1 = page width fits the scroll area). */
  const [view, setView] = useState({ page: 1, zoom: 1 });
  const { page, zoom } = view;
  const setPage = (n: number) => setView((v) => ({ ...v, page: n }));
  const setZoom = (f: (z: number) => number) => setView((v) => ({ ...v, zoom: f(v.zoom) }));
  const [width, setWidth] = useState(0);
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
    setWidth(el.clientWidth);
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
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
      const scale = pageScale(width, base.width, zoom);
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
      c.style.transform = ""; c.style.transformOrigin = "";
      // keep the point under the fingers / the cursor where it was
      const f = pendingFocus.current;
      pendingFocus.current = null;
      if (f && scroller.current) {
        const r = c.getBoundingClientRect();
        scroller.current.scrollBy?.({ left: r.left + f.px * f.k - f.fx, top: r.top + f.py * f.k - f.fy });
      }
      setDrawing(false);
      events.current.onProgress("preparing", page, doc.numPages);
      if (!readyOnce.current) { readyOnce.current = true; events.current.onReady(); }
    })().catch((e) => { if (!stale && !isCancel(e)) fail("PDF_OPEN_FAILED", e); });
    return () => { stale = true; };
  }, [doc, page, zoom, width]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom by hand (用戶 2026-10-27：看 PDF 時畫面要能縮放): wheel at the cursor, two-finger pinch at the fingers' middle;
  // one finger or a mouse drag moves the page. While zooming the page is scaled as a live preview, then drawn sharp at the
  // new zoom with the same point under the cursor / fingers (render effect above).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const touches = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; left: number; top: number } | null = null;
    let gesture: { px: number; py: number; fx: number; fy: number; k: number; dist: number } | null = null;
    let wheelTimer = 0;
    const begin = (fx: number, fy: number, dist = 0) => {
      const c = canvas.current;
      if (!c) return null;
      c.style.transform = "";
      const r = c.getBoundingClientRect();
      const px = fx - r.left, py = fy - r.top;
      c.style.transformOrigin = `${px}px ${py}px`;
      return { px, py, fx, fy, k: 1, dist };
    };
    const preview = (g: NonNullable<typeof gesture>) => {
      const c = canvas.current, z = zoomNow.current;
      if (c) c.style.transform = `scale(${zoomBy(z, g.k) / z})`;
    };
    const commit = (g: NonNullable<typeof gesture>) => {
      const c = canvas.current, z = zoomNow.current, target = zoomBy(z, g.k), k = target / z;
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
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      } else {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 1) drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        if (touches.size === 2) { drag = null; const q = pair(); gesture = begin(q.mx, q.my, q.d); }
      }
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture && gesture.dist > 0 && touches.size >= 2) {
        gesture.k = pair().d / gesture.dist;
        preview(gesture);
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

  useImperativeHandle(ref, () => ({
    command(command) {
      if (command === "zoom-in") setZoom(zoomIn);
      else if (command === "zoom-out") setZoom(zoomOut);
      else { setZoom(() => 1); toTop(); }
    },
  }), []);

  const pages = doc?.numPages ?? 0;
  return (
    <div className="pdf-viewer">
      <div ref={scroller} className="pdf-scroll">
        <canvas ref={canvas} className="pdf-page" aria-label={`${t("pdf.page")} ${page}`} />
      </div>
      {drawing && doc ? <div className="pdf-rendering" role="status">{t("pdf.rendering")}</div> : null}
      <nav className="pdf-pager">
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
