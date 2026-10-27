// 圖層狀態管理員, as in CAD: every layer state saved in the drawing with whether it is the same as the layers now;
// tap one to select it, tap it twice (or 還原) to restore it and close (用戶 2026-10-27：跟 CAD 一樣，點兩下切換).
import { useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/translations";
import { layerStateDiff, type CadLayerState } from "../viewer/layerStateTable";

/** Two taps on the same row within this many ms restore it (touch screens give no reliable dblclick). */
export const DOUBLE_TAP_MS = 450;

export function LayerStateManager({ states, layers, chosen, onRestore, onClose }: {
  states: readonly CadLayerState[];
  layers: readonly { name: string; visible: boolean; color: number }[];
  chosen: string | null;
  onRestore(name: string): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  // Like CAD: the last restored state is selected, else the one the current layers match, else the first.
  const [selected, setSelected] = useState<string | null>(chosen ?? states.find((s) => layerStateDiff(s, layers).length === 0)?.name ?? states[0]?.name ?? null);
  const lastTap = useRef<{ name: string; at: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  // Phone browsers hide scroll bars: say the list scrolls, and bring the selected state into view on opening.
  useLayoutEffect(() => {
    const el = list.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, []);
  // Centred after the "可上下拉動" line is in (it makes the list shorter; centring before it left the row half hidden).
  useLayoutEffect(() => {
    const el = list.current, row = el?.querySelector<HTMLElement>("tr[aria-selected=\"true\"]");
    if (el && row) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - (el.clientHeight - row.offsetHeight) / 2;
  }, [overflows]);
  const restore = (name: string) => { onClose(); onRestore(name); };
  const tap = (name: string) => {
    const now = Date.now(), last = lastTap.current;
    lastTap.current = { name, at: now };
    if (last && last.name === name && now - last.at <= DOUBLE_TAP_MS) { lastTap.current = null; restore(name); return; }
    setSelected(name);
  };
  return (
    <div className="confirm-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={t("cad.layers.states")} className="confirm-box layer-state-manager">
        <h2>{t("cad.layers.states")}{overflows ? <small className="layer-state-more">{t("cad.layers.stateMore", { N: states.length })}</small> : null}</h2>
        {/* many states scroll here; the title and buttons stay put (用戶：狀態太多記得要卷軸拉動) */}
        <div className="layer-state-list" ref={list}>
        <table>
          <thead><tr><th>{t("cad.layers.stateName")}</th><th>{t("cad.layers.stateSame")}</th></tr></thead>
          <tbody>
            {states.map((s) => {
              const same = layerStateDiff(s, layers).length === 0;
              return (
                <tr key={s.name} aria-selected={selected === s.name} onClick={() => tap(s.name)}>
                  <td>{s.name}</td>
                  <td className={same ? "same" : "differs"}>{t(same ? "cad.layers.stateYes" : "cad.layers.stateNo")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <p>{t("cad.layers.stateHint")}</p>
        <div className="layer-state-buttons">
          <button type="button" className="close-keep" disabled={!selected} onClick={() => selected && restore(selected)}>{t("cad.layers.stateRestore")}</button>
          <button type="button" className="layer-state-close" onClick={onClose}>{t("cad.close")}</button>
        </div>
      </section>
    </div>
  );
}
