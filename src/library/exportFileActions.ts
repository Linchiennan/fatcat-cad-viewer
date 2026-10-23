// Share / open for exports through E 組's file hand-off (src/native/fileHandoff: Android share sheet / "open with",
// Web Share or download on the web). Tests may swap the actions. Owner: P4 group A.
import { openFile, shareFile } from "../native/fileHandoff";
import type { FileAction } from "./exportTypes";

const defaults: { shareFile: FileAction; openFile: FileAction } = {
  shareFile: async (blob, name, mime) => void (await shareFile(blob, name, mime)),
  openFile: async (blob, name, mime) => void (await openFile(blob, name, mime)),
};
let actions = defaults;

/** Replace share / open (tests); call with no argument to restore the native hand-off. */
export function setExportFileActions(next?: Partial<{ shareFile: FileAction; openFile: FileAction }>): void {
  actions = next ? { ...actions, ...next } : defaults;
}

export function shareExportFile(file: File): Promise<void> {
  return actions.shareFile(file, file.name, file.type);
}

export function openExportFile(file: File): Promise<void> {
  return actions.openFile(file, file.name, file.type);
}
