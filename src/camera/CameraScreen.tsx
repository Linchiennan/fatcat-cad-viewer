// In-app camera (spec 009 plan 1): the back camera fills the screen with the whiteboard drawn on top, where it will
// sit on the saved photo. Drag the board to move it, the slider sizes it. The shutter keeps the original picture
// (ImageCapture at the camera's full resolution when the phone offers it); the board stays data until export.
// Without camera access (refused, or no getUserMedia) the system camera is offered instead. A computer uses a
// built-in test photo instead of its webcam (testPhoto.ts), so the flow can be tried on a PC.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { useI18n } from "../i18n/translations";
import { testPhoto, usesTestPhoto } from "./testPhoto";
import { allowRotation } from "../native/screenRotation";
import type { Signer, Whiteboard } from "./types";
import { boardRect, drawBoard, type BoardText } from "./whiteboard";

type Pos = Pick<Whiteboard, "x" | "y" | "width">;
type FlashMode = "off" | "auto" | "flash" | "torch";
type Capture = { takePhoto(settings?: { fillLightMode?: string }): Promise<Blob>; getPhotoCapabilities?(): Promise<{ fillLightMode?: string[] }> };
const FLASH_KEY = "fatcat.camera.flash";
const FLASH_ORDER: FlashMode[] = ["off", "auto", "flash", "torch"];
/**
 * Let the camera go: the torch off first, then every track stopped. Stopping alone left the phone's light on after
 * the app was closed (用戶 2026-11-22：「APP關閉 閃光燈一樣開著」), so the torch is switched off explicitly and the
 * tracks stop when that settles (or after 300 ms if the phone never answers).
 */
export function releaseCamera(s: MediaStream | null): void {
  if (!s) return;
  const stop = () => s.getTracks().forEach((tr) => tr.stop());
  const track = s.getVideoTracks()[0];
  const torch = (track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch;
  if (!track || !torch || track.readyState === "ended") { stop(); return; }
  let done = false;
  const finish = () => { if (!done) { done = true; stop(); } };
  try { void track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).then(finish, finish); } catch { finish(); }
  setTimeout(finish, 300);
}
const loadFlash =(): FlashMode => { try { const v = localStorage.getItem(FLASH_KEY); return (FLASH_ORDER as string[]).includes(v ?? "") ? (v as FlashMode) : "off"; } catch { return "off"; } };

