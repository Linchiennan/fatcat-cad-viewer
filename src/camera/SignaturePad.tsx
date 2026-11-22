// Inspector signature (spec 009 定案 6): sign once with a finger, kept as strokes (small, sharp at any size).
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/translations";
import { saveSigner } from "./batchStore";
import type { Signer } from "./types";

const ASPECT = 3;

export function SignaturePad({ initialName, signer, onSaved, onCancel }: {
  initialName: string; signer?: Signer; onSaved(s: Signer): void; onCancel(): void;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState(signer?.name ?? initialName);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const current = useRef<number[] | null>(null);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1)];
  };
  const paint = (list: number[][]) => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fbfbf8"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#10105a"; ctx.lineWidth = 3 * dpr; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of list) {
      if (s.length < 2) continue;
      ctx.beginPath(); ctx.moveTo(s[0] * c.width, s[1] * c.height);
      for (let i = 2; i + 1 < s.length; i += 2) ctx.lineTo(s[i] * c.width, s[i + 1] * c.height);
      if (s.length === 2) ctx.lineTo(s[0] * c.width + 0.5, s[1] * c.height);
      ctx.stroke();
    }
  };

  return createPortal(
    <div className="confirm-backdrop">
      <section role="dialog" aria-modal="true" aria-label={t("camera.signTitle")} className="confirm-box camera-sign">
        <h2>{t("camera.signTitle")}</h2>
        <label>{t("camera.field.inspector")}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <canvas ref={canvas} className="camera-sign-pad" style={{ aspectRatio: String(ASPECT) }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); current.current = point(e); setStrokes((l) => { const n = [...l, current.current!]; paint(n); return n; }); }}
          onPointerMove={(e) => { if (!current.current) return; current.current.push(...point(e)); paint(strokes); }}
          onPointerUp={() => { current.current = null; }} onPointerCancel={() => { current.current = null; }} />
        <div className="camera-actions">
          <button type="button" onClick={() => { setStrokes([]); paint([]); }}>{t("camera.signClear")}</button>
          <button type="button" onClick={onCancel}>{t("camera.cancel")}</button>
          <button type="button" className="camera-primary" disabled={!name.trim() || !strokes.length}
            onClick={() => void saveSigner({ id: signer?.id, name: name.trim(), aspect: ASPECT, strokes }).then(onSaved)}>{t("camera.save")}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
