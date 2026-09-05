import { lazy, Suspense, useEffect, useState } from "react";
import {
  AlignLeft,
  ArrowLeft,
  ArrowUpRight,
  Braces,
  Clock,
  Code2,
  Files,
  FileSearch,
  Fingerprint,
  Globe2,
  Hash,
  Image,
  KeyRound,
  LayoutGrid,
  Link,
  LoaderCircle,
  Menu,
  ScanLine,
  Scissors,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "./i18n";
import { tools, type Tool } from "./registry";
const Developer = lazy(() => import("./tools/Developer"));
const Documents = lazy(() => import("./tools/Documents"));
const icons: Record<string, LucideIcon> = {
  Braces,
  Clock,
  Files,
  FileSearch,
  Fingerprint,
  Hash,
  Image,
  KeyRound,
  LayoutGrid,
  Link,
  ScanLine,
  Scissors,
  ShieldCheck,
  AlignLeft,
};
export default function App() {
  const { locale, setLocale, l } = useLanguage();
  const [path, setPath] = useState(window.location.pathname);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const pop = () => {
      setPath(window.location.pathname);
      setMenu(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const tool = tools.find((t) => `/${t.category}/${t.id}` === path);
  const category =
    path === "/developer"
      ? "developer"
      : path === "/documents"
        ? "documents"
        : null;
  const valid = path === "/" || !!tool || !!category;
  const navigate = (next: string) => {
    if (next !== path) {
      window.history.pushState(null, "", next);
      setPath(next);
      window.scrollTo(0, 0);
    }
    setMenu(false);
    setQuery("");
  };
  const link =
    (target: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.button === 0
      ) {
        event.preventDefault();
        navigate(target);
      }
    };
  const name = (t: Tool) => l(t.zh, t.en);
  useEffect(() => {
    document.title = `${tool ? name(tool) + " · " : ""}VecSpace`;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute(
      "content",
      l(
        "在浏览器本地处理数据的开发者工具和文档工具。",
        "Developer and document tools that process your data locally in your browser.",
      ),
    );
  }, [locale, tool]);
  const filtered = tools.filter(
    (t) =>
      (!category || t.category === category) &&
      `${t.zh} ${t.en} ${t.z} ${t.e} ${t.tag}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {l("跳到主要内容", "Skip to content")}
      </a>
      {menu && (
        <button
          className="menu-scrim"
          aria-label={l("关闭导航", "Close navigation")}
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a href="/" onClick={link("/")} className="brand">
          <img src="/favicon.svg" alt="" />
          <span>VecSpace</span>
        </a>
        <nav aria-label={l("工具导航", "Tool navigation")}>
          <a
            href="/"
            onClick={link("/")}
            className={`nav-overview ${path === "/" ? "active" : ""}`}
          >
            <LayoutGrid size={18} />
            {l("全部工具", "All tools")}
            <span>15</span>
          </a>
          {(["developer", "documents"] as const).map((cat) => (
            <div className="nav-group" key={cat}>
              <a
                className="nav-label"
                href={`/${cat}`}
                onClick={link(`/${cat}`)}
              >
                {cat === "developer"
                  ? l("开发者工具", "Developer tools")
                  : l("文档工具", "Document tools")}
              </a>
              {tools
                .filter((t) => t.category === cat)
                .map((t) => {
                  const Icon = icons[t.icon];
                  return (
                    <a
                      href={`/${cat}/${t.id}`}
                      onClick={link(`/${cat}/${t.id}`)}
                      className={`nav-item ${tool?.id === t.id ? "active" : ""}`}
                      aria-current={tool?.id === t.id ? "page" : undefined}
                      key={t.id}
                    >
                      <Icon size={16} />
                      <span>{name(t)}</span>
                    </a>
                  );
                })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={17} />
          <div>
            {l("本地处理", "Local processing")}
            <small>
              {l("文件与密钥不会上传", "Files & keys stay on your device")}
            </small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label={l("打开导航", "Open navigation")}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div className="breadcrumb">
            <span>VecSpace</span>
            <span>/</span>
            <strong>
              {tool
                ? tool.category === "developer"
                  ? l("开发者工具", "Developer tools")
                  : l("文档工具", "Document tools")
                : l("工作台", "Workspace")}
            </strong>
          </div>
          <label className="language">
            <Globe2 size={16} />
            <span className="sr-only">{l("语言", "Language")}</span>
            <select
              aria-label={l("语言", "Language")}
              value={locale}
              onChange={(e) => setLocale(e.target.value as "zh" | "en")}
            >
              <option value="en">English</option>
              <option value="zh">简体中文</option>
            </select>
          </label>
        </header>
        <main id="main" tabIndex={-1}>
          {!valid ? (
            <div className="not-found">
              <h1>{l("找不到这个工具", "Tool not found")}</h1>
              <a href="/" onClick={link("/")}>
                {l("返回全部工具", "Back to all tools")}
              </a>
            </div>
          ) : tool ? (
            <>
              <a
                className="back-link"
                href={`/${tool.category}`}
                onClick={link(`/${tool.category}`)}
              >
                <ArrowLeft size={15} />
                {l("返回工具列表", "Back to tools")}
              </a>
              <div className="tool-heading">
                <div className="tool-icon large">
                  {(() => {
                    const Icon = icons[tool.icon];
                    return <Icon size={25} />;
                  })()}
                </div>
                <div>
                  <h1>{name(tool)}</h1>
                  <p>{l(tool.z, tool.e)}</p>
                </div>
                <span className="local-badge">
                  <i />
                  {l("浏览器本地运行", "Runs locally")}
                </span>
              </div>
              <Suspense
                fallback={
                  <div className="loading" role="status">
                    <LoaderCircle className="spin" />
                    {l("加载工具…", "Loading tool…")}
                  </div>
                }
              >
                <div key={tool.id} className="tool-workspace">
                  {tool.category === "developer" || tool.id === "text" ? (
                    <Developer id={tool.id} />
                  ) : (
                    <Documents id={tool.id} />
                  )}
                </div>
              </Suspense>
            </>
          ) : (
            <>
              <div className="catalog-heading">
                <div>
                  <span className="eyebrow">
                    {l("工具目录", "TOOL DIRECTORY")}
                  </span>
                  <h1>
                    {category === "developer"
                      ? l("开发者工具", "Developer tools")
                      : category === "documents"
                        ? l("文档工具", "Document tools")
                        : l("全部工具", "All tools")}
                  </h1>
                </div>
                <span className="local-badge">
                  <i />
                  {l("浏览器本地运行", "Runs locally")}
                </span>
              </div>
              <div className="catalog-toolbar">
                <div className="tabs">
                  {[
                    ["/", l("全部", "All")],
                    ["/developer", l("开发者", "Developer")],
                    ["/documents", l("文档", "Documents")],
                  ].map(([url, label]) => (
                    <a
                      key={url}
                      href={url}
                      onClick={link(url)}
                      className={path === url ? "active" : ""}
                    >
                      {label}
                    </a>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label={l("搜索工具", "Search tools")}
                    placeholder={l("搜索工具…", "Search tools…")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <span>⌕</span>
                </label>
              </div>
              {(["developer", "documents"] as const)
                .filter((cat) => !category || cat === category)
                .map((cat) => {
                  const list = filtered.filter((t) => t.category === cat);
                  return list.length ? (
                    <section className="catalog-section" key={cat}>
                      <div className="section-heading">
                        <h2>
                          {cat === "developer" ? (
                            <Code2 size={18} />
                          ) : (
                            <Files size={18} />
                          )}{" "}
                          {cat === "developer"
                            ? l("开发者工具", "Developer tools")
                            : l("文档工具", "Document tools")}
                        </h2>
                        <span>{String(list.length).padStart(2, "0")}</span>
                      </div>
                      <div className="tool-grid">
                        {list.map((t) => {
                          const Icon = icons[t.icon];
                          return (
                            <a
                              key={t.id}
                              className="tool-card"
                              href={`/${t.category}/${t.id}`}
                              onClick={link(`/${t.category}/${t.id}`)}
                            >
                              <div className="card-top">
                                <span className="tool-icon">
                                  <Icon size={22} />
                                </span>
                                <span className="tool-tag">{t.tag}</span>
                                <ArrowUpRight
                                  className="card-arrow"
                                  size={17}
                                />
                              </div>
                              <h3>{name(t)}</h3>
                              <p>{l(t.z, t.e)}</p>
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  ) : null;
                })}
              {!filtered.length && (
                <p className="empty-search">
                  {l(
                    "没有找到匹配的工具。试试 PDF、JSON 或密钥。",
                    "No matching tools. Try PDF, JSON, or keys.",
                  )}
                </p>
              )}
            </>
          )}
          <footer>
            <span>
              VecSpace <span className="muted">/ 0.1</span>
            </span>
            <span>
              {l(
                "输入仅在当前会话内保留",
                "Inputs stay in the current session",
              )}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
