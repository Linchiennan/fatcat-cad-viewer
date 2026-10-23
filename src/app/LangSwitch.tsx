// 繁中 ｜ EN pill (T10 2.2-1, T19 2-1): the two labels never change; the current one is orange and pressed.
import { useI18n, type Locale } from "../i18n/translations";

export function LangSwitch() {
  const { locale, setLocale, t } = useI18n();
  const item = (value: Locale, label: string) => (
    <button type="button" className={`lang-item${locale === value ? " is-on" : ""}`} aria-pressed={locale === value} onClick={() => setLocale(value)}>
      {label}
    </button>
  );
  return (
    <div className="lang-switch" role="group" aria-label={t("lang.groupLabel")}>
      {item("zh-TW", t("lang.zh"))}
      <span className="lang-sep" aria-hidden="true" />
      {item("en", t("lang.en"))}
    </div>
  );
}

/** Slim top bar of the error screen: brand on the left, language on the right. */
export function SlimTopBar() {
  const { t } = useI18n();
  return (
    <header className="slim-top">
      <strong className="brand">{t("error.brand")}</strong>
      <LangSwitch />
    </header>
  );
}
