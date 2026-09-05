import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import {
  imagesPDF,
  loadPDF,
  mergePDFs,
  organizePDF,
  pagesFromRange,
  splitPDF,
} from "../src/engines/pdf";
async function sample() {
  const doc = await PDFDocument.create();
  doc.setTitle("VecSpace 中文 metadata");
  doc.addPage([200, 300]);
  const p = doc.addPage([400, 500]);
  p.setRotation(degrees(90));
  doc.addPage([600, 700]);
  return doc.save();
}
describe("PDF operations", () => {
  it("preserves range order, duplicates, descending ranges and default all", () => {
    expect(pagesFromRange("3,1-2,2", 3)).toEqual([2, 0, 1, 1]);
    expect(pagesFromRange("3-1", 3)).toEqual([2, 1, 0]);
    expect(pagesFromRange("", 3)).toEqual([0, 1, 2]);
  });
  it.each(["0", "4", "1,,2", "1-4", "x", "1.5"])(
    "rejects invalid page ranges %s",
    (range) => expect(() => pagesFromRange(range, 3)).toThrow("PAGES"),
  );
  it("merges selected pages from ordered inputs and preserves source", async () => {
    const bytes = await sample();
    const before = bytes.slice();
    const merged = await loadPDF(
      await mergePDFs([
        { name: "a.pdf", bytes, range: "3,1" },
        { name: "b.pdf", bytes, range: "2" },
      ]),
    );
    expect(merged.getPages().map((p) => p.getWidth())).toEqual([600, 200, 400]);
    expect(merged.getPage(2).getRotation().angle).toBe(90);
    expect(bytes).toEqual(before);
  });
  it("organizes duplicates, removals and rotations", async () => {
    const result = await loadPDF(
      await organizePDF(await sample(), [
        { index: 1, rotation: 90 },
        { index: 0, rotation: 270 },
        { index: 1, rotation: 0 },
      ]),
    );
    expect(result.getPages().map((p) => p.getWidth())).toEqual([400, 200, 400]);
    expect(result.getPages().map((p) => p.getRotation().angle)).toEqual([
      180, 270, 90,
    ]);
  });
  it("splits into ranges, single pages and fixed groups", async () => {
    const bytes = await sample();
    const extracted = await splitPDF(bytes, "3,1", "extract", 1);
    expect(
      (await loadPDF(extracted[0].bytes)).getPages().map((p) => p.getWidth()),
    ).toEqual([600, 200]);
    const each = await splitPDF(bytes, "", "each", 1);
    expect(each).toHaveLength(3);
    expect(new Set(each.map((f) => f.name)).size).toBe(3);
    const grouped = await splitPDF(bytes, "", "groups", 2);
    expect(
      await Promise.all(
        grouped.map(async (f) => (await loadPDF(f.bytes)).getPageCount()),
      ),
    ).toEqual([2, 1]);
  });
  it("creates a PDF from PNGs with page and margin options", async () => {
    const bytes = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const doc = await loadPDF(
      await imagesPDF([{ bytes }, { bytes }], "a4", true, 24),
    );
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(841.89);
  });
  it("rejects corrupt, empty and oversized requests", async () => {
    await expect(loadPDF(new Uint8Array([1, 2, 3]))).rejects.toThrow("PDF");
    await expect(organizePDF(await sample(), [])).rejects.toThrow("EMPTY");
    await expect(
      organizePDF(await sample(), [{ index: 5, rotation: 0 }]),
    ).rejects.toThrow("PAGES");
    await expect(mergePDFs([])).rejects.toThrow("EMPTY");
  });
});
