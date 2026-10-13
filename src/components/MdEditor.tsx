import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Editor } from '@milkdown/core'
import { useMilkdown } from '@/composables/useMilkdown'
import { useEditorStore } from '@/stores/editor'
import { defaultSettings, useSettingsStore } from '@/stores/settings'
import { useUI } from '@/composables/useUI'
import { useHotkeys } from '@/composables/useHotkeys'
import { registerSaveHandler, unregisterSaveHandler } from '@/composables/useSaveRequest'
import { ensureStore } from '@/install'
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
import Toolbar from './editor/Toolbar'
import EditorPane from './editor/EditorPane'
import SettingsDialog from './dialogs/SettingsDialog'
import FindDialog from './dialogs/FindDialog'

/**
 * MdEditor —— 包内唯一公共组件（门面）。
 *
 * 职责：props ↔ settings store ↔ 编辑器实例同步；保存经 onSave 回调上交宿主；
 * 图片上传/本地 src 解析经注入点落到 utils/images。
 *
 * props 语义：首次挂载 = 初始值（播种 settings store，持久化值随后覆盖已持久化
 * 的键）；后续变化 = 受控同步（effect 写入设置 store 或编辑器）。
 */

/** 模板 ref / `onReady` 回调可获得的编辑器 API（稳定门面）。 */
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

export interface MdEditorProps {
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
  /** v-model 更新回调。 */
  onUpdateModelValue?: (v: string) => void
  /** 保存请求回调（Ctrl/Cmd+S）。 */
  onSave?: () => void
  /** 编辑器就绪回调。 */
  onReady?: (api: EditorApi) => void
}

const MdEditor = forwardRef<EditorApi, MdEditorProps>(function MdEditor(props, ref) {
  const {
    modelValue = '',
    theme = DEFAULT_THEME,
    language = 'zh-CN',
    readonly = false,
    showToolbar = true,
    showTableToolbar = true,
    showContextMenu = true,
    hotkeys = true,
    contentWidth = 80,
    fontSize = 16,
    lineHeight = 1.6,
    fontFamily = defaultSettings.fontFamily,
    customCss = '',
    onUpload,
    resolveImageSrc,
    onUpdateModelValue,
    onSave,
    onReady,
  } = props

  ensureStore()

  const milkdown = useMilkdown()
  const editorStore = useEditorStore()
  const settingsStore = useSettingsStore()
  const ui = useUI()

  const identity = (src: string): string => src
  const srcResolver = (): ((src: string) => string) => resolveImageSrc ?? identity

  // 1) 首次渲染播种设置 store + 预载文档（早于子组件 EditorPane 的挂载副作用，
  //    保证 createEditor 拿到的是已播种的内容）。
  const seededRef = useRef(false)
  if (!seededRef.current) {
    seededRef.current = true
    settingsStore.update({
      theme,
      language,
      fontSize,
      lineHeight,
      fontFamily,
      contentWidth,
      customCss,
    })
    void settingsStore.load()
    setImageUploader(onUpload ?? defaultUploader)
    setImageSrcResolver(srcResolver())
    editorStore.loadFromText(rewriteImageSrcs(modelValue, srcResolver()))
  }

  // 2) props 变化 → 设置 store + 应用（受控同步）。
  useEffect(() => {
    settingsStore.update({
      theme,
      language,
      fontSize,
      lineHeight,
      fontFamily,
      contentWidth,
      customCss,
    })
    settingsStore.applyTheme(theme)
    settingsStore.setLanguage(language)
    settingsStore.applyTypography()
    settingsStore.applyLayout()
    settingsStore.applyCustomCss(customCss)
    void settingsStore.persist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, language, fontSize, lineHeight, fontFamily, contentWidth, customCss])

  // 3) v-model 双向绑定：外部灌入 → 内部。
  useEffect(() => {
    if (modelValue !== editorStore.doc.content) {
      editorStore.loadFromText(rewriteImageSrcs(modelValue, srcResolver()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelValue])

  // 4) v-model 双向绑定：内部回流 → 外部。
  useEffect(() => {
    const md = editorStore.doc.content
    if (md !== modelValue) onUpdateModelValue?.(md)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorStore.doc.content])

  // 5) 只读：实例就绪后应用初始值，之后随 prop 切换。
  useEffect(() => {
    milkdown.instance.value?.setReadonly(readonly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readonly, milkdown.isReady.value])

  // 6) 全局热键（按 prop 条件注册）。
  useHotkeys(hotkeys)

  /** 导出基名：文档名去扩展名并做文件名安全化。 */
  function exportBaseName(filename?: string): string {
    const raw = filename || editorStore.doc.name || 'untitled'
    return sanitizeFilename(raw.replace(/\.md$/i, ''))
  }

  const apiRef = useRef<EditorApi>({
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
        await exportDocument(await apiRef.current.getMarkdown(), 'markdown', base)
      })()
    },
    exportHtml: async (filename?: string) => {
      await exportDocument(await apiRef.current.getMarkdown(), 'html', exportBaseName(filename))
    },
    print: async () => {
      await exportDocument(await apiRef.current.getMarkdown(), 'pdf', exportBaseName())
    },
    openSettings: () => ui.openSettings(),
    openFind: () => ui.openFind(),
  })

  useImperativeHandle(ref, () => apiRef.current, [])

  // 7) 实例就绪 → 向宿主暴露 API（提前拿 API 也可用 ref / onReady 回调）。
  useEffect(() => {
    if (milkdown.isReady.value) onReady?.(apiRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milkdown.isReady.value])

  // 8) 保存请求处理器注册 / 反注册。
  useEffect(() => {
    registerSaveHandler(() => onSave?.())
    return () => unregisterSaveHandler()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 9) 卸载时恢复默认图片注入点。
  useEffect(() => {
    return () => {
      setImageUploader(defaultUploader)
      setImageSrcResolver(identity)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="md-editor">
      {showToolbar && !readonly && <Toolbar />}
      <EditorPane showTableToolbar={showTableToolbar} showContextMenu={showContextMenu} />
      {ui.settingsOpen.value && <SettingsDialog onClose={() => ui.closeSettings()} />}
      {ui.findOpen.value && <FindDialog onClose={() => ui.closeFind()} />}
    </div>
  )
})

export default MdEditor
