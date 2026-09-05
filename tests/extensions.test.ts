import { describe, expect, it } from "vitest";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  privateDecrypt,
  publicEncrypt,
  sign,
  verify,
  constants,
} from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { generateUUIDs, namespaces } from "../src/engines/uuid";
import { hashInput } from "../src/engines/hash";
import {
  decodeText,
  encodeText,
  formatJSON,
  inspectUUID,
  convertTimestamp,
  cleanText,
  urlCodec,
} from "../src/engines/developer";
import {
  generateKeys,
  signBytes,
  verifyBytes,
  rawToDER,
  derToRaw,
} from "../src/engines/crypto";
import {
  pagesFromRange,
  splitPDF,
  mergePDFs,
  imagesPDF,
  loadPDF,
} from "../src/engines/pdf";
import { MAX_PDF_BYTES, MAX_PAGES } from "../src/limits";
describe("UUID versions and representations", () => {
  it.each(["1", "4", "6", "7"])("generates unique v%s batches", (version) => {
    const values = generateUUIDs({ version, count: 100 }).split("\n");
    expect(new Set(values).size).toBe(100);
    expect(
      values.every((value) => inspectUUID(value).version === Number(version)),
    ).toBe(true);
  });
  it("matches RFC name-based examples", () => {
    expect(
      generateUUIDs({
        version: "3",
        count: 1,
        name: "www.widgets.com",
        namespace: namespaces.dns,
      }),
    ).toBe("3d813cbb-47fb-32ba-91df-831e1593ac29");
    expect(
      generateUUIDs({
        version: "5",
        count: 1,
        name: "www.widgets.com",
        namespace: namespaces.dns,
      }),
    ).toBe("21f7f8de-8051-5b89-8680-0195ef798b6a");
  });
  it("supports per-line names, namespace changes, nil/max and compact/URN inspection", () => {
    const a = generateUUIDs({
      version: "5",
      count: 1,
      name: "a\na",
      namespace: namespaces.url,
    }).split("\n");
    expect(a[0]).toBe(a[1]);
    expect(a[0]).not.toBe(
      generateUUIDs({
        version: "5",
        count: 1,
        name: "a",
        namespace: namespaces.dns,
      }),
    );
    expect(generateUUIDs({ version: "nil", count: 1, format: "compact" })).toBe(
      "0".repeat(32),
    );
    expect(
      generateUUIDs({
        version: "max",
        count: 1,
        format: "compact",
        uppercase: true,
      }),
    ).toBe("F".repeat(32));
    expect(
      inspectUUID(
        generateUUIDs({
          version: "7",
          count: 1,
          format: "urn",
          uppercase: true,
        }),
      ).version,
    ).toBe(7);
  });
});
describe("extended digests", () => {
  it.each([
    "MD5",
    "SHA-1",
    "SHA-224",
    "SHA-256",
    "SHA-384",
    "SHA-512",
    "SHA3-224",
    "SHA3-256",
    "SHA3-384",
    "SHA3-512",
    "BLAKE2b-512",
    "BLAKE2s-256",
    "RIPEMD-160",
    "SM3",
  ])("%s matches OpenSSL", async (name) => {
    const mapped = name
      .toLowerCase()
      .replace(/^sha-(\d)/, "sha$1")
      .replace("blake2b-", "blake2b")
      .replace("blake2s-", "blake2s")
      .replace("ripemd-", "ripemd");
    const input = new TextEncoder().encode("VecSpace 你好");
    expect(await hashInput(input, name)).toBe(
      createHash(mapped).update(input).digest("hex"),
    );
  });
  it("checks BLAKE3, Keccak and checksum known vectors", async () => {
    expect(await hashInput(new Uint8Array(), "BLAKE3-256")).toBe(
      "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262",
    );
    expect(await hashInput(new Uint8Array(), "Keccak-256")).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(
      await hashInput(new TextEncoder().encode("123456789"), "CRC32"),
    ).toBe("cbf43926");
    expect(
      await hashInput(new TextEncoder().encode("Wikipedia"), "Adler-32"),
    ).toBe("11e60398");
  });
  it("streams files larger than a chunk and encodes digests without reading the whole file", async () => {
    const bytes = new Uint8Array(9 * 1024 * 1024 + 17);
    bytes.fill(123);
    const blob = new Blob([bytes]);
    blob.arrayBuffer = () => {
      throw new Error("must not read whole file");
    };
    const progress: number[] = [];
    expect(
      await hashInput(blob, "MD5", "base64", (n) => progress.push(n)),
    ).toBe(createHash("md5").update(bytes).digest("base64"));
    expect(progress.length).toBe(3);
    expect(progress.at(-1)).toBe(99);
  });
});
describe("key algorithms and signature structures", () => {
  for (const curve of ["P-256", "P-384", "P-521"])
    it(`${curve} DER interoperates with OpenSSL`, async () => {
      const options = {
        curve,
        hash: "SHA-512",
        ecdsaFormat: "der",
        encoding: "hex",
      };
      const keys = await generateKeys("ECDSA", 2048, options);
      const data = new TextEncoder().encode("DER test");
      const value = await signBytes(data, keys.privatePem, "ECDSA", options);
      expect(
        verify("sha512", data, keys.publicPem, Buffer.from(value, "hex")),
      ).toBe(true);
      const external = sign("sha512", data, keys.privatePem).toString("hex");
      expect(
        await verifyBytes(data, external, keys.publicPem, "ECDSA", options),
      ).toBe(true);
      expect(
        await verifyBytes(
          new Uint8Array([1]),
          external,
          keys.publicPem,
          "ECDSA",
          options,
        ),
      ).toBe(false);
    });
  it("rejects non-minimal and negative DER integers", () => {
    expect(() =>
      derToRaw(new Uint8Array([0x30, 6, 2, 1, 128, 2, 1, 1])),
    ).toThrow("KEY");
    expect(() =>
      derToRaw(new Uint8Array([0x30, 7, 2, 2, 0, 1, 2, 1, 1])),
    ).toThrow("KEY");
    const raw = new Uint8Array(132);
    raw[0] = 128;
    raw[66] = 128;
    expect(derToRaw(rawToDER(raw), "P-521")).toEqual(raw);
  });
  it("supports RSA PKCS#1 signatures and SHA-512", async () => {
    const keys = await generateKeys("RSASSA-PKCS1-v1_5", 2048, {
      hash: "SHA-512",
    });
    const data = new Uint8Array([3, 1, 4]);
    const result = await signBytes(data, keys.privatePem, "RSASSA-PKCS1-v1_5", {
      hash: "SHA-512",
      encoding: "base64url",
    });
    expect(
      verify("sha512", data, keys.publicPem, Buffer.from(result, "base64url")),
    ).toBe(true);
  });
  it("uses explicit PSS digest and salt length", async () => {
    const options = { hash: "SHA-384", saltLength: 48 };
    const keys = await generateKeys("RSA-PSS", 2048, options);
    const data = new Uint8Array([42]);
    const result = await signBytes(data, keys.privatePem, "RSA-PSS", options);
    expect(
      verify(
        "sha384",
        data,
        {
          key: keys.publicPem,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 48,
        },
        Buffer.from(result, "base64"),
      ),
    ).toBe(true);
    expect(
      await verifyBytes(data, result, keys.publicPem, "RSA-PSS", {
        ...options,
        saltLength: 32,
      }),
    ).toBe(false);
  });
  it("supports Ed25519 signatures", async () => {
    const keys = await generateKeys("Ed25519");
    const data = new Uint8Array([7, 8]);
    const result = await signBytes(data, keys.privatePem, "Ed25519");
    expect(
      verify(null, data, keys.publicPem, Buffer.from(result, "base64")),
    ).toBe(true);
    expect(
      await verifyBytes(
        data,
        sign(null, data, keys.privatePem).toString("base64"),
        keys.publicPem,
        "Ed25519",
      ),
    ).toBe(true);
  });
  it("generates usable RSA-OAEP encryption keys", async () => {
    const keys = await generateKeys("RSA-OAEP", 2048, { hash: "SHA-384" });
    const data = Buffer.from("round trip");
    expect(
      privateDecrypt(
        { key: keys.privatePem, oaepHash: "sha384" },
        publicEncrypt({ key: keys.publicPem, oaepHash: "sha384" }, data),
      ),
    ).toEqual(data);
  });
  it.each(["ECDH", "X25519"] as const)(
    "exports usable %s agreement key pairs",
    async (algorithm) => {
      const a = await generateKeys(algorithm),
        b = await generateKeys(algorithm);
      expect(
        diffieHellman({
          privateKey: createPrivateKey(a.privatePem),
          publicKey: createPublicKey(b.publicPem),
        }),
      ).toEqual(
        diffieHellman({
          privateKey: createPrivateKey(b.privatePem),
          publicKey: createPublicKey(a.publicPem),
        }),
      );
    },
  );
});
describe("codec, JSON, timestamps and text options", () => {
  it.each(["utf-8", "utf-16le", "utf-16be"])("round trips %s", (encoding) =>
    expect(decodeText(encodeText("你好 🌍", encoding), encoding)).toBe(
      "你好 🌍",
    ),
  );
  it("supports strict Latin-1", () => {
    expect(decodeText(encodeText("é\u0080", "latin1"), "latin1")).toBe(
      "é\u0080",
    );
    expect(() => encodeText("你好", "latin1")).toThrow("ENCODING");
  });
  it("sorts keys, uses tabs, escapes Unicode and preserves number lexemes", () => {
    const result = formatJSON(
      '{"z":1e+99,"a":{"你好":9007199254740993}}',
      false,
      { indent: "tab", sortKeys: true, ascii: true },
    );
    expect(result).toContain('\n\t"a"');
    expect(result).toContain("\\u4f60\\u597d");
    expect(result).toContain("1e+99");
    expect(result).toContain("9007199254740993");
  });
  it("builds duplicate query parameters and strictly encodes RFC3986 punctuation", () => {
    expect(urlCodec('[["a","1"],["a","x y"]]', "build-query", false)).toBe(
      "a=1&a=x+y",
    );
    expect(urlCodec("!'()*", "rfc3986", false)).toBe("%21%27%28%29%2A");
  });
  it("preserves nanosecond integers and negative sub-millisecond dates", () => {
    expect(
      convertTimestamp(
        "1788580800123456789",
        "nanoseconds",
        "to-date",
        "Asia/Shanghai",
      ).nanoseconds,
    ).toBe("1788580800123456789");
    expect(convertTimestamp("-1", "nanoseconds", "to-date", "UTC").utc).toBe(
      "1969-12-31T23:59:59.999999999Z",
    );
    expect(() => convertTimestamp("1.5", "nanoseconds", "to-date")).toThrow(
      "DATE",
    );
  });
  it("normalizes Unicode, cases and natural sorting before adding affixes", () => {
    const result = cleanText("x10\nx2\ne\u0301", {
      trim: true,
      empty: true,
      unique: true,
      ignoreCase: false,
      sort: "natural",
      newline: "cr",
      normalization: "NFC",
      casing: "upper",
      prefix: "[",
      suffix: "]",
    });
    expect(result.output).toBe("[É]\r[X2]\r[X10]");
  });
});
describe("expanded PDF operations and thresholds", () => {
  it("accepts thousands of pages with odd/even, last and open ranges", () => {
    expect(MAX_PDF_BYTES).toBe(512 * 1024 * 1024);
    expect(MAX_PAGES).toBe(5000);
    expect(pagesFromRange("odd", 1001)).toHaveLength(501);
    expect(pagesFromRange("even", 1001)).toHaveLength(500);
    expect(pagesFromRange("last,998-,-2", 1000)).toEqual([
      999, 997, 998, 999, 0, 1,
    ]);
    expect(() => pagesFromRange("even", 1)).toThrow("PAGES");
  });
  it("processes a document beyond the previous 300-page cap", async () => {
    const source = await PDFDocument.create();
    for (let i = 0; i < 350; i++) source.addPage([100 + i, 200]);
    const bytes = await source.save();
    const results = await splitPDF(bytes, "1-3;349-last", "custom", 1);
    expect(
      await Promise.all(
        results.map(async (file) => (await loadPDF(file.bytes)).getPageCount()),
      ),
    ).toEqual([3, 2]);
    const merged = await loadPDF(
      await mergePDFs([
        {
          name: "large.pdf",
          file: new Blob([bytes as Uint8Array<ArrayBuffer>]),
          range: "last,1",
        },
      ]),
    );
    expect(merged.getPages().map((page) => page.getWidth())).toEqual([
      449, 100,
    ]);
  });
  it("supports custom physical page dimensions", async () => {
    const bytes = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const doc = await loadPDF(
      await imagesPDF([{ bytes }], "custom", false, 0, {
        width: 100,
        height: 150,
        dpi: 300,
        fit: "shrink",
      }),
    );
    expect(doc.getPage(0).getWidth()).toBeCloseTo((100 * 72) / 25.4);
    expect(doc.getPage(0).getHeight()).toBeCloseTo((150 * 72) / 25.4);
  });
});

it("round trips exact fractional seconds, milliseconds and ISO nanoseconds", () => {
  const result = convertTimestamp("-1", "nanoseconds", "to-date");
  expect(result.seconds).toBe("-0.000000001");
  expect(result.milliseconds).toBe("-0.000001");
  expect(result.microseconds).toBe("-0.001");
  expect(
    convertTimestamp(result.seconds, "seconds", "to-date").nanoseconds,
  ).toBe("-1");
  expect(
    convertTimestamp(result.utc, "seconds", "to-timestamp").nanoseconds,
  ).toBe("-1");
  expect(
    convertTimestamp(
      "2026-09-05T12:00:00.123456789+08:00",
      "seconds",
      "to-timestamp",
    ).utc,
  ).toBe("2026-09-05T04:00:00.123456789Z");
});
