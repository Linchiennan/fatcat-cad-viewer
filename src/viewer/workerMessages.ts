// Message the viewer worker posts when it fails outside dxf-viewer's own error handling (待決 A-2).
export const VIEWER_WORKER_FAILED = "fatcat-viewer-worker-failed";
export type ViewerWorkerFailure = { type: typeof VIEWER_WORKER_FAILED; message: string };
