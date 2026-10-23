// In-app privacy / license page and source code page (P6). Full screen, fixed title bar, only the content
// scrolls, ✕ at the top right, Back / Esc closes (a license text opened inside goes back to the list first).
// Loaded lazily from the home screen. Owner: P4 group D.
import { useEffect, useState } from "react";
import nativePrivacyPolicy from "../../PRIVACY_POLICY.md?raw";
import webPrivacyPolicy from "../../WEB_PRIVACY.md?raw";
const privacyPolicy = import.meta.env.VITE_FATCAT_WEB === '1' ? webPrivacyPolicy : nativePrivacyPolicy;
import { useI18n, type TranslationKey } from "../i18n/translations";
import { CloseIcon, ArrowLeftIcon } from "../components/Icons";
import { registerBackHandler } from "./backDispatch";
import { boldParts, markdownBlocks, markdownSection, THIRD_PARTY } from "./legalText";

export type LegalKind = "privacy" | "source";

// License texts are loaded only when opened (each one its own small chunk, cached offline with the app).
const licenseTexts = import.meta.glob<string>("../../licenses/*.txt", { query: "?raw", import: "default" });
const gplText = () => import("../../LICENSE?raw").then((m) => m.default as string);
const textLoader = (file: string) => (file === "LICENSE" ? gplText : licenseTexts[`../../licenses/${file}`]);

function Rich({ text }: { text: string }) {
  return <>{boldParts(text).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>))}</>;
}

function LicenseText({ file }: { file: string }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const load = textLoader(file);
    if (!load) { setFailed(true); return; }
    load().then((s) => { if (live) setText(s); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [file]);
  if (failed) return <p className="legal-note">{t("legal.loadFailed")}</p>;
  return text === null ? <p className="legal-note">{t("legal.loading")}</p> : <pre className="legal-text">{text}</pre>;
}

function LicenseLink({ file, label, onOpen }: { file: string; label?: string; onOpen(file: string): void }) {
  return <button type="button" className="legal-link" onClick={() => onOpen(file)}>{label ?? file.replace(/\.txt$/, "")}</button>;
}

function PrivacyBody({ onOpen }: { onOpen(file: string): void }) {
  const { t, locale } = useI18n();
  const blocks = markdownBlocks(markdownSection(privacyPolicy, locale === "en" ? "English" : "繁體中文"));
  const texts = [...new Set(THIRD_PARTY.flatMap((c) => c.texts))];
  return (
    <>
      <h2>{t("legal.privacyHeading")}</h2>
      {blocks.map((b, i) => b.kind === "p"
        ? <p key={i}><Rich text={b.text} /></p>
        : <ul key={i}>{b.items.map((item, j) => <li key={j}><Rich text={item} /></li>)}</ul>)}
      <h2>{t("legal.noticeHeading")}</h2>
      <p className="legal-copyright">{t("legal.copyright")}</p>
      {(["legal.notice1", "legal.notice2", "legal.notice3", "legal.notice4"] as TranslationKey[]).map((k) => <p key={k}>{t(k)}</p>)}
      <p><LicenseLink file="LICENSE" label={t("legal.gplFull")} onOpen={onOpen} /></p>
      <h2>{t("legal.thirdHeading")}</h2>
      <p>{t("legal.thirdIntro")}</p>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead><tr><th>{t("legal.col.component")}</th><th>{t("legal.col.version")}</th><th>{t("legal.col.use")}</th><th>{t("legal.col.license")}</th></tr></thead>
          <tbody>
            {THIRD_PARTY.map((c) => (
              <tr key={c.name + c.version}>
                <td>{c.name}</td><td>{c.version}</td><td>{t(c.use)}</td>
                <td>{c.texts.length === 1 ? <LicenseLink file={c.texts[0]} label={c.license} onOpen={onOpen} /> : c.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>{t("legal.textsHeading")}</h2>
      <ul className="legal-files">{texts.map((f) => <li key={f}><LicenseLink file={f} onOpen={onOpen} /></li>)}</ul>
    </>
  );
}

function SourceBody({ onOpen }: { onOpen(file: string): void }) {
  const { t } = useI18n();
  return (
    <>
      <p className="legal-copyright">{t("legal.copyright")}</p>
      <h2>{t("legal.src.gplHeading")}</h2>
      <p>{t("legal.src.gpl1")}</p>
      <p>{t("legal.src.gpl2")}</p>
      <p><LicenseLink file="LICENSE" label={t("legal.gplFull")} onOpen={onOpen} /></p>
      <h2>{t("legal.src.whereHeading")}</h2>
      <p>{import.meta.env.VITE_FATCAT_WEB === '1' ? <a href="https://github.com/Linchiennan/fatcat-cad-viewer" target="_blank" rel="noopener noreferrer">github.com/Linchiennan/fatcat-cad-viewer</a> : t("legal.src.where")}</p>
      <h2>{t("legal.src.mplHeading")}</h2>
      <p>{t("legal.src.mpl")}</p>
      <p><LicenseLink file="dxf-viewer-MPL-2.0.txt" label={t("legal.src.mplText")} onOpen={onOpen} /></p>
    </>
  );
}

export function LegalPage({ kind, onClose }: { kind: LegalKind; onClose(): void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<string | null>(null);
  useEffect(() => registerBackHandler(() => (file ? setFile(null) : onClose()), { nested: true }), [file, onClose]);
  const title = t(kind === "privacy" ? "legal.privacyTitle" : "legal.sourceTitle");
  return (
    <section className="legal-page" role="dialog" aria-modal="true" aria-label={title}>
      <header className="legal-head">
        {file ? <button type="button" className="legal-icon" aria-label={t("legal.back")} onClick={() => setFile(null)}><ArrowLeftIcon /></button> : null}
        <h1>{file ? file.replace(/\.txt$/, "") : title}</h1>
        <button type="button" className="legal-icon" aria-label={t("legal.close")} onClick={onClose}><CloseIcon /></button>
      </header>
      <div className="legal-body">
        {file ? <LicenseText file={file} /> : kind === "privacy" ? <PrivacyBody onOpen={setFile} /> : <SourceBody onOpen={setFile} />}
      </div>
    </section>
  );
}
