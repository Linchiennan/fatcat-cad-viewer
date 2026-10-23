// dxf-viewer worker ("fatcat-dxf-worker"): our scene modules wrap DxfScene.Build before the worker starts.
// dxf-viewer 1.0.48 posts its reply outside its own try/catch, so a scene too large to send (seen as
// "ArrayBuffer/ArrayBufferView size exceeds the supported range") would leave the page waiting for the
// 180 s timeout; any uncaught failure here is reported at once instead (待決 A-2).
import { DxfViewer } from "dxf-viewer";
import { DxfScene } from "dxf-viewer/src/DxfScene.js";
import { installSceneModules } from "./sceneModules";
import { VIEWER_WORKER_FAILED } from "./workerMessages";

const scope = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: Any) => void): void;
};
type Any = any;

const report = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason ?? "worker failure");
  try { scope.postMessage({ type: VIEWER_WORKER_FAILED, message }); } catch { /* nothing more to do */ }
};
scope.addEventListener("unhandledrejection", (event) => report(event.reason));
scope.addEventListener("error", (event) => report(event.error ?? event.message));

installSceneModules(DxfScene);
DxfViewer.SetupWorker();
