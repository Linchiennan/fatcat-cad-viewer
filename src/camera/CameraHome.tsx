// 工程相機 as its own entry on the home page (用戶 2026-11-23：「首頁我的圖面拆分成兩個我的圖面跟工程相機。工程相機不要再
// 跟我的圖面再一起，自己獨立」): every batch of every drawing; tap one to open its drawing with that batch on the camera
// panel, or start a new batch by choosing a drawing first.
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/translations";
import { listBatches } from "./batchStore";
import type { CameraBatch } from "./types";
import "./camera.css";

export function CameraHome({ onPick, onNew, onClose, message }: {
  onPick(batch: CameraBatch): void;
  onNew(): void;
  onClose(): void;
  /** why the last pick could not open (its drawing is no longer in 我的圖面) */
  message?: string;
}) {
  const { t } = useI18n();
  const [batches, setBatches] = useState<CameraBatch[] | null>(null);
  useEffect(() => { void listBatches().then(setBatches).catch(() => setBatches([])); }, []);
  const day = (ms: number) => { const d = new Date(ms); return `${d.getFullYear() - 1911}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
  return (
    <section className="camera-home" role="dialog" aria-modal="true" aria-label={t("camera.homeTitle")}>
      <header className="camera-home-head">
        <h2>{t("camera.homeTitle")}</h2>
        <button type="button" className="camera-x" aria-label={t("camera.close")} title={t("camera.close")} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div className="camera-home-body">
        <button type="button" className="camera-primary camera-home-new" onClick={onNew}>{t("camera.homeNew")}</button>
        {message ? <p className="camera-message camera-message-box" role="alert" title={message}>{message}</p> : null}
        {batches === null ? null : batches.length ? (
          <ul className="camera-batches">
            {batches.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => onPick(b)}>
                  <strong>{b.demo ? <em className="camera-demo-tag">{t("camera.demoTag")}</em> : null}{b.name || t("camera.homeUnnamed")}</strong>
                  <small>{b.drawingName.replace(/\.[^.]+$/, "")}{b.space && b.space !== "Model" ? ` · ${b.space}` : ""} · {day(b.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="camera-hint">{t("camera.homeEmpty")}</p>}
      </div>
    </section>
  );
}
