// An attribute definition placed on the sheet itself (not inside a block) shows its tag in CAD, as a one-line text
// with the definition's own position, height, style and alignment. dxf-viewer has no ATTDEF case, so these were
// never drawn (外框比對 單位2: 89 of them, 碁創潭子 屋頂排水「配置同綠景3」). Inside a block the definition stays
// undrawn: an INSERT shows its ATTRIB values instead.
type Any = any;

/** The TEXT CAD shows for a top-level ATTDEF; other entities are returned as they are. */
export function attdefAsText(e: Any): Any {
  if (e?.type !== "ATTDEF" || typeof e.tag !== "string" || !e.tag) return e;
  const flag = (e.backwards ? 2 : 0) | (e.mirrored ? 4 : 0);
  return {
    ...e, type: "TEXT", text: e.tag, cadAttdef: true,
    styleName: e.styleName ?? e.textStyle, xScale: e.xScale ?? e.scale,
    halign: e.halign ?? e.horizontalJustification, valign: e.valign ?? e.verticalJustification,
    ...(flag ? { textGenerationFlag: flag } : {}),
  };
}
