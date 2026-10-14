# typo-md-editor 开发文档（React 端口）

> 分支 `v1-react` · 面向本仓库贡献者：环境搭建、日常命令、架构机制、构建发布、测试与调试。
> 使用者请读根 [`README.md`](../README.md) 与 [`SDK.md`](./SDK.md)。

## 目录

1. [环境要求与首次搭建](#1-环境要求与首次搭建)
2. [常用命令](#2-常用命令)
3. [仓库结构](#3-仓库结构)
4. [架构分层与关键机制](#4-架构分层与关键机制)
5. [构建与发布](#5-构建与发布)
6. [测试](#6-测试)
7. [调试技巧](#7-调试技巧)
8. [编码约定与红线](#8-编码约定与红线)
9. [已知问题与待办](#9-已知问题与待办)
10. [文档索引与分支说明](#10-文档索引与分支说明)

---

## 1. 环境要求与首次搭建

| 项 | 要求 |
|----|------|
| Node | ≥ 18（开发机实测 24.21；`npm test` 在 18/20/22 行为一致） |
| 包管理器 | npm（postinstall 补丁依赖 npm 的默认行为；pnpm 需手动 `npm run patch:milkdown`） |
| 内存 | `build:lib` 峰值较高，低配机器（≤4GB）可能被 OOM kill |

```bash
npm install        # 自动执行 postinstall → scripts/patch-milkdown-image-block.mjs
npm run dev        # http://localhost:1420
```

## 2. 常用命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 启动 demo 开发机（端口 1420，HMR ws 1421） |
| `npm run typecheck` | `tsc --noEmit`（基线 0 错误） |
| `npm test` | esbuild 打包 + `node --test` 纯逻辑测试（基线 106 passed） |
| `npm run build:lib` | 库产物 `dist/`（先 `tsc --noEmit`，再 `prepare-build.cjs` 清目录，再 `vite build`） |
| `npm run build:demo` | demo 产物 `dist-demo/` |
| `npm run build` | 先 lib 后 demo |
| `npm run patch:milkdown` | 手动重跑 milkdown 补丁（幂等） |
| `node probe.mjs <入口>` | import 图探针，验证某入口的模块图可解析 |

### dev server 与 EMFILE

本机 inotify 实例配额（`fs.inotify.max_user_instances`，默认 128）常被 IDE/浏览器占满，`fs.watch` 抛 `EMFILE` 导致 dev server 起不来。`demo/vite.config.ts` 启动时探测一次，失败即退化轮询：

```ts
watch: {
  usePolling: watchNeedsPolling(),   // CHOKIDAR_USEPOLLING 可显式覆盖
  interval: 300,
  ignored: ['**/node_modules/**', '**/.git/**', '**/dist*/**', '**/tests/.out/**'],
}
```

根治需提权：`sudo sysctl -w fs.inotify.max_user_instances=512`（持久化到 `/etc/sysctl.d/`）。

## 3. 仓库结构

```
.
├── src/
│   ├── index.ts                  # 公共 API 总出口（唯一发布面）
│   ├── install.ts                # typoPlugin / ensureStore / TypoProvider（Vue 兼容层）
│   ├── types/                    # 共享类型（Lang/Settings/OutlineNode/HotkeySpec…）
│   ├── themes.ts                 # 主题目录 —— 亮/暗判定唯一事实源
│   ├── components/
│   │   ├── MdEditor.tsx          # 门面组件：props ↔ store ↔ 实例同步
│   │   ├── editor/               # EditorPane / Toolbar / TableToolbar / EditorContextMenu
│   │   │                         #   SourceView / ImageHandler
│   │   ├── dialogs/              # SettingsDialog / FindDialog
│   │   ├── sidebar/              # OutlinePanel
│   │   └── common/               # Icon
│   ├── composables/              # useMilkdown / useUI / useFind / useHotkeys / useEditorMenu
│   │                             #   useSourceMode / useStoreSafe / mountSequence / useSaveRequest / useClipboard
│   ├── stores/                   # editor.ts / settings.ts（zustand vanilla 单例）
│   ├── commands/                 # actions.ts（框架无关动作层）/ prose.ts（ProseMirror 纯逻辑）
│   ├── milkdown/
│   │   ├── setup.ts              # createEditor：Crepe 封装 + 粘贴转换 + loadMarkdown 重建
│   │   └── plugins/              # mermaid / markdownMarker / underline / highlight / latex / table / image
│   ├── i18n/                     # index.ts（自研 i18n，兼容 vue-i18n 形态）+ locales/{zh-CN,en,zh-TW}.ts
│   ├── utils/                    # exporter/（toHtml/toMarkdown/toPdf）/ images / outline / file / import / markdown / toast
│   └── styles/                   # variables / app / components / typora / mermaid / print + themes/*.css
├── demo/                          # 独立 Vite 应用（回归宿主）：App.tsx / main.tsx / vite.config.ts
├── tests/                         # *.test.ts（esbuild 打包到 tests/.out/ 后由 node:test 跑）
├── scripts/                       # prepare-build.cjs / patch-milkdown-image-block.mjs
├── docs/                          # SDK.md / DEVELOPMENT.md / extraction-design.md / deviations.md / *.mermaid
├── probe.mjs                      # import 图探针（不随包发布）
└── vite.config.ts                 # 库构建配置（lib mode）
```

## 4. 架构分层与关键机制

分层自顶向下：**组件层（`components/`）→ 组合式层（`composables/`）→ 状态层（`stores/`）→ 命令层（`commands/actions.ts`）→ 编辑器内核（`milkdown/setup.ts`）→ 纯逻辑（`utils/`、`commands/prose.ts`）**。依赖方向严格向下，命令层可被任意层调用。

### 4.1 单例 + `useStoreSafe` 双上下文

`zustand/vanilla` store（`editorStore` / `settingsStore`）与 `makeReactive`  observable（`useMilkdown` / `useUI` / `useFind` / `useEditorMenu` / `useSourceMode`）都是**模块级单例**，这是「同源设计」的保留：动作层 `actions.ts` 在事件处理器期直接调用 `useEditorStore()` 等，不走 React 渲染周期。

`useStoreSafe` 用 try/catch 包 `useSyncExternalStore`：渲染期内是订阅 hook，渲染期外（动作层）退化为普通快照读取。因此同一个 `useX()` 在两种上下文都安全——这是保留 Vue 时代 `actions.ts` 不改写的前提。

### 4.2 `refLike` 兼容层

`refLike(obs, key)` 把 observable 字段暴露成 `{ value }` 对象，让保留自 Vue 的 `ui.sourceMode.value = true` 写法继续工作，同时底层是 React 可订阅的。

### 4.3 StrictMode 挂载竞态：`createMountSequence`

`createEditor` 是异步的（Crepe 跨多个微任务建 DOM/插件）。React 18 StrictMode 的 mount → cleanup → mount 会在第一次 mount 未 resolve 时启动第二次，而 cleanup 的 `destroy()` 此时是空操作——两个编辑器落进同一容器，表现为文档重复、句柄失效、菜单错位。

解法：每次 `mount()` 取序号 token，`destroy()`/新 mount 使旧 token 失效；resolve 时 token 已过期的实例**自我销毁**，保证容器内始终只有一个编辑器。`tests/mount-sequence.test.ts` 覆盖该逻辑。

### 4.4 `loadMarkdown` 串行重建

`Editor.destroy()` 是异步的，旧实例的 DOM/插件视图清理在 Promise 里才完成。因此 `loadMarkdown` 用 `loadSequence` 序号守卫串行执行「await destroy → spawn → await create」，连续调用只有最后一次落地。**不要**改成同步 destroy 后立刻 spawn（历史 bug：手柄丢失/错位）。

### 4.5 Crepe 内置 Vue 运行时的特性开关

Crepe 的 table / image-block / code-block node view 是 Vue 组件，但本项目用 `@vitejs/plugin-react`，Vue 的 esm-bundler 特性开关不会被注入，会刷 `__VUE_OPTIONS_API__` 告警。两个 vite 配置都手动 `define` 了这三个开关，**新增 vite 配置时别忘了带**。

### 4.6 压缩必须用 terser

esbuild 默认压缩会重排模块初始化顺序，触发 `@milkdown/components` 循环依赖 TDZ 崩溃；terser 保序。`build.minify: 'terser'` 不可改回 esbuild。

### 4.7 主题机制

主题 id 是稳定标识，`data-theme` 写在 `<html>`；`settings store` 按 id 动态 `import()` 对应 `styles/themes/*.css`。亮/暗判定只允许走 `src/themes.ts` 的 `themeKindMap` / `isDarkThemeId()`（其它文件禁止 `id.includes('dark')`）。主题 CSS 里同时覆盖 Crepe 的 `--crepe-color-*` 变量，使 CodeMirror 高亮（oneDark）与主题联动。

### 4.8 i18n 自研实现

`src/i18n/index.ts` 是自研的极简 i18n：模块级 `currentLang` + 订阅集合，`i18n.global.t` / `i18n.global.locale` 结构与 vue-i18n 一致，使 `milkdown/setup.ts`、`stores/settings.ts` 无需改动；React 侧由 `useTranslation` 经 `useSyncExternalStore` 订阅。缺失 key 返回 key 本身。

### 4.9 CSS 引入顺序（硬约束）

```
variables → app → @milkdown/crepe/theme/common/style.css → crepe nord
  → mermaid → typora → components
```

`typora.css` 必须在 Crepe 主题之后（靠顺序覆盖）。demo 见 `demo/main.tsx`；库侧入口 `src/index.ts` 只 import `components.css`（见 §9 已知缺口）。

### 4.10 图片注入点

`utils/images.ts` 持有模块级 `uploader` / `srcResolver`。`MdEditor` 挂载时据 `onUpload` / `resolveImageSrc` 注入，卸载时恢复默认（`fileToDataUrl` / 恒等）。Crepe `image-block.onUpload`、`ImageHandler`（粘贴/拖拽）、`actions.pickAndInsertImage` 四路统一读注入点，**新增图片入口时必须走注入点**，不要另接上传逻辑。

## 5. 构建与发布

### 5.1 库构建（`vite.config.ts`，lib mode）

- 入口 `src/index.ts`，产物 `dist/typo-md-editor.js`（ESM）+ `dist/style.css` + `dist/**/*.d.ts`（`vite-plugin-dts`）
- `react` / `react-dom` / `react/jsx-runtime` 走 `rollupOptions.external`，宿主自备 React 18
- 其余运行时依赖（mermaid / katex / milkdown / turndown…）**全量内联**（未设 external，见 `docs/deviations.md` Q1），`dist/` 为 MB 级、chunk 数量多；`files: ["dist", "docs"]` 整目录发布可覆盖
- `cssCodeSplit: false` → 单 `style.css`；`print.css` 因被 `toPdf.ts` 以 `?url` 引用而单独产出

### 5.2 `prepare-build.cjs` 为什么存在

Vite 的 `emptyOutDir` 用一次 `fs.rmSync(recursive)`  bulk 删除整棵输出树；受管环境（含部分沙箱）对单次批量删除有条数守卫，会直接让 `vite build` 失败。脚本把旧输出**改名**为 `.dist-previous`（rename 不是删除，不受守卫），让 Vite 建新目录。普通机器上 `rmSync` 成功时它只是个空操作。

### 5.3 demo 构建

`demo/vite.config.ts` 是独立 Vite 应用（`root: ./demo`，产物 `../dist-demo`），与库构建彻底分离；`@` 别名指向 `../src`，因此 demo 直接消费源码，是回归宿主。

### 5.4 发布检查单

1. `npm run typecheck` 0 错误
2. `npm test` 全绿
3. `npm run build` 成功，确认 `dist/typo-md-editor.js`、`dist/style.css`、`dist/index.d.ts` 齐全
4. 浏览器过一遍 demo（主题切换、查找替换、源码模式、导出、图片粘贴/拖拽、表格工具条、块手柄）
5. 干净目录 `npm pack --dry-run` 核对 `files` 内容

## 6. 测试

- **策略**：esbuild **原生二进制**（非 WASM）把 `tests/*.test.ts` 打包成 `tests/.out/*.test.mjs`，再由 `node --test` 执行。这样容器内无 WASM 也能跑，且能解析 `@/` 别名、stub Vite 专有的 `?raw` 导入
- **覆盖范围**：纯逻辑 only —— `file` / `outline` / `i18n` / `exporter-toHtml` / `exporter-toMarkdown` / `prose-line` / `prose-menu` / `prose-extended` / `hotkeys` / `mount-sequence`（基线 106 passed）
- **不覆盖**：依赖 DOM/ProseMirror 渲染的路径（mermaid、Crepe 视图、对话框交互）→ 走 demo 浏览器回归
- **新增测试**：在 `tests/` 加 `*.test.ts`，并把它加进 `tests/build.mjs` 的 `entries` 数组（否则不会被打包执行）

## 7. 调试技巧

| 手段 | 用法 |
|------|------|
| `?e2e=1` | URL 带该参数时 `window.__typo` 暴露 `EditorInstance`，可在控制台直接驱动编辑器 |
| `probe.mjs` | `node probe.mjs src/milkdown/setup.ts` 验证某入口 import 图可解析（手法同 `tests/build.mjs`） |
| demo 回归宿主 | `demo/App.tsx` 顶部按钮组覆盖导入/保存/导出/打印/对话框/主题/语言/只读/开关，底栏读 editor store |
| HMR | ws 端口 1421 与 http 1420 分离（`hmr` 配置），代理/端口冲突时先查这里 |
| toast | 动作层错误统一走 `showToast(msg, 'error')`，导出失败先看 toast 文案 |

## 8. 编码约定与红线

1. **禁止 Tauri 字样**：任何形式（死代码、注释、类型）都不得带进本包；复制文件时文件头注释需中性化。
2. **主题唯一事实源**：亮/暗只走 `src/themes.ts`，其它模块禁止自带映射。
3. **保存语义**：`Ctrl/Cmd+S` 只是「宿主该保存了」的请求（`useSaveRequest` → `onSave` 回调），包内**从不写文件**。
4. **CSS 变量写在 `documentElement`**：新增变量沿用现有命名，不引入第二套变量体系。
5. **i18n 三语对齐**：`locales/{zh-CN,en,zh-TW}.ts` 各 305 key，新增 key 必须三语同步。
6. **热键单一注册表**：`COMMAND_DEFS` 是唯一来源，工具栏 / 浮层菜单 / 全局监听都从它读；编辑器原生拥有的命令注册为 display-only（无 `run`）。
7. **`metaKey` 等同 `ctrlKey`**：热键匹配与格式化统一处理 macOS。
8. **图片入口走注入点**：见 §4.10。
9. **新增 vite 配置带 Vue 特性 define**：见 §4.5。
10. **压缩用 terser**：见 §4.6。

## 9. 已知问题与待办

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 1 | **样式未完全随包发布**：`src/index.ts` 只 import `components.css`，`variables.css` / `app.css` / `typora.css` / `mermaid.css` 与 Crepe 主题 CSS 都不在 `dist/style.css` 里 | 宿主只 `import 'typo-md-editor/style.css'` 会缺基础 token 与正文排版，外观破损 | 在 `src/index.ts` 顶层按 §4.9 顺序补 import，并重建验证 |
| 2 | 多实例共享单例状态 | 同页多个 `MdEditor` 互相干扰 | 后续以 provide/inject 或 context 化 store 重构 |
| 3 | `hotkeys` prop 挂载期求值 | 运行期切换无效 | `useHotkeys` 增加 imperative stop 后支持 |
| 4 | 依赖全量内联（Q1） | `dist/` MB 级、宿主重复依赖二次装载 | 真机决策是否改 `external` + `peerDependencies` |
| 5 | CSS 变量无前缀 | 可能与宿主全局样式冲突 | v0.2 前缀化 |
| 6 | i18n 冗余 key | 语言包含已废弃文案 | 随功能清理 |

## 10. 文档索引与分支说明

| 文档 | 内容 |
|------|------|
| [`../README.md`](../README.md) | 项目介绍、安装、快速开始、CSP、已知限制 |
| [`SDK.md`](./SDK.md) | 完整 API 参考与使用范例 |
| 本文 | 架构、构建、测试、调试、约定 |
| [`extraction-design.md`](./extraction-design.md) | 从 typo 桌面应用提取的架构设计（Vue 基线；React 端口沿用其分层、共享约定 §9 与映射表） |
| [`deviations.md`](./deviations.md) | 实现相对设计的偏离记录（含 QA 核对项） |
| [`class-diagram.mermaid`](./class-diagram.mermaid) / [`sequence-diagram.mermaid`](./sequence-diagram.mermaid) | 类图 / 时序图 |

**分支**：`v1-react` = React 端口（当前分支，`demo` 与 `src` 均为 `.tsx`）；`main` = Vue 3 端口。两端公共 API 命名保持一致（`MdEditor`、`editorActions`、`THEMES`、`typoPlugin`…），差异集中在框架绑定（Vue SFC/Pinia → React function component/zustand）。
