import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { LanguageProvider, LOCALE_KEY, initialLocale } from "../src/i18n";
import App from "../src/App";
import Developer from "../src/tools/Developer";
import { useTask } from "../src/task";
let renderer: ReactTestRenderer | undefined;
let stored: Map<string, string>;
let location: { pathname: string; href: string };
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
}
beforeEach(() => {
  stored = new Map();
  location = {
    pathname: "/developer/base64",
    href: "https://vec.im/developer/base64?keep=1#input",
  };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  vi.stubGlobal("navigator", {
    languages: ["zh-CN", "en-US"],
    language: "zh-CN",
  });
  vi.stubGlobal("window", {
    location,
    history: { pushState: vi.fn() },
    scrollTo: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    title: "",
    documentElement: { lang: "" },
    querySelector: () => ({ setAttribute: vi.fn() }),
  });
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
describe("language switching", () => {
  it("detects browser language, preserves current URL and input, and remembers a manual override", async () => {
    await act(async () => {
      renderer = create(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      );
    });
    const root = renderer!.root;
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(root.findByType(Developer)).toBeTruthy();
    await act(async () =>
      root
        .findByProps({ id: "tool-input" })
        .props.onChange({ target: { value: "保留我的输入 🌍" } }),
    );
    const before = window.location.href;
    await act(async () =>
      root
        .findAllByType("select")
        .find((select) => select.props["aria-label"] === "语言")!
        .props.onChange({ target: { value: "en" } }),
    );
    expect(root.findByProps({ id: "tool-input" }).props.value).toBe(
      "保留我的输入 🌍",
    );
    expect(root.findByType("h1").children.join("")).toBe("Base64 codec");
    expect(document.documentElement.lang).toBe("en");
    expect(stored.get(LOCALE_KEY)).toBe("en");
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
    expect(initialLocale()).toBe("en");
    expect([...stored.keys()]).toEqual([LOCALE_KEY]);
  });
  it("still switches when browser storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    await act(async () => {
      renderer = create(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      );
    });
    await act(async () =>
      renderer!.root
        .findAllByType("select")
        .find((select) => select.props["aria-label"] === "语言")!
        .props.onChange({ target: { value: "en" } }),
    );
    expect(renderer!.root.findByType("h1").children.join("")).toBe(
      "Base64 codec",
    );
  });
  it("translates an existing validation error after switching", async () => {
    location.pathname = "/developer/url";
    await act(async () => {
      renderer = create(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      );
    });
    const root = renderer!.root;
    await act(async () =>
      root
        .findAllByType("select")
        .find((select) => select.props.value === "encode")!
        .props.onChange({ target: { value: "decode" } }),
    );
    await act(async () =>
      root
        .findByProps({ id: "tool-input" })
        .props.onChange({ target: { value: "%FF" } }),
    );
    await act(async () =>
      root
        .findAllByType("button")
        .find((button) => button.props.className === "primary")!
        .props.onClick(),
    );
    expect(root.findByProps({ role: "alert" }).children.join("")).toContain(
      "输入无效",
    );
    await act(async () =>
      root
        .findAllByType("select")
        .find((select) => select.props["aria-label"] === "语言")!
        .props.onChange({ target: { value: "en" } }),
    );
    expect(root.findByProps({ role: "alert" }).children.join("")).toContain(
      "Invalid input",
    );
    expect(root.findByProps({ id: "tool-input" }).props.value).toBe("%FF");
  });
});
describe("worker lifecycle", () => {
  it("cancels, rejects stale replies, supports reruns, and cleans up on unmount", async () => {
    let task: ReturnType<typeof useTask>;
    function Probe() {
      task = useTask();
      return null;
    }
    await act(async () => {
      renderer = create(<Probe />);
    });
    await act(async () => task!.run("hash", { text: "secret" }));
    const first = FakeWorker.instances[0];
    const oldId = first.postMessage.mock.calls[0][0].id;
    expect(task!.busy).toBe(true);
    await act(async () => task!.cancel());
    expect(first.terminate).toHaveBeenCalled();
    expect(task!.busy).toBe(false);
    expect(task!.error).toBe("CANCELLED");
    await act(async () => task!.run("hash", { text: "new" }));
    await act(async () =>
      first.onmessage?.({ data: { id: oldId, result: { text: "stale" } } }),
    );
    expect(task!.result).toBeNull();
    expect(task!.busy).toBe(true);
    const second = FakeWorker.instances[1];
    const id = second.postMessage.mock.calls[0][0].id;
    await act(async () =>
      second.onmessage?.({ data: { id, result: { text: "fresh" } } }),
    );
    expect(task!.result).toEqual({ text: "fresh" });
    expect(task!.busy).toBe(false);
    await act(async () => task!.run("hash", { text: "next" }));
    const third = FakeWorker.instances[2];
    await act(async () => renderer!.unmount());
    renderer = undefined;
    expect(third.terminate).toHaveBeenCalled();
  });
});

describe("expanded option wiring", () => {
  it("passes UUID v5 namespace and per-line names to the worker", async () => {
    location.pathname = "/developer/uuid";
    await act(async () => {
      renderer = create(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      );
    });
    const root = renderer!.root;
    await act(async () =>
      root
        .findAllByType("select")
        .find((select) => select.props.value === "4")!
        .props.onChange({ target: { value: "5" } }),
    );
    await act(async () =>
      root
        .findByProps({ id: "tool-input" })
        .props.onChange({ target: { value: "www.widgets.com" } }),
    );
    await act(async () =>
      root
        .findAllByType("button")
        .find((button) => button.props.className === "primary")!
        .props.onClick(),
    );
    const message = FakeWorker.instances[0].postMessage.mock.calls[0][0];
    expect(message.operation).toBe("uuid");
    expect(message.payload.version).toBe("5");
    expect(message.payload.name).toBe("www.widgets.com");
    expect(message.payload.namespace).toBe(
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    );
  });
  it("passes MD5 and Base64 output and compares Base64 hashes case-sensitively", async () => {
    location.pathname = "/developer/hash";
    await act(async () => {
      renderer = create(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      );
    });
    const root = renderer!.root;
    await act(async () =>
      root
        .findAllByType("select")
        .find((select) => select.props.value === "SHA-256")!
        .props.onChange({ target: { value: "MD5" } }),
    );
    await act(async () =>
      root
        .findAllByType("select")
        .find((select) => select.props.value === "hex")!
        .props.onChange({ target: { value: "base64" } }),
    );
    await act(async () =>
      root
        .findAllByType("input")
        .find((input) => input.props.placeholder === "使用所选输出格式")!
        .props.onChange({ target: { value: "abc=" } }),
    );
    await act(async () =>
      root
        .findAllByType("button")
        .find((button) => button.props.className === "primary")!
        .props.onClick(),
    );
    const worker = FakeWorker.instances[0];
    const message = worker.postMessage.mock.calls[0][0];
    expect(message.payload.algorithm).toBe("MD5");
    expect(message.payload.outputFormat).toBe("base64");
    await act(async () =>
      worker.onmessage?.({
        data: { id: message.id, result: { text: "Abc=" } },
      }),
    );
    expect(
      root
        .findAllByType("div")
        .some(
          (node) =>
            node.props.className === "notice error" &&
            node.children.includes("摘要不匹配"),
        ),
    ).toBe(true);
  });
});
