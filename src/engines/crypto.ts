import { fromBase64, toBase64 } from "./developer";
import { hashInput, encodeDigest, decodeDigest } from "./hash";
export type Algorithm =
  | "RSA-PSS"
  | "RSASSA-PKCS1-v1_5"
  | "RSA-OAEP"
  | "ECDSA"
  | "ECDH"
  | "Ed25519"
  | "X25519";
export type KeyOptions = {
  curve?: string;
  hash?: string;
  saltLength?: number;
  encoding?: string;
  ecdsaFormat?: string;
};
export function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}
function subtle() {
  if (!globalThis.crypto?.subtle) throw new Error("CRYPTO");
  return globalThis.crypto.subtle;
}
function keyAlgorithm(algorithm: Algorithm, options: KeyOptions = {}) {
  if (algorithm.startsWith("RSA") || algorithm === "RSASSA-PKCS1-v1_5")
    return { name: algorithm, hash: options.hash || "SHA-256" };
  if (algorithm === "ECDSA" || algorithm === "ECDH")
    return { name: algorithm, namedCurve: options.curve || "P-256" };
  if (algorithm === "Ed25519" || algorithm === "X25519")
    return { name: algorithm };
  throw new Error("INPUT");
}
function signatureAlgorithm(algorithm: Algorithm, options: KeyOptions = {}) {
  if (algorithm === "RSA-PSS") {
    const saltLength = options.saltLength ?? 32;
    if (!Number.isInteger(saltLength) || saltLength < 0 || saltLength > 512)
      throw new Error("INPUT");
    return { name: algorithm, saltLength };
  }
  if (algorithm === "ECDSA")
    return { name: algorithm, hash: options.hash || "SHA-256" };
  if (algorithm === "Ed25519" || algorithm === "RSASSA-PKCS1-v1_5")
    return { name: algorithm };
  throw new Error("INPUT");
}
export async function hashBytes(bytes: Uint8Array, algorithm: string) {
  return hashInput(bytes, algorithm);
}
function pem(bytes: ArrayBuffer, kind: string) {
  const base = toBase64(new Uint8Array(bytes));
  return `-----BEGIN ${kind}-----\n${base.match(/.{1,64}/g)!.join("\n")}\n-----END ${kind}-----`;
}
export async function generateKeys(
  algorithm: Algorithm,
  bits = 2048,
  options: KeyOptions = {},
) {
  if (![2048, 3072, 4096, 8192].includes(bits)) throw new Error("INPUT");
  const rsa = algorithm.startsWith("RSA");
  const params = rsa
    ? {
        ...keyAlgorithm(algorithm, options),
        modulusLength: bits,
        publicExponent: new Uint8Array([1, 0, 1]),
      }
    : keyAlgorithm(algorithm, options);
  const usages: KeyUsage[] =
    algorithm === "RSA-OAEP"
      ? ["encrypt", "decrypt"]
      : algorithm === "ECDH" || algorithm === "X25519"
        ? ["deriveBits", "deriveKey"]
        : ["sign", "verify"];
  const keys = (await subtle().generateKey(
    params,
    true,
    usages,
  )) as CryptoKeyPair;
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
  options: KeyOptions = {},
) {
  try {
    const usage: KeyUsage[] = [privateKey ? "sign" : "verify"];
    const value = input.trim();
    if (value.startsWith("{"))
      return await subtle().importKey(
        "jwk",
        JSON.parse(value),
        keyAlgorithm(algorithm, options),
        false,
        usage,
      );
    const kind = privateKey ? "PRIVATE KEY" : "PUBLIC KEY";
    const match = value.match(
      new RegExp(
        `^-----BEGIN ${kind}-----\\s*([A-Za-z0-9+/=\\s]+)\\s*-----END ${kind}-----$`,
      ),
    );
    if (!match) throw new Error("KEY");
    return await subtle().importKey(
      privateKey ? "pkcs8" : "spki",
      buffer(fromBase64(match[1])),
      keyAlgorithm(algorithm, options),
      false,
      usage,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "CRYPTO") throw error;
    throw new Error("KEY");
  }
}
export function rawToDER(raw: Uint8Array) {
  if (![64, 96, 132].includes(raw.length)) throw new Error("KEY");
  const integer = (part: Uint8Array) => {
    let start = 0;
    while (start < part.length - 1 && part[start] === 0) start++;
    const bytes = Array.from(part.subarray(start));
    if (bytes[0] & 128) bytes.unshift(0);
    return [2, bytes.length, ...bytes];
  };
  const body = [
    ...integer(raw.subarray(0, raw.length / 2)),
    ...integer(raw.subarray(raw.length / 2)),
  ];
  return new Uint8Array([
    0x30,
    ...(body.length >= 128 ? [0x81, body.length] : [body.length]),
    ...body,
  ]);
}
export function derToRaw(der: Uint8Array, curve = "P-256") {
  const width: Record<string, number> = {
    "P-256": 32,
    "P-384": 48,
    "P-521": 66,
  };
  const size = width[curve];
  if (!size) throw new Error("KEY");
  let at = 0;
  const length = () => {
    const first = der[at++];
    if (first < 128) return first;
    if (first !== 0x81) throw new Error("KEY");
    const n = der[at++];
    if (n < 128) throw new Error("KEY");
    return n;
  };
  if (der[at++] !== 0x30) throw new Error("KEY");
  const len = length();
  if (at + len !== der.length) throw new Error("KEY");
  const parts: Uint8Array[] = [];
  for (let i = 0; i < 2; i++) {
    if (der[at++] !== 2) throw new Error("KEY");
    const n = length();
    let bytes = der.subarray(at, at + n);
    at += n;
    if (!n || bytes.length !== n || bytes[0] & 128) throw new Error("KEY");
    if (bytes[0] === 0 && bytes.length > 1) {
      if (!(bytes[1] & 128)) throw new Error("KEY");
      bytes = bytes.subarray(1);
    }
    if (bytes.length > size) throw new Error("KEY");
    const padded = new Uint8Array(size);
    padded.set(bytes, size - bytes.length);
    parts.push(padded);
  }
  if (at !== der.length) throw new Error("KEY");
  return new Uint8Array([...parts[0], ...parts[1]]);
}
export async function signBytes(
  bytes: Uint8Array,
  input: string,
  algorithm: Algorithm,
  options: KeyOptions = {},
) {
  const key = await importKey(input, algorithm, true, options);
  let signature = new Uint8Array(
    await subtle().sign(
      signatureAlgorithm(algorithm, options),
      key,
      buffer(bytes),
    ),
  );
  if (algorithm === "ECDSA" && options.ecdsaFormat === "der")
    signature = rawToDER(signature);
  return encodeDigest(signature, options.encoding || "base64");
}
export async function verifyBytes(
  bytes: Uint8Array,
  signature: string,
  input: string,
  algorithm: Algorithm,
  options: KeyOptions = {},
) {
  const key = await importKey(input, algorithm, false, options);
  try {
    let decoded = decodeDigest(signature, options.encoding || "base64");
    if (algorithm === "ECDSA" && options.ecdsaFormat === "der")
      decoded = derToRaw(decoded, options.curve);
    return await subtle().verify(
      signatureAlgorithm(algorithm, options),
      key,
      buffer(decoded),
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
  options: KeyOptions = {},
) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  return verifyBytes(
    challenge,
    await signBytes(challenge, privateKey, algorithm, options),
    publicKey,
    algorithm,
    options,
  );
}
