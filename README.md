# typo-md-editor

纯前端 Vue3 WYSIWYG Markdown 编辑器组件（Milkdown/Crepe 7 内核），从 Tauri 桌面应用 typo 的编辑器子系统剥离而来，**零 Tauri 依赖**。

> 完整设计文档见 [`docs/extraction-design.md`](docs/extraction-design.md)。

## 安装

```bash
npm install typo-md-editor
```

### 重要：milkdown 补丁

包依赖的 `@milkdown/components` 存在一个上游 bug（无标题图片 `![alt](url)` 解析时整节点丢弃）。本包通过 `postinstall` 自动打补丁：

- **npm**：安装依赖时自动执行，无需操作。
- **pnpm**：默认不运行依赖的 postinstall，装后请手动执行：

  ```bash
  npm run patch:milkdown
  # 或 pnpm approve-builds 后重装
  ```

验证：`node_modules/@milkdown/components/lib/image-block/index.js` 中该行应为「已修复」形态之一 ——
源码形态 `const caption = node.title ?? "";`，或 npm 发布时的转译形态 `const caption = (_a = node.title) != null ? _a : "";`。
两种形态补丁脚本均识别为已修复（`node scripts/patch-milkdown-image-block.mjs` 输出 `already fixed — skipped`）。

## 快速开始

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MdEditor, typoPlugin } from 'typo-md-editor'
import 'typo-md-editor/style.css'

const app = createApp(App)
app.use(createPinia()).use(typoPlugin).mount('#app')
```

```vue
<template>
  <MdEditor v-model="md" theme="night" @save="onSave" :on-upload="uploadToMyCdn" />
</template>

<script setup>
import { ref } from 'vue'
import { MdEditor } from 'typo-md-editor'

const md = ref('# Hello')
function onSave() {
  // 宿主持久化（浏览器 download 或自有后端）
}
async function uploadToMyCdn(file: File): Promise<string> {
  return await myCdnUpload(file)
}
</script>
```

## 公共 API 摘要

### `MdEditor` 组件

| 类别 | 成员 |
|------|------|
| Props | `modelValue` `theme` `language` `readonly` `showToolbar` `showTableToolbar` `showContextMenu` `hotkeys` `contentWidth` `fontSize` `lineHeight` `fontFamily` `customCss` `onUpload` `resolveImageSrc` |
| Emits | `update:modelValue` `save` `ready` |
| Exposes | `getMarkdown` `getHTML` `loadMarkdown` `insert` `focus` `destroy` `getEditor` `setReadonly` `exportMarkdown` `exportHtml` `print` `openSettings` `openFind` |

### 配套导出

`OutlinePanel` / `SettingsDialog` / `FindDialog` / `useMilkdown` / `useFind` / `useHotkeys` / `useEditorMenu` / `useEditorStore` / `useSettingsStore` / `editorActions` / `THEMES` / `isDarkThemeId` / `typoPlugin` / `typoI18n` / `SUPPORTED_LANGS` / `toHtml` / `toMarkdown` / `toPdf` / `exportDocument` / `downloadBlob` / `fileToDataUrl` / `rewriteImageSrcs` / `buildOutlineFromMarkdown`，以及 `EditorInstance` `EditorApi` `Settings` `ThemeDef` `Lang` `EditorMode` `OutlineNode` `HotkeySpec` `ExportFormat` `ThemeKind` `ImageUploader` 等类型。

完整 API 表格见设计文档 §2.1。

## CSP 建议

包功能依赖以下 CSP 授权（最小策略）：

```
default-src 'self';
img-src 'self' data: blob: https:;      /* data:URL 默认上传 / blob: 导出下载 */
font-src 'self' data:;                  /* KaTeX 字体 */
style-src 'self' 'unsafe-inline';       /* 运行时主题 CSS 与自定义 CSS 注入 */
script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval';  /* mermaid */
connect-src 'self' blob:;
```

`demo/index.html` 提供了一份可用样板。

## 已知限制

- **多实例**：`useMilkdown`/`useUI`/`useEditorMenu` 为模块级单例（同源设计），同一页面多个 `MdEditor` 会共享编辑器状态；后续版本以 provide/inject 重构。
- **CSS 变量**：`--bg/--fg/--accent` 等变量写在 `documentElement`，可能与宿主全局样式互相影响（v0.1 不前缀化）。
- **PDF 导出**：经隐藏 iframe 调起系统打印对话框，由用户选择"另存为 PDF"（与纯浏览器能力一致，不引入 jsPDF/html2canvas）。
- **i18n 冗余 key**：语言包保留源项目全部 key（含已废弃功能文案），v0.1 接受。

## 开发与验证

```bash
npm install          # 含 postinstall 补丁
npm run dev          # demo 开发机（http://localhost:1420）
npm run typecheck    # vue-tsc --noEmit
npm test             # esbuild 打包 + node:test 纯逻辑测试
npm run build:lib    # 库产物 dist/（需真实终端，沙箱 4GB 内存下 vite build 必崩）
npm run build:demo   # demo 产物 dist-demo/
```

`npm test` 用 esbuild **原生二进制**打包测试（容器内无 WASM，vite/vitest 不可用），
因此只覆盖纯逻辑（file/outline/i18n/exporter-toHtml/exporter-toMarkdown）；
mermaid 等依赖 DOM 的模块走 demo 浏览器回归。

**import 图探针**（开发用，验证某入口的模块图可解析）：

```bash
node probe.mjs src/milkdown/setup.ts   # 或 src/commands/actions.ts、demo/main.ts
```

