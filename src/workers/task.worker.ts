import {
  cleanText,
  decodeUTF8,
  formatJSON,
  fromBase64,
  jsonTree,
  MAX_BYTES,
  toBase64,
  requireText,
} from "../engines/developer";
import {
  generateKeys,
  hashBytes,
  matchKeys,
  signBytes,
  verifyBytes,
} from "../engines/crypto";
import { imagesPDF, mergePDFs, organizePDF, splitPDF } from "../engines/pdf";
self.onmessage = async ({ data: { id, operation, payload: p } }) => {
  const progress = (value: number) => self.postMessage({ id, progress: value });
  try {
    progress(5);
    if (p.text !== undefined) requireText(p.text);
    if (p.file?.size > MAX_BYTES) throw new Error("LIMIT");
    const bytes = async () =>
      p.file
        ? new Uint8Array(await p.file.arrayBuffer())
        : new TextEncoder().encode(p.text || "");
    let result: unknown;
    switch (operation) {
      case "base64": {
        if (!p.decode) result = { text: toBase64(await bytes(), p.url) };
        else {
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
            : { text: decodeUTF8(decoded) };
        }
        break;
      }
      case "json":
        result = {
          text: formatJSON(p.text, p.compact),
          tree: p.tree ? jsonTree(p.text) : undefined,
        };
        break;
      case "text":
        result = cleanText(p.text, p.options);
        break;
      case "hash":
        result = { text: await hashBytes(await bytes(), p.algorithm) };
        break;
      case "keys":
        result = await generateKeys(p.algorithm, p.bits);
        break;
      case "sign":
        result = {
          text: await signBytes(await bytes(), p.privateKey, p.algorithm),
        };
        break;
      case "verify":
        result = {
          valid: await verifyBytes(
            await bytes(),
            p.signature,
            p.publicKey,
            p.algorithm,
          ),
        };
        break;
      case "match":
        result = {
          valid: await matchKeys(p.privateKey, p.publicKey, p.algorithm),
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
              bytes: await organizePDF(p.bytes, p.selection),
              type: "application/pdf",
            },
          ],
        };
        break;
      case "split":
        result = {
          files: await splitPDF(p.bytes, p.range, p.mode, p.size, progress),
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
              ),
              type: "application/pdf",
            },
          ],
        };
        break;
      default:
        throw new Error("INPUT");
    }
    self.postMessage({ id, result });
  } catch (error) {
    const e = error as Error;
    self.postMessage({
      id,
      error: e.name === "NotSupportedError" ? "CRYPTO" : e.message,
    });
  }
};
