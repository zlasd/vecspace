# VecSpace

VecSpace 是面向浏览器的本地工具集合，计划以静态网站形式部署到 `vec.im`，使用 JavaScript 与按需加载的 WebAssembly 引擎处理用户数据。

## 项目状态

当前版本 0.2，15 项工具已实现并扩展常用选项，支持中文与英文。默认根据浏览器语言列表选择首个支持的语言，无匹配时使用英文；手动切换优先于自动检测，选择保存在本地。切换语言不会修改 URL，也不会清空当前工具的输入或结果。

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

- 开发者：Base64/Base64URL、URL 编解码与查询参数、JSON 格式化/压缩/树状查看、UUID v1/v3/v4/v5/v6/v7 及 Nil/Max、纳秒时间戳、18 种哈希/校验和、RSA/EC/Ed25519/X25519 密钥生成、签名/验签/公私钥配对。
- 文档：PDF 预览及元数据、合并、拆分/提取、页面重排/删除/旋转/复制、图片转 PDF、PDF 转 PNG/JPEG/WebP、文本整理。
- 共享：双语搜索与导航、复制/下载、拖放导入、批量结果 ZIP、进度与取消、错误提示、响应式布局。

## 运行边界

- 当前限制：文本 16 MiB；一般编解码/签名文件 64 MiB；PDF 输入合计 512 MiB、最多 5,000 页；哈希文件 2 GiB；UUID 批量最多 10,000 个；单次选择最多 1,000 个文件。
- 图像最多 6400 万像素；PDF 转图片合计输出上限 512 MiB。实际可处理规模还取决于设备和浏览器，不把这些限制视为性能保证。
- 首版不支持加密 PDF；图片输入限 JPEG/PNG。图片透明区域使用白色背景，自动应用图片方向信息。
- 签名支持 RSA-PSS、RSASSA-PKCS1-v1_5、ECDSA 和 Ed25519；RSA/ECDSA 摘要可选 SHA-256/384/512，PSS 盐长度可配置，ECDSA 曲线支持 P-256/384/521，签名结构可选 P1363/DER，编码可选 Base64/Base64URL/Hex。密钥生成另支持 RSA-OAEP/ECDH/X25519；RSA 长度支持 2048/3072/4096/8192。PEM 公钥使用 SPKI、私钥使用 PKCS#8，也可导出 JWK。算法不可用时显示浏览器能力错误。
- JSON 数字使用 lossless-json 保留词法和精度；树形查看最多 5000 节点、80 层，完整格式化输出不截断。
- 日期字符串必须包含 Z 或明确时区偏移，支持最多 9 位小数秒；秒/毫秒/微秒/纳秒以精确十进制字符串互转。文本整理支持 UTF-16 升降序、数字自然排序和反转，字符统计采用 Unicode 码点。
- 仅语言偏好持久化。切换工具会释放当前输入和结果；用户文件、密钥不会写入浏览器存储、URL 或日志。
- PWA/完整离线下载属于后续阶段；当前首次加载或尚未加载的工具资源需要网络或本地服务器。

## 静态部署

将 `dist/` 发布到支持 HTTPS 的静态托管平台，为 `/developer/*` 和 `/documents/*` 配置 SPA 回退到 `index.html`。随产物提供的 `_redirects` / `_headers` 适用于支持该约定的平台；其他平台需要配置等价规则。`.wasm` 应返回 `application/wasm`，`.mjs` 应返回 JavaScript MIME。

PDF.js 使用单线程 Worker，当前不需要 SharedArrayBuffer 或 COOP/COEP。域名及 DNS 没有被修改。

详见 [0.2 选项扩展与验证记录](docs/RELEASE-0.2.md)。[0.1 交付记录](docs/RELEASE-0.1.md) 保留为历史快照。
