import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Copy,
  RotateCw,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useLanguage, errorCode } from "../i18n";
import { MAX_BYTES } from "../engines/developer";
import { MAX_PAGES, pagesFromRange, type ResultFile } from "../engines/pdf";
import {
  canvasBytes,
  normalizeImage,
  openPDF,
  renderPage,
  type PDFDocumentProxy,
} from "../engines/render";
import { useTask } from "../task";
import {
  ErrorNotice,
  Field,
  FilePicker,
  FileResults,
  Progress,
} from "../components/shared";
type Input = {
  id: number;
  name: string;
  bytes: Uint8Array;
  size: number;
  doc?: PDFDocumentProxy;
  count: number;
  range: string;
  width?: number;
  height?: number;
  title?: string;
  author?: string;
};
type Page = { uid: number; index: number; rotation: number };
let counter = 0;
function Thumbnail({
  doc,
  index,
  rotation = 0,
}: {
  doc: PDFDocumentProxy;
  index: number;
  rotation?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const { l } = useLanguage();
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    (async () => {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      if (controller.signal.aborted || !canvas.current) return;
      await renderPage(
        doc,
        index,
        Math.min(120 / viewport.width, 140 / viewport.height),
        controller.signal,
        canvas.current,
      );
    })().catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [doc, index]);
  return (
    <div className="thumbnail">
      {failed ? (
        <span>{l("预览不可用", "Preview unavailable")}</span>
      ) : (
        <canvas
          ref={canvas}
          style={{ transform: `rotate(${rotation}deg)` }}
          aria-label={`${l("页面", "Page")} ${index + 1}`}
        />
      )}
    </div>
  );
}
function Preview({
  input,
  page,
  zoom,
}: {
  input: Input;
  page: number;
  zoom: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const { l } = useLanguage();
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    if (input.doc && canvas.current)
      renderPage(
        input.doc,
        page,
        zoom,
        controller.signal,
        canvas.current,
      ).catch((e) => {
        if (!controller.signal.aborted) setError(errorCode(e));
      });
    return () => controller.abort();
  }, [input, page, zoom]);
  return (
    <div className="page-preview">
      <ErrorNotice code={error} />
      <canvas ref={canvas} aria-label={l("PDF 页面预览", "PDF page preview")} />
    </div>
  );
}
export default function Documents({ id }: { id: string }) {
  const { l } = useLanguage();
  const task = useTask();
  const imageMode = id === "images-pdf";
  const multiple = imageMode || id === "pdf-merge";
  const [inputs, setInputs] = useState<Input[]>([]);
  const liveInputs = useRef<Input[]>([]);
  const [selection, setSelection] = useState<Page[]>([]);
  const [range, setRange] = useState("");
  const [splitMode, setSplitMode] = useState("extract");
  const [group, setGroup] = useState(1);
  const [pageSize, setPageSize] = useState("a4");
  const [landscape, setLandscape] = useState(false);
  const [margin, setMargin] = useState(24);
  const [format, setFormat] = useState("image/png");
  const [scale, setScale] = useState(1.5);
  const [quality, setQuality] = useState(0.9);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [gallery, setGallery] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [fileErrors, setFileErrors] = useState<
    { name: string; code: string }[]
  >([]);
  const [output, setOutput] = useState<ResultFile[] | null>(null);
  const controller = useRef<AbortController | null>(null);
  const loading = useRef<ReturnType<typeof openPDF> | null>(null);
  const generation = useRef(0);
  const active = inputs[0];
  const working = busy || task.busy;
  const updateInputs = (items: Input[]) => {
    liveInputs.current = items;
    setInputs(items);
  };
  const invalidate = () => {
    task.clear();
    setError("");
    setOutput(null);
  };
  const dispose = (items: Input[]) => {
    for (const input of items)
      void input.doc?.loadingTask.destroy().catch(() => {});
  };
  const cancel = () => {
    generation.current++;
    controller.current?.abort();
    void loading.current?.destroy().catch(() => {});
    loading.current = null;
    task.cancel();
    setBusy(false);
    setOutput(null);
    setError("CANCELLED");
  };
  const clear = () => {
    cancel();
    dispose(liveInputs.current);
    updateInputs([]);
    setSelection([]);
    setRange("");
    setGallery(0);
    setPage(0);
    setFileErrors([]);
    setError("");
    task.clear();
  };
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      void loading.current?.destroy().catch(() => {});
      dispose(liveInputs.current);
    },
    [],
  );
  const add = async (files: File[]) => {
    invalidate();
    setFileErrors([]);
    if (
      files.reduce((n, f) => n + f.size, 0) +
        (multiple ? inputs.reduce((n, f) => n + f.size, 0) : 0) >
      MAX_BYTES
    ) {
      setError("LIMIT");
      return;
    }
    if (!multiple) {
      dispose(inputs);
      updateInputs([]);
      setSelection([]);
      setPage(0);
      setGallery(0);
    }
    const serial = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setProgress(0);
    let next = multiple ? [...inputs] : [];
    for (let i = 0; i < files.length; i++) {
      if (generation.current !== serial) break;
      const file = files[i];
      let doc: PDFDocumentProxy | undefined;
      try {
        const image = imageMode ? await normalizeImage(file) : null;
        const bytes = image
          ? image.bytes
          : new Uint8Array(await file.arrayBuffer());
        if (generation.current !== serial) break;
        let count = 1;
        let title = "";
        let author = "";
        let width = image?.width;
        let height = image?.height;
        if (!imageMode) {
          const load = openPDF(bytes);
          loading.current = load;
          try {
            doc = await load.promise;
          } catch (e) {
            await load.destroy().catch(() => {});
            throw e;
          }
          if (generation.current !== serial) {
            await doc.loadingTask.destroy();
            break;
          }
          count = doc.numPages;
          if (count > MAX_PAGES) throw new Error("LIMIT");
          const metadata = await doc.getMetadata();
          const info = metadata.info as {
            Title?: string;
            Author?: string;
            EncryptFilterName?: string;
          };
          if (info.EncryptFilterName) throw new Error("ENCRYPTED");
          title = info.Title || "";
          author = info.Author || "";
          const first = await doc.getPage(1);
          const view = first.getViewport({ scale: 1 });
          width = view.width;
          height = view.height;
        }
        if (generation.current !== serial) {
          await doc?.loadingTask.destroy();
          break;
        }
        if (
          next.reduce((n, item) => n + item.count, 0) + count > MAX_PAGES ||
          next.reduce((n, item) => n + item.bytes.length, 0) + bytes.length >
            MAX_BYTES
        )
          throw new Error("LIMIT");
        if (
          doc &&
          !["pdf-preview", "pdf-organize", "pdf-images"].includes(id)
        ) {
          await doc.loadingTask.destroy();
          doc = undefined;
        }
        if (generation.current !== serial) {
          await doc?.loadingTask.destroy();
          break;
        }
        const item: Input = {
          id: ++counter,
          name: file.name,
          bytes,
          size: file.size,
          doc,
          count,
          range: "",
          width,
          height,
          title,
          author,
        };
        next = [...next, item];
        updateInputs(next);
        if (!multiple)
          setSelection(
            Array.from({ length: count }, (_, index) => ({
              uid: ++counter,
              index,
              rotation: 0,
            })),
          );
      } catch (e) {
        await doc?.loadingTask.destroy().catch(() => {});
        if (generation.current === serial) {
          const err = e as Error;
          const code =
            err.name === "PasswordException"
              ? "ENCRYPTED"
              : ["InvalidPDFException", "UnknownErrorException"].includes(
                    err.name,
                  )
                ? "PDF"
                : errorCode(e);
          setFileErrors((previous) => [...previous, { name: file.name, code }]);
        }
      }
      if (generation.current === serial) {
        loading.current = null;
        setProgress(((i + 1) / files.length) * 100);
      }
    }
    if (generation.current === serial) setBusy(false);
  };
  const moveInput = (index: number, direction: number) => {
    invalidate();
    const next = [...inputs];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    updateInputs(next);
  };
  const changeSelection = (index: number, action: string) => {
    invalidate();
    let next = [...selection];
    if (action === "remove") next.splice(index, 1);
    if (action === "copy") {
      if (next.length >= MAX_PAGES) {
        setError("LIMIT");
        return;
      }
      next.splice(index + 1, 0, { ...next[index], uid: ++counter });
    }
    if (action === "rotate")
      next[index] = {
        ...next[index],
        rotation: (next[index].rotation + 90) % 360,
      };
    if (action === "up" || action === "down") {
      const other = index + (action === "up" ? -1 : 1);
      [next[index], next[other]] = [next[other], next[index]];
    }
    setGallery(Math.min(gallery, Math.max(0, Math.ceil(next.length / 8) - 1)));
    setSelection(next);
  };
  const exportImages = async () => {
    if (!active?.doc) {
      setError("EMPTY");
      return;
    }
    const serial = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setProgress(0);
    const results: ResultFile[] = [];
    let total = 0;
    try {
      if (
        !Number.isFinite(scale) ||
        scale < 0.25 ||
        scale > 3 ||
        quality < 0.1 ||
        quality > 1
      )
        throw new Error("INPUT");
      const pages = pagesFromRange(range, active.count);
      for (let i = 0; i < pages.length; i++) {
        const canvas = await renderPage(
          active.doc,
          pages[i],
          scale,
          abort.signal,
        );
        let bytes: Uint8Array;
        try {
          bytes = await canvasBytes(canvas, format, quality);
        } finally {
          canvas.width = canvas.height = 0;
        }
        if (generation.current !== serial) return;
        total += bytes.length;
        if (total > 150 * 1024 * 1024) throw new Error("OUTPUT_LIMIT");
        results.push({
          name: `${String(i + 1).padStart(3, "0")}-page-${pages[i] + 1}.${format === "image/png" ? "png" : "jpg"}`,
          bytes,
          type: format,
        });
        setProgress(((i + 1) / pages.length) * 100);
      }
      if (generation.current === serial) setOutput(results);
    } catch (e) {
      if (generation.current === serial) setError(errorCode(e));
    } finally {
      if (generation.current === serial) setBusy(false);
    }
  };
  const run = () => {
    invalidate();
    if (!active) {
      setError("EMPTY");
      return;
    }
    if (id === "pdf-merge")
      task.run("merge", {
        inputs: inputs.map(({ name, bytes, range }) => ({
          name,
          bytes,
          range,
        })),
      });
    if (id === "pdf-split")
      task.run("split", {
        bytes: active.bytes,
        range,
        mode: splitMode,
        size: group,
      });
    if (id === "pdf-organize")
      task.run("organize", { bytes: active.bytes, selection });
    if (id === "images-pdf")
      task.run("images-pdf", {
        images: inputs.map(({ bytes }) => ({ bytes })),
        pageSize,
        landscape,
        margin,
      });
    if (id === "pdf-images") void exportImages();
  };
  const rangeControl = (
    <Field
      label={l("页码范围", "Page range")}
      hint={l(
        "留空表示全部；如 1,3-5,2，保留顺序与重复页面。",
        "Blank means all. Example: 1,3-5,2. Order and duplicates are preserved.",
      )}
    >
      <input
        value={range}
        onChange={(e) => {
          invalidate();
          setRange(e.target.value);
        }}
        placeholder="1,3-5"
      />
    </Field>
  );
  return (
    <div className="tool-body">
      <FilePicker
        disabled={working}
        multiple={multiple}
        accept={imageMode ? ".jpg,.jpeg,.png" : ".pdf"}
        onFiles={add}
      />
      {imageMode && (
        <p className="hint">
          {l(
            "图片自动应用方向信息；透明区域使用白色背景。",
            "Image orientation is applied automatically. Transparent areas use a white background.",
          )}
        </p>
      )}
      {fileErrors.map((failure, i) => (
        <div key={i} className="file-error">
          <strong>{failure.name}</strong>
          <ErrorNotice code={failure.code} />
        </div>
      ))}
      {inputs.length > 0 && (
        <fieldset disabled={working}>
          <div className="file-list">
            {inputs.map((input, index) => (
              <div className="document-row" key={input.id}>
                <FileText size={20} />
                <div className="document-name">
                  <strong>{input.name}</strong>
                  <small>
                    {imageMode
                      ? `${input.width} × ${input.height} px`
                      : `${input.count} ${l("页", "pages")}`}{" "}
                    · {(input.size / 1024).toFixed(1)} KiB
                  </small>
                </div>
                {id === "pdf-merge" && (
                  <Field label={l("选取页码", "Select pages")}>
                    <input
                      value={input.range}
                      placeholder={l("全部", "All")}
                      onChange={(e) => {
                        invalidate();
                        updateInputs(
                          inputs.map((item) =>
                            item.id === input.id
                              ? { ...item, range: e.target.value }
                              : item,
                          ),
                        );
                      }}
                    />
                  </Field>
                )}
                <div className="inline">
                  {multiple && (
                    <>
                      <button
                        className="icon-btn"
                        disabled={index === 0}
                        onClick={() => moveInput(index, -1)}
                        aria-label={l("文件上移", "Move file up")}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={index === inputs.length - 1}
                        onClick={() => moveInput(index, 1)}
                        aria-label={l("文件下移", "Move file down")}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </>
                  )}
                  <button
                    className="icon-btn"
                    aria-label={l("移除文件", "Remove file")}
                    onClick={() => {
                      invalidate();
                      dispose([input]);
                      updateInputs(
                        inputs.filter((item) => item.id !== input.id),
                      );
                      if (!multiple) setSelection([]);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {id === "pdf-merge" && (
            <p className="hint">
              {l(
                "页码留空表示全部；支持 1,3-5，按文件顺序与页码顺序合并。",
                "Leave page ranges blank for all pages. Use 1,3-5. File and page order are preserved.",
              )}
            </p>
          )}
          {id === "pdf-split" && (
            <div className="options-row">
              {rangeControl}
              <Field label={l("拆分方式", "Split mode")}>
                <select
                  value={splitMode}
                  onChange={(e) => {
                    invalidate();
                    setSplitMode(e.target.value);
                  }}
                >
                  <option value="extract">
                    {l("提取为一个 PDF", "Extract into one PDF")}
                  </option>
                  <option value="each">
                    {l("每页一个 PDF", "One PDF per page")}
                  </option>
                  <option value="groups">
                    {l("固定页数分组", "Fixed-size groups")}
                  </option>
                </select>
              </Field>
              {splitMode === "groups" && (
                <Field label={l("每组页数", "Pages per group")}>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={group}
                    onChange={(e) => {
                      invalidate();
                      setGroup(Number(e.target.value));
                    }}
                  />
                </Field>
              )}
            </div>
          )}
          {id === "images-pdf" && (
            <div className="options-row">
              <Field label={l("页面大小", "Page size")}>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    invalidate();
                    setPageSize(e.target.value);
                  }}
                >
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                  <option value="original">
                    {l("按图片尺寸（96 DPI）", "Image size (96 DPI)")}
                  </option>
                </select>
              </Field>
              <Field label={l("边距（pt）", "Margin (pt)")}>
                <input
                  type="number"
                  min={0}
                  max={144}
                  value={margin}
                  onChange={(e) => {
                    invalidate();
                    setMargin(Number(e.target.value));
                  }}
                />
              </Field>
              {pageSize !== "original" && (
                <Field label={l("方向", "Orientation")}>
                  <select
                    value={landscape ? "landscape" : "portrait"}
                    onChange={(e) => {
                      invalidate();
                      setLandscape(e.target.value === "landscape");
                    }}
                  >
                    <option value="portrait">{l("纵向", "Portrait")}</option>
                    <option value="landscape">{l("横向", "Landscape")}</option>
                  </select>
                </Field>
              )}
            </div>
          )}
          {id === "pdf-images" && (
            <div className="options-row">
              {rangeControl}
              <Field label={l("格式", "Format")}>
                <select
                  value={format}
                  onChange={(e) => {
                    invalidate();
                    setFormat(e.target.value);
                  }}
                >
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                </select>
              </Field>
              <Field label={l("倍率（1 = 72 DPI）", "Scale (1 = 72 DPI)")}>
                <input
                  type="number"
                  min={0.25}
                  max={3}
                  step={0.25}
                  value={scale}
                  onChange={(e) => {
                    invalidate();
                    setScale(Number(e.target.value));
                  }}
                />
              </Field>
              {format === "image/jpeg" && (
                <Field label={l("质量（0.1–1）", "Quality (0.1–1)")}>
                  <input
                    type="number"
                    min={0.1}
                    max={1}
                    step={0.1}
                    value={quality}
                    onChange={(e) => {
                      invalidate();
                      setQuality(Number(e.target.value));
                    }}
                  />
                </Field>
              )}
            </div>
          )}
          {id === "pdf-organize" && active?.doc && (
            <>
              <div className="options-row">
                {rangeControl}
                <button
                  className="secondary current-time"
                  onClick={() => {
                    invalidate();
                    try {
                      setSelection(
                        pagesFromRange(range, active.count).map((index) => ({
                          uid: ++counter,
                          index,
                          rotation: 0,
                        })),
                      );
                      setGallery(0);
                    } catch (e) {
                      setError(errorCode(e));
                    }
                  }}
                >
                  {l("按范围重建顺序", "Apply page order")}
                </button>
              </div>
              <div className="page-grid">
                {selection
                  .slice(gallery * 8, gallery * 8 + 8)
                  .map((item, localIndex) => {
                    const index = gallery * 8 + localIndex;
                    return (
                      <div className="page-card" key={item.uid}>
                        <Thumbnail
                          doc={active.doc!}
                          index={item.index}
                          rotation={item.rotation}
                        />
                        <div className="page-caption">
                          {index + 1}{" "}
                          <small>
                            {l("原页", "Source")} {item.index + 1} ·{" "}
                            {item.rotation}°
                          </small>
                        </div>
                        <div className="page-actions">
                          <button
                            className="icon-btn"
                            disabled={index === 0}
                            onClick={() => changeSelection(index, "up")}
                            aria-label={l("页面前移", "Move page earlier")}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            disabled={index === selection.length - 1}
                            onClick={() => changeSelection(index, "down")}
                            aria-label={l("页面后移", "Move page later")}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => changeSelection(index, "rotate")}
                            aria-label={l("旋转页面", "Rotate page")}
                          >
                            <RotateCw size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => changeSelection(index, "copy")}
                            aria-label={l("复制页面", "Duplicate page")}
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => changeSelection(index, "remove")}
                            aria-label={l("删除页面", "Delete page")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
              {selection.length > 8 && (
                <div className="pagination">
                  <button
                    className="secondary"
                    disabled={gallery === 0}
                    onClick={() => setGallery(gallery - 1)}
                  >
                    <ChevronLeft size={16} />
                    {l("上一组", "Previous")}
                  </button>
                  <span>
                    {gallery + 1} / {Math.ceil(selection.length / 8)}
                  </span>
                  <button
                    className="secondary"
                    disabled={(gallery + 1) * 8 >= selection.length}
                    onClick={() => setGallery(gallery + 1)}
                  >
                    {l("下一组", "Next")}
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
          {id === "pdf-preview" && active?.doc && (
            <>
              <dl className="metadata">
                <div>
                  <dt>{l("标题", "Title")}</dt>
                  <dd>{active.title || "—"}</dd>
                </div>
                <div>
                  <dt>{l("作者", "Author")}</dt>
                  <dd>{active.author || "—"}</dd>
                </div>
                <div>
                  <dt>{l("首页尺寸", "First page size")}</dt>
                  <dd>
                    {active.width?.toFixed(1)} × {active.height?.toFixed(1)} pt
                  </dd>
                </div>
              </dl>
              <div className="preview-toolbar">
                <button
                  className="icon-btn"
                  disabled={page === 0}
                  aria-label={l("上一页", "Previous page")}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <Field label={l("页码", "Page")}>
                  <input
                    type="number"
                    min={1}
                    max={active.count}
                    value={page + 1}
                    onChange={(e) =>
                      setPage(
                        Math.max(
                          0,
                          Math.min(
                            active.count - 1,
                            Number(e.target.value) - 1,
                          ),
                        ),
                      )
                    }
                  />
                </Field>
                <span>/ {active.count}</span>
                <button
                  className="icon-btn"
                  disabled={page + 1 === active.count}
                  aria-label={l("下一页", "Next page")}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} />
                </button>
                <Field label={l("缩放", "Zoom")}>
                  <select
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  >
                    {[0.5, 0.75, 1, 1.5, 2].map((n) => (
                      <option key={n} value={n}>
                        {n * 100}%
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="thumbnail-strip">
                {Array.from(
                  {
                    length: Math.min(
                      8,
                      active.count - Math.floor(page / 8) * 8,
                    ),
                  },
                  (_, i) => {
                    const at = Math.floor(page / 8) * 8 + i;
                    return (
                      <button
                        className={page === at ? "selected" : ""}
                        key={at}
                        onClick={() => setPage(at)}
                      >
                        <Thumbnail doc={active.doc!} index={at} />
                        <span>{at + 1}</span>
                      </button>
                    );
                  },
                )}
              </div>
              <Preview input={active} page={page} zoom={zoom} />
            </>
          )}
        </fieldset>
      )}
      <div className="action-row">
        {id !== "pdf-preview" && (
          <button
            className="primary"
            disabled={
              working ||
              !inputs.length ||
              (id === "pdf-organize" && !selection.length)
            }
            onClick={run}
          >
            {l("生成文件", "Create files")}
            <ArrowRight size={17} />
          </button>
        )}
        <button className="quiet" onClick={clear}>
          {l("清空", "Clear")}
        </button>
      </div>
      <Progress
        busy={working}
        value={busy ? progress : task.progress}
        cancel={cancel}
      />
      <ErrorNotice code={error || task.error} />
      {(task.result?.files || output) && (
        <FileResults files={task.result?.files || output} />
      )}
      <p className="hint">
        {l(
          "原文件不会被修改。当前限制：合计 50 MiB、300 页；单张渲染图像最多 1600 万像素，图片导出合计最多 150 MiB。",
          "Original files remain unchanged. Limits: 50 MiB total, 300 pages, 16 megapixels per rendered image, and 150 MiB of exported images.",
        )}
      </p>
    </div>
  );
}
