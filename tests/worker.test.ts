import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
const scope: any = { postMessage: vi.fn() };
beforeAll(async () => {
  vi.stubGlobal("self", scope);
  await import("../src/workers/task.worker");
});
afterAll(() => vi.unstubAllGlobals());
async function job(operation: string, payload: unknown) {
  scope.postMessage.mockClear();
  await scope.onmessage({ data: { id: 7, operation, payload } });
  return scope.postMessage.mock.calls.at(-1)![0];
}
describe("actual worker request protocol", () => {
  it("handles UTF-8 text and raw binary files without mixing sources", async () => {
    expect(
      (await job("base64", { text: "你好", decode: false })).result.text,
    ).toBe("5L2g5aW9");
    const file = new File([new Uint8Array([0, 255, 254, 128])], "binary.bin");
    expect(
      (await job("base64", { text: "ignored", file, decode: false })).result
        .text,
    ).toBe("AP/+gA==");
    const decoded = await job("base64", {
      text: "AP/+gA==",
      decode: true,
      binary: true,
    });
    expect(decoded.result.files[0].bytes).toEqual(
      new Uint8Array([0, 255, 254, 128]),
    );
    expect(
      (await job("base64", { text: "AP/+gA==", decode: true, binary: false }))
        .error,
    ).toBe("UTF8");
  });
  it.each(["SHA-256", "SHA-384", "SHA-512"])(
    "hashes file bytes with %s",
    async (algorithm) => {
      const file = new File(["file contents 你好"], "input.txt");
      const result = await job("hash", { file, algorithm });
      expect(result.result.text).toBe(
        createHash(algorithm.toLowerCase().replace("-", ""))
          .update("file contents 你好")
          .digest("hex"),
      );
    },
  );
  it("emits structured errors without producing stale output", async () => {
    expect((await job("json", { text: '{"broken":}' })).error).toBe("JSON");
    expect(
      (
        await job("hash", {
          file: { size: 2 * 1024 * 1024 * 1024 + 1 },
          algorithm: "SHA-256",
        })
      ).error,
    ).toBe("HASH_LIMIT");
  });
  it("returns usable PDF files and progress through the actual dispatcher", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 200]);
    doc.addPage([300, 400]);
    const bytes = await doc.save();
    const response = await job("split", {
      bytes,
      range: "2,1",
      mode: "each",
      size: 1,
    });
    expect(response.id).toBe(7);
    expect(response.result.files).toHaveLength(2);
    expect(
      (await PDFDocument.load(response.result.files[0].bytes))
        .getPage(0)
        .getWidth(),
    ).toBe(300);
    expect(
      scope.postMessage.mock.calls.some(
        ([message]: any) => message.progress > 5,
      ),
    ).toBe(true);
  });
});

describe("expanded worker options", () => {
  it("applies encoding, padding and wrapping options", async () => {
    const encoded = await job("base64", {
      text: "你好",
      encoding: "utf-16le",
      padding: "include",
      url: true,
    });
    const decoded = await job("base64", {
      text: encoded.result.text,
      encoding: "utf-16le",
      decode: true,
      url: true,
    });
    expect(decoded.result.text).toBe("你好");
    const wrapped = await job("base64", {
      text: "a".repeat(100),
      wrap: 64,
      padding: "omit",
    });
    expect(wrapped.result.text.split("\n")[0]).toHaveLength(64);
    expect(wrapped.result.text).not.toContain("=");
  });
  it("hashes hexadecimal input bytes instead of their text spelling", async () => {
    expect(
      (
        await job("hash", {
          text: "616263",
          inputFormat: "hex",
          algorithm: "MD5",
          outputFormat: "HEX",
        })
      ).result.text,
    ).toBe("900150983CD24FB0D6963F7D28E17F72");
  });
  it("reads PDF files in the worker and returns custom-named groups", async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 4; i++) pdf.addPage([100 + i, 200]);
    const file = new File(
      [(await pdf.save()) as Uint8Array<ArrayBuffer>],
      "source.pdf",
    );
    const result = await job("split", {
      file,
      range: "1-2;last",
      mode: "custom",
      size: 1,
      outputName: "report",
    });
    expect(result.result.files.map((f: any) => f.name)).toEqual([
      "report-001.pdf",
      "report-002.pdf",
    ]);
    expect(
      (await PDFDocument.load(result.result.files[1].bytes))
        .getPage(0)
        .getWidth(),
    ).toBe(103);
    expect(scope.postMessage.mock.calls.at(-1)![1]).toHaveLength(2);
  });
});

it("forwards curve, digest and signature structure when checking key pairs", async () => {
  const keyOptions = {
    curve: "P-384",
    hash: "SHA-384",
    ecdsaFormat: "der",
    encoding: "hex",
  };
  const generated = await job("keys", {
    algorithm: "ECDSA",
    bits: 2048,
    keyOptions,
  });
  const matched = await job("match", {
    algorithm: "ECDSA",
    privateKey: generated.result.privatePem,
    publicKey: generated.result.publicPem,
    keyOptions,
  });
  expect(matched.result.valid).toBe(true);
});
