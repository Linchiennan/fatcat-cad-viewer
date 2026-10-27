import { useEffect, useRef, useState } from 'react';
import { LOCALE_KEY, useI18n } from '../i18n/translations';
import { DEVICE_PRESETS, PHONE_BARS, PREVIEW_CHANGE, barsHeight } from './devicePreview';
import './devicePreview.css';

const clock = () => { const d = new Date(); return `${d.getHours() < 12 ? '上午' : '下午'}${(d.getHours() % 12) || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** One persistent browsing context, one auth gate, one CAD engine. Never change src/key on selection. */
export default function DevicePreviewHost() {
  const { t, setLocale } = useI18n();
  const [selected, setSelected] = useState('desktop');
  const [src] = useState(() => window.location.href);
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const preset = DEVICE_PRESETS.find(p => p.id === selected);
  const chrome = !!(preset && 'chrome' in preset && preset.chrome);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const [title, setTitle] = useState('');
  const [time, setTime] = useState(clock);
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
  useEffect(() => { const id = window.setInterval(() => setTime(clock()), 10000); return () => window.clearInterval(id); }, []);
  // The phone body (bezel 14 px each side) is what has to fit when the bars are shown.
  const bezel = chrome ? 28 : 0;
  const scale = preset ? Math.max(0, Math.min(1, available.width / (preset.width + bezel), available.height / (preset.height + bezel))) : 1;
  const pageHeight = preset ? preset.height - (chrome ? barsHeight() : 0) : 0;
  const notify = () => {
    const child = frame.current?.contentWindow;
    if (!child) return;
    // Same-origin only; the frame URL is our own page, never user-controlled external content.
    child.document.documentElement.dataset.devicePreview = preset ? 'phone' : 'desktop';
    child.dispatchEvent(new Event(PREVIEW_CHANGE));
    setTitle(child.document.title);
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
  // The bars are always in the tree and only hidden, so switching never moves or reloads the iframe.
  return <main className="device-preview-host">
    <header className="device-preview-bar">
      <label htmlFor="device-preview">{t('preview.label')}</label>
      <select id="device-preview" value={selected} onChange={e => setSelected(e.target.value)} aria-describedby="device-preview-note">
        <option value="desktop">{t('preview.desktop')}</option>
        {DEVICE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name} · {p.width} × {p.height} CSS px</option>)}
      </select>
      <small id="device-preview-note">{chrome && preset ? t('preview.chromeNote', { w: preset.width, h: preset.height, vh: pageHeight }) : t('preview.note')}</small>
    </header>
    <div className={`device-preview-stage${preset ? ' is-phone' : ''}${chrome ? ' has-chrome' : ''}`} ref={stage}>
      <div className="device-preview-fit" style={preset ? { width: (preset.width + bezel) * scale, height: (preset.height + bezel) * scale } : undefined}>
        <div className="device-phone" style={preset ? { width: preset.width + bezel, height: preset.height + bezel, transform: `scale(${scale})` } : undefined}>
          <div className="device-screen">
            <div className="device-status" aria-hidden="true" style={{ height: PHONE_BARS.status }}><span>{time}</span><span>VoLTE 5G ▲ 68%</span></div>
            <div className="device-browser-top" aria-hidden="true" style={{ height: PHONE_BARS.browserTop }}>
              <span className="device-icon">⌄</span><span className="device-page"><b>{title}</b><span>{src}</span></span><span className="device-icon">✕</span>
            </div>
            <iframe className="device-preview-frame" title={t('preview.frame')} src={src} ref={frame} onLoad={notify}
              allow="fullscreen; clipboard-read; clipboard-write; web-share"
              style={preset ? { width: preset.width, height: pageHeight } : undefined} />
            <div className="device-browser-bottom" aria-hidden="true" style={{ height: PHONE_BARS.browserBottom }}><span>‹</span><span>›</span><span>⟳</span><span>⤴</span><span>⋮</span></div>
            <div className="device-system" aria-hidden="true" style={{ height: PHONE_BARS.system }}><span>◁</span><span>○</span><span>□</span></div>
          </div>
        </div>
      </div>
    </div>
  </main>;
}
