<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue'
import type { Editor } from '@milkdown/core'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { defaultSettings, useSettingsStore } from '@/stores/settings'
import { useUI } from '@/composables/useUI'
import { useHotkeys } from '@/composables/useHotkeys'
import { registerSaveHandler, unregisterSaveHandler } from '@/composables/useSaveRequest'
import { ensurePinia } from '@/install'
import { DEFAULT_THEME } from '@/themes'
import {
  defaultUploader,
  setImageUploader,
  setImageSrcResolver,
  rewriteImageSrcs,
  type ImageUploader,
} from '@/utils/images'
import { exportDocument } from '@/utils/exporter'
import { sanitizeFilename } from '@/utils/markdown'
import type { Lang } from '@/types'
import Toolbar from './editor/Toolbar.vue'
import EditorPane from './editor/EditorPane.vue'
import SettingsDialog from './dialogs/SettingsDialog.vue'
import FindDialog from './dialogs/FindDialog.vue'

/**
 * MdEditor —— 包内唯一公共组件（门面）。
 *
 * 职责：props ↔ settings store ↔ 编辑器实例同步；保存经 @save 事件上交宿主；
 * 图片上传/本地 src 解析经注入点落到 utils/images。
 *
 * props 语义：首次挂载 = 初始值（播种 settings store，持久化值随后覆盖已持久化
 * 的键）；后续变化 = 受控同步（watch 写入设置 store 或编辑器）。
 */

/** 模板 ref / `ready` 事件可获得的编辑器 API（稳定门面）。 */
export interface EditorApi {
  getMarkdown: () => Promise<string>
  getHTML: () => string
  loadMarkdown: (md: string) => void
  insert: (md: string) => void
  focus: () => void
  destroy: () => void
  getEditor: () => Editor | null
  setReadonly: (v: boolean) => void
  exportMarkdown: (filename?: string) => void
  exportHtml: (filename?: string) => Promise<void>
  print: () => Promise<void>
  openSettings: () => void
  openFind: () => void
}

const props = withDefaults(
  defineProps<{
    /** v-model：Markdown 双向绑定（编辑器真相源）。 */
    modelValue?: string
    /** 主题 id（github/gothic/newsprint/night/pixyll/whitey）。 */
    theme?: string
    language?: Lang
    readonly?: boolean
    showToolbar?: boolean
    showTableToolbar?: boolean
    showContextMenu?: boolean
    hotkeys?: boolean
    contentWidth?: number
    fontSize?: number
    lineHeight?: number
    fontFamily?: string
    customCss?: string
    /** 图片上传回调（粘贴/拖拽/选择文件/image-block 统一走它）。 */
    onUpload?: ImageUploader
    /** 本地图片 src 显示解析（默认恒等）。 */
    resolveImageSrc?: (src: string) => string
  }>(),
  {
    modelValue: '',
    theme: DEFAULT_THEME,
    language: 'zh-CN',
    readonly: false,
    showToolbar: true,
    showTableToolbar: true,
    showContextMenu: true,
    hotkeys: true,
    contentWidth: 80,
    fontSize: 16,
    lineHeight: 1.6,
    fontFamily: defaultSettings.fontFamily,
    customCss: '',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'save'): void
  (e: 'ready', api: EditorApi): void
}>()

ensurePinia()

const milkdown = useMilkdown()
const editorStore = useEditorStore()
const settingsStore = useSettingsStore()
const ui = useUI()

const identity = (src: string): string => src
const srcResolver = (): ((src: string) => string) => props.resolveImageSrc ?? identity

// 1) props 作为初始值播种设置 store；load() 随后用 localStorage 持久值覆盖
//    已持久化的键（从未持久化的键保留 props 值）。
settingsStore.update({
  theme: props.theme,
  language: props.language,
  fontSize: props.fontSize,
  lineHeight: props.lineHeight,
  fontFamily: props.fontFamily,
  contentWidth: props.contentWidth,
  customCss: props.customCss,
})
void settingsStore.load()

// 2) 图片注入点（卸载时恢复默认）。
setImageUploader(props.onUpload ?? defaultUploader)
setImageSrcResolver(srcResolver())

