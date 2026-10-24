// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useGloveMode } from './App';
import { DEVICE_PRESETS, PREVIEW_CHANGE, shouldHostPreview } from './devicePreview';
import { translate } from '../i18n/translations';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { vi.unstubAllGlobals(); delete document.documentElement.dataset.devicePreview; });
it('changes the existing toolbar live without remounting app state', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el);
  let mounts = 0;
  function Probe() { const glove = useGloveMode(); useEffect(() => { mounts++; }, []); return <span>{glove ? 'phone' : 'desktop'}</span>; }
  try {
    act(() => root.render(<Probe />)); expect(el.textContent).toBe('desktop');
    act(() => { document.documentElement.dataset.devicePreview = 'phone'; window.dispatchEvent(new Event(PREVIEW_CHANGE)); });
    expect(el.textContent).toBe('phone');
    act(() => { document.documentElement.dataset.devicePreview = 'desktop'; window.dispatchEvent(new Event(PREVIEW_CHANGE)); });
    expect(el.textContent).toBe('desktop'); expect(mounts).toBe(1);
  } finally { act(() => root.unmount()); el.remove(); }
});
it('keeps native and phone browsers outside the desktop host', () => {
  expect(shouldHostPreview(true)).toBe(false);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('navigator', {userAgent:'Mozilla/5.0 (iPhone)'});
  expect(shouldHostPreview(false)).toBe(false);
});
it('offers six unique fixed sizes with bilingual shell text', () => {
  expect(DEVICE_PRESETS.length).toBe(6);
  expect(new Set(DEVICE_PRESETS.map(p => p.id)).size).toBe(6);
  for (const key of ['preview.label','preview.desktop','preview.note','preview.frame'] as const) {
    expect(translate('zh-TW',key).length).toBeGreaterThan(0);
    expect(translate('en',key)).not.toBe(translate('zh-TW',key));
  }
});
