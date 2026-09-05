import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { PDFDocument, rgb } from "pdf-lib";
let engine: typeof import("../src/engines/render");
beforeAll(async () => {
  vi.stubGlobal("DOMMatrix", DOMMatrix);
  vi.stubGlobal("ImageData", ImageData);
  vi.stubGlobal("Path2D", Path2D);
  engine = await import("../src/engines/render");
  const { GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = new URL(
    "../node_modules/pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).href;
});
afterAll(() => vi.unstubAllGlobals());
describe("PDF rendering engine", () => {
  it("renders a generated PDF at the requested scale and encodes PNG output", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([120, 80]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      color: rgb(1, 0, 0),
    });
    const load = engine.openPDF(await source.save());
    const doc = await load.promise;
    try {
      const canvas = createCanvas(1, 1);
      await engine.renderPage(
        doc,
        0,
        2,
        undefined,
        canvas as unknown as HTMLCanvasElement,
      );
      expect(canvas.width).toBe(240);
      expect(canvas.height).toBe(160);
      expect(
        Array.from(canvas.getContext("2d").getImageData(20, 20, 1, 1).data),
      ).toEqual([255, 0, 0, 255]);
      const wrapped = canvas as unknown as HTMLCanvasElement;
      wrapped.toBlob = (callback) =>
        callback(
          new Blob([new Uint8Array(canvas.toBuffer("image/png")).buffer], {
            type: "image/png",
          }),
        );
      const png = await engine.canvasBytes(wrapped, "image/png", 1);
      expect(Array.from(png.slice(0, 8))).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);
      const cancelled = new AbortController();
      cancelled.abort();
      await expect(
        engine.renderPage(doc, 0, 1, cancelled.signal, wrapped),
      ).rejects.toThrow("CANCELLED");
      await expect(
        engine.renderPage(doc, 0, 100, undefined, wrapped),
      ).rejects.toThrow("PIXELS");
    } finally {
      await load.destroy();
    }
  });
});
