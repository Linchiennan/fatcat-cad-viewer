import { describe, expect, it } from "vitest";
import { nativeErrorText, NATIVE_ERROR_CODES } from "./nativeErrors";

describe("Android plugin error text (T21 5-10)", () => {
  it("every native code has 繁中 word for word and English", () => {
    expect(nativeErrorText("zh-TW", { code: "XREF_CANCELLED", message: "x" })).toBe("已取消選擇資料夾");
    expect(nativeErrorText("zh-TW", { code: "XREF_TOO_DEEP" })).toBe("資料夾超過16層安全上限");
    for (const code of NATIVE_ERROR_CODES) expect(nativeErrorText("en", { code, message: "" })).not.toMatch(/[㐀-鿿]/);
  });
  it("keeps the reason of a folder read failure; unknown codes return null", () => {
    expect(nativeErrorText("en", { code: "XREF_READ_FAILED", message: "無法讀取外參資料夾：IOException" })).toBe("Can't read the xref folder: IOException");
    expect(nativeErrorText("en", { code: "OTHER" })).toBeNull();
    expect(nativeErrorText("en", new Error("plain"))).toBeNull();
  });
});