export function CameraScreen({ board, text, signer, onShot, onPos, onClose }: {
  board: Whiteboard; text: BoardText; signer?: Signer | null;
  onShot(photo: Blob, pos: Pos): Promise<void> | void;
  /** the board was moved or resized: remembered for the next photos and the next time */
  onPos?(pos: Pos): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const sample = useRef<HTMLImageElement>(null);
  const [testMode] = useState(() => usesTestPhoto(Capacitor.isNativePlatform()));
  const [sampleUrl, setSampleUrl] = useState("");
  const overlay = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [pos, setPos] = useState<Pos>({ x: board.x, y: board.y, width: board.width });
  // remember where the board is left (a moment after it stops moving)
  useEffect(() => { const id = window.setTimeout(() => onPos?.(pos), 300); return () => window.clearTimeout(id); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<"starting" | "ready" | "denied">("starting");
  const [shots, setShots] = useState(0);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  /** flash modes this phone offers (用戶 2026-11-22：拍照模式下的閃光燈模式切換); none on computers */
  const [flashModes, setFlashModes] = useState<FlashMode[]>([]);
  const [flash, setFlash] = useState<FlashMode>(loadFlash);
  const capture = useRef<Capture | null>(null);
  // The camera (and its torch) only runs while the page is in front: switching apps, locking the phone or closing
  // the tab lets it go; coming back starts it again with the chosen flash mode.
  const [awake, setAwake] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const vis = () => setAwake(document.visibilityState !== "hidden");
    const gone = () => { releaseCamera(stream.current); stream.current = null; setAwake(false); };
    const back = () => setAwake(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", gone); window.addEventListener("pageshow", back);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", gone); window.removeEventListener("pageshow", back); };
  }, []);

  // The phone's back gesture / key closes the camera and returns to the drawing, instead of leaving the page
  // (用戶 2026-11-22：「拍完照片，回不去改定位，沒有返回」). One history entry while the camera is open; closing with
  // the button takes it off again. The back is deferred a tick so React's dev double-mount does not pop the new entry.
  // the phone may turn sideways while the camera is open (用戶 2026-11-23：拍照模式支援橫向自動轉向)
  useEffect(() => { allowRotation(true); return () => allowRotation(false); }, []);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const mark = `${Date.now()}-${Math.random()}`;
    let popped = false;
    try { history.pushState({ ...(history.state ?? {}), fatcatCamera: mark }, ""); } catch { return; }
    const pop = () => { if ((history.state as { fatcatCamera?: string } | null)?.fatcatCamera !== mark) { popped = true; closeRef.current(); } };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      if (!popped) window.setTimeout(() => { if ((history.state as { fatcatCamera?: string } | null)?.fatcatCamera === mark) history.back(); }, 0);
    };
  }, []);

  useEffect(() => {
    let live = true;
    if (!testMode && !awake) return;
    if (testMode) {
      let url = "";
      void testPhoto(shots + 1).then((b) => { if (!live) return; url = URL.createObjectURL(b); setSampleUrl(url); setState("ready"); });
      return () => { live = false; if (url) URL.revokeObjectURL(url); };
    }
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) { setState("denied"); return; }
    md.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } }, audio: false })
      .then((s) => {
        if (!live) { releaseCamera(s); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); }
        setState("ready");
        void (async () => {
          const track = s.getVideoTracks()[0];
          const IC = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => Capture }).ImageCapture;
          const modes: FlashMode[] = ["off"];
          try {
            if (track && IC) {
              capture.current = new IC(track);
              const caps = await capture.current.getPhotoCapabilities?.();
              for (const m of ["auto", "flash"] as const) if (caps?.fillLightMode?.includes(m)) modes.push(m);
            }
          } catch { /* no photo capabilities */ }
          if ((track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch) modes.push("torch");
          if (live) setFlashModes(modes.length > 1 ? modes : []);
        })();
      })
      .catch(() => live && setState("denied"));
    return () => { live = false; releaseCamera(stream.current); stream.current = null; capture.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testMode, testMode ? shots : 0, awake]);

  /** Where the picture shows inside the video element (object-fit: contain). */
  const shown = () => {
    const v = testMode ? sample.current : video.current;
    const vw = v instanceof HTMLVideoElement ? v.videoWidth : v?.naturalWidth ?? 0, vh = v instanceof HTMLVideoElement ? v.videoHeight : v?.naturalHeight ?? 0;
    if (!v || !vw) return null;
    const r = v.getBoundingClientRect(), s = Math.min(r.width / vw, r.height / vh);
    const w = vw * s, h = vh * s;
    return { left: (r.width - w) / 2, top: (r.height - h) / 2, w, h };
  };

  // Redraw the board over the live picture whenever it moves or the video size settles.
  useEffect(() => {
    let frame = 0;
    const paint = () => {
      const c = overlay.current, area = shown();
      if (c && area) {
        const dpr = window.devicePixelRatio || 1;
        c.style.left = `${area.left}px`; c.style.top = `${area.top}px`; c.style.width = `${area.w}px`; c.style.height = `${area.h}px`;
        c.width = Math.round(area.w * dpr); c.height = Math.round(area.h * dpr);
        const ctx = c.getContext("2d");
        if (ctx) { ctx.clearRect(0, 0, c.width, c.height); drawBoard(ctx, c.width, c.height, { ...board, ...pos }, text, signer); }
      }
      frame = requestAnimationFrame(() => { if (!c || !area) paint(); });
    };
    paint();
    const v: HTMLElement | null = testMode ? sample.current : video.current;
    v?.addEventListener(testMode ? "load" : "loadedmetadata", paint);
    window.addEventListener("resize", paint);
    return () => { cancelAnimationFrame(frame); v?.removeEventListener(testMode ? "load" : "loadedmetadata", paint); window.removeEventListener("resize", paint); };
  }, [pos, board, text, signer, state, sampleUrl, testMode]);

  const takePicture = async (): Promise<Blob> => {
    if (testMode) return testPhoto(shots + 1);
    const track = stream.current?.getVideoTracks()[0];
    const IC = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => Capture }).ImageCapture;
    if (track && IC) {
      const cap = capture.current ?? new IC(track);
      const mode = flashModes.includes(flash) && (flash === "auto" || flash === "flash") ? flash : flashModes.length ? "off" : undefined;
      try { return await cap.takePhoto(mode ? { fillLightMode: mode } : undefined); } catch { /* fall back to a video frame */ }
    }
    const v = video.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("no picture"))), "image/jpeg", 0.95));
  };

  // the torch stays on while 常亮 is chosen
  useEffect(() => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || !flashModes.includes("torch")) return;
    void track.applyConstraints({ advanced: [{ torch: flash === "torch" } as MediaTrackConstraintSet] }).catch(() => {});
  }, [flash, flashModes]);
  const nextFlash = () => {
    const i = flashModes.indexOf(flash);
    const next = flashModes[(i + 1) % flashModes.length] ?? "off";
    setFlash(next);
    try { localStorage.setItem(FLASH_KEY, next); } catch { /* private mode */ }
  };

  // The photo just taken shrinks into a thumbnail at the top left (用戶 2026-11-22：「拍完照片，要有個縮圖縮進左上角的
  // 特效」). It flies from where the picture shows on screen; the thumbnail stays until the next photo.
  const [thumb, setThumb] = useState<{ url: string; n: number; from: { left: number; top: number; width: number; height: number } | null } | null>(null);
  const thumbEl = useRef<HTMLImageElement>(null);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb.url); }, [thumb]);
  // It only says "a photo was taken": it shrinks into the top-left corner and is gone (用戶 2026-11-23：「縮到最左上後
  // 直接消失，這只是提醒有拍到照片用」).
  useLayoutEffect(() => {
    const el = thumbEl.current, n = thumb?.n, from = thumb?.from;
    if (!el || n === undefined) return;
    const gone = () => setThumb((cur) => (cur?.n === n ? null : cur));
    let reduced = false;
    try { reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* no matchMedia */ }
    if (!from || reduced || typeof el.animate !== "function") { const id = window.setTimeout(gone, 500); return () => window.clearTimeout(id); }
    const to = el.getBoundingClientRect(), host = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const box = (b: { left: number; top: number; width: number; height: number }, radius: string, opacity: number, offset?: number) =>
      ({ left: `${b.left - host.left}px`, top: `${b.top - host.top}px`, width: `${b.width}px`, height: `${b.height}px`, borderRadius: radius, opacity, ...(offset === undefined ? {} : { offset }) });
    const corner = { left: to.left, top: to.top, width: 16, height: 16 };
    const run = el.animate([box(from, "0px", 1), box(to, "10px", 1, 0.75), box(corner, "6px", 0)],
      { duration: 640, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" });
    run.onfinish = gone;
    return () => { run.onfinish = null; };
  }, [thumb?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const flyThumb = (photo: Blob) => {
    const v = testMode ? sample.current : video.current, area = shown(), r = v?.getBoundingClientRect();
    const from = r && area ? { left: r.left + area.left, top: r.top + area.top, width: area.w, height: area.h } : null;
    setThumb((old) => ({ url: URL.createObjectURL(photo), n: (old?.n ?? 0) + 1, from }));
  };

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try { const photo = await takePicture(); flyThumb(photo); await onShot(photo, pos); setShots((n) => n + 1); } finally { setBusy(false); }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const area = shown();
    if (!area) return;
    const r = boardRect(pos, area.w, area.h), x = e.nativeEvent.offsetX, y = e.nativeEvent.offsetY;
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, dx: x - r.x, dy: y - r.y };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current, area = shown();
    if (!d || d.id !== e.pointerId || !area) return;
    setPos((p) => ({ ...p, x: (e.nativeEvent.offsetX - d.dx) / area.w, y: (e.nativeEvent.offsetY - d.dy) / area.h }));
  };
  const onUp = () => { drag.current = null; };

  // On top of the whole page (the panel it opens from sits under the toolbar).
  return createPortal(
    <div className="camera-screen" role="dialog" aria-modal="true" aria-label={t("camera.shoot")}>
      {state === "denied" ? (
        <div className="camera-denied">
          <p>{t("camera.cameraDenied")}</p>
          <label className="camera-shoot camera-primary">{t("camera.systemCamera")}
            <input type="file" accept="image/*" capture="environment" hidden
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { await onShot(f, pos); setShots((n) => n + 1); } }} />
          </label>
        </div>
      ) : (
        <div className="camera-stage">
          {testMode ? <img ref={sample} src={sampleUrl || undefined} alt="" className="camera-sample" /> : <video ref={video} playsInline muted />}
          {testMode ? <p className="camera-test-note">{t("camera.testPhoto")}</p> : null}
          <canvas ref={overlay} className="camera-overlay" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        </div>
      )}
      <button type="button" className="camera-back" aria-label={t("camera.backToDrawing")} title={t("camera.backToDrawing")} onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        <span>{t("camera.back")}{shots ? ` (${shots})` : ""}</span>
      </button>
      {thumb ? <img key={thumb.n} ref={thumbEl} src={thumb.url} alt="" className="camera-shot-thumb" /> : null}
      <div className="camera-controls">
        <label className="camera-size">{t("camera.boardSize")}
          <input type="range" min={0.15} max={0.6} step={0.01} value={pos.width} onChange={(e) => setPos((p) => ({ ...p, width: Number(e.target.value) }))} />
        </label>
        <div className="camera-buttons">
          <button type="button" title={t("camera.backToDrawing")} onClick={onClose}>{t("camera.back")}{shots ? ` (${shots})` : ""}</button>
          {flashModes.length ? <button type="button" className="camera-flash" aria-label={t("camera.flash")} onClick={nextFlash}><span aria-hidden="true">⚡</span>{t(`camera.flash.${flashModes.includes(flash) ? flash : "off"}` as "camera.flash.off")}</button> : <span className="camera-flash-space" />}
          <button type="button" className="camera-shutter" aria-label={t("camera.shutter")} disabled={state !== "ready" || busy} onClick={() => void shoot()}><span /></button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
