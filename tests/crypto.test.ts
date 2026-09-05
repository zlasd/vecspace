import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  constants,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateKeys,
  hashBytes,
  matchKeys,
  signBytes,
  verifyBytes,
} from "../src/engines/crypto";
const message = new TextEncoder().encode("VecSpace 你好");
describe("Web Crypto interoperability", () => {
  it("matches SHA-256 standard abc vector", async () =>
    expect(await hashBytes(new TextEncoder().encode("abc"), "SHA-256")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    ));
  for (const algorithm of ["ECDSA", "RSA-PSS"] as const) {
    it(`${algorithm}: exported keys and signatures interoperate with OpenSSL`, async () => {
      const keys = await generateKeys(algorithm);
      const signature = await signBytes(message, keys.privatePem, algorithm);
      const nodeOptions =
        algorithm === "ECDSA"
          ? { key: keys.publicPem, dsaEncoding: "ieee-p1363" as const }
          : {
              key: keys.publicPem,
              padding: constants.RSA_PKCS1_PSS_PADDING,
              saltLength: 32,
            };
      expect(
        verify(
          "sha256",
          message,
          nodeOptions,
          Buffer.from(signature, "base64"),
        ),
      ).toBe(true);
      expect(
        await verifyBytes(message, signature, keys.publicJwk, algorithm),
      ).toBe(true);
      expect(
        await verifyBytes(
          new TextEncoder().encode("tampered"),
          signature,
          keys.publicPem,
          algorithm,
        ),
      ).toBe(false);
      expect(await matchKeys(keys.privateJwk, keys.publicPem, algorithm)).toBe(
        true,
      );
      const unrelated = await generateKeys(algorithm);
      expect(
        await matchKeys(keys.privatePem, unrelated.publicPem, algorithm),
      ).toBe(false);
      expect(
        await verifyBytes(message, signature, unrelated.publicPem, algorithm),
      ).toBe(false);
      expect(createPublicKey(keys.publicPem).asymmetricKeyType).toBe(
        algorithm === "ECDSA" ? "ec" : "rsa",
      );
    });
    it(`${algorithm}: verifies externally generated signatures`, async () => {
      const pair =
        algorithm === "ECDSA"
          ? generateKeyPairSync("ec", { namedCurve: "prime256v1" })
          : generateKeyPairSync("rsa", { modulusLength: 2048 });
      const options =
        algorithm === "ECDSA"
          ? { key: pair.privateKey, dsaEncoding: "ieee-p1363" as const }
          : {
              key: pair.privateKey,
              padding: constants.RSA_PKCS1_PSS_PADDING,
              saltLength: 32,
            };
      const signature = sign("sha256", message, options).toString("base64");
      expect(
        await verifyBytes(
          message,
          signature,
          pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
          algorithm,
        ),
      ).toBe(true);
    });
  }
  it("rejects a malformed key", async () =>
    await expect(signBytes(message, "not a key", "ECDSA")).rejects.toThrow(
      "KEY",
    ));
});
