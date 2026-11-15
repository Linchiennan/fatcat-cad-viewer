// A phone held sideways gets a full-screen "turn it upright" notice: on a phone the sideways layout leaves almost no
// room for the drawing and the panels (用戶 2026-11-15：只有電腦網頁、平板網頁或 APP 能用橫向，手機橫向超難用).
// The app locks phones to portrait natively (MainActivity); a browser cannot lock, so the web shows this instead.
// Phone = touch screen whose shorter side is under 600 px (tablets are 600 or more, like Android's sw600dp).
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/translations";

export type ScreenInfo = { coarse: boolean; screenW: number; screenH: number; orientation?: string; innerW: number; innerH: number };

export function isPhoneSideways(s: ScreenInfo): boolean {
  if (!s.coarse || Math.min(s.screenW, s.screenH) >= 600) return false;
  // the device orientation, not the window shape: a phone in split screen is not "sideways"
  if (s.orientation) return s.orientation.startsWith("landscape");
  return s.screenW > s.screenH;
}

const read = (): ScreenInfo => ({
  coarse: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
  screenW: screen.width, screenH: screen.height, orientation: screen.orientation?.type,
  innerW: innerWidth, innerH: innerHeight,
});

export function RotateNotice() {
  const { t } = useI18n();
  const [sideways, setSideways] = useState(() => isPhoneSideways(read()));
  useEffect(() => {
    const update = () => setSideways(isPhoneSideways(read()));
    addEventListener("resize", update);
    screen.orientation?.addEventListener?.("change", update);
    return () => { removeEventListener("resize", update); screen.orientation?.removeEventListener?.("change", update); };
  }, []);
  if (!sideways) return null;
  return (
    <div className="rotate-notice" role="alertdialog" aria-modal="true" aria-label={t("rotate.title")}>
      <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="20" y="8" width="24" height="44" rx="4" />
        <path d="M29 46h6" />
        <path d="M10 30a22 22 0 0 1 8-15" /><path d="M10 22v8h8" />
      </svg>
      <strong>{t("rotate.title")}</strong>
      <span>{t("rotate.body")}</span>
    </div>
  );
}
