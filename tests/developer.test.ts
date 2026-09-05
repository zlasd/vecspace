import { describe, expect, it } from "vitest";
import {
  cleanText,
  convertTimestamp,
  decodeUTF8,
  formatJSON,
  fromBase64,
  inspectUUID,
  jsonTree,
  toBase64,
  urlCodec,
} from "../src/engines/developer";
import { detectLocale } from "../src/i18n";
describe("language preference", () => {
  it.each([
    ["zh", ["en-US"], "zh"],
    ["en", ["zh-CN"], "en"],
    [null, ["zh-TW", "en-US"], "zh"],
    [null, ["en-GB", "zh-CN"], "en"],
    [null, ["ja-JP", "zh-HK"], "zh"],
    [null, ["fr-FR"], "en"],
    ["fr", ["zh-CN"], "zh"],
    [null, ["ZH-cn"], "zh"],
    [null, [], "en"],
  ])("resolves saved=%s languages=%s", (saved, languages, expected) =>
    expect(detectLocale(saved, languages)).toBe(expected),
  );
});
describe("Base64", () => {
  it("matches RFC 4648 vectors", () => {
    for (const [plain, encoded] of [
      ["", ""],
      ["f", "Zg=="],
      ["fo", "Zm8="],
      ["foo", "Zm9v"],
      ["foobar", "Zm9vYmFy"],
    ]) {
      expect(toBase64(new TextEncoder().encode(plain))).toBe(encoded);
      expect(decodeUTF8(fromBase64(encoded))).toBe(plain);
    }
  });
  it("preserves Unicode and arbitrary bytes", () => {
    const text = "你好 🌍\0";
    expect(
      decodeUTF8(fromBase64(toBase64(new TextEncoder().encode(text)))),
    ).toBe(text);
    const raw = new Uint8Array([0, 255, 254, 128]);
    expect(fromBase64(toBase64(raw, true), true)).toEqual(raw);
    expect(() => decodeUTF8(raw)).toThrow("UTF8");
  });
  it.each(["Z", "Zh==", "Zg=", "Zg===", "Zg==x", "@@@@", "-_8="])(
    "rejects malformed Base64 %s",
    (input) => expect(() => fromBase64(input)).toThrow("BASE64"),
  );
  it("accepts legal URL-safe and missing padding", () => {
    expect(Array.from(fromBase64("-_8", true))).toEqual([251, 255]);
    expect(decodeUTF8(fromBase64(" Zg\n"))).toBe("f");
  });
});
describe("JSON", () => {
  it("preserves number lexemes and order of values", () => {
    const raw =
      '{"big":900719925474099312345,"exponent":1e+99,"small":1.2300,"negative":-0}';
    expect(formatJSON(raw, true)).toBe(raw);
    expect(jsonTree(raw).children?.[0].value).toBe("900719925474099312345");
  });
  it.each(['{"a":1,}', "{a:1}", "[NaN]", '{"a":'])(
    "rejects invalid syntax",
    (input) => expect(() => formatJSON(input)).toThrow("JSON"),
  );
});
describe("URL", () => {
  it("distinguishes components, URI, and form values", () => {
    expect(urlCodec("a b+c/", "component", false)).toBe("a%20b%2Bc%2F");
    expect(urlCodec("a b+c/", "form", false)).toBe("a+b%2Bc%2F");
    expect(urlCodec("https://vec.im/a b?q=x", "uri", false)).toBe(
      "https://vec.im/a%20b?q=x",
    );
    expect(urlCodec("a+b", "component", true)).toBe("a+b");
    expect(urlCodec("a+b", "form", true)).toBe("a b");
  });
  it("retains repeated query parameters", () =>
    expect(
      JSON.parse(urlCodec("https://vec.im/?a=1&a=2&b=x+y#hash", "query", true)),
    ).toEqual([
      ["a", "1"],
      ["a", "2"],
      ["b", "x y"],
    ]));
  it("rejects malformed escapes", () =>
    expect(() => urlCodec("x=%FF", "query", true)).toThrow("INPUT"));
});
describe("time and UUID", () => {
  it("converts explicit offsets and units", () => {
    const date = convertTimestamp(
      "2026-09-05T12:00:00+08:00",
      "seconds",
      "to-timestamp",
    );
    expect(date.utc).toBe("2026-09-05T04:00:00.000Z");
    expect(
      convertTimestamp(String(date.seconds), "seconds", "to-date").milliseconds,
    ).toBe(date.milliseconds);
    expect(convertTimestamp("0", "milliseconds", "to-date").utc).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
  it.each([
    "2026-02-30T12:00:00Z",
    "2026-09-05T12:00:00",
    "2026-09-05T24:00:00Z",
    "garbage",
  ])("rejects invalid or ambiguous dates", (value) =>
    expect(() => convertTimestamp(value, "seconds", "to-timestamp")).toThrow(
      "DATE",
    ),
  );
  it("inspects v4 UUID", () => {
    expect(inspectUUID("36B8F84D-DF4E-4D49-B662-BCDE71A8764F").version).toBe(4);
    expect(() => inspectUUID("36b8")).toThrow("INPUT");
  });
});
describe("text cleanup", () => {
  it("handles Unicode, CRLF, case-insensitive deduplication and stable first spelling", () => {
    const result = cleanText(" b \r\nA\r\na\n\n🌍", {
      trim: true,
      empty: true,
      unique: true,
      ignoreCase: true,
      sort: "asc",
      newline: "crlf",
    });
    expect(result.output).toBe("A\r\nb\r\n🌍");
    expect(result.lines).toBe(3);
    expect(result.characters).toBe(7);
    expect(result.bytes).toBe(10);
  });
});
