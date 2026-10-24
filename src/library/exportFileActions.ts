// Share / open for exports through E 組's file hand-off (src/native/fileHandoff: Android share sheet / "open with",
// Web Share or download on the web). Tests may swap the actions. Owner: P4 group A.
import { openFile, shareFile } from "../native/fileHandoff";
import { Capacitor } from '@capacitor/core';
import { zipSync } from 'fflate';

/** Call directly from the click with already-read files to preserve user activation. */
export async function shareExportFiles(files: File[]): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!files.length) return 'unsupported';
  if (Capacitor.isNativePlatform()) {
    // Current FileHandoff plugin supports ONE file, not ACTION_SEND_MULTIPLE.
    if (files.length !== 1) return 'unsupported';
    const file = files[0];
    const result = await shareFile(file, file.name, file.type);
    return result === 'shared' ? 'shared' : 'cancelled';
  }
  if (!navigator.share || !navigator.canShare?.({files})) return 'unsupported';
  try { await navigator.share({files}); return 'shared'; }
  catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; throw e; }
}

/** Explicit fallback only: keep every selected file in one ZIP, never silently share just the first. */
export async function exportFilesZip(files: File[]): Promise<string> {
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const file of files) entries[file.name] = new Uint8Array(await file.arrayBuffer());
  const data = zipSync(entries, {level: 0});
  return shareFile(new Blob([data as BlobPart], {type: 'application/zip'}), 'CAD-exports.zip', 'application/zip');
}

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
