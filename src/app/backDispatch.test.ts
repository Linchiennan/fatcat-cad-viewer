import { describe, expect, it } from "vitest";
import { BackStack, decideBack, type ShellBackState } from "./backDispatch";

const viewing: ShellBackState = {
  screen: "viewing", closeConfirmOpen: false, confirmOpen: false, exportOpen: false, markupTextOpen: false,
  marking: false, searchPanelOpen: false, hasSearchResults: false, libraryOpen: false, cadPanelOpen: false,
  measuring: false, inspecting: false, nativeApp: false,
};

describe("Back order (T10 4.3-4)", () => {
  it("takes one step at a time, first match wins", () => {
    const all = { ...viewing, markupTextOpen: true, marking: true, searchPanelOpen: true, hasSearchResults: true, libraryOpen: true, cadPanelOpen: true, measuring: true };
    expect(decideBack(all)).toBe("close-markup-text");
    expect(decideBack({ ...all, markupTextOpen: false })).toBe("end-markup");
    expect(decideBack({ ...viewing, searchPanelOpen: true, hasSearchResults: true })).toBe("close-search-panel");
    expect(decideBack({ ...viewing, hasSearchResults: true, libraryOpen: true })).toBe("clear-search");
    expect(decideBack({ ...viewing, libraryOpen: true, cadPanelOpen: true })).toBe("close-library");
    expect(decideBack({ ...viewing, inspecting: true })).toBe("end-measure");
  });

  it("Esc sequence: full measure panel → end measuring → close confirm → keep viewing (T10 4.3-5)", () => {
    expect(decideBack({ ...viewing, measuring: true })).toBe("end-measure");
    expect(decideBack(viewing)).toBe("ask-close-drawing");
    expect(decideBack({ ...viewing, closeConfirmOpen: true })).toBe("close-close-confirm");
  });

  it("an export dialog or area selection closes before anything else but confirms", () => {
    expect(decideBack({ ...viewing, exportOpen: true, marking: true, measuring: true })).toBe("close-export");
    expect(decideBack({ ...viewing, exportOpen: true, confirmOpen: true })).toBe("close-confirm");
  });

  it("web home does nothing", () => {
    expect(decideBack({ ...viewing, screen: "home" })).toBe("none");
  });
});

describe("back handler stack (T10 4.3-2)", () => {
  it("newest nested handler first, then newest plain one; removing restores the previous", () => {
    const stack = new BackStack();
    const calls: string[] = [];
    expect(stack.dispatch()).toBe(false);
    const offApp = stack.register(() => calls.push("app"));
    const offOther = stack.register(() => calls.push("other"));
    const offLibrary = stack.register(() => calls.push("library"), true);
    stack.dispatch();
    offLibrary();
    stack.dispatch();
    offOther();
    stack.dispatch();
    offApp();
    expect(stack.dispatch()).toBe(false);
    expect(calls).toEqual(["library", "other", "app"]);
  });
});