// 3) 预载文档（同步，早于子组件 EditorPane 的 onMounted）。
editorStore.loadFromText(rewriteImageSrcs(props.modelValue, srcResolver()))

// 4) 受控同步：props 变化 → 设置 store + 应用。
watch(
  () => [
    props.theme,
    props.language,
    props.fontSize,
    props.lineHeight,
    props.fontFamily,
    props.contentWidth,
    props.customCss,
  ],
  () => {
    settingsStore.update({
      theme: props.theme,
      language: props.language,
      fontSize: props.fontSize,
      lineHeight: props.lineHeight,
      fontFamily: props.fontFamily,
      contentWidth: props.contentWidth,
      customCss: props.customCss,
    })
    settingsStore.applyTheme(props.theme)
    settingsStore.setLanguage(props.language)
    settingsStore.applyTypography()
    settingsStore.applyLayout()
    settingsStore.applyCustomCss(props.customCss)
    void settingsStore.persist()
  },
)

// 5) v-model 双向绑定：外部灌入 / 内部回流。
watch(
  () => props.modelValue,
  (md) => {
    if (md !== editorStore.doc.content) {
      editorStore.loadFromText(rewriteImageSrcs(md, srcResolver()))
    }
  },
)
watch(
  () => editorStore.doc.content,
  (md) => {
    if (md !== props.modelValue) emit('update:modelValue', md)
  },
)

// 6) 只读：实例就绪后应用初始值，之后随 prop 切换。
watch(
  () => props.readonly,
  (v) => {
    milkdown.instance.value?.setReadonly(v)
  },
)
watch(
  () => milkdown.isReady.value,
  (ready) => {
    if (ready && props.readonly) milkdown.instance.value?.setReadonly(true)
  },
)

// 7) 全局热键（按 prop 条件注册）。
if (props.hotkeys) useHotkeys()

/** 导出基名：文档名去扩展名并做文件名安全化。 */
function exportBaseName(filename?: string): string {
  const raw = filename || editorStore.doc.name || 'untitled'
  return sanitizeFilename(raw.replace(/\.md$/i, ''))
}

const api: EditorApi = {
  getMarkdown: () => Promise.resolve(milkdown.getMarkdown()),
  getHTML: () => {
    const html = milkdown.getHTML()
    return typeof html === 'string' ? html : ''
  },
  loadMarkdown: (md: string) => milkdown.loadMarkdown(md),
  insert: (md: string) => milkdown.insert(md),
  focus: () => milkdown.instance.value?.focus(),
  destroy: () => milkdown.destroy(),
  getEditor: () => milkdown.getEditor(),
  setReadonly: (v: boolean) => milkdown.instance.value?.setReadonly(v),
  exportMarkdown: (filename?: string) => {
    const base = exportBaseName(filename)
    void (async () => {
      await exportDocument(await api.getMarkdown(), 'markdown', base)
    })()
  },
  exportHtml: async (filename?: string) => {
    await exportDocument(await api.getMarkdown(), 'html', exportBaseName(filename))
  },
  print: async () => {
    await exportDocument(await api.getMarkdown(), 'pdf', exportBaseName())
  },
  openSettings: () => ui.openSettings(),
  openFind: () => ui.openFind(),
}

// 8) 实例就绪 → 向宿主暴露 API（提前拿 API 也可用 exposes / ready 事件）。
watch(
  () => milkdown.isReady.value,
  (ready) => {
    if (ready) emit('ready', api)
  },
  { immediate: true },
)

onMounted(() => {
  registerSaveHandler(() => emit('save'))
})

onBeforeUnmount(() => {
  unregisterSaveHandler()
  setImageUploader(defaultUploader)
  setImageSrcResolver(identity)
})

defineExpose(api)
</script>

<template>
  <div class="md-editor">
    <slot name="toolbar">
      <Toolbar v-if="showToolbar && !readonly" />
    </slot>
    <EditorPane :show-table-toolbar="showTableToolbar" :show-context-menu="showContextMenu" />
    <SettingsDialog v-if="ui.settingsOpen.value" @close="ui.closeSettings()" />
    <FindDialog v-if="ui.findOpen.value" @close="ui.closeFind()" />
  </div>
</template>

<style scoped>
.md-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--bg);
  color: var(--fg);
}
</style>
