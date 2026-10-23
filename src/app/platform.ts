import { Capacitor } from "@capacitor/core";

/** True only for scripts/web-build.py output (VITE_FATCAT_WEB=1); APK builds leave it false. */
export const IS_WEB_BUILD = import.meta.env.VITE_FATCAT_WEB === "1" && !Capacitor.isNativePlatform();

/** iPhone/iPad Safari, including iPadOS that reports itself as a Mac with touch. */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Opened from the home screen icon rather than a browser tab. */
export function isStandalone(): boolean {
  return matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}
