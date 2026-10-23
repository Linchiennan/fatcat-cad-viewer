// Last line of defence (T20 2.5): any render error, including a failed download of a lazily loaded part,
// replaces the App with this recovery screen. 重試 (or Back) reloads the page. Owner: P4 group D.
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../i18n/translations";
import { diagnosticError, recordDiagnostic } from "../viewer/parseAudit";
import { registerBackHandler } from "../app/backDispatch";
import { ErrorMark } from "./ErrorScreen";

function reload() {
  window.location.reload();
}

export function RecoveryScreen() {
  const { t } = useI18n();
  useEffect(() => registerBackHandler(reload, { nested: true }), []);
  return (
    <section className="error-page recovery" role="alert">
      <div className="error-body">
        <ErrorMark />
        <p className="eyebrow">{t("error.brand")}</p>
        <h1 className="error-title">{t("error.title")}</h1>
        <p className="error-reason">{t("error.render")}</p>
        <button type="button" className="primary-btn" onClick={reload}>{t("action.retry")}</button>
      </div>
    </section>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    recordDiagnostic("ui.render-error", { ...diagnosticError(error), componentStack: info.componentStack ?? "" }, true);
  }

  render(): ReactNode {
    return this.state.failed ? <RecoveryScreen /> : this.props.children;
  }
}
