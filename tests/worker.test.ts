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
          file: { size: 51 * 1024 * 1024 },
          algorithm: "SHA-256",
        })
      ).error,
    ).toBe("LIMIT");
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
