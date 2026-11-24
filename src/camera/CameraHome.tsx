// 工程相機 as its own entry on the home page (用戶 2026-11-23：「首頁我的圖面拆分成兩個我的圖面跟工程相機。工程相機不要再
// 跟我的圖面再一起，自己獨立」): every batch of every drawing; tap one to open its drawing with that batch on the camera
// panel, or start a new batch by choosing a drawing first.
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog, type ConfirmRequest } from "../components/ConfirmDialog";
import { useI18n } from "../i18n/translations";
import { deleteBatch, listBatches, listPhotos, updateBatch } from "./batchStore";
import type { CameraBatch } from "./types";
import "./camera.css";

export function CameraHome({ onPick, onNew, onCopy, onClose, message }: {
  onPick(batch: CameraBatch): void;
  /** 複製到另一張圖: pick the drawing next, the spots follow (用戶 2026-11-24) */
  onCopy?(batch: CameraBatch): void;
  onNew(): void;
  onClose(): void;
  /** why the last pick could not open (its drawing is no longer in 我的圖面) */
  message?: string;
}) {
  const { t } = useI18n();
  const [batches, setBatches] = useState<CameraBatch[] | null>(null);
  const reload = () => listBatches().then(setBatches).catch(() => setBatches([]));
  useEffect(() => { void reload(); }, []);
  // hold a project for its menu, delete among it (用戶 2026-11-23：「按住專案不放，出現刪除的選項」); the demo is never
  // deleted (「範例都不讓刪除」)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [note, setNote] = useState("");
  const hold = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  // hold → a menu: 修改名稱 or 刪除專案 (用戶 2026-11-23：「長按這個專案，新增修改名稱」)
  const [menu, setMenu] = useState<CameraBatch | null>(null);
  const [renaming, setRenaming] = useState<{ batch: CameraBatch; name: string } | null>(null);
  const saveName = (b: CameraBatch, name: string) => {
    const v = name.trim();
    setRenaming(null);
    if (!v || v === b.name) return;
    void updateBatch(b.id, { name: v, nameEdited: true }).then(() => { setNote(t("camera.renamed", { name: v })); return reload(); }).catch(() => {});
  };
  const askDelete = async (b: CameraBatch) => {
    if (b.demo) { setNote(t("camera.demoKept")); return; }
    setNote("");
    const photos = (await listPhotos(b.id).catch(() => [])).length;
    setConfirm({ message: t("camera.deleteBatchAsk", { name: b.name || t("camera.homeUnnamed"), photos }), okLabel: t("camera.deleteBatch"),
      onOk: () => void deleteBatch(b.id).then(() => { setNote(t("camera.deletedBatch", { name: b.name })); return reload(); }).catch(() => setNote(t("camera.demoKept"))) });
  };
  const down = (b: CameraBatch, e: React.PointerEvent) => {
    const timer = window.setTimeout(() => { if (hold.current) hold.current.fired = true; setNote(""); setMenu(b); }, HOLD_MS);
    hold.current = { timer, x: e.clientX, y: e.clientY, fired: false };
  };
  const move = (e: React.PointerEvent) => {
    const h = hold.current;
    if (h && !h.fired && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) { window.clearTimeout(h.timer); hold.current = null; }
  };
  const up = () => { const h = hold.current; if (h && !h.fired) { window.clearTimeout(h.timer); hold.current = null; } };
  // the tap that ends a hold does not open the project
  const pick = (b: CameraBatch) => { if (hold.current?.fired) { hold.current = null; return; } onPick(b); };
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
        {/* before a drawing is picked: label rooms and the floor on it first (用戶 2026-11-23：「底圖上要先有各空間名稱跟樓層名稱才方便辨識」
            「放在首頁，上方提示，用紅字粗體明顯」) */}
        <p className="camera-home-tip">{t("camera.homeDrawingTip")}</p>
        {/* how to take a floor's spots to the next floor (用戶 2026-11-24：「你首頁記得寫說明」) */}
        {onCopy ? <p className="camera-home-copy-tip">{t("camera.homeCopyTip")}</p> : null}
        {/* the whole flow in five steps and every long press (用戶 2026-11-24：首頁加使用說明) */}
        <details className="camera-home-guide">
          <summary>{t("camera.guide")}</summary>
          <ol>{(["camera.guide.1", "camera.guide.2", "camera.guide.3", "camera.guide.4", "camera.guide.5"] as const).map((k) => <li key={k}>{t(k)}</li>)}</ol>
          <p className="camera-home-guide-hold">{t("camera.guide.hold")}</p>
        </details>
        <button type="button" className="camera-primary camera-home-new" onClick={onNew}>{t("camera.homeNew")}</button>
        {message || note ? <p className="camera-message camera-message-box" role="alert" title={message || note}>{message || note}</p> : null}
        {batches === null ? null : batches.length ? (
          <ul className="camera-batches">
            {batches.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => pick(b)} onPointerDown={(e) => down(b, e)} onPointerMove={move} onPointerUp={up}
                  onPointerCancel={up} onPointerLeave={up} onContextMenu={(e) => e.preventDefault()}>
                  <strong>{b.demo ? <em className="camera-demo-tag">{t("camera.demoTag")}</em> : null}{b.name || t("camera.homeUnnamed")}</strong>
                  <small>{b.drawingName.replace(/\.[^.]+$/, "")}{b.space && b.space !== "Model" ? ` · ${/^PDF p\.(\d+)$/.test(b.space) ? t("camera.pdfPage", { n: b.space.slice(6) }) : b.space}` : ""} · {day(b.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="camera-hint">{t("camera.homeEmpty")}</p>}
      </div>
      {/* the backdrop does not close the menu: the finger lifting off the long press lands there and closed it at once */}
      {menu ? (
        <div className="confirm-backdrop">
          <section role="dialog" aria-modal="true" aria-label={menu.name} className="confirm-box camera-home-menu" onClick={(e) => e.stopPropagation()}>
            <h2>{menu.name || t("camera.homeUnnamed")}</h2>
            <div className="camera-home-menu-choices">
              <button type="button" className="close-keep" onClick={() => { const b = menu; setMenu(null); setRenaming({ batch: b, name: b.name }); }}>{t("camera.renameBatch")}</button>
              {onCopy ? <button type="button" className="close-keep camera-home-copy" onClick={() => { const b = menu; setMenu(null); onCopy(b); }}>{t("camera.copyToDrawing")}</button> : null}
              <button type="button" className="close-go" onClick={() => { const b = menu; setMenu(null); void askDelete(b); }}>{t("camera.deleteBatch")}</button>
              <button type="button" className="camera-home-menu-cancel" onClick={() => setMenu(null)}>{t("confirm.cancel")}</button>
            </div>
          </section>
        </div>
      ) : null}
      {renaming ? (
        <div className="confirm-backdrop">
          <form role="dialog" aria-modal="true" aria-label={t("camera.renameBatch")} className="confirm-box camera-home-menu" onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); saveName(renaming.batch, renaming.name); }}>
            <h2>{t("camera.renameBatch")}</h2>
            <input className="camera-home-name" autoFocus value={renaming.name} aria-label={t("camera.renameBatch")} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
            <div className="camera-home-menu-choices">
              <button type="submit" className="close-keep" disabled={!renaming.name.trim()}>{t("camera.renameSave")}</button>
              <button type="button" className="camera-home-menu-cancel" onClick={() => setRenaming(null)}>{t("confirm.cancel")}</button>
            </div>
          </form>
        </div>
      ) : null}
      {confirm ? <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} /> : null}
    </section>
  );
}

/** how long a press on a project is held before 刪除 is offered */
const HOLD_MS = 550;
