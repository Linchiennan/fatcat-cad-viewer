import type { MeasurableEntity } from "../viewer/measurementGeometry";
import { IconTile } from "./IconTile";
import { CloseIcon, EyeOffIcon } from "./Icons";
import { plainCadText } from "../viewer/textSearch";
import { useI18n, type TranslationKey } from "../i18n/translations";

// Numbers on the card always use the zh-TW format with at most three decimals (T19 3.3-3).
const num = (v: unknown, digits = 3) => typeof v === "number" && Number.isFinite(v) ? new Intl.NumberFormat("zh-TW", { maximumFractionDigits: digits }).format(v) : undefined;

/** What a tapped object is: type, layer, text, the blocks it belongs to and their attribute values. */
/**
 * Where the card goes so it does not cover what was tapped: the side with more room between the
 * tap and the top strip (78 px) or the dock (108 px), never shorter than 150 px.
 */
export function infoPlacement(tapY: number, height: number): { onTop: boolean; maxHeight: number } {
  const above = tapY - 78 - 20, below = height - 108 - tapY - 20;
  return { onTop: above > below, maxHeight: Math.max(150, Math.round(Math.max(above, below))) };
}

export function InfoPanel({ entity, onTop, maxHeight, format, onHideLayer, onClose }: {
  entity: MeasurableEntity | null;
  onTop?: boolean;
  maxHeight?: number;
  format(value: number, area?: boolean): string;
  onHideLayer(layer: string): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const kindName = (kind: string) => t(`info.kind.${kind}` as TranslationKey) || kind;
  const colorText = (index: unknown) => index === 256 || index === undefined ? t("info.byLayer") : index === 0 ? t("info.byBlock") : t("info.colorIndex", { N: String(index) });
  const p = (entity?.properties ?? {}) as Record<string, unknown>;
  const text = typeof p.text === "string" && p.text ? plainCadText(p.text) : "";
  const layer = entity?.layer ?? (typeof p.layer === "string" ? p.layer : "0");
  const rows: [string, string | undefined][] = entity ? [
    [t("info.type"), kindName(entity.kind)],
    [t("info.layer"), layer],
    [t("info.color"), colorText(p.colorIndex)],
    [t("info.lineType"), typeof p.lineType === "string" && p.lineType ? (/^bylayer$/i.test(p.lineType) ? t("info.byLayer") : p.lineType) : undefined],
    [t("info.textHeight"), num(p.textHeight)],
    [t("info.textStyle"), typeof p.styleName === "string" ? p.styleName : undefined],
    [entity.kind === "CIRCLE" || entity.kind === "ELLIPSE" ? t("info.perimeter") : t("info.length"), !entity.propertiesOnly && entity.length > 0 ? format(entity.length) : undefined],
    [t("info.area"), !entity.propertiesOnly && entity.area ? format(entity.area, true) : undefined],
    [t("info.radius"), num(p.radius)],
    [t("info.hatch"), typeof p.pattern === "string" ? p.pattern : undefined],
    [t("info.handle"), typeof p.handle === "string" ? p.handle : undefined],
  ] : [];

  return (
    <section className={`info-panel${onTop ? " info-top" : ""}`} style={maxHeight ? { maxHeight } : undefined} aria-label={t("info.title")}>
      <header><strong>{t("info.title")}</strong><IconTile name={t("info.close")} label={t("info.closeShort")} tip={t("info.closeTip")} onClick={onClose}><CloseIcon /></IconTile></header>
      <div className="info-body">
        {!entity ? <p className="info-hint">{t("info.hint")}</p> : <>
          {text ? <p className="info-text">{text}</p> : null}
          <dl>{rows.filter(([, v]) => v !== undefined).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {entity.blockChain?.length ? <div className="info-blocks">
            <h4>{t("info.blocks")}</h4>
            {entity.blockChain.map((b, i) => <div key={i} className="info-block">
              <strong>{/^\*U/i.test(b.name) ? t("info.dynamic", { name: b.name }) : b.name}</strong>
              {b.attributes.length ? <dl>{b.attributes.map((a, j) => <div key={j}><dt>{a.tag}</dt><dd>{a.text || t("info.blank")}</dd></div>)}</dl> : null}
            </div>)}
          </div> : null}
          <IconTile name={t("info.hideLayer", { layer })} label={t("info.hideShort")} tip={t("info.hideTip", { layer })} className="icon-tile info-hide" onClick={() => onHideLayer(layer)}><EyeOffIcon /></IconTile>
        </>}
      </div>
    </section>
  );
}
