import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildCardDocx } from "./cardDocx";
import type { CardEntry } from "./photoCard";

const heading = { company: "威德水電工程有限公司", project: "PARK23 集合住宅新建工程", date: "109 年 10 月 21 日" };
const entry = (i: number): CardEntry => ({ label: `01-${i}`, description: ["8F 室內隔間配管完成", "A 戶主浴"], photoId: `p${i}`, width: 3264, height: 1840 });

describe("照片保存卡 docx", () => {
  it("has the heading on every page, two photo boxes a page and the photos inside", () => {
    const photos = new Map([1, 2, 3].map((i) => [`p${i}`, new Uint8Array([0xff, 0xd8, i])]));
    const files = unzipSync(buildCardDocx(heading, [1, 2, 3].map(entry), photos));
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml", "word/media/image1.jpeg", "word/media/image2.jpeg", "word/media/image3.jpeg"]);
    const doc = strFromU8(files["word/document.xml"]);
    expect(doc.match(/威德水電工程有限公司/g)).toHaveLength(2);
    expect(doc.match(/<w:tbl>/g)).toHaveLength(3);
    expect(doc.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
    expect(doc).toContain("01-3");
    expect(doc).toContain("工程名稱：PARK23 集合住宅新建工程");
    expect(files["word/media/image3.jpeg"][2]).toBe(3);
  });

  // Local check: CARD_OUT=<folder> writes a card made from the 8F example photos (opened in Word and compared by hand).
  it.skipIf(!process.env.CARD_OUT)("writes the 8F example card", () => {
    const dir = process.env.CARD_PHOTOS!;
    const names = ["1-1", "1-2", "2", "3-1"];
    const photos = new Map(names.map((n) => [n, new Uint8Array(fs.readFileSync(path.join(dir, `${n}.jpg`)))]));
    const entries: CardEntry[] = names.map((n) => ({ label: n.includes("-") ? `0${n}` : `0${n}`, description: ["8F 室內隔間配管完成", "A 戶主浴"], photoId: n, width: 3264, height: 1840 }));
    fs.writeFileSync(path.join(process.env.CARD_OUT!, "測試保存卡.docx"), buildCardDocx(heading, entries, photos));
  });
});
