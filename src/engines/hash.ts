import * as wasm from "hash-wasm";
import { MAX_HASH_BYTES } from "../limits";
import { toBase64 } from "./developer";
const creators: Record<string, () => Promise<wasm.IHasher>> = {
  MD5: wasm.createMD5,
  "SHA-1": wasm.createSHA1,
  "SHA-224": wasm.createSHA224,
  "SHA-256": wasm.createSHA256,
  "SHA-384": wasm.createSHA384,
  "SHA-512": wasm.createSHA512,
  "SHA3-224": () => wasm.createSHA3(224),
  "SHA3-256": () => wasm.createSHA3(256),
  "SHA3-384": () => wasm.createSHA3(384),
  "SHA3-512": () => wasm.createSHA3(512),
  "Keccak-256": () => wasm.createKeccak(256),
  "BLAKE2b-512": () => wasm.createBLAKE2b(512),
  "BLAKE2s-256": () => wasm.createBLAKE2s(256),
  "BLAKE3-256": () => wasm.createBLAKE3(256),
  "RIPEMD-160": wasm.createRIPEMD160,
  SM3: wasm.createSM3,
  CRC32: wasm.createCRC32,
  "Adler-32": wasm.createAdler32,
};
export const hashAlgorithms = Object.keys(creators);
export function encodeDigest(bytes: Uint8Array, format = "hex") {
  if (format === "base64" || format === "base64url")
    return toBase64(bytes, format === "base64url");
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return format === "HEX" ? hex.toUpperCase() : hex;
}
export function decodeDigest(input: string, format = "base64") {
  if (format === "hex" || format === "HEX") {
    const value = input.replace(/\s/g, "");
    if (!/^(?:[\da-f]{2})*$/i.test(value)) throw new Error("INPUT");
    return Uint8Array.from(value.match(/../g) ?? [], (pair) =>
      parseInt(pair, 16),
    );
  }
  // Import is static in the worker bundle; no external services are used.
  return decodeBase64(input, format === "base64url");
}
import { fromBase64 as decodeBase64 } from "./developer";
export async function hashInput(
  input: Blob | Uint8Array,
  algorithm: string,
  format = "hex",
  progress: (n: number) => void = () => {},
) {
  if (!creators[algorithm]) throw new Error("INPUT");
  const size = input instanceof Uint8Array ? input.byteLength : input.size;
  if (size > MAX_HASH_BYTES) throw new Error("HASH_LIMIT");
  const hash = await creators[algorithm]();
  hash.init();
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < size; offset += chunkSize) {
    hash.update(
      input instanceof Uint8Array
        ? input.subarray(offset, offset + chunkSize)
        : new Uint8Array(
            await input.slice(offset, offset + chunkSize).arrayBuffer(),
          ),
    );
    progress(Math.min(99, ((offset + chunkSize) / Math.max(size, 1)) * 99));
  }
  return encodeDigest(hash.digest("binary"), format);
}
