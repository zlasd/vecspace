import { parse, stringify, isLosslessNumber } from "lossless-json";
import { MAX_TEXT } from "../limits";
export { MAX_TEXT, MAX_BYTES } from "../limits";
import { normalizeUUID } from "./uuid";
export function requireText(text: string) {
  if (new TextEncoder().encode(text).length > MAX_TEXT)
    throw new Error("LIMIT");
}
export function toBase64(bytes: Uint8Array, url = false): string {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const result = btoa(value);
  return url
    ? result.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : result;
}
export function fromBase64(input: string, url = false): Uint8Array {
  const value = input.replace(/\s/g, "");
  if (!(url ? /^[\w-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/).test(value))
    throw new Error("BASE64");
  const raw = value.replace(/=+$/, "");
  if (raw.length % 4 === 1 || (value.includes("=") && value.length % 4 !== 0))
    throw new Error("BASE64");
  try {
    const bytes = Uint8Array.from(
      atob(raw.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    if (toBase64(bytes, url).replace(/=+$/, "") !== raw)
      throw new Error("BASE64");
    return bytes;
  } catch {
    throw new Error("BASE64");
  }
}
export function decodeUTF8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("UTF8");
  }
}
export function formatJSON(
  input: string,
  compact = false,
  options: { indent?: string; sortKeys?: boolean; ascii?: boolean } = {},
) {
  requireText(input);
  try {
    const sort = (value: any): any => {
      if (
        isLosslessNumber(value) ||
        value === null ||
        typeof value !== "object"
      )
        return value;
      if (Array.isArray(value)) return value.map(sort);
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, sort(value[key])]),
      );
    };
    const value = parse(input);
    const result = stringify(
      options.sortKeys ? sort(value) : value,
      undefined,
      compact
        ? undefined
        : options.indent === "tab"
          ? "\t"
          : Number(options.indent || 2),
    )!;
    return options.ascii
      ? result.replace(
          /[\u007f-\uffff]/g,
          (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
        )
      : result;
  } catch {
    throw new Error("JSON");
  }
}
export type TreeNode = {
  name: string;
  kind: string;
  value?: string;
  children?: TreeNode[];
};
export function jsonTree(input: string): TreeNode {
  try {
    let count = 0;
    const walk = (value: unknown, name: string, depth: number): TreeNode => {
      if (++count > 5000 || depth > 80) return { name, kind: "…", value: "…" };
      if (isLosslessNumber(value))
        return { name, kind: "number", value: value.value };
      if (value && typeof value === "object")
        return {
          name,
          kind: Array.isArray(value) ? "array" : "object",
          children: Object.entries(value).map(([k, v]) =>
            walk(v, k, depth + 1),
          ),
        };
      return {
        name,
        kind: value === null ? "null" : typeof value,
        value: JSON.stringify(value),
      };
    };
    return walk(parse(input), "$", 0);
  } catch {
    throw new Error("JSON");
  }
}
export function urlCodec(input: string, mode: string, decode: boolean): string {
  requireText(input);
  try {
    if (mode === "build-query") {
      const entries = JSON.parse(input);
      if (
        !Array.isArray(entries) ||
        entries.some(
          (pair) =>
            !Array.isArray(pair) ||
            pair.length !== 2 ||
            pair.some((v: unknown) => typeof v !== "string"),
        )
      )
        throw new Error("INPUT");
      return new URLSearchParams(entries).toString();
    }
    if (mode === "rfc3986")
      return decode
        ? decodeURIComponent(input)
        : encodeURIComponent(input).replace(
            /[!'()*]/g,
            (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
          );
    if (mode === "query") {
      const query = input.includes("?")
        ? input.slice(input.indexOf("?") + 1).split("#")[0]
        : input.replace(/^\?/, "");
      // Decode strictly; URLSearchParams silently replaces malformed UTF-8.
      const entries = query
        ? query
            .split("&")
            .filter(Boolean)
            .map((pair) => {
              const at = pair.indexOf("=");
              const key = at < 0 ? pair : pair.slice(0, at);
              const value = at < 0 ? "" : pair.slice(at + 1);
              return [
                decodeURIComponent(key.replace(/\+/g, " ")),
                decodeURIComponent(value.replace(/\+/g, " ")),
              ];
            })
        : [];
      return JSON.stringify(entries, null, 2);
    }
    if (mode === "uri") return decode ? decodeURI(input) : encodeURI(input);
    if (mode === "form")
      return decode
        ? decodeURIComponent(input.replace(/\+/g, " "))
        : new URLSearchParams([["v", input]]).toString().slice(2);
    return decode ? decodeURIComponent(input) : encodeURIComponent(input);
  } catch {
    throw new Error("INPUT");
  }
}
export function inspectUUID(input: string) {
  const value = normalizeUUID(input);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("INPUT");
  return {
    uuid: value.toLowerCase(),
    version: parseInt(value[14], 16),
    variant: /^[89ab]$/i.test(value[19]) ? "RFC 9562" : "Other",
  };
}
export function convertTimestamp(
  input: string,
  unit: string,
  direction: string,
  timezone = "local",
) {
  let ms: number;
  let nanos: bigint | undefined;
  if (direction === "to-date") {
    if (!/^-?\d+(?:\.\d+)?$/.test(input.trim())) throw new Error("DATE");
    const digits: Record<string, number> = {
      seconds: 9,
      milliseconds: 6,
      microseconds: 3,
      nanoseconds: 0,
    };
    const precision = digits[unit];
    if (precision === undefined) throw new Error("DATE");
    const value = input.trim();
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    if (fraction.length > precision) throw new Error("DATE");
    nanos =
      (BigInt(whole) * 10n ** BigInt(precision) +
        BigInt(fraction.padEnd(precision, "0") || "0")) *
      (value.startsWith("-") ? -1n : 1n);
    let millis = nanos / 1000000n;
    if (nanos < 0n && nanos % 1000000n) millis--;
    ms = Number(millis);
  } else {
    const value = input.trim();
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      )
    )
      throw new Error("DATE");
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > days[month - 1] ||
      Number(value.slice(11, 13)) > 23
    )
      throw new Error("DATE");
    ms = Date.parse(value.replace(/\.(\d{3})\d+/, ".$1"));
    if (Number.isFinite(ms)) {
      const fraction = value.match(/\.(\d{1,9})(?=Z|[+-])/)?.[1] || "";
      nanos = BigInt(ms) * 1000000n + BigInt(fraction.padEnd(9, "0").slice(3));
    }
  }
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) throw new Error("DATE");
  const date = new Date(ms);
  nanos ??= BigInt(date.getTime()) * 1000000n;
  let local: string;
  try {
    local =
      timezone === "local"
        ? date.toString()
        : new Intl.DateTimeFormat("en-GB", {
            timeZone: timezone,
            dateStyle: "full",
            timeStyle: "long",
          }).format(date);
  } catch {
    throw new Error("DATE");
  }
  const fraction = ((nanos % 1000000000n) + 1000000000n) % 1000000000n;
  const decimal = (digits: number) => {
    const negative = nanos! < 0n;
    const value = negative ? -nanos! : nanos!;
    const divisor = 10n ** BigInt(digits);
    const fraction = (value % divisor)
      .toString()
      .padStart(digits, "0")
      .replace(/0+$/, "");
    return (
      (negative ? "-" : "") +
      (value / divisor).toString() +
      (fraction ? "." + fraction : "")
    );
  };
  return {
    milliseconds: decimal(6),
    seconds: decimal(9),
    microseconds: decimal(3),
    nanoseconds: nanos.toString(),
    utc:
      nanos % 1000000n
        ? date
            .toISOString()
            .replace(
              /\.\d{3}Z$/,
              "." + fraction.toString().padStart(9, "0") + "Z",
            )
        : date.toISOString(),
    local,
    timezone:
      timezone === "local"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : timezone,
  };
}
export function cleanText(
  input: string,
  options: {
    trim: boolean;
    empty: boolean;
    unique: boolean;
    ignoreCase: boolean;
    sort: string;
    newline: string;
    normalization?: string;
    casing?: string;
    collapse?: boolean;
    prefix?: string;
    suffix?: string;
  },
) {
  requireText(input);
  if (options.normalization && options.normalization !== "none")
    input = input.normalize(options.normalization as "NFC");
  if (options.casing === "upper") input = input.toUpperCase();
  if (options.casing === "lower") input = input.toLowerCase();
  if (options.collapse) input = input.replace(/[^\S\r\n]+/g, " ");
  let lines = input.split(/\r\n|\r|\n/);
  if (options.trim) lines = lines.map((line) => line.trim());
  if (options.empty) lines = lines.filter((line) => line.trim().length);
  if (options.unique) {
    const seen = new Set<string>();
    lines = lines.filter((line) => {
      const key = options.ignoreCase ? line.toLowerCase() : line;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (options.sort === "reverse") lines.reverse();
  else if (options.sort !== "none")
    lines.sort((a, b) => {
      const x = options.ignoreCase ? a.toLowerCase() : a;
      const y = options.ignoreCase ? b.toLowerCase() : b;
      const order =
        options.sort === "natural"
          ? x.localeCompare(y, "en", {
              numeric: true,
              sensitivity: options.ignoreCase ? "accent" : "variant",
            })
          : x < y
            ? -1
            : x > y
              ? 1
              : 0;
      return order * (options.sort === "desc" ? -1 : 1);
    });
  const output = lines
    .map((line) => (options.prefix || "") + line + (options.suffix || ""))
    .join(
      options.newline === "crlf"
        ? "\r\n"
        : options.newline === "cr"
          ? "\r"
          : "\n",
    );
  return {
    output,
    lines: output ? lines.length : 0,
    characters: Array.from(output).length,
    bytes: new TextEncoder().encode(output).length,
  };
}

export function encodeText(input: string, encoding = "utf-8") {
  if (encoding === "utf-8") return new TextEncoder().encode(input);
  if (encoding === "latin1") {
    if (Array.from(input).some((c) => c.codePointAt(0)! > 255))
      throw new Error("ENCODING");
    return Uint8Array.from(input, (c) => c.charCodeAt(0));
  }
  if (!["utf-16le", "utf-16be"].includes(encoding)) throw new Error("ENCODING");
  const bytes = new Uint8Array(input.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < input.length; i++)
    view.setUint16(i * 2, input.charCodeAt(i), encoding === "utf-16le");
  return bytes;
}
export function decodeText(bytes: Uint8Array, encoding = "utf-8") {
  if (encoding === "latin1") {
    let result = "";
    for (let i = 0; i < bytes.length; i += 8192)
      result += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return result;
  }
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new Error(encoding === "utf-8" ? "UTF8" : "ENCODING");
  }
}
