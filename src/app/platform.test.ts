// @vitest-environment jsdom
// Also proves the jsdom environment works for component tests (opt in per file with the comment above).
import { afterEach, describe, expect, it, vi } from "vitest";
import { IS_WEB_BUILD, isAppleMobile, isStandalone } from "./platform";

const setNavigator = (props: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(props)) Object.defineProperty(navigator, key, { value, configurable: true });
};

afterEach(() => vi.unstubAllGlobals());

describe("platform (T10 8-2)", () => {
  it("runs in a DOM", () => {
    expect(document.createElement("div").tagName).toBe("DIV");
  });

  it("is not the web build outside scripts/web-build.py", () => {
    expect(IS_WEB_BUILD).toBe(false);
  });

  it("detects iPhone and iPadOS that reports itself as a Mac with touch", () => {
    setNavigator({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", maxTouchPoints: 5 });
    expect(isAppleMobile()).toBe(true);
    setNavigator({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 });
    expect(isAppleMobile()).toBe(true);
    setNavigator({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 });
    expect(isAppleMobile()).toBe(false);
    setNavigator({ userAgent: "Mozilla/5.0 (Linux; Android 15)", maxTouchPoints: 5 });
    expect(isAppleMobile()).toBe(false);
  });

  it("detects a home-screen launch", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(display-mode: standalone)" }));
    expect(isStandalone()).toBe(true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    setNavigator({ standalone: true });
    expect(isStandalone()).toBe(true);
    setNavigator({ standalone: false });
    expect(isStandalone()).toBe(false);
  });
});
