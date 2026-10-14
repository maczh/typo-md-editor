# typo-md-editor SDK 参考（React 端口）

> 分支 `v1-react` · 版本 0.1.0 · 引擎 React 18 + Milkdown/Crepe 7
> 本文是包的完整 API 参考；入门与安装见根 [`README.md`](../README.md)，架构与构建见 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

## 目录

1. [导入与样式](#1-导入与样式)
2. [MdEditor 组件](#2-mdeditor-组件)
3. [附带组件](#3-附带组件)
4. [Hooks](#4-hooks)
5. [editorActions 命令层](#5-editoractions-命令层)
6. [主题](#6-主题)
7. [安装与 Provider](#7-安装与-provider)
8. [i18n](#8-i18n)
9. [导出工具](#9-导出工具)
10. [纯函数](#10-纯函数)
11. [类型定义](#11-类型定义)
12. [使用范例](#12-使用范例)
13. [陷阱与注意事项](#13-陷阱与注意事项)

---

## 1. 导入与样式

```ts
import { MdEditor } from 'typo-md-editor'
import 'typo-md-editor/style.css'
```

`style.css` 包含**全部包内样式**，按共享约定顺序打包：基础设计 token（`variables.css`）→ 通用控件与对话框（`app.css`）→ mermaid 容器 → 正文排版（`typora.css`）→ 组件样式（`components.css`）→ 6 套主题 CSS。

Crepe 自带 UI（块手柄、代码块工具条等）的样式不在本包内，需宿主另行引入，且必须在 `style.css` **之前**（`typora.css` 靠顺序覆盖 Crepe nord 主题）：

```ts
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import 'typo-md-editor/style.css'
```

`demo/main.tsx` 有开发期直接从 `src/styles` 引入的等价样板。包同时导出 `typo-md-editor/package.json`，无其它子路径导出。

---

## 2. MdEditor 组件

包内唯一公共组件（门面），`forwardRef<EditorApi, MdEditorProps>`。

### 2.1 Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `modelValue` | `string` | `''` | v-model：Markdown 双向绑定，编辑器为真相源 |
| `theme` | `string` | `'github'` | 主题 id，见[主题](#6-主题) |
| `language` | `Lang` | `'zh-CN'` | 界面语言 |
| `readonly` | `boolean` | `false` | 只读（隐藏工具栏、编辑器置只读） |
| `showToolbar` | `boolean` | `true` | 是否显示工具栏 |
| `showTableToolbar` | `boolean` | `true` | 表格浮动工具条 |
| `showContextMenu` | `boolean` | `true` | 右键菜单 + 块手柄浮层（`false` 时恢复浏览器原生右键与 Crepe「+」手柄行为） |
| `hotkeys` | `boolean` | `true` | 全局热键开关（**挂载期求值**，运行期切换不生效） |
| `contentWidth` | `number` | `80` | WYSIWYG 内容列宽度百分比（应用时钳制到 30–100） |
| `fontSize` | `number` | `16` | 正文字号 px |
| `lineHeight` | `number` | `1.6` | 正文行高 |
| `fontFamily` | `string` | `defaultSettings.fontFamily` | 字体栈 |
| `customCss` | `string` | `''` | 用户自定义 CSS（注入 `#typo-custom-css` `<style>`） |
| `onUpload` | `ImageUploader` | `fileToDataUrl` | 图片上传回调，粘贴/拖拽/选择文件/image-block 四路统一走它 |
| `resolveImageSrc` | `(src: string) => string` | 恒等 | 本地图片 src 的显示解析 |
| `onUpdateModelValue` | `(v: string) => void` | — | v-model 更新回调 |
| `onSave` | `() => void` | — | 保存请求（`Ctrl/Cmd+S`） |
| `onReady` | `(api: EditorApi) => void` | — | 编辑器就绪回调（也可提前用 ref 拿 API） |

**prop 语义**：首次挂载 = 初始值（播种 settings store，随后 `localStorage` 已持久化的键覆盖）；后续变化 = 受控同步（effect 写入设置 store / 编辑器并持久化）。

### 2.2 Ref API（`EditorApi`）

```ts
interface EditorApi {
  getMarkdown: () => Promise<string>
  getHTML: () => string
  loadMarkdown: (md: string) => void
  insert: (md: string) => void
  focus: () => void
  destroy: () => void
  getEditor: () => Editor | null          // @milkdown/core 的 Editor
  setReadonly: (v: boolean) => void
  exportMarkdown: (filename?: string) => void
  exportHtml: (filename?: string) => Promise<void>
  print: () => Promise<void>              // 系统打印对话框 → 另存为 PDF
  openSettings: () => void
  openFind: () => void
}
```

```tsx
const apiRef = useRef<EditorApi | null>(null)
<MdEditor ref={apiRef} onReady={(api) => (apiRef.current = api)} />
```

`exportMarkdown` / `exportHtml` 的文件名缺省取文档名（去 `.md` 后缀并做文件名安全化），文档名缺省 `untitled`。

---

## 3. 附带组件

| 组件 | Props | 说明 |
|------|-------|------|
| `OutlinePanel` | 无 | 大纲面板，读 `useEditorStore().outline`，点击滚动定位并高亮 0.8s |
| `SettingsDialog` | `modelValue?: boolean = true`、`onClose: () => void` | 设置对话框：general（主题/语言/字号/行高/字体/模式/自定义 CSS）+ hotkeys（改键/冲突检测/重置） |
| `FindDialog` | `modelValue?: boolean = true`、`onClose: () => void` | 查找替换条：`Enter` 下一个、`Shift+Enter` 上一个、`Esc` 关闭 |

三个组件均可脱离 `MdEditor` 单独使用（状态走模块级单例）；`MdEditor` 内部已按 `useUI()` 的开关渲染 `SettingsDialog` / `FindDialog`，宿主通常只需自己放 `OutlinePanel`。

---

## 4. Hooks

所有 hook 都可在任意组件中调用（模块级单例，无需 Provider）。

### `useMilkdown(): MilkdownApi`

共享编辑器控制器。`mount` 只应由 `EditorPane` 调用一次。

```ts
interface MilkdownApi {
  instance: { value: EditorInstance | null }   // ref-like（.value 读写）
  isReady: { value: boolean }
  mount: (container: HTMLElement, defaultValue?: string,
          onChange?: (markdown: string) => void,
          onUpload?: ImageUploader) => Promise<void>
  getMarkdown: () => Promise<string> | string
  loadMarkdown: (md: string) => void           // 重建实例，串行 + 序号守卫
  getHTML: () => Promise<string> | string
  getEditor: () => Editor | null
  insert: (md: string) => void
  destroy: () => void
}
```

### `useUI(): UiApi`

`settingsOpen` / `sourceMode` / `findOpen`（均为 `{ value }` ref-like）+ `openSettings` / `closeSettings` / `toggleSourceMode` / `openSourceMode` / `closeSourceMode` / `openFind` / `closeFind`。

### `useFind(): FindApi`

`findText` / `replaceText` / `matchCase` / `replaceVisible`（ref-like）+ `findNext` / `findPrev`（浏览器原生页内查找，返回是否命中）/ `replaceOne` / `replaceAll`（改 Markdown 源后重载编辑器）/ `close`（仅重置替换行显隐）。

### `useHotkeys(enabled = true): void`

安装/移除全局键盘监听。由 `MdEditor` 按 `hotkeys` prop 调用，宿主一般无需直接用。

### `useEditorMenu(): EditorMenuApi`

浮动菜单（块手柄 / 右键共用）状态：`open` / `x` / `y` / `kind` / `range` / `sub` / `beforeRun` + `show(px, py, kind?, range?, sub?, before?)` / `hide()`。自定义浮层时使用。

### `useSourceMode(): SourceModeApi`

`sourceText`（ref-like）+ `enter()`（快照当前 Markdown）/ `commit()`（回写编辑器并刷新文档 store 与大纲）。

### `useTranslation(): { t, locale, setLocale }`

`t(key, params?)` 支持 `{name}` 占位替换；`locale` 为当前语言；`setLocale(lang)` 切换并持久化。订阅语言变化自动重渲染。

### `useEditorStore(): EditorState`

| 字段 / 方法 | 说明 |
|------|------|
| `doc: EditorDoc` | `{ name, content, dirty, savedAt }`，`content` 为 Markdown 真相源 |
| `outline: OutlineNode[]` | 嵌套大纲 |
| `cursor: { line, col }` | 光标行列 |
| `wordCount: number` | 按空白分词的粗略词数 |
| `loadSignal: number` | 新文档载入时自增（编辑器重载信号） |
| `loadFromText(text, name?)` | 整文档替换（挂载 / 宿主灌入） |
| `updateContent(md)` | 编辑器每次变更回调（置 `dirty`） |
| `markSaved()` | 清除 dirty、记 `savedAt` |
| `setOutline(o)` / `setCursor(line, col)` | 大纲 / 光标写入 |
| `getContent()` | 取当前 Markdown |
| `updateWordCount(text)` | 重算词数 |

### `useSettingsStore(): SettingsState`

`settings: Settings`、`themeList: ThemeDef[]` + `load()` / `persist()` / `applyTheme(id)` / `applyTypography()` / `applyLayout()` / `applyCustomCss(css)` / `setLanguage(lang)` / `update(partial)`。

设置持久化在 `localStorage['typo-md-editor:settings']`，语言在 `localStorage['typo-md-editor:lang']`。`applyTheme` 会在 `<html>` 写 `data-theme` 并动态加载主题 CSS；`applyTypography` / `applyLayout` 写 `--font-size` / `--line-height` / `--font-family` / `--content-width`。

---

## 5. `editorActions` 命令层

命名空间导出：`import { editorActions } from 'typo-md-editor'`。框架无关的动作层（事件处理器期运行，不调用 hook），覆盖工具栏 / 右键菜单 / 热键三条入口。

| 分组 | 函数 |
|------|------|
| 保存 / 剪贴板 | `requestSave` `undo` `redo` `cut` `copySelection` `paste` `copyAsMarkdown` `pasteAsPlainText` `selectAll` `restoreSelection` `focusEditor` `deleteSelection` |
| 查找 / 视图 | `openFind(find?)` `toggleSourceMode` `setMode` `toggleFocusMode` `toggleTypewriterMode` `toggleFullscreen` `zoomActualSize` `zoomIn` `zoomOut` `applyTheme` `setLanguage` `openPreferences` |
| 段落 / 块 | `setHeading(level)` `setParagraph` `increaseHeadingLevel` `decreaseHeadingLevel` `insertTable` `insertCodeBlock` `indentSelectedLines` `indentCodeBlock` `insertAlert(type)` `insertMathBlock` `insertInlineMath` `insertBlockquote` `insertOrderedList` `insertUnorderedList` `insertTaskList` `indentList` `outdentList` `insertParagraphAbove` `insertParagraphBelow` `insertLinkReference` `insertFootnote` `insertHorizontalRule` `insertToc` `insertYamlFrontMatter` `insertDiagramBlock` `insertDiagramTemplate(id)` |
| 表格 | `tableRowAbove` `tableRowBelow` `tableColLeft` `tableColRight` `tableDeleteRow` `tableDeleteCol` `tableDelete` `tableMoveRowUp` `tableMoveRowDown` `tableMoveColLeft` `tableMoveColRight` `tableFormat` `tableCopy` |
| 行内格式 | `toggleBold` `toggleItalic` `toggleUnderline` `toggleInlineCode` `toggleStrike` `insertComment` `insertHyperlink` `insertLocalImage` `pickAndInsertImage` `clearStyle` `openLink` `copyLinkAddress` `editLink` `removeLink` `insertRemoteImage` `reloadAllImages` |
| 状态查询 | `currentBlockType` `currentHeadingLevel` `markActive(...names)` `nodeActive(name, attrs?)` `taskItemActive` |

图片相关动作最终都走 `utils/images` 的注入点（`onUpload` prop → `setImageUploader`），因此上传行为对全部入口一致。

---

## 6. 主题

```ts
THEMES: ThemeDef[]          // 6 套，见 README 主题表
isDarkThemeId(id): boolean  // 查表；未注册 id 回退名字推断（仅此文件允许）
```

切换主题两种方式：`<MdEditor theme="night">`（受控）或 `editorActions.applyTheme('night')` / 设置对话框。主题 CSS 按需动态加载，`data-theme` 写在 `<html>` 上。

---

## 7. 安装与 Provider

```ts
typoPlugin: { install(): void }   // 兼容 Vue 时代 app.use() 的写法；React 宿主无需安装
ensureStore(): void               // 幂等空操作（zustand store 为模块级单例），保留 API 兼容
TypoProvider: ({ children }) => ReactNode   // 可选 Provider，仅透传 children
```

---

## 8. i18n

```ts
i18n / typoI18n: { global: { t: translate, locale: { value: Lang } } }  // 兼容 vue-i18n 形态
SUPPORTED_LANGS: Lang[]           // ['zh-CN', 'en', 'zh-TW']
useTranslation(): { t, locale, setLocale }
TypoI18nProvider: ({ children }) => ReactNode
```

`i18n.global.locale.value = 'en'` 可直接切语言（持久化 + 通知订阅者）。语言包位于 `src/i18n/locales/`，三语各 305 个 key，新增文案需同步补齐。

---

## 9. 导出工具

```ts
toMarkdown(markdown: string): string
toHtml(markdown: string, baseName?: string): Promise<string>   // 内联样式/主题的完整 HTML
toPdf(html: string): Promise<void>                             // 隐藏 iframe + 系统打印对话框
exportDocument(markdown: string, format: ExportFormat, baseName?): Promise<void>
downloadBlob(blob: Blob, filename: string): void
```

`exportDocument` 是带 toast 反馈的统一入口（markdown/html 走浏览器下载，pdf 走打印）；失败时 toast 显示错误信息。包**从不触碰文件系统**。

---

## 10. 纯函数

```ts
fileToDataUrl(file: File): Promise<string>              // FileReader → data: URL（默认上传器）
rewriteImageSrcs(md: string, resolve: (src: string) => string): string   // 按 resolver 重写图片引用
buildOutlineFromMarkdown(markdown: string): OutlineNode[]               // ATX 标题 → 嵌套大纲（跳过代码围栏）
```

内部另有（未从包根导出）：`collectImageSrcs` `getImageUploader` `setImageUploader` `getImageSrcResolver` `setImageSrcResolver` `buildOutline` `htmlToMarkdown` `escapeHtml` `escapeAttr` `sanitizeFilename` `getFirstHeading` `stripMarkdown` `dirname` `basename` `replaceExtension` `resolveAssetPath` `showToast`。

---

## 11. 类型定义

```ts
type Lang = 'zh-CN' | 'en' | 'zh-TW'
type EditorMode = 'normal' | 'focus' | 'typewriter' | 'source'
type ThemeKind = 'light' | 'dark'
type ExportFormat = 'markdown' | 'html' | 'pdf'

interface EditorDoc { name: string; content: string; dirty: boolean; savedAt: number | null }
interface OutlineNode { id: string; level: number; text: string; pos: number; children: OutlineNode[] }
interface HotkeySpec { ctrl?: boolean; shift?: boolean; alt?: boolean; key?: string; code?: string }
interface Settings {
  theme: string; language: Lang; fontSize: number; lineHeight: number; fontFamily: string
  mode: EditorMode; contentWidth: number; customCss: string
  hotkeys?: Record<string, HotkeySpec>   // 按命令 id 的覆盖，缺失回退内置默认
}
interface ThemeDef { id: string; name: string; kind: ThemeKind; cssPath?: string }
type ImageUploader = (file: File) => Promise<string>
```

`HotkeySpec`：`key` 为规范化小写键名；对 `key` 会随 Shift 变化的键（如 Backquote → `~`）必须同时给 `code`（物理键）才能稳定匹配。`metaKey` 在匹配时等同于 `ctrlKey`。

---

## 12. 使用范例

### 受控编辑 + 宿主持久化

```tsx
const [md, setMd] = useState('')
<MdEditor
  modelValue={md}
  onUpdateModelValue={setMd}
  onSave={() => { void apiRef.current?.getMarkdown().then(saveToBackend) }}
/>
```

### 上传到自有 CDN

```tsx
<MdEditor onUpload={async (file) => {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch('/api/upload', { method: 'POST', body: fd })
  return (await r.json()).url
}} />
```

### 本地图片路径解析

```tsx
<MdEditor resolveImageSrc={(src) => src.startsWith('http') ? src : `/assets/${src}`} />
```

### 只读预览 + 大纲

```tsx
<MdEditor modelValue={md} readonly />
<OutlinePanel />
```

### 导入 / 导出

```tsx
apiRef.current?.loadMarkdown(text)     // 灌入（会重建编辑器实例）
apiRef.current?.exportMarkdown('doc')  // 下载 doc.md
await apiRef.current?.exportHtml()     // 下载 doc.html
await apiRef.current?.print()          // 打印 / 另存为 PDF
```

### 命令层驱动工具栏

```tsx
import { editorActions } from 'typo-md-editor'
<button onClick={() => editorActions.insertTable()}>表格</button>
<button onClick={() => editorActions.toggleBold()}>加粗</button>
```

---

## 13. 陷阱与注意事项

1. **`getMarkdown()` 在 `EditorApi` 上返回 `Promise<string>`，在 `useMilkdown()` 上返回 `Promise<string> | string`**——统一按 `await` 处理。
2. **`loadMarkdown` 是异步重建实例**（先 `destroy` 旧 Crepe 再 `create` 新的），连续调用只有最后一次落地；调用后立刻 `getMarkdown()` 可能读到旧内容。
3. **图片上传器是模块级注入点**：`onUpload` prop 在挂载时注入、卸载时恢复默认 `fileToDataUrl`；多实例页面后卸载的实例会影响全局。
4. **`hotkeys` prop 挂载期求值**：运行期勾选/取消不生效，需重挂组件。
5. **模块级单例**：`useMilkdown` / `useUI` / `useFind` / `useEditorMenu` / `useSourceMode` 状态全包共享，同页多个 `MdEditor` 会互相干扰（大纲、查找、源码模式、菜单）。
6. **CSS 变量写在 `documentElement`**，自定义 CSS 也注入全局 `#typo-custom-css`，注意与宿主样式冲突。
7. **React 是外部依赖**：库构建 externalize `react` / `react-dom` / `react/jsx-runtime`，宿主必须自备 React 18。
8. **`?e2e=1` 调试手柄**：URL 带该参数时 `window.__typo` 暴露编辑器实例，仅用于自动化探针，生产无影响。
9. **mermaid 需要 CSP 的 `unsafe-eval` / `wasm-unsafe-eval`**，KaTeX 需要 `font-src data:`。
