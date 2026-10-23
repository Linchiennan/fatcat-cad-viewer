import { describe, expect, it } from "vitest";
import { LibraryError } from "../types/errors";
import type { LibraryEntry } from "./drawingLibrary";
import { libraryText } from "./libraryText";
import {
  decideLibraryBack, filterLibraryEntries, formatLibraryDate, formatLibrarySize, handleLibraryBack, libraryErrorMessage,
  progressPercent, recentCurrentPage, recentPageCount, setLibraryBackHandler, sortLibraryEntries, type LibraryBackState,
} from "./libraryView";

const folder = (name: string, updatedAt = 0): LibraryEntry => ({ id: name, kind: "folder", parentId: "root", name, createdAt: 0, updatedAt });
const drawing = (name: string, size: number, updatedAt = 0): LibraryEntry => ({
  id: name, kind: "drawing", parentId: "root", name, createdAt: 0, updatedAt, format: "dwg", mimeType: "", size, lastModified: 0, lastOpenedAt: 0,
});

describe("sorting and search (T11 3.6-3.7)", () => {
  const list = [drawing("b10.dwg", 5, 3), folder("Z", 1), drawing("B2.dwg", 50, 1), folder("a", 9), drawing("c.dwg", 50, 2)];
  it("always lists folders first", () => {
    expect(sortLibraryEntries(list, "name", "zh-TW").map((e) => e.name)).toEqual(["a", "Z", "B2.dwg", "b10.dwg", "c.dwg"]);
    expect(sortLibraryEntries(list, "newest", "en").map((e) => e.name)).toEqual(["a", "Z", "b10.dwg", "c.dwg", "B2.dwg"]);
    expect(sortLibraryEntries(list, "largest", "en").map((e) => e.name)).toEqual(["a", "Z", "B2.dwg", "c.dwg", "b10.dwg"]);
  });
  it("matches full-width and half-width letters alike", () => {
    expect(filterLibraryEntries([drawing("ＰＬＡＮ１.dwg", 1), drawing("other.dwg", 1)], "  plan1 ", "zh-TW").map((e) => e.id)).toEqual(["ＰＬＡＮ１.dwg"]);
    expect(filterLibraryEntries(list, "", "en")).toHaveLength(5);
  });
});

describe("display text (T11 3.17)", () => {
  it("formats sizes and dates", () => {
    expect(formatLibrarySize(1023, "en")).toBe("1023 B");
    expect(formatLibrarySize(1_992_294, "en")).toBe("1.9 MB");
    expect(formatLibrarySize(251_290, "zh-TW")).toBe("245.4 KB");
    expect(formatLibraryDate(new Date(2026, 9, 23).getTime(), "zh-TW")).toBe("2026年10月23日");
  });
  it("computes carousel pages and progress", () => {
    expect(recentPageCount(6)).toBe(3);
    expect(recentPageCount(5)).toBe(3);
    expect(recentCurrentPage(353, 343)).toBe(1);
    expect(progressPercent(1, 3)).toBe(33);
  });
  it("maps errors to messages, with a 64 MB text for archives", () => {
    expect(libraryErrorMessage(new LibraryError("ARCHIVE_UNREADABLE"))).toEqual({ key: "error.archiveOpen" });
    expect(libraryErrorMessage(new LibraryError("FILE_TOO_LARGE", "File is larger than the 67108864 byte limit"))).toEqual({ own: "archiveTooLarge" });
    expect(libraryErrorMessage(new LibraryError("FILE_TOO_LARGE", "File is larger than the 134217728 byte limit"))).toEqual({ key: "library.err.tooLarge" });
    expect(libraryErrorMessage(new Error("x"))).toEqual({ key: "library.err.failed" });
    expect(libraryText("en", "page", { n: 2 })).toBe("Page 2");
    expect(libraryText("zh-TW", "archiveTooLarge")).toContain("64 MB");
  });
});

describe("back key (T11 4.2)", () => {
  const base: LibraryBackState = { archiveOpen: false, busy: false, textDialogOpen: false, destinationOpen: false, deleteOpen: false, actionsOpen: false, hasSearch: false, inSubfolder: false };
  it("takes the first matching step only", () => {
    expect(decideLibraryBack({ ...base, archiveOpen: true, busy: true })).toBe("cancel-archive");
    expect(decideLibraryBack({ ...base, busy: true, textDialogOpen: true })).toBe("ignore");
    expect(decideLibraryBack({ ...base, textDialogOpen: true, actionsOpen: true })).toBe("close-text");
    expect(decideLibraryBack({ ...base, destinationOpen: true })).toBe("close-destination");
    expect(decideLibraryBack({ ...base, deleteOpen: true })).toBe("close-delete");
    expect(decideLibraryBack({ ...base, actionsOpen: true, hasSearch: true })).toBe("close-actions");
    expect(decideLibraryBack({ ...base, exportPopupOpen: true, exportsOpen: true })).toBe("close-export-popup");
    expect(decideLibraryBack({ ...base, exportsOpen: true, inSubfolder: true })).toBe("close-exports");
    expect(decideLibraryBack({ ...base, hasSearch: true, inSubfolder: true })).toBe("clear-search");
    expect(decideLibraryBack({ ...base, inSubfolder: true })).toBe("up");
    expect(decideLibraryBack(base)).toBe("close-library");
  });
  it("routes the App's back press to the mounted library", () => {
    expect(handleLibraryBack()).toBe(false);
    let pressed = 0;
    setLibraryBackHandler(() => pressed++);
    expect(handleLibraryBack()).toBe(true);
    setLibraryBackHandler(null);
    expect(handleLibraryBack()).toBe(false);
    expect(pressed).toBe(1);
  });
});
