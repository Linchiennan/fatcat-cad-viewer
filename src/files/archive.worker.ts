// Archive worker: one worker per archive, its own copy of the libarchive WASM (T12 3.6-1, 3.7). Owner: P4 group A.
import { libarchiveWasm } from "libarchive-wasm";
import { createArchiveHandler, type ArchiveReply, type ArchiveRequest } from "./archiveCore";

const scope = self as unknown as {
  postMessage(message: ArchiveReply, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ArchiveRequest>) => void) | null;
};

const handle = createArchiveHandler(
  (reply, transfer) => scope.postMessage(reply, transfer ?? []),
  // The WASM ships with the app (public/runtime/libarchive); never fetched from the network.
  (wasmUrl) => libarchiveWasm({ locateFile: () => wasmUrl }),
);

scope.onmessage = (event) => {
  void handle(event.data);
};
