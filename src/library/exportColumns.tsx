// How many export cards sit in one row of 歷史輸出 (用戶 2026-10-29：X 左邊可切換每排 2～5 張). One setting for this
// device; the button cycles 2 → 3 → 4 → 5 → 2 and draws as many little cards as the rows will hold.
import { useSyncExternalStore } from "react";

export const EXPORT_COLUMN_CHOICES = [2, 3, 4, 5] as const;
export const DEFAULT_EXPORT_COLUMNS = 4; // 用戶 2026-10-29：預設每排 4 張
const KEY = "fatcat:export-columns";

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return (EXPORT_COLUMN_CHOICES as readonly number[]).includes(v) ? v : DEFAULT_EXPORT_COLUMNS;
  } catch { return DEFAULT_EXPORT_COLUMNS; }
}

let current: number | null = null;
const listeners = new Set<() => void>();

export function setExportColumns(n: number): void {
  current = n;
  try { localStorage.setItem(KEY, String(n)); } catch { /* Private mode: lasts for this visit. */ }
  listeners.forEach((l) => l());
}

/** The next choice after n, wrapping from 5 back to 2. */
export const nextExportColumns = (n: number): number => EXPORT_COLUMN_CHOICES[(EXPORT_COLUMN_CHOICES.indexOf(n as 2) + 1) % EXPORT_COLUMN_CHOICES.length];

export function useExportColumns(): number {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => (current ??= load()),
    () => (current ??= load()),
  );
}

/** n small cards side by side (2 … 5), the picture on the switch. */
export function ColumnsIcon({ n }: { n: number }) {
  const gap = 1.5, w = (20 - gap * (n - 1)) / n;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <rect key={i} x={2 + i * (w + gap)} y={5} width={w} height={14} rx={1.2} fill="none" stroke="currentColor" strokeWidth={1.6} />)}
    </svg>
  );
}

/** The switch in the 歷史輸出 title bar, left of the close button. */
export function ExportColumnsButton({ en, disabled }: { en: boolean; disabled?: boolean }) {
  const n = useExportColumns(), next = nextExportColumns(n);
  const label = en ? `${n} per row` : `每排 ${n} 張`;
  const tip = en ? `Cards per row: ${n}. Tap to show ${next} per row (2 to 5).` : `每排張數：目前 ${n} 張。點一下改成每排 ${next} 張（2～5 張輪流切換）。`;
  return (
    <button type="button" className="lib-icon-btn lib-columns-btn" aria-label={label} title={tip} disabled={disabled} onClick={() => setExportColumns(next)}>
      <ColumnsIcon n={n} /><span aria-hidden="true">{n}</span>
    </button>
  );
}
