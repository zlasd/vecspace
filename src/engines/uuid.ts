import { v1, v3, v4, v5, v6, v7, NIL, MAX, validate } from "uuid";
export const namespaces = {
  dns: v5.DNS,
  url: v5.URL,
  oid: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  x500: "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
};
export function normalizeUUID(input: string) {
  let value = input
    .trim()
    .replace(/^urn:uuid:/i, "")
    .replace(/^\{(.*)\}$/, "$1");
  if (/^[a-f\d]{32}$/i.test(value))
    value = `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  return value.toLowerCase();
}
export function generateUUIDs(options: {
  version: string;
  count: number;
  name?: string;
  namespace?: string;
  format?: string;
  uppercase?: boolean;
}) {
  const { version, count } = options;
  if (
    !["3", "5"].includes(version) &&
    (!Number.isInteger(count) || count < 1 || count > 10000)
  )
    throw new Error("INPUT");
  let values: string[];
  if (version === "3" || version === "5") {
    const namespace = normalizeUUID(options.namespace ?? namespaces.dns);
    if (!validate(namespace)) throw new Error("INPUT");
    const names = (options.name ?? "").split(/\r\n|\r|\n/);
    if (names.length > 10000) throw new Error("LIMIT");
    values = names.map((name) => (version === "3" ? v3 : v5)(name, namespace));
  } else {
    const generator: Record<string, () => string> = {
      "1": v1,
      "4": v4,
      "6": v6,
      "7": v7,
      nil: () => NIL,
      max: () => MAX,
    };
    if (!generator[version]) throw new Error("INPUT");
    values = Array.from({ length: count }, () => generator[version]());
  }
  return values
    .map((value) => {
      if (options.uppercase) value = value.toUpperCase();
      if (options.format === "compact") return value.replace(/-/g, "");
      if (options.format === "urn") return `urn:uuid:${value}`;
      if (options.format === "braces") return `{${value}}`;
      return value;
    })
    .join("\n");
}
