import { describe, expect, it } from "vitest";
import { AppError } from "../types/errors";
import { translate } from "../i18n/translations";
import { tooLargeMessage, MAX_ARCHIVE_BYTES, MAX_DRAWING_BYTES } from "../files/fileTypes";
import { errorMessageKey, errorReasonKey, formatBadge, formatFileSize, isAbort, progressFraction, readFailureCode, shortVersion, stageKey, toAppError, viewerFailureCode } from "./shellText";

describe("error text (T20 5.1)", () => {
  it("each code has its own message; the screen never shows the developer message", () => {
    expect(translate("zh-TW", errorMessageKey("DXF_OPEN_FAILED"))).toBe("無法開啟 DXF 檔案。");
    expect(translate("zh-TW", errorMessageKey("UNSUPPORTED_FORMAT"))).toBe("請選擇 DXF、DWG、PDF、PNG、JPG、ZIP 或 RAR 檔案。");
    expect(translate("zh-TW", errorMessageKey("RENDER_FAILED"))).toBe("此裝置無法繪製圖面。");
    expect(translate("en", errorMessageKey("DWG_CONVERSION_TIMEOUT"))).toBe("The DWG conversion took too long and was stopped.");
  });

  it("too large: archives say 64 MB, drawings 128 MB (待決 A-6)", () => {
    expect(translate("zh-TW", errorReasonKey(new AppError("FILE_TOO_LARGE", tooLargeMessage(MAX_ARCHIVE_BYTES))))).toContain("64 MB");
    expect(translate("zh-TW", errorReasonKey(new AppError("FILE_TOO_LARGE", tooLargeMessage(MAX_DRAWING_BYTES))))).toContain("128 MB");
  });

  it("uncoded failures default by format: DWG and DXF apart (待決 18)", () => {
    expect(readFailureCode("dwg")).toBe("DWG_CONVERSION_FAILED");
    expect(readFailureCode("dxf")).toBe("DXF_OPEN_FAILED");
    expect(readFailureCode("pdf")).toBe("PDF_OPEN_FAILED");
    expect(viewerFailureCode("dxf")).toBe("DXF_OPEN_FAILED");
    expect(viewerFailureCode("pdf")).toBe("PDF_OPEN_FAILED");
  });

  it("keeps coded errors, wraps others, and treats cancelling as no error", () => {
    const coded = new AppError("DWG_MEMORY_LIMIT");
    expect(toAppError(coded, "DXF_OPEN_FAILED")).toBe(coded);
    const wrapped = toAppError(new Error("boom"), "FILE_READ_FAILED");
    expect(wrapped.code).toBe("FILE_READ_FAILED");
    expect(wrapped.cause).toBeInstanceOf(Error);
    expect(isAbort(new DOMException("stop", "AbortError"))).toBe(true);
    expect(isAbort(new Error("x"))).toBe(false);
  });
});

describe("loading stages and progress (T20 2.1-4, T10 3.2-9)", () => {
  it("names each stage", () => {
    expect(translate("zh-TW", stageKey("converting"))).toBe("正在轉換 DWG…");
    expect(translate("zh-TW", stageKey("loading"))).toBe("正在載入檔案…");
    expect(translate("zh-TW", stageKey("preparing"))).toBe("正在準備圖面…");
    expect(translate("en", stageKey("fonts"))).toBe("Preparing text…");
  });
  it("progress is done/total clamped, unknown without a valid total", () => {
    expect(progressFraction(5, 10)).toBe(0.5);
    expect(progressFraction(15, 10)).toBe(1);
    expect(progressFraction(3, 0)).toBeNull();
    expect(progressFraction(Number.NaN, 4)).toBeNull();
  });
});

describe("file bar and version text (T10 2.2-11, 2.4-2)", () => {
  it("file size: bytes below 1 KB, else one decimal at most, in the locale's format", () => {
    expect(formatFileSize(512, "zh-TW")).toBe("512 B");
    expect(formatFileSize(666_726, "zh-TW")).toBe("651.1 KB");
    expect(formatFileSize(10_695_475, "en")).toBe("10.2 MB");
    expect(formatFileSize(2048, "en")).toBe("2 KB");
  });
  it("badge and version", () => {
    expect(formatBadge("t1-B01主浴.dwg")).toBe("DWG");
    expect(formatBadge("noext")).toBe("");
    expect(shortVersion("2.1.0")).toBe("2.1");
    expect(shortVersion("3.0.0")).toBe("3.0");
  });
});
