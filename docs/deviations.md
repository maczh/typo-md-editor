# typo-md-editor 实现偏离记录（deviations）

> 作者：寇豆码（Engineer） · 日期：2026-10-13
> 记录实现过程相对 `docs/extraction-design.md` 的全部偏离，作为 QA「偏离评审」的核对依据。
> 每条包含：**偏离点**（设计章节 → 实际做法）、**原因**、**风险/影响评估**、**是否需用户在真机关注**。
> 分两部分：A = 工程师实现偏离（9 项）；B = QA 代核对项（4 处，含 2 项经核对符合设计、1 项偏离后果说明、1 项需真机决策）。

---

## A. 实现偏离（9 项）

### D1 `vite-plugin-dts` 版本 `^3.16.0` → `^4.5.4`

- **设计章节**：§4 package.json devDependencies。
- **实际做法**：`"vite-plugin-dts": "^4.5.4"`。
- **原因**：npm registry 不存在 3.16.0（3.x 线已终止，最新为 5.1.2），按设计版本号 `npm install` 直接 ETARGET 失败。4.5.4 为与 Vite 5 兼容的成熟 4.x 线。
- **风险/影响**：仅影响用户机器 `build:lib` 的 d.ts 产出环节；不影响沙箱验证（类型检查走 vue-tsc，与 dts 插件无关）；插件 API（`include`/`exclude`）两版一致。
- **真机关注**：**是**（低）——首次执行 `npm run build:lib` 时确认 d.ts 正常生成即可。

### D2 devDependencies 增加 `@types/node ^20.14.0`

- **设计章节**：§4 依赖清单 + tsconfig 规格（`include` 含 `tests/**`）。
- **实际做法**：devDependencies 新增 `@types/node`。
- **原因**：5 个测试文件 `import { test } from 'node:test'` / `node:assert/strict`，而设计的依赖清单未含 node 类型包，根 tsconfig 一纳入 `tests/**` 即报 TS2307（设计自身的 include 规格与依赖清单之间的矛盾，按验收「vue-tsc 0 错误」必须补齐）。
- **风险/影响**：dev-only 类型包，零运行时影响；@types 自动纳入会向 src 引入 Node 全局类型，strict 下无副作用（未发现既有代码依赖 Node 专有全局）。
- **真机关注**：否。

### D3 exporter 四个文件从 T05 提前至 T04 落地

- **设计章节**：任务列表 T04 / T05 的划分（exporter 列在 T05）。
- **实际做法**：`src/utils/exporter/{index,toHtml,toPdf,toMarkdown}.ts` 与 `MdEditor.vue` 同批写入。
- **原因**：MdEditor 的 `exportMarkdown` / `exportHtml` / `print` 静态依赖 `@/utils/exporter`，而 T04 验收标准要求 `vue-tsc --noEmit` 全绿——不提前则 T04 节点不可验证。
- **风险/影响**：无。文件内容与 T05/§3.3-8 规格逐条一致（downloadBlob / print / 删 pickSave/saveFileAs），仅写入时序变化。
- **真机关注**：否。

### D4 `image-block.onUpload` 回退值从 `defaultUploader` 改为 `getImageUploader()`

- **设计章节**：§3.3-7 字面写法 `options.onUpload ?? defaultUploader`；与同文档 §2.1 API 表「粘贴/拖拽/选择文件/`image-block.onUpload` 统一走 `onUpload`」及时序图注记「Crepe image-block 的 onUpload 同样走 `getImageUploader()`」存在内部矛盾。
- **实际做法**：`onUpload: options.onUpload ?? getImageUploader()`。
- **原因**：EditorPane 为复制文件、`mount` 三参调用不传 onUpload；若按字面写法，宿主 `onUpload` prop 对 image-block 路径（粘贴图片进 Crepe 图像块）恒不生效，违背 §2.1 公开 API 契约。无注入时 `getImageUploader()` 默认即 `fileToDataUrl`，与字面写法行为完全一致。
- **风险/影响**：无行为回退；`useMilkdown.mount` 的 onUpload 透参通道仍然保留可用（直接使用 `createEditor` 的调用方）。
- **真机关注**：否（但属设计文档内部矛盾，建议架构师后续回写文档统一表述）。

