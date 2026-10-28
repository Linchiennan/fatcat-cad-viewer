// Every reference the drawing uses, references inside references included, at the top of the 外部參考 tab: green when
// applied, red when not; tap a red (or green) name to pick its file; the 載入 check box on the right turns one off
// (用戶 2026-10-28：缺的檔案全部集中列在上面，點擊開啟尋找，已套用綠色、未套用紅色).
import { useRef } from "react";
import { useI18n } from "../i18n/translations";
import type { XrefStatus } from "../viewer/xrefs";

export type XrefRow = Pick<XrefStatus, "name" | "path" | "key" | "overlay"> & { status?: string };

/** Applied = drawn from a file (loaded, picked, or found automatically). */
export const xrefApplied = (status?: string) => !!status && /^已(自動)?載入/.test(status);
/** Not drawn in CAD either: an overlay inside a reference does not carry up (11F 給水放樣: six of eleven). Gray, not missing. */
export const xrefNotNeeded = (status?: string) => !!status && status.startsWith("巢狀覆疊不傳遞");

export function XrefList({ rows, rootName, disabled, busy, onPick, onToggle }: {
  rows: readonly XrefRow[];
  /** the main drawing file name: references of other files are shown as nested in them */
  rootName: string;
  disabled: ReadonlySet<string>;
  busy: boolean;
  onPick(row: XrefRow, file: File): void;
  onToggle(row: XrefRow, on: boolean): void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<XrefRow | null>(null);
  const needed = rows.filter((r) => !xrefNotNeeded(r.status));
  const missing = needed.filter((r) => !disabled.has(r.key) && !xrefApplied(r.status)).length;
  return (
    <div className="cad-xref-list">
      <p className={"cad-xref-summary " + (missing ? "missing" : "ok")} role="status">
        {missing ? t("cad.xref.missingN", { N: missing, total: needed.length }) : t("cad.xref.allApplied", { total: needed.length })}
      </p>
      <input ref={input} type="file" accept="*/*" hidden onChange={(e) => {
        const file = e.target.files?.[0], row = target.current;
        e.target.value = "";
        if (file && row) onPick(row, file);
      }} />
      {needed.map(row)}
      {/* overlays inside references: not drawn in CAD either, folded away until tapped (用戶 2026-10-28：預設縮起來) */}
      {rows.length > needed.length ? (
        <details className="cad-xref-hidden">
          <summary>{t("cad.xref.notNeededN", { N: rows.length - needed.length })}</summary>
          {rows.filter((r) => xrefNotNeeded(r.status)).map(row)}
        </details>
      ) : null}
    </div>
  );

  function row(r: XrefRow) {
    const off = disabled.has(r.key), applied = xrefApplied(r.status), notNeeded = xrefNotNeeded(r.status);
    const parent = r.key.slice(0, r.key.lastIndexOf("|")); // keys are "parent file|reference name"
    return (
      <div className={"cad-xref-row " + (off ? "off" : applied ? "applied" : notNeeded ? "not-needed" : "missing")} key={r.key}>
        <button type="button" className="cad-xref-name" disabled={busy} title={t("cad.xref.pickOne", { name: r.name })}
          onClick={() => { target.current = r; input.current?.click(); }}>
          <strong>{r.name}</strong>
          <small>{r.path} · {r.overlay ? t("cad.xref.overlay") : t("cad.xref.attach")}</small>
          {parent && parent !== rootName ? <small className="cad-xref-nested">{t("cad.xref.nestedIn", { parent })}</small> : null}
          {r.status ? <small className="cad-xref-state">{notNeeded ? t("cad.xref.notNeeded") : r.status}</small> : null}
        </button>
        <label className="cad-xref-load">
          <input type="checkbox" checked={!off} disabled={busy} onChange={(e) => onToggle(r, e.target.checked)} />
          {t("cad.xref.load")}
        </label>
      </div>
    );
  }
}
