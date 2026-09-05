# VecSpace

VecSpace 是面向浏览器的本地工具集合，计划以静态网站形式部署到 `vec.im`，使用 JavaScript 与按需加载的 WebAssembly 引擎处理用户数据。

## 项目状态

首版 15 项工具已实现，支持中文与英文。默认根据浏览器语言列表选择首个支持的语言，无匹配时使用英文；手动切换优先于自动检测，选择保存在本地。切换语言不会修改 URL，也不会清空当前工具的输入或结果。

## 产品约定

- 品牌使用 **VecSpace**，暂不设置中文名或标语。
- 第一阶段包含 **开发者工具（Developer Tools）** 与 **文档工具（Document Tools）**。
- PDF 是文档工具下的子类，文档工具同时覆盖文本、Markdown、Word 内容处理、表格转换与 OCR。
- 文件、输入内容、密钥与计算结果在浏览器本地处理；不引入业务处理后端。
- JavaScript 与浏览器原生 API 优先，需要重型计算或复用底层引擎时使用 Wasm。
- 重型功能按需加载，计算与界面分离；离线能力按模块缓存逐步实现。
- 游戏模拟器与音视频转换保留为未来方向，不属于当前开发范围。

## 规划文档

- [功能清单](docs/FEATURES.md)：按类别列出功能、阶段、实现思路与边界。
- [实施路线](docs/ROADMAP.md)：首版范围、交付顺序与验收要求。
- [架构约定](docs/ARCHITECTURE.md)：浏览器本地运行、模块划分、数据生命周期与部署要求。
- [技术资料](docs/REFERENCES.md)：已核查的上游资料与待验证事项。

## 仓库

本地目录：`~/repo/vecspace`。默认分支：`main`。

使用 React + TypeScript + Vite，包管理器为 npm。生产产物是纯静态文件；没有业务 API、上传后端或运行时外部 CDN。当前未配置远程仓库或部署到 vec.im，项目许可证仍待确定。第三方依赖声明随静态产物一起分发。


## 本地运行

需要 Node.js 22.13 或更高版本。

```sh
cd ~/repo/vecspace
npm ci
npm run dev
```

访问终端打印的本地地址。安装时会将 PDF.js 的字体、CMap 和 Wasm 解码器复制到 `public/vendor/pdfjs/`，并生成第三方声明；资源均从本站加载。该生成目录不加入 Git。

```sh
npm test          # 引擎、格式互操作、组件状态和 Worker 协议测试
npm run check    # TypeScript 检查
npm run build    # 输出 dist/
npm run preview  # 预览生产构建
```

## 已实现工具

- 开发者：Base64/Base64URL、URL 编解码与查询参数、JSON 格式化/压缩/树状查看、UUID v4 生成与格式检查、时间戳、SHA-256/384/512、RSA-PSS/ECDSA 密钥生成、签名/验签/公私钥配对。
- 文档：PDF 预览及元数据、合并、拆分/提取、页面重排/删除/旋转/复制、图片转 PDF、PDF 转 PNG/JPEG、文本整理。
- 共享：双语搜索与导航、复制/下载、拖放导入、批量结果 ZIP、进度与取消、错误提示、响应式布局。

## 运行边界

- 当前保守限制：文本 2 MiB；输入文件合计 50 MiB；PDF/输出页面最多 300 页；UUID 批量最多 1000 个。
- 图像最多 1600 万像素；PDF 转图片合计输出上限 150 MiB。实际可处理规模还取决于设备和浏览器，不把这些限制视为性能保证。
- 首版不支持加密 PDF；图片输入限 JPEG/PNG。图片透明区域使用白色背景，自动应用图片方向信息。
- RSA-PSS 使用 SHA-256 和 32 字节盐；ECDSA 使用 P-256/SHA-256，签名为 IEEE P1363（64 字节 r‖s），以 Base64 展示。PEM 公钥是 SPKI，私钥是 PKCS#8；同时支持 JWK。
- JSON 数字使用 lossless-json 保留词法和精度；树形查看最多 5000 节点、80 层，完整格式化输出不截断。
- 日期字符串必须包含 Z 或明确时区偏移；文本整理的排序为 UTF-16 字典序，字符统计采用 Unicode 码点。
- 仅语言偏好持久化。切换工具会释放当前输入和结果；用户文件、密钥不会写入浏览器存储、URL 或日志。
- PWA/完整离线下载属于后续阶段；当前首次加载或尚未加载的工具资源需要网络或本地服务器。

## 静态部署

将 `dist/` 发布到支持 HTTPS 的静态托管平台，为 `/developer/*` 和 `/documents/*` 配置 SPA 回退到 `index.html`。随产物提供的 `_redirects` / `_headers` 适用于支持该约定的平台；其他平台需要配置等价规则。`.wasm` 应返回 `application/wasm`，`.mjs` 应返回 JavaScript MIME。

PDF.js 使用单线程 Worker，当前不需要 SharedArrayBuffer 或 COOP/COEP。域名及 DNS 没有被修改。

详见 [首版交付与验证记录](docs/RELEASE-0.1.md)。
