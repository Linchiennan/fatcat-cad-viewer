// "Close this drawing?" confirm (T10 4.4): role alertdialog, 取消，繼續看圖 (default focus) above
// 確認關閉圖面, far apart for gloved hands; tapping the backdrop does nothing. Owner: P4 group D.
import { useI18n } from "../i18n/translations";

export function CloseDrawingDialog({ onKeep, onClose }: { onKeep(): void; onClose(): void }) {
  const { t } = useI18n();
  return (
    <div className="confirm-backdrop" onClick={(e) => e.stopPropagation()}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="close-title" aria-describedby="close-body" className="confirm-box close-box">
        <h2 id="close-title">{t("close.title")}</h2>
        <p id="close-body">{t("close.body")}</p>
        <div className="close-choices">
          <button type="button" className="close-keep" autoFocus onClick={onKeep}>{t("close.keep")}</button>
          <button type="button" className="close-go" onClick={onClose}>{t("close.go")}</button>
        </div>
      </section>
    </div>
  );
}
