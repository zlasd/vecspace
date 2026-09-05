import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerURL;
export { getDocument };
export type { PDFDocumentProxy };
export function openPDF(bytes: Uint8Array) {
  return getDocument({
    data: bytes.slice(),
    cMapUrl: "/vendor/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
    wasmUrl: "/vendor/pdfjs/wasm/",
    enableXfa: false,
    stopAtErrors: true,
    verbosity: 0,
  });
}
export async function renderPage(
  doc: PDFDocumentProxy,
  index: number,
  scale: number,
  signal?: AbortSignal,
  canvas?: HTMLCanvasElement,
) {
  if (signal?.aborted) throw new Error("CANCELLED");
  const page = await doc.getPage(index + 1);
  if (signal?.aborted) throw new Error("CANCELLED");
  const viewport = page.getViewport({ scale });
  if (
    viewport.width * viewport.height > 16_000_000 ||
    viewport.width > 16384 ||
    viewport.height > 16384
  )
    throw new Error("PIXELS");
  const target = canvas || document.createElement("canvas");
  target.width = Math.ceil(viewport.width);
  target.height = Math.ceil(viewport.height);
  const context = target.getContext("2d");
  if (!context) throw new Error("IMAGE");
  const task = page.render({
    canvasContext: context,
    canvas: target,
    viewport,
    background: "#ffffff",
  });
  const cancel = () => task.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await task.promise;
    if (signal?.aborted) throw new Error("CANCELLED");
    return target;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
export async function canvasBytes(
  canvas: HTMLCanvasElement,
  format: string,
  quality: number,
) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("IMAGE"))),
      format,
      quality,
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
export async function normalizeImage(file: File) {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png =
    header[0] === 137 &&
    header[1] === 80 &&
    header[2] === 78 &&
    header[3] === 71;
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  if (!png && !jpeg) throw new Error("IMAGE");
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("IMAGE");
  }
  try {
    if (
      image.width * image.height > 16_000_000 ||
      image.width > 16384 ||
      image.height > 16384
    )
      throw new Error("PIXELS");
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("IMAGE");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    try {
      return {
        bytes: await canvasBytes(canvas, "image/png", 1),
        width: image.width,
        height: image.height,
      };
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    image.close();
  }
}
