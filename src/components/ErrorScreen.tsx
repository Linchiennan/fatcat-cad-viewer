// Error screen (T20 2.4) and the shared "!" mark. Owner: P4 group D.
import type { AppError } from "../types/errors";
import { useI18n } from "../i18n/translations";
import { errorReasonKey } from "../app/shellText";
import { SlimTopBar } from "../app/LangSwitch";
import { FolderCheckIcon } from "./Icons";

export function ErrorMark() {
  const { t } = useI18n();
  return <div className="error-mark" role="img" aria-label={t("error.markLabel")}>!</div>;
}

export function ErrorScreen({ error, onLibrary, onRetry, onBack }: {
  error: AppError;
  onLibrary(): void;
  /** Only when the last drawing is remembered. */
  onRetry?(): void;
  onBack?(): void;
}) {
  const { t } = useI18n();
  const d = error.diagnostics;
  return (
    <div className="error-page">
      <SlimTopBar />
      <section className="error-body" aria-labelledby="error-title">
        <ErrorMark />
        <p className="eyebrow">{t("error.brand")}</p>
        <h1 id="error-title" className="error-title">{t("error.title")}</h1>
        <p className="error-reason">{t(errorReasonKey(error))}</p>
        {d ? (
          <dl className="error-diag" aria-label={t("error.diagLabel")}>
            <dt>{t("error.diag.dwgVersion")}</dt><dd>{d.version}</dd>
            {d.engineCode ? <><dt>{t("error.diag.engineCode")}</dt><dd>{d.engineCode}</dd></> : null}
          </dl>
        ) : null}
        <button type="button" className="primary-btn" onClick={onLibrary}><FolderCheckIcon />{t("home.myDrawings")}</button>
        {onRetry ? <button type="button" className="secondary-btn" onClick={onRetry}>{t("action.retry")}</button> : null}
        {onBack ? <button type="button" className="secondary-btn" onClick={onBack}>{t("action.back")}</button> : null}
      </section>
    </div>
  );
}