### D5 `demo/tsconfig.json` 两处调整

- **设计章节**：T01「demo/tsconfig.json 新增」（未给细则）。
- **实际做法**：`exclude: ["vite.config.ts"]`；`include` 增加 `../src/types/turndown-plugin-gfm.d.ts`。
- **原因**：demo 程序若纳入 `vite.config.ts`，`node:url` 无类型声明会误报（根 tsconfig 同样不检查 vite.config.ts，保持一致）；`turndown-plugin-gfm` 的 ambient 声明位于 `src/types/`，demo 程序需显式引入否则 TS7016。
- **风险/影响**：无；仅类型检查配置，不影响 vite 构建（vite 不读该 include/exclude）。
- **真机关注**：否。

### D6 `package.json` test 脚本 glob 化

- **设计章节**：§4 scripts（`"test": "node tests/build.mjs && node --test tests/.out/"`）。
- **实际做法**：`node --test tests/.out/*.test.mjs`。
- **原因**：Node ≥ 22 的 `--test` 位置参数按 glob 模式解释、不再扫描目录（已用非隐藏目录复证：`node --test tests/outtest` 同样报 MODULE_NOT_FOUND），目录形式在本环境必红；glob 形式在各 Node 版本均可用。
- **风险/影响**：无；`npm test` 在 Node 18/20/22 行为一致。
- **真机关注**：否。

### D7 `hotkeys` prop 为挂载期求值（遵循设计字面，非实现选择）

- **设计章节**：§3.2 MdEditor 装配步骤 8（`if (props.hotkeys) useHotkeys()`）。
- **实际做法**：与设计一致，setup 期求值一次。
- **原因**：`useHotkeys()` 经 `onMounted`/`onBeforeUnmount` 管理窗口监听，运行期切换 prop 无法热注册/热注销；严格按设计字面实施，未自行扩大 API。
- **风险/影响**：运行期切换 `hotkeys` prop 不生效（需重挂组件）；demo 中的「热键」勾选框仅演示挂载期行为。
- **真机关注**：否（后续版本可在 useHotkeys 增加 imperative stop 后支持运行期切换）。

### D8 `toast.ts` / `toPdf.ts` 文件头注释中性化

- **设计章节**：映射表 #21 / #29（标注「复制」）。
- **实际做法**：复制后去除文件头注释中的桌面运行时字样。
- **原因**：交付硬约束「禁止 Tauri 相关代码以任何形式（含死代码、注释、类型）带进新包」；与映射表 #17（prose.ts 的 `replaceImageSrc` 注释中性化）同一性质。
- **风险/影响**：无（纯注释）。
- **真机关注**：否。

### D9 settings store 新增导出 `defaultSettings`

- **设计章节**：§3.3-5 settings store 改造（公开 API 清单未含此导出）。
- **实际做法**：`export { defaultSettings }`。
- **原因**：MdEditor 的 `fontFamily` / `theme` 默认值需要单一事实源，避免 store 与组件各存一份字面量漂移。
- **风险/影响**：无（仅新增导出，不改变既有 API 形态）。
- **真机关注**：否。

---

## B. QA 代核对项（4 处）

### Q1 vite.config 未设 `external` —— 运行时依赖全量内联（**偏离，需真机决策**）

