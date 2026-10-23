import { useEffect, useMemo, useRef, useState } from "react";
import { IconTile } from "./IconTile";
import { ArrowLeftIcon, ChevronRightIcon, CloseIcon } from "./Icons";
import type { MeasurableEntity } from "../viewer/measurementGeometry";
import { searchTexts, type TextHit } from "../viewer/textSearch";
import { useI18n } from "../i18n/translations";

/** Text search on the current sheet: title and box stay put, only the result list scrolls. */
export function SearchPanel({ entities, limited, initialQuery, onPick, onClose }: {
  entities: readonly MeasurableEntity[];
  limited: boolean;
  initialQuery: string;
  onPick(hits: TextHit[], index: number, query: string): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 200); return () => clearTimeout(t); }, [query]);
  const hits = useMemo(() => searchTexts(entities, debounced), [entities, debounced]);
  const searchable = useMemo(() => entities.some((e) => typeof e.properties?.text === "string"), [entities]);

  return (
    <section className="search-sheet" role="dialog" aria-label={t("search.title")}>
      <header><strong>{t("search.title")}</strong><IconTile name={t("search.close")} label={t("search.closeShort")} tip={t("search.closeTip")} onClick={onClose}><CloseIcon /></IconTile></header>
      <div className="search-box">
        <input ref={input} type="search" value={query} placeholder={t("search.placeholder")} aria-label={t("search.title")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && hits.length) onPick(hits, 0, query); }} />
        <p className="search-count" role="status">
          {!debounced.trim() ? t("search.scope") : hits.length ? t("search.found", { N: `${hits.length}${hits.length >= 500 ? "+" : ""}` }) : t("search.none")}
        </p>
        {!searchable ? <p className="search-warn">{t("search.noText")}</p> : null}
        {limited ? <p className="search-warn">{t("search.limited")}</p> : null}
      </div>
      <ol className="search-results">
        {hits.map((h, i) => (
          <li key={i}><button type="button" onClick={() => onPick(hits, i, query)}>
            <span className="search-text">{h.text}</span>
            <span className="search-layer">{t("search.layer", { name: h.layer || "0" })}</span>
          </button></li>
        ))}
      </ol>
    </section>
  );
}

/** Thin bar under the top strip to step through hits after the panel closes. */
export function SearchStepper({ query, index, total, onStep, onOpen, onClose }: {
  query: string; index: number; total: number;
  onStep(delta: number): void; onOpen(): void; onClose(): void;
}) {
  const { t } = useI18n();
  return (
    <div className="search-stepper" role="group" aria-label={t("search.results")}>
      <IconTile name={t("search.prev")} label={t("search.prevShort")} tip={t("search.prevTip")} disabled={total < 2} onClick={() => onStep(-1)}><ArrowLeftIcon /></IconTile>
      <button type="button" className="search-stepper-label" onClick={onOpen}>{t("search.stepLabel", { query, i: index + 1, N: total })}</button>
      <IconTile name={t("search.next")} label={t("search.nextShort")} tip={t("search.nextTip")} disabled={total < 2} onClick={() => onStep(1)}><ChevronRightIcon /></IconTile>
      <IconTile name={t("search.end")} label={t("search.endShort")} tip={t("search.endTip")} onClick={onClose}><CloseIcon /></IconTile>
    </div>
  );
}
