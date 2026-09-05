import { parse, stringify, isLosslessNumber } from "lossless-json";
export const MAX_TEXT = 2 * 1024 * 1024;
export const MAX_BYTES = 50 * 1024 * 1024;
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
export function formatJSON(input: string, compact = false) {
  requireText(input);
  try {
    return stringify(parse(input), undefined, compact ? undefined : 2)!;
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
  const value = input.trim();
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
) {
  let ms: number;
  if (direction === "to-date") {
    if (!/^-?\d+(?:\.\d+)?$/.test(input.trim())) throw new Error("DATE");
    ms = Number(input) * (unit === "seconds" ? 1000 : 1);
  } else {
    const value = input.trim();
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
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
    ms = Date.parse(value);
  }
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) throw new Error("DATE");
  const date = new Date(ms);
  return {
    milliseconds: date.getTime(),
    seconds: date.getTime() / 1000,
    utc: date.toISOString(),
    local: date.toString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
  },
) {
  requireText(input);
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
  if (options.sort !== "none")
    lines.sort((a, b) => {
      const x = options.ignoreCase ? a.toLowerCase() : a;
      const y = options.ignoreCase ? b.toLowerCase() : b;
      return (x < y ? -1 : x > y ? 1 : 0) * (options.sort === "desc" ? -1 : 1);
    });
  const output = lines.join(options.newline === "crlf" ? "\r\n" : "\n");
  return {
    output,
    lines: output ? lines.length : 0,
    characters: Array.from(output).length,
    bytes: new TextEncoder().encode(output).length,
  };
}
