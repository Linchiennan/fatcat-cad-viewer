// Layout presets only: Playwright v1.51.1 deviceDescriptorsSource.json screen,
// falling back to viewport when screen is absent. Never alter UA, DPR or rendering engine.
// `chrome`: the user's own phone (用戶 2026-10-27，比照山水璞苑B23 測試台): the screen also shows Android's status bar,
// Brave's title/address bar and Brave's + Android's bottom bars, so the page gets the height it really has there.
export const PHONE_BARS = { status: 40, browserTop: 59, browserBottom: 55, system: 53 } as const;
export const barsHeight = () => PHONE_BARS.status + PHONE_BARS.browserTop + PHONE_BARS.browserBottom + PHONE_BARS.system;
export const DEVICE_PRESETS = [
  { id: 'zenfone-11-ultra', name: 'ASUS Zenfone 11 Ultra（系統列＋Brave）', width: 412, height: 915, chrome: true },
  { id: 'iphone-se', name: 'iPhone SE', width: 320, height: 568 },
  { id: 'iphone-13', name: 'iPhone 13', width: 390, height: 844 },
  { id: 'iphone-13-max', name: 'iPhone 13 Pro Max', width: 428, height: 926 },
  { id: 'pixel-2', name: 'Android · Pixel 2', width: 411, height: 731 },
  { id: 'pixel-5', name: 'Android · Pixel 5', width: 393, height: 851 },
  { id: 'pixel-7', name: 'Android · Pixel 7', width: 412, height: 915 },
] as const;
export const PREVIEW_CHANGE = 'fatcat-device-preview-change';
export const phonePreview = () => typeof document !== 'undefined' && document.documentElement.dataset.devicePreview === 'phone';

/** Decide once at entry, not on resize: narrow desktop windows retain the exit control. */
export function shouldHostPreview(native: boolean): boolean {
  if (native || typeof window === 'undefined' || window.self !== window.top) return false;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return false;
  return window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
}
