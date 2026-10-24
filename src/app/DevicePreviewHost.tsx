import { useEffect, useRef, useState } from 'react';
import { LOCALE_KEY, useI18n } from '../i18n/translations';
import { DEVICE_PRESETS, PREVIEW_CHANGE } from './devicePreview';
import './devicePreview.css';

/** One persistent browsing context, one auth gate, one CAD engine. Never change src/key on selection. */
export default function DevicePreviewHost() {
  const { t, setLocale } = useI18n();
  const [selected, setSelected] = useState('desktop');
  const [src] = useState(() => window.location.href);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const preset = DEVICE_PRESETS.find(p => p.id === selected);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    // Observe the content box: padding and the wrapping toolbar are already deducted.
    const observer = new ResizeObserver(([entry]) => {
      setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scale = preset ? Math.max(0, Math.min(1, available.width / preset.width, available.height / preset.height)) : 1;
  const notify = () => {
    const child = frame.current?.contentWindow;
    if (!child) return;
    // Same-origin only; the frame URL is our own page, never user-controlled external content.
    child.document.documentElement.dataset.devicePreview = preset ? 'phone' : 'desktop';
    child.dispatchEvent(new Event(PREVIEW_CHANGE));
  };
  useEffect(() => {
    notify();
    stage.current?.scrollTo(0, 0);
  }, [selected]); // Selection only resizes; it does not remount the child.
  useEffect(() => {
    const update = (e: StorageEvent) => {
      if (e.key === LOCALE_KEY && (e.newValue === 'zh-TW' || e.newValue === 'en')) setLocale(e.newValue);
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, [setLocale]);
  return <main className="device-preview-host">
    <header className="device-preview-bar">
      <label htmlFor="device-preview">{t('preview.label')}</label>
      <select id="device-preview" value={selected} onChange={e => setSelected(e.target.value)} aria-describedby="device-preview-note">
        <option value="desktop">{t('preview.desktop')}</option>
        {DEVICE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name} · {p.width} × {p.height} CSS px</option>)}
      </select>
      <small id="device-preview-note">{t('preview.note')}</small>
    </header>
    <div className={`device-preview-stage${preset ? ' is-phone' : ''}`} ref={stage}>
      <div className="device-preview-fit" style={preset ? { width: preset.width * scale, height: preset.height * scale } : undefined}>
        <iframe className="device-preview-frame" title={t('preview.frame')} src={src} ref={frame} onLoad={notify}
          allow="fullscreen; clipboard-read; clipboard-write; web-share"
          style={preset ? { width: preset.width, height: preset.height, transform: `scale(${scale})` } : undefined} />
      </div>
    </div>
  </main>;
}
