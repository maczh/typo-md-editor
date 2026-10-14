# typo-md-editor

纯前端 **React 18** WYSIWYG Markdown 编辑器组件（Milkdown/Crepe 7 内核，零原生运行时依赖、零 Node/文件系统依赖）。从 Tauri 桌面应用 typo 的编辑器子系统剥离而来，本分支（`v1-react`）为 **React 端口**（Vue 3 版本在 `main` 分支）。

> - 完整 API 参考：[`docs/SDK.md`](docs/SDK.md)
> - 开发 / 构建 / 测试指南：[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
> - 提取架构设计（Vue 基线，React 端口沿用其分层与共享约定）：[`docs/extraction-design.md`](docs/extraction-design.md)
> - 实现偏离记录：[`docs/deviations.md`](docs/deviations.md)

## 功能特性

- **WYSIWYG 编辑**：Milkdown/Crepe 内核，Markdown 双向绑定（编辑器为真相源），完整 round-trip
- **GFM**：表格（浮动工具条 + 右键子菜单）、任务列表、删除线、脚注、链接引用
- **代码块**：CodeMirror 增强（按主题切换 oneDark/亮色、语言搜索、预览切换、复制）
- **Mermaid 图表**：Crepe 不自带图表能力，包内自研插件（含模板插入）
- **KaTeX 数学公式**：行内 `$...$` 与块级 `$$...$$`
- **图片**：粘贴 / 拖拽 / 选择文件 / Crepe `image-block` 四路统一走上传注入点，默认 FileReader → `data:` URL，可替换为自有 CDN
- **查找替换**：WYSIWYG 内原生高亮查找，替换走 Markdown 源后重载
- **源码模式**：`Ctrl/Cmd+/` 切换，进入快照、退出回写
- **大纲面板**：`OutlinePanel` 独立组件，点击滚动定位并高亮
- **6 套主题**：github / gothic / newsprint / night / pixyll / whitey（`data-theme` + 运行时动态加载）
- **三语 i18n**：简体中文 / English / 繁體中文，热键文案全量本地化
- **可重绑热键**：40+ 命令集中注册，设置对话框可改键、查冲突、单个/全部重置
- **导出**：Markdown / HTML / PDF（PDF 经隐藏 iframe 调系统打印对话框，纯浏览器能力）

## 安装

```bash
npm install typo-md-editor
# 宿主需自备 react / react-dom ^18（库构建时 externalize，不打包 React）
```

### 重要：milkdown 补丁

包依赖的 `@milkdown/components` 存在上游 bug：无标题图片 `![alt](url)` 的 `caption` 取到 `null`，触发属性校验抛错，导致**整张图片节点在解析时被静默丢弃**（打开文档、退出源码模式、查找替换都会复现）。本包通过 `postinstall` 自动打补丁：

- **npm**：安装依赖时自动执行，无需操作。
- **pnpm / yarn**：默认不运行依赖的 postinstall，装后请手动执行：

  ```bash
  npm run patch:milkdown
  ```

验证：`node_modules/@milkdown/components/lib/image-block/index.js` 中该行应为「已修复」形态之一 —— 源码形态 `const caption = node.title ?? "";`，或 npm 发布时的转译形态 `const caption = (_a = node.title) != null ? _a : "";`。两种形态补丁脚本均识别为已修复（输出 `already fixed — skipped`）。

## 快速开始

```tsx
import { useRef, useState } from 'react'
import { MdEditor, type EditorApi } from 'typo-md-editor'
// Crepe 自带 UI（块手柄、代码块工具条等）的样式不在本包内，需宿主自行引入，
// 且必须位于本包 style.css 之前（typora 排版靠顺序覆盖 Crepe nord 主题）：
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import 'typo-md-editor/style.css'

export default function Demo() {
  const [md, setMd] = useState('# Hello typo-md-editor')
  const apiRef = useRef<EditorApi | null>(null)

  return (
    <MdEditor
      modelValue={md}
      onUpdateModelValue={setMd}
      theme="night"
      language="zh-CN"
      onSave={() => apiRef.current?.exportMarkdown()}
      onReady={(api) => (apiRef.current = api)}
      onUpload={async (file) => myCdnUpload(file)}
    />
  )
}
```

与大纲面板组合：

```tsx
<MdEditor modelValue={md} onUpdateModelValue={setMd} />
<OutlinePanel />
```

更多用法（受控同步、只读、源码模式、导出、对话框、上传注入）见 [`docs/SDK.md`](docs/SDK.md) 的使用范例。

### 样式说明

`typo-md-editor/style.css` 已包含**全部包内样式**，按共享约定顺序打包：基础设计 token（`variables.css`）→ 通用控件与对话框（`app.css`）→ mermaid 容器 → 正文排版（`typora.css`）→ 组件样式（`components.css`）→ 6 套主题 CSS（运行时按 `data-theme` 动态加载，已内联在同一文件里）。宿主只需额外引入 Crepe 自带 UI 的样式（见上方快速开始），无需再关心其它文件。

`demo/main.tsx` 给出了开发期直接从 `src/styles` 引入的等价样板。

## 公共 API 速览

### `MdEditor` 组件

| 类别 | 成员 |
|------|------|
| Props | `modelValue` `theme` `language` `readonly` `showToolbar` `showTableToolbar` `showContextMenu` `hotkeys` `contentWidth` `fontSize` `lineHeight` `fontFamily` `customCss` `onUpload` `resolveImageSrc` `onUpdateModelValue` `onSave` `onReady` |
| Ref API（`EditorApi`） | `getMarkdown` `getHTML` `loadMarkdown` `insert` `focus` `destroy` `getEditor` `setReadonly` `exportMarkdown` `exportHtml` `print` `openSettings` `openFind` |

### 其它导出

`OutlinePanel` / `SettingsDialog` / `FindDialog` / `useMilkdown` / `useUI` / `useFind` / `useHotkeys` / `useEditorMenu` / `useSourceMode` / `useTranslation` / `useEditorStore` / `useSettingsStore` / `editorActions` / `THEMES` / `isDarkThemeId` / `typoPlugin` / `ensureStore` / `TypoProvider` / `TypoI18nProvider` / `i18n` / `typoI18n` / `SUPPORTED_LANGS` / `toHtml` / `toMarkdown` / `toPdf` / `exportDocument` / `downloadBlob` / `fileToDataUrl` / `rewriteImageSrcs` / `buildOutlineFromMarkdown`，以及 `EditorApi` `MdEditorProps` `EditorInstance` `ImageUploader` `Settings` `ThemeDef` `Lang` `EditorMode` `OutlineNode` `HotkeySpec` `ExportFormat` `ThemeKind` `EditorDoc` 等类型。

逐项签名、默认值与陷阱见 [`docs/SDK.md`](docs/SDK.md)。

## 主题

| id | 名称 | 亮度 |
|----|------|------|
| `github` | Github | light |
| `gothic` | Gothic | dark |
| `newsprint` | Newsprint | light |
| `night` | Night | dark |
| `pixyll` | Pixyll | light |
| `whitey` | Whitey | light |

默认 `github`。主题切换 = 在 `<html>` 上设置 `data-theme` 并动态加载对应 CSS；亮/暗判定统一走 `isDarkThemeId()`（`src/themes.ts` 为唯一事实源）。

## 国际化

`zh-CN` / `en` / `zh-TW`，语言持久化在 `localStorage`（键 `typo-md-editor:lang`）。设置持久化键为 `typo-md-editor:settings`。缺失 key 回退为 key 本身（`resolve()` 行为），新增文案需三语同步补齐。

## CSP 建议

```
default-src 'self';
img-src 'self' data: blob: https:;      /* data:URL 默认上传 / blob: 导出下载 */
font-src 'self' data:;                  /* KaTeX 字体 */
style-src 'self' 'unsafe-inline';       /* 运行时主题 CSS 与自定义 CSS 注入 */
script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval';  /* mermaid */
connect-src 'self' blob: ws://localhost:* wss://localhost:*;
```

`demo/index.html` 提供了一份可用样板。

## 已知限制

- **多实例**：`useMilkdown`/`useUI`/`useEditorMenu`/`useFind` 等为模块级单例，同一页面多个 `MdEditor` 会共享编辑器状态（大纲、查找、源码模式）。
- **CSS 变量写在 `documentElement`**：`--bg/--fg/--accent` 等未加前缀，可能与宿主全局样式互相影响（v0.1 不前缀化）。
- **`hotkeys` prop 为挂载期求值**：运行期切换不生效，需重挂组件。
- **PDF 导出**：经隐藏 iframe 调起系统打印对话框，由用户选择「另存为 PDF」（不引入 jsPDF/html2canvas）。
- **依赖全量内联**：`dist/` 为 MB 级（mermaid / katex / milkdown 均打入），宿主装有同名依赖会二次装载；是否改为 `external` + `peerDependencies` 待真机决策（见 `docs/deviations.md` Q1）。
- **i18n 冗余 key**：语言包保留源项目全部 key（含已废弃功能文案），v0.1 接受。

## 开发与验证

```bash
npm install          # 含 postinstall 补丁
npm run dev          # demo 开发机（http://localhost:1420，HMR ws 1421）
npm run typecheck    # tsc --noEmit
npm test             # esbuild 打包 + node:test 纯逻辑测试（基线 106 passed）
npm run build:lib    # 库产物 dist/
npm run build:demo   # demo 产物 dist-demo/
```

`npm test` 用 esbuild **原生二进制**打包测试（不依赖 WASM，容器内 vite/vitest 不可用），因此只覆盖纯逻辑（file / outline / i18n / exporter / prose / hotkeys / mount-sequence）；mermaid 等依赖 DOM 的模块走 demo 浏览器回归。

**dev server 启动报 `EMFILE: too many open files`**：本机 inotify 实例配额（`fs.inotify.max_user_instances`，默认 128）被 IDE/浏览器进程占满所致，非项目问题。`demo/vite.config.ts` 会探测并自动退化为轮询监听；也可显式控制：

```bash
CHOKIDAR_USEPOLLING=true npm run dev    # 强制轮询
CHOKIDAR_USEPOLLING=false npm run dev   # 强制 inotify
```

根治需提权调整内核参数：`sudo sysctl -w fs.inotify.max_user_instances=512`（并写入 `/etc/sysctl.d/`）。

更多架构说明、目录结构、构建发布与调试技巧见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。
