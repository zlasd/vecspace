import { PDFDocument, degrees } from "pdf-lib";
import { MAX_PDF_BYTES as MAX_BYTES, MAX_PAGES, MAX_PIXELS } from "../limits";
export { MAX_PAGES } from "../limits";
export function pagesFromRange(input: string, count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PAGES)
    throw new Error("PAGES");
  if (!input.trim() || input.trim().toLowerCase() === "all")
    return Array.from({ length: count }, (_, i) => i);
  if (/^(odd|even)$/i.test(input.trim())) {
    const result = Array.from({ length: count }, (_, i) => i).filter(
      (i) => i % 2 === (input.trim().toLowerCase() === "odd" ? 0 : 1),
    );
    if (!result.length) throw new Error("PAGES");
    return result;
  }
  const pages: number[] = [];
  for (const token of input.split(",")) {
    const normalized = token
      .trim()
      .toLowerCase()
      .replace(/last/g, String(count))
      .replace(/^-(\d+)$/, "1-$1")
      .replace(/^(\d+)-$/, "$1-" + count);
    const match = normalized.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("PAGES");
    const a = Number(match[1]);
    const b = Number(match[2] || a);
    if (a < 1 || b < 1 || a > count || b > count) throw new Error("PAGES");
    for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) {
      pages.push(i - 1);
      if (pages.length > MAX_PAGES) throw new Error("LIMIT");
    }
  }
  if (!pages.length) throw new Error("PAGES");
  return pages;
}
export async function loadPDF(bytes: Uint8Array) {
  if (bytes.length > MAX_BYTES) throw new Error("LIMIT");
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (doc.getPageCount() > MAX_PAGES) throw new Error("LIMIT");
    return doc;
  } catch (error) {
    if (error instanceof Error && error.message === "LIMIT") throw error;
    if (error instanceof Error && /encrypt/i.test(error.message))
      throw new Error("ENCRYPTED");
    throw new Error("PDF");
  }
}
export type PDFInput = {
  name: string;
  bytes?: Uint8Array;
  file?: Blob;
  range: string;
};
export type ResultFile = { name: string; bytes: Uint8Array; type: string };
export type PageSelection = { index: number; rotation: number };
export async function mergePDFs(
  inputs: PDFInput[],
  progress: (n: number) => void = () => {},
) {
  if (!inputs.length) throw new Error("EMPTY");
  if (
    inputs.reduce(
      (sum, input) => sum + (input.bytes?.length ?? input.file?.size ?? 0),
      0,
    ) > MAX_BYTES
  )
    throw new Error("LIMIT");
  const output = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (!input.bytes && !input.file) throw new Error("EMPTY");
    const doc = await loadPDF(
      input.bytes ?? new Uint8Array(await input.file!.arrayBuffer()),
    );
    const pages = pagesFromRange(input.range, doc.getPageCount());
    if (output.getPageCount() + pages.length > MAX_PAGES)
      throw new Error("LIMIT");
    for (const page of await output.copyPages(doc, pages)) output.addPage(page);
    progress(((i + 1) / inputs.length) * 90);
  }
  return output.save();
}
export async function organizePDF(
  bytes: Uint8Array,
  selection: PageSelection[],
) {
  if (!selection.length) throw new Error("EMPTY");
  if (selection.length > MAX_PAGES) throw new Error("LIMIT");
  const source = await loadPDF(bytes);
  const output = await PDFDocument.create();
  for (const item of selection) {
    if (
      !Number.isInteger(item.index) ||
      item.index < 0 ||
      item.index >= source.getPageCount() ||
      !Number.isInteger(item.rotation) ||
      item.rotation % 90 !== 0
    )
      throw new Error("PAGES");
    const [page] = await output.copyPages(source, [item.index]);
    page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));
    output.addPage(page);
  }
  return output.save();
}
export async function splitPDF(
  bytes: Uint8Array,
  range: string,
  mode: string,
  size: number,
  progress: (n: number) => void = () => {},
) {
  const source = await loadPDF(bytes);
  const custom =
    mode === "custom"
      ? range.split(";").map((part) => {
          if (!part.trim()) throw new Error("PAGES");
          return pagesFromRange(part, source.getPageCount());
        })
      : null;
  const pages = custom
    ? custom.flat()
    : pagesFromRange(range, source.getPageCount());
  if (pages.length > MAX_PAGES) throw new Error("LIMIT");
  const batch = mode === "extract" ? pages.length : mode === "each" ? 1 : size;
  if (!Number.isInteger(batch) || batch < 1 || batch > MAX_PAGES)
    throw new Error("INPUT");
  const results: ResultFile[] = [];
  const groups =
    custom ??
    Array.from({ length: Math.ceil(pages.length / batch) }, (_, i) =>
      pages.slice(i * batch, (i + 1) * batch),
    );
  for (let i = 0; i < groups.length; i++) {
    const output = await PDFDocument.create();
    for (const page of await output.copyPages(source, groups[i]))
      output.addPage(page);
    results.push({
      name: `part-${String(results.length + 1).padStart(3, "0")}.pdf`,
      bytes: await output.save(),
      type: "application/pdf",
    });
    progress(Math.min(95, ((i + 1) / groups.length) * 95));
  }
  return results;
}
export async function imagesPDF(
  images: { bytes: Uint8Array }[],
  pageSize: string,
  landscape: boolean,
  margin: number,
  options: {
    dpi?: number;
    fit?: string;
    width?: number;
    height?: number;
    autoOrientation?: boolean;
  } = {},
) {
  if (!images.length) throw new Error("EMPTY");
  if (
    images.length > MAX_PAGES ||
    images.reduce((n, image) => n + image.bytes.length, 0) > MAX_BYTES
  )
    throw new Error("LIMIT");
  if (!Number.isFinite(margin) || margin < 0 || margin > 288)
    throw new Error("INPUT");
  const sizes: Record<string, number[]> = {
    a3: [841.89, 1190.55],
    a4: [595.28, 841.89],
    a5: [419.53, 595.28],
    letter: [612, 792],
    legal: [612, 1008],
    tabloid: [792, 1224],
    custom: [
      ((options.width ?? 210) * 72) / 25.4,
      ((options.height ?? 297) * 72) / 25.4,
    ],
  };
  const dpi = options.dpi ?? 96;
  if (!Number.isFinite(dpi) || dpi < 36 || dpi > 1200) throw new Error("INPUT");
  const output = await PDFDocument.create();
  for (const image of images) {
    const embedded = await output.embedPng(image.bytes);
    if (embedded.width * embedded.height > MAX_PIXELS)
      throw new Error("PIXELS");
    let [width, height] =
      pageSize === "original"
        ? [
            (embedded.width * 72) / dpi + margin * 2,
            (embedded.height * 72) / dpi + margin * 2,
          ]
        : (sizes[pageSize] ?? []);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= margin * 2 ||
      height <= margin * 2 ||
      width > 14400 ||
      height > 14400
    )
      throw new Error("INPUT");
    if (
      pageSize !== "original" &&
      (options.autoOrientation ? embedded.width > embedded.height : landscape)
    )
      [width, height] = [height, width];
    const page = output.addPage([width, height]);
    const scale = Math.min(
      (width - margin * 2) / embedded.width,
      (height - margin * 2) / embedded.height,
      options.fit === "shrink" ? 72 / dpi : Infinity,
    );
    if (scale <= 0) throw new Error("INPUT");
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    page.drawImage(embedded, {
      x: (width - w) / 2,
      y: (height - h) / 2,
      width: w,
      height: h,
    });
  }
  return output.save();
}
