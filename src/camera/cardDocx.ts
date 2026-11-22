// 照片保存卡 as .docx (spec 009 定案 8): plain WordprocessingML zipped with fflate — company, 「照 片 保 存 卡」,
// 工程名稱 / 日期 heading on every page, then two boxed tables a page (label column + photo merged down the rows).
import { strToU8, zipSync } from "fflate";
import { CARD, CARD_TITLE, infoLine, pages, photoCell, type CardEntry, type CardHeading } from "./photoCard";

const TW = 20; // twips per point
const EMU = 12700; // EMU per point
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const run = (text: string, halfPoints: number, bold = false) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="標楷體" w:cs="Times New Roman"/>${bold ? "<w:b/>" : ""}<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const para = (text: string, pt: number, opts: { center?: boolean; before?: number; after?: number; pageBreak?: boolean } = {}) =>
  `<w:p><w:pPr>${opts.pageBreak ? "<w:pageBreakBefore/>" : ""}<w:spacing w:before="${(opts.before ?? 0) * TW}" w:after="${(opts.after ?? 0) * TW}" w:line="240" w:lineRule="auto"/>${opts.center ? '<w:jc w:val="center"/>' : ""}</w:pPr>${run(text, pt * 2)}</w:p>`;

function imageXml(rid: string, n: number, entry: CardEntry): string {
  const cell = photoCell(0);
  const cx = Math.round(cell.w * EMU), cy = Math.round(cell.h * EMU);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="照片 ${n}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="photo${n}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function boxTable(entry: CardEntry, rid: string, n: number): string {
  const labelW = (CARD.labelRight - CARD.left) * TW, photoW = (CARD.right - CARD.labelRight) * TW;
  const restH = CARD.boxH - CARD.rows.reduce((a, b) => a + b, 0);
  const heights = [...CARD.rows, restH].map((h) => Math.round(h * TW));
  const cellText = (lines: string[], center: boolean) => lines.map((l) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${center ? '<w:jc w:val="center"/>' : ""}</w:pPr>${run(l, CARD.textPt * 2)}</w:p>`).join("") || "<w:p/>";
  const left = [cellText(["照片編號"], true), cellText([entry.label], true), cellText(["施工說明"], true), cellText(entry.description, true)];
  const rows = heights.map((h, i) => {
    const photo = i === 0
      ? `<w:tc><w:tcPr><w:tcW w:w="${photoW}" w:type="dxa"/><w:vMerge w:val="restart"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>${imageXml(rid, n, entry)}</w:p></w:tc>`
      : `<w:tc><w:tcPr><w:tcW w:w="${photoW}" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>`;
    return `<w:tr><w:trPr><w:trHeight w:val="${h}" w:hRule="exact"/><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${labelW}" w:type="dxa"/><w:vAlign w:val="${i === 3 ? "top" : "center"}"/></w:tcPr>${left[i]}</w:tc>${photo}</w:tr>`;
  }).join("");
  const border = (side: string, outer: boolean) => `<w:${side} w:val="single" w:sz="${outer ? 18 : 6}" w:space="0" w:color="000000"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${labelW + photoW}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${border("top", true)}${border("left", true)}${border("bottom", true)}${border("right", true)}${border("insideH", false)}${border("insideV", false)}</w:tblBorders>` +
    `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${labelW}"/><w:gridCol w:w="${photoW}"/></w:tblGrid>${rows}</w:tbl>`;
}

/** The .docx bytes; `photos` holds the JPEG of each entry (with its whiteboard) by photo id. */
export function buildCardDocx(heading: CardHeading, entries: readonly CardEntry[], photos: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const media: Record<string, Uint8Array> = {};
  const rels: string[] = [];
  let body = "";
  let n = 0;
  pages(entries).forEach((page, pi) => {
    body += para(heading.company, CARD.companyPt, { center: true, pageBreak: pi > 0 });
    body += para(CARD_TITLE, CARD.titlePt, { center: true, before: 2 });
    body += para(infoLine(heading), CARD.textPt, { before: 4, after: 6 });
    page.forEach((entry, i) => {
      n += 1;
      const rid = `rIdImg${n}`, name = `image${n}.jpeg`;
      media[`word/media/${name}`] = photos.get(entry.photoId) ?? new Uint8Array();
      rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
      body += boxTable(entry, rid, n);
      if (i === 0) body += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.round((CARD.boxTops[1] - CARD.boxTops[0] - CARD.boxH) * TW)}" w:lineRule="exact"/></w:pPr></w:p>`;
    });
  });
  const marginLeft = Math.round(CARD.left * TW), marginRight = Math.round((595.32 - CARD.right) * TW);
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${Math.round((CARD.companyTop - 4) * TW)}" w:right="${marginRight}" w:bottom="567" w:left="${marginLeft}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(doc),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`),
    ...media,
  };
  return zipSync(files, { level: 6 });
}
