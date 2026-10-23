import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decideBack, type ShellBackState } from "./backDispatch";
import { CloseDrawingDialog } from "../components/CloseDrawingDialog";

// Behaviour of closing a drawing (T10 4.3, 4.4), replacing the old App.tsx source-text check.
const viewing: ShellBackState = {
  screen: "viewing", closeConfirmOpen: false, confirmOpen: false, exportOpen: false, markupTextOpen: false,
  marking: false, searchPanelOpen: false, hasSearchResults: false, libraryOpen: false, cadPanelOpen: false,
  measuring: false, inspecting: false, nativeApp: true,
};

describe("closing a drawing", () => {
  it("Back while viewing asks first instead of closing", () => {
    expect(decideBack(viewing)).toBe("ask-close-drawing");
    expect(decideBack({ ...viewing, screen: "loading" })).toBe("ask-close-drawing");
  });

  it("Back with the CAD panel open closes only the panel", () => {
    expect(decideBack({ ...viewing, cadPanelOpen: true })).toBe("close-cad-panel");
  });

  it("Back with the close confirm open keeps viewing; a general confirm is closed first", () => {
    expect(decideBack({ ...viewing, closeConfirmOpen: true, cadPanelOpen: true })).toBe("close-close-confirm");
    expect(decideBack({ ...viewing, confirmOpen: true, measuring: true })).toBe("close-confirm");
  });

  it("Back ends a mode before asking to close; error screen goes straight home; home exits on Android only", () => {
    expect(decideBack({ ...viewing, measuring: true })).toBe("end-measure");
    expect(decideBack({ ...viewing, marking: true, measuring: true })).toBe("end-markup");
    expect(decideBack({ ...viewing, screen: "error" })).toBe("go-home");
    expect(decideBack({ ...viewing, screen: "home" })).toBe("exit-app");
    expect(decideBack({ ...viewing, screen: "home", nativeApp: false })).toBe("none");
  });

  it("the confirm is an alert dialog whose first choice is 取消，繼續看圖", () => {
    const html = renderToStaticMarkup(createElement(CloseDrawingDialog, { onKeep: () => {}, onClose: () => {} }));
    expect(html).toContain('role="alertdialog"');
    expect(html.indexOf("取消，繼續看圖")).toBeGreaterThan(-1);
    expect(html.indexOf("取消，繼續看圖")).toBeLessThan(html.indexOf("確認關閉圖面"));
  });

  // ✕ → confirm in a real DOM: closeFlow.dom.test.tsx (jsdom).
});
