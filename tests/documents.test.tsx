import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { LanguageProvider, useLanguage } from "../src/i18n";
import { FilePicker, FileResults } from "../src/components/shared";
import Documents from "../src/tools/Documents";
const mocks = vi.hoisted(() => ({ destroy: vi.fn() }));
vi.mock("../src/engines/render", () => ({
  openPDF: (bytes: Uint8Array) => {
    const load: any = { destroy: mocks.destroy.mockResolvedValue(undefined) };
    load.promise =
      bytes[0] === 0
        ? Promise.reject(
            Object.assign(new Error("password"), { name: "PasswordException" }),
          )
        : Promise.resolve({
            numPages: bytes[0],
            loadingTask: load,
            getMetadata: async () => ({
              info: { Title: "中文文档", Author: "VecSpace" },
            }),
            getPage: async () => ({
              getViewport: () => ({ width: 200, height: 300 }),
            }),
          });
    return load;
  },
  renderPage: vi.fn(),
  canvasBytes: vi.fn(),
  normalizeImage: vi.fn(),
}));
class WorkerMock {
  static last: WorkerMock;
  onmessage: any;
  onerror: any;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    WorkerMock.last = this;
  }
}
let view: ReactTestRenderer | undefined;
function Toggle() {
  const { locale, setLocale } = useLanguage();
  return (
    <button
      data-toggle
      onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
    >
      toggle
    </button>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("navigator", { languages: ["zh-CN"] });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("document", { documentElement: { lang: "" } });
  vi.stubGlobal("Worker", WorkerMock);
  mocks.destroy.mockClear();
});
afterEach(async () => {
  if (view) await act(async () => view!.unmount());
  view = undefined;
  vi.unstubAllGlobals();
});
async function mount(id: string) {
  await act(async () => {
    view = create(
      <LanguageProvider>
        <Documents id={id} />
        <Toggle />
      </LanguageProvider>,
    );
  });
}
const file = (name: string, pages: number) =>
  new File([new Uint8Array([pages])], name, { type: "application/pdf" });
describe("document workflow state", () => {
  it("retains imported files and completed downloads across language switches", async () => {
    await mount("pdf-split");
    const root = view!.root;
    await act(async () =>
      root.findByType(FilePicker).props.onFiles([file("source.pdf", 3)]),
    );
    await act(async () =>
      root
        .findAllByType("button")
        .find((b) => b.props.className === "primary")!
        .props.onClick(),
    );
    const worker = WorkerMock.last;
    const request = worker.postMessage.mock.calls[0][0];
    expect(request.operation).toBe("split");
    expect(request.payload.bytes[0]).toBe(3);
    await act(async () =>
      worker.onmessage({
        data: {
          id: request.id,
          result: {
            files: [
              {
                name: "part-001.pdf",
                bytes: new Uint8Array([1]),
                type: "application/pdf",
              },
            ],
          },
        },
      }),
    );
    await act(async () =>
      root.findByProps({ "data-toggle": true }).props.onClick(),
    );
    expect(root.findByType(FileResults).props.files[0].name).toBe(
      "part-001.pdf",
    );
    expect(
      root
        .findAllByType("strong")
        .some((node) => node.children.includes("source.pdf")),
    ).toBe(true);
  });
  it("keeps good files when an encrypted file in a batch fails and releases parser workers", async () => {
    await mount("pdf-merge");
    const root = view!.root;
    await act(async () =>
      root
        .findByType(FilePicker)
        .props.onFiles([
          file("first.pdf", 2),
          file("locked.pdf", 0),
          file("last.pdf", 1),
        ]),
    );
    expect(root.findByProps({ role: "alert" }).children.join("")).toContain(
      "加密 PDF",
    );
    await act(async () =>
      root
        .findAllByType("button")
        .find((b) => b.props.className === "primary")!
        .props.onClick(),
    );
    const request = WorkerMock.last.postMessage.mock.calls[0][0];
    expect(request.payload.inputs.map((input: any) => input.name)).toEqual([
      "first.pdf",
      "last.pdf",
    ]);
    expect(mocks.destroy).toHaveBeenCalledTimes(3);
  });
  it("submits explicit duplicated, rotated and reordered pages", async () => {
    await mount("pdf-organize");
    const root = view!.root;
    await act(async () =>
      root.findByType(FilePicker).props.onFiles([file("pages.pdf", 3)]),
    );
    await act(async () =>
      root.findAllByProps({ "aria-label": "复制页面" })[0].props.onClick(),
    );
    await act(async () =>
      root.findAllByProps({ "aria-label": "旋转页面" })[0].props.onClick(),
    );
    await act(async () =>
      root.findAllByProps({ "aria-label": "页面后移" })[0].props.onClick(),
    );
    await act(async () =>
      root
        .findAllByType("button")
        .find((b) => b.props.className === "primary")!
        .props.onClick(),
    );
    const selection =
      WorkerMock.last.postMessage.mock.calls[0][0].payload.selection;
    expect(selection.map((p: any) => [p.index, p.rotation])).toEqual([
      [0, 0],
      [0, 90],
      [1, 0],
      [2, 0],
    ]);
  });
});
