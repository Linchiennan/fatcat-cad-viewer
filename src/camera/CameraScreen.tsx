// In-app camera (spec 009 plan 1): the back camera fills the screen with the whiteboard drawn on top, where it will
// sit on the saved photo. Drag the board to move it, the slider sizes it. The shutter keeps the original picture
// (ImageCapture at the camera's full resolution when the phone offers it); the board stays data until export.
// Without camera access (refused, or no getUserMedia) the system camera is offered instead.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/translations";
import type { Signer, Whiteboard } from "./types";
import { boardRect, drawBoard, type BoardText } from "./whiteboard";

type Pos = Pick<Whiteboard, "x" | "y" | "width">;
type Capture = { takePhoto(): Promise<Blob> };

export function CameraScreen({ board, text, signer, onShot, onClose }: {
  board: Whiteboard; text: BoardText; signer?: Signer | null;
  onShot(photo: Blob, pos: Pos): Promise<void> | void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [pos, setPos] = useState<Pos>({ x: board.x, y: board.y, width: board.width });
  const [state, setState] = useState<"starting" | "ready" | "denied">("starting");
  const [shots, setShots] = useState(0);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    let live = true;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) { setState("denied"); return; }
    md.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } }, audio: false })
      .then((s) => {
        if (!live) { s.getTracks().forEach((tr) => tr.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); }
        setState("ready");
      })
      .catch(() => live && setState("denied"));
    return () => { live = false; stream.current?.getTracks().forEach((tr) => tr.stop()); stream.current = null; };
  }, []);

  /** Where the picture shows inside the video element (object-fit: contain). */
  const shown = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const r = v.getBoundingClientRect(), s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const w = v.videoWidth * s, h = v.videoHeight * s;
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
    const v = video.current;
    v?.addEventListener("loadedmetadata", paint);
    window.addEventListener("resize", paint);
    return () => { cancelAnimationFrame(frame); v?.removeEventListener("loadedmetadata", paint); window.removeEventListener("resize", paint); };
  }, [pos, board, text, signer, state]);

  const takePicture = async (): Promise<Blob> => {
    const track = stream.current?.getVideoTracks()[0];
    const IC = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => Capture }).ImageCapture;
    if (track && IC) {
      try { return await new IC(track).takePhoto(); } catch { /* fall back to a video frame */ }
    }
    const v = video.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("no picture"))), "image/jpeg", 0.95));
  };

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try { await onShot(await takePicture(), pos); setShots((n) => n + 1); } finally { setBusy(false); }
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
          <video ref={video} playsInline muted />
          <canvas ref={overlay} className="camera-overlay" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        </div>
      )}
      <div className="camera-controls">
        <label className="camera-size">{t("camera.boardSize")}
          <input type="range" min={0.15} max={0.6} step={0.01} value={pos.width} onChange={(e) => setPos((p) => ({ ...p, width: Number(e.target.value) }))} />
        </label>
        <div className="camera-buttons">
          <button type="button" onClick={onClose}>{t("camera.done")}{shots ? ` (${shots})` : ""}</button>
          <button type="button" className="camera-shutter" aria-label={t("camera.shutter")} disabled={state !== "ready" || busy} onClick={() => void shoot()}><span /></button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
