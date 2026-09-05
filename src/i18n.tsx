import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
export type Locale = "zh" | "en";
export const LOCALE_KEY = "vecspace.language";
export function detectLocale(
  saved: string | null,
  languages: readonly string[],
): Locale {
  if (saved === "zh" || saved === "en") return saved;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return "zh";
    if (/^en(?:-|$)/i.test(language)) return "en";
  }
  return "en";
}
export function initialLocale(): Locale {
  let saved = null;
  try {
    saved = localStorage.getItem(LOCALE_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
  return detectLocale(
    saved,
    navigator.languages?.length ? navigator.languages : [navigator.language],
  );
}
const Context = createContext({
  locale: "en" as Locale,
  setLocale: (_: Locale) => {},
  l: (zh: string, en: string) => en,
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, update] = useState(initialLocale);
  const setLocale = (next: Locale) => {
    update(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      /* Session choice still works. */
    }
  };
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
  return (
    <Context.Provider
      value={{ locale, setLocale, l: (zh, en) => (locale === "zh" ? zh : en) }}
    >
      {children}
    </Context.Provider>
  );
}
export const useLanguage = () => useContext(Context);
export const errors: Record<string, [string, string]> = {
  INPUT: [
    "输入无效，请检查格式或参数。",
    "Invalid input. Check the format and options.",
  ],
  BASE64: [
    "Base64 格式无效，或填充/末尾位不正确。",
    "Invalid Base64 alphabet, padding, or trailing bits.",
  ],
  UTF8: [
    "结果不是有效的 UTF-8 文本，请选择下载二进制文件。",
    "The result is not valid UTF-8. Choose binary download instead.",
  ],
  JSON: [
    "JSON 无效，请检查引号、逗号和嵌套结构。",
    "Invalid JSON. Check quotes, commas, and nesting.",
  ],
  LIMIT: [
    "输入超过当前限制。文本最多 2 MiB，文件合计最多 50 MiB，PDF 最多 300 页。",
    "Input exceeds the current limit: 2 MiB of text, 50 MiB of files, or 300 PDF pages.",
  ],
  OUTPUT_LIMIT: [
    "图片输出合计超过 150 MiB，请减少页数或降低倍率。",
    "Exported images exceed 150 MiB. Select fewer pages or reduce the scale.",
  ],
  PAGES: [
    "页码范围无效或为空。请使用 1,3-5；页面可重复，顺序将保留。",
    "Invalid or empty page range. Use 1,3-5. Repetitions and order are preserved.",
  ],
  ENCRYPTED: [
    "首版不支持加密 PDF，请先使用其他工具解密。",
    "Encrypted PDFs are not supported in this release. Decrypt the file before importing.",
  ],
  PDF: [
    "无法读取 PDF。文件可能已损坏或格式不受支持。",
    "Cannot read this PDF. It may be damaged or unsupported.",
  ],
  IMAGE: [
    "无法读取图片，请使用有效的 JPEG 或 PNG。",
    "Cannot read the image. Use a valid JPEG or PNG.",
  ],
  PIXELS: [
    "图像尺寸过大，请降低倍率或使用较小图片（最多 1600 万像素）。",
    "Image dimensions are too large. Reduce scale or use smaller images (16 megapixels maximum).",
  ],
  KEY: [
    "密钥、签名格式或算法不匹配。支持 JWK、SPKI 公钥与 PKCS#8 私钥。",
    "Invalid key/signature or algorithm mismatch. Use JWK, SPKI public keys, or PKCS#8 private keys.",
  ],
  CRYPTO: [
    "当前浏览器不支持此密码学操作，请使用较新的浏览器并通过 HTTPS 或 localhost 访问。",
    "This cryptographic operation is unavailable. Use a current browser over HTTPS or localhost.",
  ],
  DATE: [
    "日期无效。ISO 日期须包含 Z 或时区偏移，例如 2026-09-05T12:00:00+08:00。",
    "Invalid date. Include Z or a time-zone offset, for example 2026-09-05T12:00:00+08:00.",
  ],
  EMPTY: [
    "请先提供输入文件或选择页面。",
    "Add input files or select pages first.",
  ],
  CANCELLED: [
    "任务已取消，可以重新开始。",
    "Task cancelled. You can start again.",
  ],
  UNKNOWN: [
    "操作失败，请检查输入后重试。",
    "Operation failed. Check the input and try again.",
  ],
};
export function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return errors[message] ? message : "UNKNOWN";
}