- **设计章节**：TL;DR「`dependencies` 全外部化」vs §4 详规（根 vite.config.ts 要点，585–604 行，**无** `rollupOptions.external`）+ §4「未设 peerDependencies（v0.1 与源策略一致：运行时依赖进 dependencies，由 npm 自动装配）」。
- **实际做法**：与 §4 详规逐字一致——根 `vite.config.ts` 不设 external，rollup 将全部运行时依赖打入 `dist/`。
- **原因**：设计文档自身存在 TL;DR 与详规的矛盾；按详规（更具体、与源项目策略一致）实施，主理人明确「按设计基线保持，留给用户真机决策」。
- **风险/影响**：`dist/` 体积大（mermaid / katex / milkdown 全量内联，MB 级）；宿主应用若装有同名依赖会二次装载；动态 chunk 数量多（设计 R3 已知，`files: ["dist"]` 整目录发布可覆盖）。
- **真机关注**：**是**——用户真机执行 `build:lib` 后需决策是否改为 `rollupOptions.external` + 依赖迁移 `peerDependencies`（届时需同步改 package.json 依赖策略，本次按基线未动）。

### Q2 demo CSS 导入顺序（**符合设计**）

- **设计章节**：§9.5 共享约定——`variables.css → app.css → @milkdown/crepe/theme/common/style.css → @milkdown/crepe/theme/nord.css → mermaid.css → typora.css`（typora 必须在 Crepe 主题之后）。
- **实际做法**：`demo/main.ts` 严格按该顺序导入，且与库侧说明一致。
- **结论**：符合，无偏离。

### Q3 SettingsDialog `customCss` 为 general tab 一等字段（**偏离后果说明**）

- **设计章节**：§3.3-4 / 映射表 #37（Settings 删 `autoSave`/`autoSaveInterval`）。
- **实际做法**：删除自动保存复选框与间隔输入两个表单行，以及随之失效的 `.field.checkbox` scoped CSS；`customCss` 保留为 general tab 的一等字段（源实现中它本就位于 general tab、autoSave 行之后，非新提升位置）。
- **风险/影响**：无功能变化；`Settings` 类型已无 autoSave 键，挂载时 `Object.assign(form, settings)` 自然兼容。
- **真机关注**：否。

### Q4 `file.ts` 删 `nativeJoin` + `image.ts` 无残留调用 + `setReadonly` 形态一致（**符合设计**）

- **设计章节**：映射表 #15（「复制并删 nativeJoin」）；§3.3-7（`setReadonly` 透传，已核实存在）。
- **实际做法**：`nativeJoin` 已删；全仓 grep 确认 `images.ts` / `actions.ts` 等无残留引用（`dirname`/`basename`/`replaceExtension`/`resolveAssetPath` 四函数保留，测试覆盖不受影响）；`setReadonly` 采用与 `create`/`destroy`/`getMarkdown` 相同的防御性 cast 形态 `(crepe as unknown as { setReadonly: (v: boolean) => Crepe }).setReadonly(value)`。
- **结论**：符合，无偏离。

---

## C. 汇总

| # | 条目 | 类型 | 真机关注 |
|---|------|------|---------|
| D1 | vite-plugin-dts ^4.5.4 | 偏离（依赖版本） | 是（低，验证 d.ts） |
| D2 | 增 @types/node | 偏离（依赖清单补齐） | 否 |
| D3 | exporter 提前至 T04 | 偏离（任务时序） | 否 |
| D4 | image-block onUpload 回退值 | 偏离（设计内部矛盾的取舍） | 否（建议架构师回写文档） |
| D5 | demo/tsconfig 两处调整 | 偏离（配置细则补全） | 否 |
| D6 | test 脚本 glob 化 | 偏离（Node 22 兼容） | 否 |
| D7 | hotkeys 挂载期求值 | 遵循设计字面（已知限制） | 否 |
| D8 | toast/toPdf 注释中性化 | 偏离（映射表 vs 硬约束） | 否 |
| D9 | settings store 导出 defaultSettings | 偏离（API 增项） | 否 |
| Q1 | vite.config 无 external（依赖内联） | 偏离（TL;DR vs 详规） | **是（需真机决策）** |
| Q2 | demo CSS 顺序 | 符合 | 否 |
| Q3 | customCss 一等字段 | 偏离后果说明 | 否 |
| Q4 | nativeJoin 删除/setReadonly 形态 | 符合 | 否 |
