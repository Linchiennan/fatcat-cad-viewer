import { getAcadColor } from "dxf-viewer/src/parser/ParseHelpers.js";
type Any = any;

/**
 * An external reference whose file is not found is drawn by CAD as one line of text at its insertion point:
 * "外部參考 <the saved path>" (ZWCAD 2026, Chinese). ZWCAD puts a TEXT in the empty block at the block origin with the
 * current text style, text height and layer (TEXTSTYLE, TEXTSIZE, CLAYER), so it scales and turns with the INSERT.
 * TEXTSIZE is not the value saved in the header: on open ZWCAD sets it to the current style's last height (group 42);
 * a drawing saved with TEXTSIZE 7 or 10 and Standard's last height 2.5 reopens at 2.5 and draws the path 2.5 high.
 * The colour is CECOLOR, but LibreDWG misreads it (3 read as 256, ByLayer as 0), so the text is ByLayer here.
 * Measured: 缺外參 test drawing 2.5 / Standard / 0 / ByLayer; 127鑫元鴻 給水-2F 15 / NAME / W-給水-L-CW (green layer)
 * / 3. A reference saved unloaded, turned off in the panel, or a nested overlay shows nothing.
 */
export function xrefPlaceholderText(dxf: Any, block: Any): Any {
  const h = dxf.header ?? {};
  const styleName = typeof h.$TEXTSTYLE === "string" && h.$TEXTSTYLE ? h.$TEXTSTYLE : "Standard";
  const styles = dxf.tables?.style?.styles ?? {};
  const style = styles[styleName] ?? Object.entries(styles).find(([n]) => n.toLowerCase() === styleName.toLowerCase())?.[1];
  const size = [style?.fixedTextHeight, style?.lastHeight, h.$TEXTSIZE].map(Number).find((v) => v > 0) ?? 2.5;
  const colorIndex = 256;
  const at = block.position ?? { x: 0, y: 0, z: 0 };
  return {
    type: "TEXT",
    handle: "xref-placeholder:" + block.name,
    layer: typeof h.$CLAYER === "string" && h.$CLAYER ? h.$CLAYER : "0",
    styleName,
    textHeight: size,
    startPoint: { x: at.x ?? 0, y: at.y ?? 0, z: at.z ?? 0 },
    text: "外部參考 " + String(block.xrefPath),
    colorIndex,
    color: getAcadColor(Math.abs(colorIndex)),
    cadXrefPlaceholder: true,
  };
}

/** Fill each missing reference's empty block with the placeholder text. `off`: names turned off in the panel. */
export function addMissingXrefTexts(dxf: Any, off: ReadonlySet<unknown>): number {
  let n = 0;
  for (const block of Object.values(dxf.blocks ?? {}) as Any[]) {
    if (!block?.xrefPath || !(block.type & 4) || (block.entities?.length ?? 0) > 0) continue;
    if (block.cadXrefUnloaded || block.cadXrefNotNeeded || off.has(block.name)) continue;
    block.entities = [xrefPlaceholderText(dxf, block)];
    n++;
  }
  return n;
}
