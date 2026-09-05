import { useState } from "react";
import { ArrowRight, RotateCcw, CheckCircle2, XCircle } from "lucide-react";
import { useLanguage, errorCode } from "../i18n";
import { useTask } from "../task";
import {
  convertTimestamp,
  inspectUUID,
  urlCodec,
  type TreeNode,
} from "../engines/developer";
import {
  ErrorNotice,
  Field,
  FilePicker,
  FileResults,
  Output,
  Progress,
  SelectedFile,
} from "../components/shared";
import ExtraOptions from "./ExtraOptions";
import { defaults, hashAlgorithms } from "../tool-options";
import { namespaces } from "../engines/uuid";
import { MAX_HASH_BYTES } from "../limits";
function Tree({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return node.children ? (
    <details open={depth < 2} className="tree-node">
      <summary>
        <b>{node.name}</b>{" "}
        <small>
          {node.kind} [{node.children.length}]
        </small>
      </summary>
      {node.children.map((child, i) => (
        <Tree key={i} node={child} depth={depth + 1} />
      ))}
    </details>
  ) : (
    <div className="tree-leaf">
      <b>{node.name}</b>
      <span>{node.value}</span>
    </div>
  );
}
export default function Developer({ id }: { id: string }) {
  const { l } = useLanguage();
  const task = useTask();
  const [cfg, setCfg] = useState(defaults);
  const keyOptions = {
    curve: cfg.curve,
    hash: cfg.keyHash,
    saltLength: cfg.saltLength,
    encoding: cfg.signatureEncoding,
    ecdsaFormat: cfg.ecdsaFormat,
  };
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("text");
  const [mode, setMode] = useState("encode");
  const [variant, setVariant] = useState("standard");
  const [binary, setBinary] = useState(false);
  const [urlMode, setUrlMode] = useState("component");
  const [jsonMode, setJsonMode] = useState("format");
  const [count, setCount] = useState(1);
  const [unit, setUnit] = useState("seconds");
  const [direction, setDirection] = useState("to-date");
  const [algorithm, setAlgorithm] = useState("SHA-256");
  const [expected, setExpected] = useState("");
  const [keyAlgorithm, setKeyAlgorithm] = useState("ECDSA");
  const [bits, setBits] = useState(2048);
  const [keyFormat, setKeyFormat] = useState("pem");
  const [privateKey, setPrivateKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [signature, setSignature] = useState("");
  const [signMode, setSignMode] = useState("sign");
  const [options, setOptions] = useState({
    trim: true,
    empty: true,
    unique: true,
    ignoreCase: false,
    sort: "none",
    newline: "lf",
  });
  const [localResult, setLocalResult] = useState<any>(null);
  const [localError, setLocalError] = useState("");
  const clearResult = () => {
    task.clear();
    setLocalResult(null);
    setLocalError("");
  };
  const changeMode = (next: string) => {
    setMode(next);
    if (
      id === "base64" &&
      next === "encode" &&
      !["utf-8", "utf-16le", "utf-16be", "latin1"].includes(cfg.encoding)
    )
      setCfg({ ...cfg, encoding: "utf-8" });
  };
  const result = task.result || localResult;
  const run = () => {
    clearResult();
    try {
      const payload = { text, file: source === "file" ? file : null };
      if (
        source === "file" &&
        ["base64", "hash", "signature"].includes(id) &&
        !(id === "signature" && signMode === "match") &&
        !file
      )
        throw new Error("EMPTY");
      if (id === "base64")
        task.run("base64", {
          ...payload,
          decode: mode === "decode",
          url: variant === "url",
          binary,
          encoding: cfg.encoding,
          padding: cfg.padding,
          wrap: cfg.wrap,
        });
      if (id === "url")
        setLocalResult({
          text:
            cfg.batch && !["query", "build-query"].includes(urlMode)
              ? text
                  .split(/\r\n|\r|\n/)
                  .map((line) => urlCodec(line, urlMode, mode === "decode"))
                  .join("\n")
              : urlCodec(text, urlMode, mode === "decode"),
        });
      if (id === "json")
        task.run("json", {
          text,
          compact: jsonMode === "compact",
          tree: jsonMode === "tree",
          jsonOptions: {
            indent: cfg.jsonIndent,
            sortKeys: cfg.jsonSort,
            ascii: cfg.jsonAscii,
          },
        });
      if (id === "uuid") {
        if (mode === "inspect") setLocalResult({ uuid: inspectUUID(text) });
        else
          task.run("uuid", {
            version: cfg.uuidVersion,
            count,
            name: text,
            namespace:
              cfg.uuidNamespace === "custom"
                ? cfg.customNamespace
                : namespaces[cfg.uuidNamespace as keyof typeof namespaces],
            format: cfg.uuidFormat,
            uppercase: cfg.uuidUppercase,
          });
      }
      if (id === "timestamp")
        setLocalResult({
          timestamp: convertTimestamp(text, unit, direction, cfg.timezone),
        });
      if (id === "hash")
        task.run("hash", {
          ...payload,
          algorithm,
          outputFormat: cfg.hashFormat,
          inputFormat: cfg.inputFormat,
        });
      if (id === "keys")
        task.run("keys", { algorithm: keyAlgorithm, bits, keyOptions });
      if (id === "signature")
        task.run(signMode, {
          ...payload,
          algorithm: keyAlgorithm,
          privateKey,
          publicKey,
          signature,
          keyOptions,
          inputFormat: cfg.inputFormat,
        });
      if (id === "text")
        task.run("text", {
          text,
          options: {
            ...options,
            normalization: cfg.normalization,
            casing: cfg.casing,
            collapse: cfg.collapse,
            prefix: cfg.prefix,
            suffix: cfg.suffix,
          },
        });
    } catch (error) {
      setLocalError(errorCode(error));
    }
  };
  const reset = () => {
    clearResult();
    setText("");
    setFile(null);
    setPrivateKey("");
    setPublicKey("");
    setSignature("");
    setExpected("");
  };
  const needsText =
    !["keys"].includes(id) &&
    !(
      id === "uuid" &&
      mode !== "inspect" &&
      !["3", "5"].includes(cfg.uuidVersion)
    ) &&
    !(id === "signature" && signMode === "match");
  const fileCapable =
    ["base64", "hash", "signature"].includes(id) &&
    !(id === "signature" && signMode === "match");
  const expectedMatch =
    result?.text && expected.trim()
      ? ["hex", "HEX"].includes(cfg.hashFormat)
        ? result.text.toLowerCase() === expected.trim().toLowerCase()
        : result.text === expected.trim()
      : null;
  return (
    <div className="tool-body">
      <fieldset
        disabled={task.busy}
        onChange={(e) => {
          if (!(e.target as HTMLElement).hasAttribute("data-preserve-result"))
            clearResult();
        }}
      >
        <div className="options-row">
          {["base64", "url"].includes(id) && (
            <Field label={l("操作", "Operation")}>
              <select value={mode} onChange={(e) => changeMode(e.target.value)}>
                <option value="encode">{l("编码", "Encode")}</option>
                <option value="decode">{l("解码", "Decode")}</option>
              </select>
            </Field>
          )}
          {id === "base64" && (
            <>
              <Field label={l("字母表", "Alphabet")}>
                <select
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                >
                  <option value="standard">Base64</option>
                  <option value="url">Base64URL</option>
                </select>
              </Field>
              {mode === "decode" && (
                <Field label={l("解码输出", "Decoded output")}>
                  <select
                    value={binary ? "binary" : "text"}
                    onChange={(e) => setBinary(e.target.value === "binary")}
                  >
                    <option value="text">{l("文本", "Text")}</option>
                    <option value="binary">
                      {l("二进制文件", "Binary file")}
                    </option>
                  </select>
                </Field>
              )}
            </>
          )}
          {id === "url" && (
            <Field label={l("模式", "Mode")}>
              <select
                value={urlMode}
                onChange={(e) => setUrlMode(e.target.value)}
              >
                <option value="component">
                  {l("URL 组件", "URL component")}
                </option>
                <option value="rfc3986">RFC 3986</option>
                <option value="build-query">
                  {l("JSON 键值对 → 查询参数", "JSON pairs → query string")}
                </option>
                <option value="uri">{l("完整 URI", "Full URI")}</option>
                <option value="form">
                  {l("表单值（空格 ↔ +）", "Form value (space ↔ +)")}
                </option>
                <option value="query">
                  {l("查询参数解析", "Parse query parameters")}
                </option>
              </select>
            </Field>
          )}
          {id === "json" && (
            <Field label={l("操作", "Operation")}>
              <select
                value={jsonMode}
                onChange={(e) => setJsonMode(e.target.value)}
              >
                <option value="format">
                  {l("校验与格式化", "Validate & format")}
                </option>
                <option value="compact">{l("压缩", "Minify")}</option>
                <option value="tree">{l("树状查看", "Tree view")}</option>
              </select>
            </Field>
          )}
          {id === "uuid" && (
            <>
              <Field label={l("操作", "Operation")}>
                <select
                  value={mode}
                  onChange={(e) => changeMode(e.target.value)}
                >
                  <option value="encode">
                    {l("生成 UUID", "Generate UUID")}
                  </option>
                  <option value="inspect">
                    {l("检查 UUID", "Inspect UUID")}
                  </option>
                </select>
              </Field>
              {mode !== "inspect" && !["3", "5"].includes(cfg.uuidVersion) && (
                <Field label={l("数量（1–10000）", "Count (1–10000)")}>
                  <input
                    type="number"
                    value={count}
                    min={1}
                    max={10000}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </Field>
              )}
            </>
          )}
          {id === "timestamp" && (
            <>
              <Field label={l("方向", "Direction")}>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="to-date">
                    {l("时间戳 → 日期", "Timestamp → date")}
                  </option>
                  <option value="to-timestamp">
                    {l("日期 → 时间戳", "Date → timestamp")}
                  </option>
                </select>
              </Field>
              <Field label={l("时间戳单位", "Timestamp unit")}>
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="microseconds">
                    {l("微秒", "Microseconds")}
                  </option>
                  <option value="nanoseconds">
                    {l("纳秒", "Nanoseconds")}
                  </option>
                  <option value="seconds">{l("秒", "Seconds")}</option>
                  <option value="milliseconds">
                    {l("毫秒", "Milliseconds")}
                  </option>
                </select>
              </Field>
              <button
                className="secondary current-time"
                onClick={() => {
                  clearResult();
                  setText(
                    direction === "to-date"
                      ? String(
                          unit === "seconds"
                            ? Math.floor(Date.now() / 1000)
                            : unit === "microseconds"
                              ? BigInt(Date.now()) * 1000n
                              : unit === "nanoseconds"
                                ? BigInt(Date.now()) * 1000000n
                                : Date.now(),
                        )
                      : new Date().toISOString(),
                  );
                }}
              >
                {l("使用当前时间", "Use current time")}
              </button>
            </>
          )}
          {id === "hash" && (
            <>
              <Field label={l("算法", "Algorithm")}>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                >
                  {hashAlgorithms.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </Field>
              <Field label={l("预期摘要（可选）", "Expected hash (optional)")}>
                <input
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  placeholder={l(
                    "使用所选输出格式",
                    "Use the selected output format",
                  )}
                />
              </Field>
            </>
          )}
          {["keys", "signature"].includes(id) && (
            <>
              <Field label={l("算法", "Algorithm")}>
                <select
                  value={keyAlgorithm}
                  onChange={(e) => setKeyAlgorithm(e.target.value)}
                >
                  {[
                    "ECDSA",
                    "RSA-PSS",
                    "RSASSA-PKCS1-v1_5",
                    "Ed25519",
                    ...(id === "keys" ? ["RSA-OAEP", "ECDH", "X25519"] : []),
                  ].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              {id === "keys" && keyAlgorithm.startsWith("RSA") && (
                <Field label={l("密钥长度", "Key size")}>
                  <select
                    value={bits}
                    onChange={(e) => setBits(Number(e.target.value))}
                  >
                    {[2048, 3072, 4096, 8192].map((n) => (
                      <option key={n} value={n}>
                        {n} bits
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {id === "keys" && (
                <Field label={l("导出格式", "Export format")}>
                  <select
                    data-preserve-result
                    value={keyFormat}
                    onChange={(e) => setKeyFormat(e.target.value)}
                  >
                    <option value="pem">PEM · SPKI / PKCS#8</option>
                    <option value="jwk">JWK</option>
                  </select>
                </Field>
              )}
            </>
          )}
          {id === "signature" && (
            <Field label={l("操作", "Operation")}>
              <select
                value={signMode}
                onChange={(e) => setSignMode(e.target.value)}
              >
                <option value="sign">{l("签名", "Sign")}</option>
                <option value="verify">{l("验签", "Verify")}</option>
                <option value="match">
                  {l("公私钥配对检查", "Match key pair")}
                </option>
              </select>
            </Field>
          )}
        </div>
        <ExtraOptions
          id={id}
          cfg={cfg}
          change={setCfg}
          keyAlgorithm={keyAlgorithm}
          mode={mode}
        />
        {id === "hash" &&
          ["MD5", "SHA-1", "CRC32", "Adler-32"].includes(algorithm) && (
            <p className="hint">
              {l(
                "兼容性摘要与校验和，不用于密码存储或安全签名。",
                "Legacy digests and checksums are for compatibility, not password storage or secure signatures.",
              )}
            </p>
          )}
        {id === "uuid" &&
          ["3", "5"].includes(cfg.uuidVersion) &&
          mode !== "inspect" && (
            <p className="hint">
              {l(
                "每行一个名称；相同命名空间与名称会生成相同 UUID。空名称也会参与生成。",
                "One name per line. The same namespace and name produce the same UUID. Empty names are included.",
              )}
            </p>
          )}
        {id === "signature" && (
          <p className="hint">
            {l(
              "验签时请匹配签名算法、曲线、摘要、编码和签名结构；PSS 盐长度须与签名方一致。",
              "Match the algorithm, curve, digest, encoding and signature structure. PSS salt length must match the signer.",
            )}
          </p>
        )}
        {id === "text" && (
          <div className="text-options">
            {(
              [
                ["trim", l("去首尾空白", "Trim lines")],
                ["empty", l("去空行", "Remove empty lines")],
                ["unique", l("去重", "Deduplicate")],
                ["ignoreCase", l("忽略大小写", "Ignore case")],
              ] as const
            ).map(([key, label]) => (
              <label className="checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) =>
                    setOptions({ ...options, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <Field label={l("行排序", "Line sorting")}>
              <select
                value={options.sort}
                onChange={(e) =>
                  setOptions({ ...options, sort: e.target.value })
                }
              >
                <option value="none">{l("保持顺序", "Keep order")}</option>
                <option value="asc">{l("升序", "Ascending")}</option>
                <option value="natural">
                  {l("自然排序（数字）", "Natural sort (numeric)")}
                </option>
                <option value="reverse">
                  {l("反转行顺序", "Reverse line order")}
                </option>
                <option value="desc">{l("降序", "Descending")}</option>
              </select>
            </Field>
            <Field label={l("换行符", "Line endings")}>
              <select
                value={options.newline}
                onChange={(e) =>
                  setOptions({ ...options, newline: e.target.value })
                }
              >
                <option value="cr">CR</option>
                <option value="lf">LF</option>
                <option value="crlf">CRLF</option>
              </select>
            </Field>
          </div>
        )}
        {fileCapable && (
          <div
            className="segmented"
            role="group"
            aria-label={l("输入类型", "Input type")}
          >
            {["text", "file"].map((s) => (
              <button
                key={s}
                aria-pressed={source === s}
                className={source === s ? "active" : ""}
                onClick={() => {
                  clearResult();
                  setSource(s);
                }}
              >
                {s === "text" ? l("文本", "Text") : l("文件", "File")}
              </button>
            ))}
          </div>
        )}
        {needsText && (!fileCapable || source === "text") && (
          <div className="input-panel">
            <div className="panel-heading">
              <label htmlFor="tool-input">
                {id === "timestamp" && direction === "to-timestamp"
                  ? l("ISO 日期（包含时区）", "ISO date (with time zone)")
                  : l("输入", "Input")}
              </label>
              <span className="muted">
                {l("仅本地处理", "Processed locally")}
              </span>
            </div>
            <textarea
              id="tool-input"
              className="code"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={
                id === "json"
                  ? '{"hello": "VecSpace", "id": 9007199254740993}'
                  : id === "timestamp"
                    ? direction === "to-date"
                      ? "1788609600"
                      : "2026-09-05T12:00:00+08:00"
                    : l("输入或粘贴内容…", "Type or paste your input…")
              }
            />
          </div>
        )}
        {needsText && fileCapable && source === "file" && (
          <>
            <FilePicker
              maxBytes={id === "hash" ? MAX_HASH_BYTES : undefined}
              compact
              onFiles={(files) => {
                clearResult();
                setFile(files[0]);
              }}
            />
            {file && (
              <SelectedFile
                file={file}
                clear={() => {
                  clearResult();
                  setFile(null);
                }}
              />
            )}
          </>
        )}
        {id === "signature" && (
          <div className="key-inputs">
            {signMode !== "verify" && (
              <Field
                label={l(
                  "私钥（PKCS#8 PEM / JWK）",
                  "Private key (PKCS#8 PEM / JWK)",
                )}
              >
                <textarea
                  className="code small"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  spellCheck={false}
                />
              </Field>
            )}
            {signMode !== "sign" && (
              <Field
                label={l(
                  "公钥（SPKI PEM / JWK）",
                  "Public key (SPKI PEM / JWK)",
                )}
              >
                <textarea
                  className="code small"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  spellCheck={false}
                />
              </Field>
            )}
            {signMode === "verify" && (
              <Field
                label={l(
                  "签名（使用所选编码）",
                  "Signature (selected encoding)",
                )}
              >
                <textarea
                  className="code small"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  spellCheck={false}
                />
              </Field>
            )}
          </div>
        )}
        {id === "keys" && (
          <div className="key-empty">
            <span className="key-glyph">↗</span>
            <strong>{l("生成新的公私钥对", "Generate a new key pair")}</strong>
            <p>
              {l(
                "密钥仅存在于当前页面。离开前请下载需要保留的密钥。",
                "Keys stay in this page. Download any keys you want to keep before leaving.",
              )}
            </p>
          </div>
        )}
      </fieldset>
      <div className="action-row">
        <button className="primary" disabled={task.busy} onClick={run}>
          {id === "keys" || (id === "uuid" && mode !== "inspect")
            ? l("生成", "Generate")
            : id === "signature"
              ? signMode === "sign"
                ? l("签名", "Sign")
                : l("验证", "Verify")
              : l("运行", "Run")}
          <ArrowRight size={17} />
        </button>
        <button className="quiet" onClick={reset}>
          <RotateCcw size={15} />
          {l("清空", "Clear")}
        </button>
      </div>
      <Progress busy={task.busy} value={task.progress} cancel={task.cancel} />
      <ErrorNotice code={task.error || localError} />
      {result?.valid !== undefined && (
        <div
          className={`notice ${result.valid ? "success" : "error"}`}
          role="status"
        >
          {result.valid ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {result.valid
            ? l("验证通过", "Verification passed")
            : l(
                "验证失败：内容、签名或密钥不匹配。",
                "Verification failed: content, signature, or keys do not match.",
              )}
        </div>
      )}
      {expectedMatch !== null && (
        <div className={`notice ${expectedMatch ? "success" : "error"}`}>
          {expectedMatch
            ? l("摘要匹配", "Hash matches")
            : l("摘要不匹配", "Hash does not match")}
        </div>
      )}
      {result?.uuid && (
        <dl className="metadata">
          <dt>UUID</dt>
          <dd>{result.uuid.uuid}</dd>
          <dt>{l("版本", "Version")}</dt>
          <dd>{result.uuid.version}</dd>
          <dt>{l("变体", "Variant")}</dt>
          <dd>
            {result.uuid.variant === "Other"
              ? l("其他", "Other")
              : result.uuid.variant}
          </dd>
        </dl>
      )}
      {result?.timestamp && (
        <dl className="metadata">
          {Object.entries(result.timestamp).map(([key, value]) => (
            <div key={key}>
              <dt>
                {
                  (
                    {
                      milliseconds: l("毫秒", "Milliseconds"),
                      seconds: l("秒", "Seconds"),
                      microseconds: l("微秒", "Microseconds"),
                      nanoseconds: l("纳秒", "Nanoseconds"),
                      utc: "UTC",
                      local: l("本地时间", "Local time"),
                      timezone: l("时区", "Time zone"),
                    } as Record<string, string>
                  )[key]
                }
              </dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {result?.tree && (
        <div className="tree-panel">
          <p className="hint">
            {l(
              "最多展开 5000 个节点、80 层；完整数据保留在输出中。",
              "Tree view shows up to 5,000 nodes and 80 levels. The complete data remains in the output.",
            )}
          </p>
          <Tree node={result.tree} />
        </div>
      )}
      {id === "keys" && result?.publicPem && (
        <div className="key-results">
          <Output
            label={l("公钥", "Public key")}
            value={keyFormat === "pem" ? result.publicPem : result.publicJwk}
            name={`public-key.${keyFormat === "pem" ? "pem" : "json"}`}
          />
          <Output
            label={l("私钥", "Private key")}
            value={keyFormat === "pem" ? result.privatePem : result.privateJwk}
            name={`private-key.${keyFormat === "pem" ? "pem" : "json"}`}
          />
        </div>
      )}
      {id === "text" && result && (
        <div className="stats">
          <span>
            {l("行数", "Lines")} <b>{result.lines}</b>
          </span>
          <span>
            {l("字符（Unicode 码点）", "Characters (Unicode code points)")}{" "}
            <b>{result.characters}</b>
          </span>
          <span>
            UTF-8 <b>{result.bytes}</b> bytes
          </span>
        </div>
      )}
      {result?.files && <FileResults files={result.files} />}
      {!["keys", "timestamp"].includes(id) &&
        !(id === "signature" && signMode !== "sign") &&
        !(id === "uuid" && mode === "inspect") &&
        !result?.files && (
          <Output
            value={result?.text ?? result?.output ?? ""}
            name={
              id === "json"
                ? "result.json"
                : id === "signature"
                  ? "signature.txt"
                  : "result.txt"
            }
          />
        )}
    </div>
  );
}
