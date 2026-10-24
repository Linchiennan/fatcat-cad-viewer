import {loadPdfJs, runtimeUrl} from '../pdf/PdfViewer';
import type {ExportFormat} from './exportStore';
const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Preview encoding failed')), 'image/png'));
/** Bounded, single-page render. Caller serializes work and caches it in the export store. */
export async function renderExportPreview(file: File, format: ExportFormat): Promise<{thumbnail: Blob; pageCount?: number}> {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Preview canvas unavailable');
  if (format === 'pdf') {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:runtimeUrl('cmaps/'),cMapPacked:true,standardFontDataUrl:runtimeUrl('standard_fonts/'),wasmUrl:runtimeUrl('wasm/'),iccUrl:runtimeUrl('iccs/'),enableXfa:false});
    task.onPassword = () => { void task.destroy(); };
    try {
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const original = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:240 / Math.max(original.width,original.height)});
      canvas.width = Math.max(1,Math.ceil(viewport.width)); canvas.height = Math.max(1,Math.ceil(viewport.height));
      await page.render({canvasContext:context,canvas,viewport}).promise;
      const thumbnail = await toBlob(canvas); page.cleanup();
      return {thumbnail,pageCount:pdf.numPages};
    } finally { await task.destroy(); }
  }
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1,240 / Math.max(image.width,image.height));
    canvas.width = Math.max(1,Math.ceil(image.width*scale)); canvas.height = Math.max(1,Math.ceil(image.height*scale));
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return {thumbnail:await toBlob(canvas)};
  } finally { image.close(); }
}
