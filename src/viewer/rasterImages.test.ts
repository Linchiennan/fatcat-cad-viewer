import { describe, expect, it } from "vitest";
import { installRasters } from "./rasterImages";

describe("images without a file or definition", () => {
  it("are skipped quietly: nothing to show and no file to pick (惠宇敦南 S-工程說明 「圖片 0」)", async () => {
    const warnings: string[] = [];
    const viewer = { GetOrigin: () => ({ x: 0, y: 0 }), GetScene: () => ({ add() {}, remove() {} }) };
    const item = { entity: { type: "IMAGE", handle: "4D89", imagePath: "", imageDef: "0" }, clips: [], matrix: null, layer: "___H_1" };
    const missing = { ...item, entity: { ...item.entity, handle: "4D90", imagePath: "C:\pics\a.jpg", imageDef: "4DA0" } };
    const r = await installRasters(viewer, [item, missing] as never, warnings);
    expect(r.count).toBe(0);
    expect(warnings).toEqual([expect.stringContaining("a.jpg")]);
  });
});
