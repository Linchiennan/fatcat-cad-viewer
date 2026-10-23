import { useI18n } from "../i18n/translations";

/**
 * In-app yes/no question. The browser's own confirm() is blocked or auto-cancelled in some embedded
 * browsers and app webviews, which made 清除 look dead; this one always shows, with the two answers
 * stacked far apart for gloved hands.
 */
export type ConfirmRequest = { message: string; okLabel: string; onOk(): void };

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose(): void }) {
  const { t } = useI18n();
  return (
    <div className="confirm-backdrop" onClick={(e) => e.stopPropagation()}>
      <section role="alertdialog" aria-modal="true" aria-label={request.message} className="confirm-box">
        <h2>{request.message}</h2>
        <div className="close-choices">
          <button type="button" className="close-keep" autoFocus onClick={onClose}>{t("confirm.cancel")}</button>
          <button type="button" className="close-go" onClick={() => { onClose(); request.onOk(); }}>{request.okLabel}</button>
        </div>
      </section>
    </div>
  );
}
