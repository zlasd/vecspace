import { fromBase64, toBase64, MAX_BYTES } from "./developer";
export type Algorithm = "RSA-PSS" | "ECDSA";
export function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}
function subtle() {
  if (!globalThis.crypto?.subtle) throw new Error("CRYPTO");
  return globalThis.crypto.subtle;
}
function keyAlgorithm(
  algorithm: Algorithm,
): RsaHashedImportParams | EcKeyImportParams {
  return algorithm === "RSA-PSS"
    ? { name: "RSA-PSS", hash: "SHA-256" }
    : { name: "ECDSA", namedCurve: "P-256" };
}
function signatureAlgorithm(algorithm: Algorithm) {
  return algorithm === "RSA-PSS"
    ? { name: "RSA-PSS", saltLength: 32 }
    : { name: "ECDSA", hash: "SHA-256" };
}
export async function hashBytes(bytes: Uint8Array, algorithm: string) {
  if (bytes.byteLength > MAX_BYTES) throw new Error("LIMIT");
  const digest = new Uint8Array(
    await subtle().digest(algorithm, buffer(bytes)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
function pem(bytes: ArrayBuffer, kind: string) {
  const base = toBase64(new Uint8Array(bytes));
  return `-----BEGIN ${kind}-----\n${base.match(/.{1,64}/g)!.join("\n")}\n-----END ${kind}-----`;
}
export async function generateKeys(algorithm: Algorithm, bits = 2048) {
  if (![2048, 3072, 4096].includes(bits)) throw new Error("INPUT");
  const params =
    algorithm === "RSA-PSS"
      ? {
          name: "RSA-PSS",
          modulusLength: bits,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        }
      : { name: "ECDSA", namedCurve: "P-256" };
  const keys = (await subtle().generateKey(params, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    publicPem: pem(
      await subtle().exportKey("spki", keys.publicKey),
      "PUBLIC KEY",
    ),
    privatePem: pem(
      await subtle().exportKey("pkcs8", keys.privateKey),
      "PRIVATE KEY",
    ),
    publicJwk: JSON.stringify(
      await subtle().exportKey("jwk", keys.publicKey),
      null,
      2,
    ),
    privateJwk: JSON.stringify(
      await subtle().exportKey("jwk", keys.privateKey),
      null,
      2,
    ),
  };
}
export async function importKey(
  input: string,
  algorithm: Algorithm,
  privateKey: boolean,
) {
  try {
    const usage: KeyUsage[] = [privateKey ? "sign" : "verify"];
    const value = input.trim();
    if (value.startsWith("{"))
      return await subtle().importKey(
        "jwk",
        JSON.parse(value),
        keyAlgorithm(algorithm),
        false,
        usage,
      );
    const kind = privateKey ? "PRIVATE KEY" : "PUBLIC KEY";
    const pattern = new RegExp(
      `^-----BEGIN ${kind}-----\\s*([A-Za-z0-9+/=\\s]+)\\s*-----END ${kind}-----$`,
    );
    const match = value.match(pattern);
    if (!match) throw new Error("KEY");
    return await subtle().importKey(
      privateKey ? "pkcs8" : "spki",
      buffer(fromBase64(match[1])),
      keyAlgorithm(algorithm),
      false,
      usage,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "CRYPTO") throw error;
    throw new Error("KEY");
  }
}
export async function signBytes(
  bytes: Uint8Array,
  input: string,
  algorithm: Algorithm,
) {
  const key = await importKey(input, algorithm, true);
  return toBase64(
    new Uint8Array(
      await subtle().sign(signatureAlgorithm(algorithm), key, buffer(bytes)),
    ),
  );
}
export async function verifyBytes(
  bytes: Uint8Array,
  signature: string,
  input: string,
  algorithm: Algorithm,
) {
  const key = await importKey(input, algorithm, false);
  try {
    return await subtle().verify(
      signatureAlgorithm(algorithm),
      key,
      buffer(fromBase64(signature)),
      buffer(bytes),
    );
  } catch {
    throw new Error("KEY");
  }
}
export async function matchKeys(
  privateKey: string,
  publicKey: string,
  algorithm: Algorithm,
) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  return verifyBytes(
    challenge,
    await signBytes(challenge, privateKey, algorithm),
    publicKey,
    algorithm,
  );
}
