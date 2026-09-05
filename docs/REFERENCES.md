# 技术资料与验证记录

核查日期：2026-09-05。以下为规划依据，不代表 VecSpace 已接入或测试这些库；具体版本在接入时再次验证。

| 资料 | 规划采用的结论 |
| --- | --- |
| [PDF-LIB 仓库](https://github.com/Hopding/pdf-lib) | 支持浏览器运行、页面组合、表单和绘制；不支持普通页面文字的直接编辑或提取；不支持加密 PDF，ignoreEncryption 不是解密 |
| [PDF.js 入门](https://mozilla.github.io/pdf.js/getting_started/) | 用于 PDF 解析、显示层和浏览器预览 |
| [PDF.js 示例](https://mozilla.github.io/pdf.js/examples/) | 浏览器页面渲染的接入参考 |
| [Mammoth](https://github.com/mwilliamson/mammoth.js/) | DOCX 转语义 HTML，可在浏览器工作；不做原文档净化，输出需额外处理 |
| [Tesseract.js FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md) | 不直接支持 PDF；可先渲染页面图像再识别；不承诺手写文字识别 |
| [Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) | 原生密钥生成与密码学操作的候选基础 |
| [randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) | 原生生成安全随机 UUID v4，要求安全上下文 |
| [COOP 与跨源隔离](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy) | 使用共享内存的引擎需要相应跨源隔离与响应头配置 |

## 尚需实测

- 密钥导入导出、签名字节格式与不同浏览器及外部实现的互操作。
- PDF 各操作的字体、页面框、表单与已签名文档行为；修改后不能把旧签名继续标为有效。
- 移动 Safari 等环境的内存边界、取消能力和大文件下载体验。
- XLSX 候选引擎的输入类型、值/公式语义、许可证与分发来源。
- OCR 语言包的下载体积、识别质量、离线缓存与逐页处理开销。
- PDF 压缩、密码与 Office 转换引擎的浏览器性能、输出保真和分发条件。

所有功能拆分、优先级与产品边界为本项目的设计建议，上游文档仅支撑对应技术能力。
