import { Field } from "../components/shared";
import { useLanguage } from "../i18n";
import type { ExtraConfig } from "../tool-options";
type Choice = string | [string, string, string];
export default function ExtraOptions({
  id,
  cfg,
  change,
  keyAlgorithm,
  mode,
}: {
  id: string;
  cfg: ExtraConfig;
  change: (cfg: ExtraConfig) => void;
  keyAlgorithm: string;
  mode: string;
}) {
  const { l } = useLanguage();
  const select = (
    key: keyof ExtraConfig,
    zh: string,
    en: string,
    choices: Choice[],
  ) => (
    <Field label={l(zh, en)}>
      <select
        value={String(cfg[key])}
        onChange={(e) => change({ ...cfg, [key]: e.target.value })}
      >
        {choices.map((choice) => {
          const [value, z, e] =
            typeof choice === "string" ? [choice, choice, choice] : choice;
          return (
            <option key={value} value={value}>
              {l(z, e)}
            </option>
          );
        })}
      </select>
    </Field>
  );
  const check = (key: keyof ExtraConfig, zh: string, en: string) => (
    <label className="checkbox">
      <input
        type="checkbox"
        checked={Boolean(cfg[key])}
        onChange={(e) => change({ ...cfg, [key]: e.target.checked })}
      />
      {l(zh, en)}
    </label>
  );
  return (
    <div className="options-row extra-options">
      {id === "base64" && (
        <>
          {select("encoding", "文本字符编码", "Text encoding", [
            "utf-8",
            "utf-16le",
            "utf-16be",
            "latin1",
            ...(mode === "decode"
              ? ["gb18030", "shift_jis", "big5", "windows-1252"]
              : []),
          ])}
          {mode !== "decode" && (
            <>
              {select("padding", "末尾填充", "Padding", [
                ["auto", "按字母表默认", "Alphabet default"],
                ["include", "保留 =", "Include ="],
                ["omit", "去掉 =", "Omit ="],
              ])}
              <Field label={l("输出换行", "Line wrapping")}>
                <select
                  value={cfg.wrap}
                  onChange={(e) =>
                    change({ ...cfg, wrap: Number(e.target.value) })
                  }
                >
                  <option value={0}>{l("不换行", "No wrapping")}</option>
                  <option value={64}>64</option>
                  <option value={76}>76 (MIME)</option>
                </select>
              </Field>
            </>
          )}
        </>
      )}
      {id === "url" &&
        check("batch", "逐行批量编解码", "Encode/decode one line at a time")}
      {id === "json" && (
        <>
          {select("jsonIndent", "缩进", "Indentation", [
            ["2", "2 空格", "2 spaces"],
            ["4", "4 空格", "4 spaces"],
            ["8", "8 空格", "8 spaces"],
            ["tab", "制表符", "Tab"],
          ])}
          {check("jsonSort", "递归排序对象键", "Sort object keys recursively")}
          {check(
            "jsonAscii",
            "转义非 ASCII 字符",
            "Escape non-ASCII characters",
          )}
        </>
      )}
      {id === "uuid" && mode !== "inspect" && (
        <>
          {select("uuidVersion", "UUID 版本", "UUID version", [
            "1",
            "3",
            "4",
            "5",
            "6",
            "7",
            ["nil", "Nil（全零）", "Nil (all zeros)"],
            ["max", "Max（全一）", "Max (all ones)"],
          ])}
          {select("uuidFormat", "输出格式", "Output format", [
            ["standard", "标准 UUID", "Standard UUID"],
            ["compact", "无连字符", "No hyphens"],
            ["urn", "URN", "URN"],
            ["braces", "花括号", "Braces"],
          ])}
          {check("uuidUppercase", "大写", "Uppercase")}
          {["3", "5"].includes(cfg.uuidVersion) && (
            <>
              {select("uuidNamespace", "命名空间", "Namespace", [
                "dns",
                "url",
                "oid",
                "x500",
                ["custom", "自定义", "Custom"],
              ])}
              {cfg.uuidNamespace === "custom" && (
                <Field label={l("命名空间 UUID", "Namespace UUID")}>
                  <input
                    value={cfg.customNamespace}
                    onChange={(e) =>
                      change({ ...cfg, customNamespace: e.target.value })
                    }
                  />
                </Field>
              )}
            </>
          )}
        </>
      )}
      {id === "timestamp" && (
        <Field label={l("输出时区（IANA）", "Output time zone (IANA)")}>
          <input
            list="timezones"
            value={cfg.timezone}
            onChange={(e) => change({ ...cfg, timezone: e.target.value })}
          />
          <datalist id="timezones">
            {[
              "local",
              "UTC",
              "Asia/Shanghai",
              "Asia/Tokyo",
              "Asia/Hong_Kong",
              "America/New_York",
              "Europe/London",
              "Europe/Berlin",
              "Australia/Sydney",
            ].map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </Field>
      )}
      {id === "hash" &&
        select("hashFormat", "摘要输出格式", "Digest format", [
          ["hex", "十六进制（小写）", "Hex (lowercase)"],
          ["HEX", "十六进制（大写）", "Hex (uppercase)"],
          "base64",
          "base64url",
        ])}
      {["hash", "signature"].includes(id) &&
        select("inputFormat", "文本输入解释为", "Interpret text input as", [
          ["utf8", "UTF-8 文本", "UTF-8 text"],
          ["hex", "Hex 字节", "Hex bytes"],
          "base64",
          "base64url",
        ])}
      {["keys", "signature"].includes(id) && (
        <>
          {["ECDSA", "ECDH"].includes(keyAlgorithm) &&
            select("curve", "椭圆曲线", "Curve", ["P-256", "P-384", "P-521"])}
          {!["Ed25519", "X25519", "ECDH"].includes(keyAlgorithm) &&
            select("keyHash", "摘要算法", "Digest algorithm", [
              "SHA-256",
              "SHA-384",
              "SHA-512",
            ])}
          {id === "signature" && (
            <>
              {select("signatureEncoding", "签名编码", "Signature encoding", [
                "base64",
                "base64url",
                ["hex", "十六进制", "Hex"],
              ])}
              {keyAlgorithm === "ECDSA" &&
                select(
                  "ecdsaFormat",
                  "ECDSA 签名结构",
                  "ECDSA signature structure",
                  [
                    ["raw", "IEEE P1363（r‖s）", "IEEE P1363 (r‖s)"],
                    ["der", "ASN.1 DER", "ASN.1 DER"],
                  ],
                )}
              {keyAlgorithm === "RSA-PSS" && (
                <Field
                  label={l("PSS 盐长度（字节）", "PSS salt length (bytes)")}
                >
                  <input
                    type="number"
                    min={0}
                    max={512}
                    value={cfg.saltLength}
                    onChange={(e) =>
                      change({ ...cfg, saltLength: Number(e.target.value) })
                    }
                  />
                </Field>
              )}
            </>
          )}
        </>
      )}
      {id === "text" && (
        <>
          {select("normalization", "Unicode 标准化", "Unicode normalization", [
            ["none", "不转换", "Unchanged"],
            "NFC",
            "NFD",
            "NFKC",
            "NFKD",
          ])}
          {select("casing", "大小写转换", "Letter case", [
            ["none", "保持", "Unchanged"],
            ["upper", "大写", "Uppercase"],
            ["lower", "小写", "Lowercase"],
          ])}
          {check("collapse", "合并连续空白", "Collapse repeated whitespace")}
          <Field label={l("每行前缀", "Line prefix")}>
            <input
              value={cfg.prefix}
              onChange={(e) => change({ ...cfg, prefix: e.target.value })}
            />
          </Field>
          <Field label={l("每行后缀", "Line suffix")}>
            <input
              value={cfg.suffix}
              onChange={(e) => change({ ...cfg, suffix: e.target.value })}
            />
          </Field>
        </>
      )}
    </div>
  );
}
