// @vitest-environment jsdom
// 訪客試用（用戶 2026-10-29）：只開示範圖、記憶體儲存關分頁即清空、不能挑自己的檔、登入畫面有入口、上方有橫幅.
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate';
import { GuestShell } from './GuestShell';
import { AccessController, type AccessBackend } from './accessController';
import { I18nProvider } from '../i18n/translations';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('guest storage', () => {
  it('keeps only language and style, stores nothing in the real storage and blocks picking files', async () => {
    const realLocal = window.localStorage, realIdb = window.indexedDB;
    realLocal.setItem('fatcat.locale', 'en');
    realLocal.setItem('fatcat-ui-style', 'simple');
    realLocal.setItem('fatcat:marks:owner-drawing', '[1,2,3]');
    const { installGuestStorage } = await import('./guestStorage');
    installGuestStorage();
    try {
      expect(localStorage).not.toBe(realLocal);
      expect(localStorage.getItem('fatcat.locale')).toBe('en');
      expect(localStorage.getItem('fatcat-ui-style')).toBe('simple');
      expect(localStorage.getItem('fatcat:marks:owner-drawing')).toBeNull();
      localStorage.setItem('fatcat:marks:demo', 'x');
      expect(realLocal.getItem('fatcat:marks:demo')).toBeNull();
      expect(indexedDB).not.toBe(realIdb);
      const input = document.createElement('input'); input.type = 'file'; document.body.append(input);
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      input.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect((window as { showDirectoryPicker?: unknown }).showDirectoryPicker).toBeUndefined();
      input.remove();
    } finally {
      Object.defineProperty(window, 'localStorage', { value: realLocal, configurable: true, writable: true });
      Object.defineProperty(window, 'indexedDB', { value: realIdb, configurable: true, writable: true });
      realLocal.clear();
    }
  });
});

describe('guest entry and banner', () => {
  it('offers 訪客試用 on the sign-in page and calls it', async () => {
    const backend: AccessBackend = { observe: fn => { queueMicrotask(() => fn(null)); return () => {}; }, verify: async () => ({ exists: false, server: true }), watch: () => () => {}, signIn: async () => {}, signOut: async () => {} };
    const data = new Map<string, string>();
    const controller = new AccessController(backend, { storage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } } });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    const onGuest = vi.fn();
    await act(async () => root.render(<I18nProvider><AuthGate controller={controller} onGuest={onGuest}><div>NEVER_MOUNT</div></AuthGate></I18nProvider>));
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === '繁中')!.click());
    const guest = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '訪客試用（只看示範圖）');
    expect(guest).toBeTruthy();
    await act(async () => guest!.click());
    expect(onGuest).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("NEVER_MOUNT");
    await act(async () => root.unmount()); host.remove();
  });

  it('shows the guest bar with a sign-in button above the app', async () => {
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<I18nProvider><GuestShell><div className="test-cad">CAD</div></GuestShell></I18nProvider>));
    await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === '繁中')?.click());
    expect(host.querySelector('.web-account')?.textContent).toContain('訪客試用中');
    expect(host.querySelector('.web-account')?.textContent).toContain('只能開示範圖，關閉後註記不保留');
    expect(Array.from(host.querySelectorAll('.web-account button')).map(b => b.textContent)).toEqual(['登入']);
    expect(host.querySelector('.web-cad .test-cad')).not.toBeNull();
    expect(host.querySelector('iframe')).toBeNull();
    await act(async () => root.unmount()); host.remove();
  });
});
