import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Download, Upload, X, Check, LoaderCircle } from "lucide-react";
import { zip } from "fflate";
import { errors, useLanguage } from "../i18n";
import type { ResultFile } from "../engines/pdf";
import { MAX_BYTES, MAX_FILES, MiB } from "../limits";
export function download(
  data: Uint8Array | string,
  name: string,
  type = "text/plain;charset=utf-8",
) {
  const blob = new Blob(
    [typeof data === "string" ? data : (data.slice().buffer as ArrayBuffer)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorNotice({ code }: { code: string }) {
  const { l } = useLanguage();
  if (!code) return null;
  const pair = errors[code] || errors.UNKNOWN;
  return (
    <div
      role="alert"
      className={`notice ${code === "CANCELLED" ? "" : "error"}`}
    >
      {l(...pair)}
    </div>
  );
}
export function Progress({
  busy,
  value,
  cancel,
}: {
  busy: boolean;
  value: number;
  cancel: () => void;
}) {
  const { l } = useLanguage();
  if (!busy) return null;
  return (
    <div className="progress" role="status">
      <LoaderCircle className="spin" size={18} />
      <span>
        {l("处理中", "Processing")} · {Math.round(value)}%
      </span>
      <progress value={value} max={100} />
      <button className="quiet" onClick={cancel}>
        {l("取消", "Cancel")}
      </button>
    </div>
  );
}
export function FilePicker({
  multiple = false,
  accept,
  onFiles,
  disabled = false,
  compact = false,
  maxBytes = MAX_BYTES,
}: {
  multiple?: boolean;
  accept?: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
  maxBytes?: number;
}) {
  const { l } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const take = (files: File[]) => {
    if (disabled) return;
    setError("");
    if ((!multiple && files.length > 1) || files.length > MAX_FILES) {
      setError("INPUT");
      return;
    }
    if (files.reduce((n, f) => n + f.size, 0) > maxBytes) {
      setError("LIMIT");
      return;
    }
    if (files.length) onFiles(files);
  };
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className={`dropzone ${compact ? "compact" : ""} ${drag ? "drag" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          take(Array.from(e.dataTransfer.files));
        }}
      >
        <Upload size={compact ? 18 : 26} />
        <strong>
          {l("选择文件或拖放到此处", "Choose files or drop them here")}
        </strong>
        <span>
          {accept ? `${accept} · ` : ""}
          {l(
            `合计最多 ${maxBytes / MiB} MiB`,
            `${maxBytes / MiB} MiB total maximum`,
          )}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          take(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <ErrorNotice code={error} />
    </>
  );
}
export function SelectedFile({
  file,
  clear,
}: {
  file: File;
  clear: () => void;
}) {
  const { l } = useLanguage();
  return (
    <div className="selected-file">
      <span>
        {file.name} <small>{(file.size / 1024).toFixed(1)} KiB</small>
      </span>
      <button
        className="icon-btn"
        aria-label={l("移除文件", "Remove file")}
        onClick={clear}
      >
        <X size={16} />
      </button>
    </div>
  );
}
export function Output({
  value,
  name = "result.txt",
  label,
}: {
  value: string;
  name?: string;
  label?: string;
}) {
  const { l } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return (
    <section className="output-panel">
      <div className="panel-heading">
        <span>{label || l("输出", "Output")}</span>
        <div className="inline">
          <button
            className="quiet"
            disabled={!value}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                setCopied(true);
                setCopyError(false);
                setTimeout(() => setCopied(false), 1600);
              } catch {
                setCopyError(true);
              }
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? l("已复制", "Copied") : l("复制", "Copy")}
          </button>
          <button
            className="quiet"
            disabled={!value}
            onClick={() => download(value, name)}
          >
            <Download size={15} />
            {l("下载", "Download")}
          </button>
        </div>
      </div>
      <textarea
        aria-label={label || l("输出", "Output")}
        className="code result"
        readOnly
        value={value}
        placeholder={l("结果将显示在这里", "Your result will appear here")}
        spellCheck={false}
      />
      {copyError && (
        <small className="copy-error">
          {l(
            "无法访问剪贴板，请手动选择并复制。",
            "Clipboard unavailable. Select and copy the result manually.",
          )}
        </small>
      )}
    </section>
  );
}
export function FileResults({ files }: { files: ResultFile[] }) {
  const { l } = useLanguage();
  const [packing, setPacking] = useState(false);
  const [failed, setFailed] = useState(false);
  const terminate = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      terminate.current?.();
    },
    [files],
  );
  const cancel = () => {
    generation.current++;
    terminate.current?.();
    terminate.current = null;
    setPacking(false);
  };
  const all = () => {
    const serial = ++generation.current;
    setPacking(true);
    setFailed(false);
    terminate.current = zip(
      Object.fromEntries(
        files.map((file, i) => [
          `${String(i + 1).padStart(3, "0")}-${file.name}`,
          file.bytes,
        ]),
      ),
      { level: 0 },
      (error, bytes) => {
        if (generation.current !== serial) return;
        terminate.current = null;
        setPacking(false);
        if (error) setFailed(true);
        else download(bytes, "vecspace-results.zip", "application/zip");
      },
    );
  };
  return (
    <section className="results">
      <div className="panel-heading">
        <strong>
          {l("处理完成", "Ready to download")} · {files.length}
        </strong>
        {files.length > 1 && (
          <button className="secondary" disabled={packing} onClick={all}>
            <Download size={16} />
            {packing ? l("打包中", "Packing") : l("下载 ZIP", "Download ZIP")}
          </button>
        )}
        {packing && (
          <button className="quiet" onClick={cancel}>
            {l("取消", "Cancel")}
          </button>
        )}
      </div>
      {failed && <ErrorNotice code="UNKNOWN" />}
      {files.map((file, i) => (
        <div className="download-row" key={i}>
          <span>
            {file.name}{" "}
            <small>{(file.bytes.length / 1024).toFixed(1)} KiB</small>
          </span>
          <button
            className="quiet"
            onClick={() => download(file.bytes, file.name, file.type)}
          >
            <Download size={16} />
            {l("下载", "Download")}
          </button>
        </div>
      ))}
    </section>
  );
}
