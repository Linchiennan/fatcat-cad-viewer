// Local check (skipped when the census file is absent): every warning the 945-drawing census recorded, through the
// English translation, leaves only names in Chinese.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { splitCadWarnings } from "./cadWarnings";
import { cadMessageText } from "./warningText";

const FILE = "../010-BUG檢查/單張探查/warn_census_v3.jsonl";
const CJK = /[㐀-鿿！-～　-〿]/;
describe.skipIf(!fs.existsSync(FILE))("census warnings in English", () => {
  it("no untranslated sentence", () => {
    const left = new Map<string, number>();
    for (const line of fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean)) {
      const { warnings } = JSON.parse(line) as { warnings: string[] };
      const { missing, notes } = splitCadWarnings(warnings);
      for (const w of [...missing, ...notes]) {
        // names (file, block, linetype) may be Chinese: blank them out of the check by the original's ASCII-free spans
        const en = cadMessageText(w, "en");
        const stripped = en.replace(/^[^:]*\.(dwg|dxf): /i, "").replace(/(Missing block|Missing linetype definition|Layout|Complex linetype) [^,:]*/g, "").replace(/^Image .*?\.(jpe?g|png|tiff?|bmp): /i, "");
        if (CJK.test(stripped)) left.set(en.replace(/\d+/g, "#"), (left.get(en.replace(/\d+/g, "#")) ?? 0) + 1);
      }
    }
    expect([...left].slice(0, 30)).toEqual([]);
  });
});
