import {
  cleanText,
  encodeText,
  decodeText,
  formatJSON,
  fromBase64,
  jsonTree,
  MAX_BYTES,
  toBase64,
  requireText,
} from "../engines/developer";
import {
  generateKeys,
  matchKeys,
  signBytes,
  verifyBytes,
} from "../engines/crypto";
import { generateUUIDs } from "../engines/uuid";
import { hashInput, decodeDigest } from "../engines/hash";
import { MAX_HASH_BYTES, MAX_PDF_BYTES } from "../limits";
import { imagesPDF, mergePDFs, organizePDF, splitPDF } from "../engines/pdf";
self.onmessage = async ({ data: { id, operation, payload: p } }) => {
  const progress = (value: number) => self.postMessage({ id, progress: value });
  try {
    progress(5);
    if (p.text !== undefined && !p.file) requireText(p.text);
    const pdfOperation = ["merge", "split", "organize", "images-pdf"].includes(
      operation,
    );
    if (
      p.file?.size >
      (operation === "hash"
        ? MAX_HASH_BYTES
        : pdfOperation
          ? MAX_PDF_BYTES
          : MAX_BYTES)
    )
      throw new Error(
        operation === "hash"
          ? "HASH_LIMIT"
          : pdfOperation
            ? "PDF_LIMIT"
            : "LIMIT",
      );
    const bytes = async () =>
      p.file
        ? new Uint8Array(await p.file.arrayBuffer())
        : p.inputFormat && p.inputFormat !== "utf8"
          ? decodeDigest(p.text || "", p.inputFormat)
          : encodeText(p.text || "", p.encoding || "utf-8");
    let result: unknown;
    switch (operation) {
      case "base64": {
        if (!p.decode) {
          let text = toBase64(await bytes(), p.url);
          if (p.padding === "omit") text = text.replace(/=+$/, "");
          if (p.padding === "include")
            text = text.padEnd(Math.ceil(text.length / 4) * 4, "=");
          if (p.wrap === 64 || p.wrap === 76)
            text =
              text.match(new RegExp(".{1," + p.wrap + "}", "g"))?.join("\n") ||
              "";
          result = { text };
        } else {
          const input = p.file ? await p.file.text() : p.text;
          const decoded = fromBase64(input, p.url);
          result = p.binary
            ? {
                files: [
                  {
                    name: "decoded.bin",
                    bytes: decoded,
                    type: "application/octet-stream",
                  },
                ],
              }
            : { text: decodeText(decoded, p.encoding || "utf-8") };
        }
        break;
      }
      case "json":
        result = {
          text: formatJSON(p.text, p.compact, p.jsonOptions),
          tree: p.tree ? jsonTree(p.text) : undefined,
        };
        break;
      case "uuid":
        result = { text: generateUUIDs(p) };
        break;
      case "text":
        result = cleanText(p.text, p.options);
        break;
      case "hash":
        result = {
          text: await hashInput(
            p.file ?? (await bytes()),
            p.algorithm,
            p.outputFormat || "hex",
            progress,
          ),
        };
        break;
      case "keys":
        result = await generateKeys(p.algorithm, p.bits, p.keyOptions);
        break;
      case "sign":
        result = {
          text: await signBytes(
            await bytes(),
            p.privateKey,
            p.algorithm,
            p.keyOptions,
          ),
        };
        break;
      case "verify":
        result = {
          valid: await verifyBytes(
            await bytes(),
            p.signature,
            p.publicKey,
            p.algorithm,
            p.keyOptions,
          ),
        };
        break;
      case "match":
        result = {
          valid: await matchKeys(
            p.privateKey,
            p.publicKey,
            p.algorithm,
            p.keyOptions,
          ),
        };
        break;
      case "merge":
        result = {
          files: [
            {
              name: "merged.pdf",
              bytes: await mergePDFs(p.inputs, progress),
              type: "application/pdf",
            },
          ],
        };
        break;
      case "organize":
        result = {
          files: [
            {
              name: "organized.pdf",
              bytes: await organizePDF(p.bytes ?? (await bytes()), p.selection),
              type: "application/pdf",
            },
          ],
        };
        break;
      case "split":
        result = {
          files: await splitPDF(
            p.bytes ?? (await bytes()),
            p.range,
            p.mode,
            p.size,
            progress,
          ),
        };
        break;
      case "images-pdf":
        result = {
          files: [
            {
              name: "images.pdf",
              bytes: await imagesPDF(
                p.images,
                p.pageSize,
                p.landscape,
                p.margin,
                p.imageOptions,
              ),
              type: "application/pdf",
            },
          ],
        };
        break;
      default:
        throw new Error("INPUT");
    }
    const output = result as { files?: { name: string; bytes: Uint8Array }[] };
    if (p.outputName && output.files) {
      const name =
        String(p.outputName)
          .replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_")
          .trim()
          .slice(0, 120) || "vecspace";
      output.files.forEach((file, i) => {
        const extension = file.name.split(".").pop();
        file.name =
          name +
          (output.files!.length > 1
            ? "-" + String(i + 1).padStart(3, "0")
            : "") +
          "." +
          extension;
      });
    }
    const transfer = Array.from(
      new Set(
        output.files?.map((file) => file.bytes.buffer as ArrayBuffer) || [],
      ),
    );
    (
      self as unknown as {
        postMessage: (message: unknown, transfer: Transferable[]) => void;
      }
    ).postMessage({ id, result }, transfer);
  } catch (error) {
    const e = error as Error;
    self.postMessage({
      id,
      error: e.name === "NotSupportedError" ? "CRYPTO" : e.message,
    });
  }
};
