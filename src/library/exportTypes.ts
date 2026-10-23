// Shapes the exports area uses: ExportResult comes from C 組 (src/export/types.ts). Owner: P4 group A.
export type { ExportResult } from "../export/types";

/** Signature of E 組's shareFile / openFile as used here (outcome ignored). */
export type FileAction = (blob: Blob, fileName: string, mime: string) => Promise<void>;
