// Home screen (T10 2.2): brand + language, the cat card with the pink butterfly, tagline, 我的圖面,
// features, privacy line, iOS install hint, legal links and the two version lines. Owner: P4 group D.
import { Capacitor } from "@capacitor/core";
import packageInfo from "../../package.json";
import { useI18n } from "../i18n/translations";
import { FolderCheckIcon, ShieldIcon } from "../components/Icons";
import { BUILD_CODE, BUILD_ID } from "./buildIdentity";
import { IS_WEB_BUILD, isAppleMobile, isStandalone } from "./platform";
import { LangSwitch } from "./LangSwitch";
import { UiStyleSwitch } from "./uiStyle";
import { shortVersion } from "./shellText";

/** Little pink butterfly on the card's top-left; the wings flap around the body line. */
export function Butterfly() {
  return (
    <svg className="butterfly" viewBox="0 0 40 36" aria-hidden="true" focusable="false">
      <g className="wing wing-left">
        <path className="wing-upper" d="M19 16C14 6 5 2 3 7c-2 5 4 10 16 10z" />
        <path className="wing-lower" d="M19 18C11 18 6 22 8 27c2 4 8 2 11-8z" />
        <circle className="wing-dot" cx="9" cy="9" r="1.6" />
      </g>
      <g className="wing wing-right">
        <path className="wing-upper" d="M21 16C26 6 35 2 37 7c2 5-4 10-16 10z" />
        <path className="wing-lower" d="M21 18C29 18 34 22 32 27c-2 4-8 2-11-8z" />
        <circle className="wing-dot" cx="31" cy="9" r="1.6" />
      </g>
      <path className="body" d="M20 11v17" />
      <path className="feelers" d="M20 11c-1-4-3-6-5-7M20 11c1-4 3-6 5-7" />
    </svg>
  );
}

export function versionLine(t: ReturnType<typeof useI18n>["t"], native: boolean): string {
  const platform = native ? t("home.platformApk", { "建置序號": BUILD_CODE }) : t("home.platformWeb");
  return `${t("home.version")} ${shortVersion(packageInfo.version)} · ${platform}`;
}

export function HomeScreen({ onLibrary, onLegal }: { onLibrary(): void; onLegal?(kind: "privacy" | "source"): void }) {
  const { t, locale } = useI18n();
  const native = Capacitor.isNativePlatform();
  const showInstallHint = IS_WEB_BUILD && isAppleMobile() && !isStandalone();
  return (
    <div className="home-page">
      <header className="home-top">
        <strong className="brand">{t("home.brand")}</strong>
        <div className="home-switches"><UiStyleSwitch /><LangSwitch /></div>
      </header>
      <main className="home-main">
        <div className="home-art">
          <div className="brand-card">
            <img src="./brand-cat.png" alt={t("home.iconAlt")} width={512} height={512} decoding="async" />
            <Butterfly />
          </div>
        </div>
        <div className="home-text">
          <p className="eyebrow">{t("home.eyebrow")}</p>
          <h1 className="home-title" aria-label={t("home.tagline")}>
            <span aria-hidden="true">{t("home.titleLine1")}</span>
            <span aria-hidden="true">{t("home.titleLine2")}</span>
          </h1>
          <p className="home-lead">{t("home.lead")}</p>
          <button type="button" className="primary-btn home-library" onClick={onLibrary}>
            <FolderCheckIcon />{t("home.myDrawings")}
          </button>
          <ul className="home-features" aria-label={t("home.featuresLabel")}>
            <li><span className="feature-dot" aria-hidden="true" />{t("home.formats")}</li>
            <li><ShieldIcon className="feature-icon" />{IS_WEB_BUILD ? (locale === 'en' ? 'Local drawings · online access check' : '圖檔本機處理 · 授權需連線') : t("home.offline")}</li>
          </ul>
          <p className="home-no3d">{t("home.no3d")}</p>
          <p className="home-privacy">{IS_WEB_BUILD ? (locale === 'en' ? 'Google sign-in and allowlist required. Basic usage analytics only after access is granted; no drawing or annotation uploads.' : 'Google 登入與白名單驗證；授權後啟用基本使用統計，不上傳圖檔或註記。') : t("home.privacy")}</p>
          {showInstallHint ? <p className="home-install">{t("home.installHintIos")}</p> : null}
          <nav className="home-legal" aria-label={t("home.legalLabel")}>
            <button type="button" className="home-link" onClick={() => onLegal?.("privacy")}>{t("home.privacyLink")}</button>
            <span aria-hidden="true">•</span>
            <button type="button" className="home-link" onClick={() => onLegal?.("source")}>{t("home.sourceLink")}</button>
          </nav>
          <p className="home-version">
            <span>{versionLine(t, native)}</span>
            <span>{t("home.build", { "識別碼": BUILD_ID })}</span>
            <span>{t("legal.copyright")}</span>
          </p>
        </div>
      </main>
    </div>
  );
}
