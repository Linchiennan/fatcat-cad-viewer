// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ isNative: false, share: vi.fn(), open: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.isNative },
  registerPlugin: () => ({ share: native.share, open: native.open }),
}));

const { shareFile, openFile, safeHandoffName, HandoffError, MAX_HANDOFF_BYTES } = await import("./fileHandoff");

const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], { type: "image/png" });
let clicks: string[] = [];

beforeEach(() => {
  native.isNative = false;
  native.share.mockReset().mockResolvedValue(undefined);
  native.open.mockReset().mockResolvedValue(undefined);
  clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("safeHandoffName", () => {
  it("removes path and reserved characters and keeps the extension when shortening", () => {
    expect(safeHandoffName("a/b\\c:d*?.png")).toBe("a_b_c_d__.png");
    expect(safeHandoffName("  ")).toBe("output");
    const long = safeHandoffName("圖".repeat(200) + ".pdf");
    expect(long.length).toBe(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("web build", () => {
  it("uses Web Share when files can be shared", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, canShare: () => true, share });
    expect(await shareFile(png(), "plan.png", "image/png")).toBe("shared");
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files[0].name).toBe("plan.png");
    expect(arg.files[0].type).toBe("image/png");
    expect(clicks).toEqual([]);
  });

  it("reports a cancelled share and falls back to a download when sharing is unsupported or refused", async () => {
    vi.stubGlobal("navigator", { ...navigator, canShare: () => true, share: async () => { throw new DOMException("x", "AbortError"); } });
    expect(await shareFile(png(), "plan.png", "image/png")).toBe("cancelled");
    vi.stubGlobal("navigator", { ...navigator, canShare: () => true, share: async () => { throw new DOMException("x", "NotAllowedError"); } });
    expect(await shareFile(png(), "plan.png", "image/png")).toBe("downloaded");
    vi.stubGlobal("navigator", { ...navigator, canShare: undefined });
    expect(await shareFile(png(), "a/b.png", "image/png")).toBe("downloaded");
    expect(clicks).toEqual(["plan.png", "a_b.png"]);
  });

  it("opens a new tab, or downloads when the pop-up is blocked", async () => {
    const tab = { opener: {} };
    vi.spyOn(window, "open").mockReturnValueOnce(tab as unknown as Window).mockReturnValueOnce(null);
    expect(await openFile(png(), "plan.pdf", "application/pdf")).toBe("opened");
    expect(tab.opener).toBeNull();
    expect(await openFile(png(), "plan.pdf", "application/pdf")).toBe("downloaded");
    expect(clicks).toEqual(["plan.pdf"]);
  });
});

describe("Android", () => {
  beforeEach(() => { native.isNative = true; });

  it("passes the bytes as base64 with a safe name and the MIME type", async () => {
    expect(await shareFile(png(), "x:y.png", "image/png")).toBe("shared");
    expect(native.share).toHaveBeenCalledWith({ data: btoa("\x89PNG\x01\x02\x03"), fileName: "x_y.png", mimeType: "image/png" });
    expect(await openFile(png(), "plan.pdf", "application/pdf")).toBe("opened");
    expect(native.open.mock.calls[0][0].mimeType).toBe("application/pdf");
  });

  it("maps native failures and refuses oversized files before crossing the bridge", async () => {
    native.open.mockRejectedValueOnce(Object.assign(new Error("none"), { code: "HANDOFF_NO_APP" }));
    await expect(openFile(png(), "a.pdf", "application/pdf")).rejects.toMatchObject({ code: "HANDOFF_NO_APP" });
    native.share.mockRejectedValueOnce(new Error("boom"));
    await expect(shareFile(png(), "a.png", "image/png")).rejects.toBeInstanceOf(HandoffError);
    const big = { size: MAX_HANDOFF_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Blob;
    await expect(shareFile(big, "a.png", "image/png")).rejects.toMatchObject({ code: "HANDOFF_TOO_LARGE" });
    expect(native.share).toHaveBeenCalledTimes(1);
  });
});
