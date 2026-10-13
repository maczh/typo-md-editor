import { useEffect, useRef, useState } from 'react'
import {
  MdEditor,
  OutlinePanel,
  THEMES,
  SUPPORTED_LANGS,
  useEditorStore,
  type EditorApi,
} from '@/index'
import type { Lang } from '@/types'

/**
 * demo 宿主外壳 —— 同时充当回归宿主：
 * 顶部按钮组演示宿主侧动作（导入/保存/导出/打印/对话框/主题/语言/只读/开关），
 * 左右分栏演示 MdEditor + OutlinePanel 的自由组合，底部状态行演示宿主如何读
 * editor store。
 */
const SAMPLE = `# typo-md-editor demo

左侧编辑，右侧大纲。试试：

- 输入文字，v-model 实时同步
- \`Ctrl/Cmd+S\` 触发宿主保存（下载 .md）
- 粘贴 HTML / 粘贴图片
- 切换主题、语言、只读
- 查找替换（\`Ctrl/Cmd+F\`）、设置对话框（\`Ctrl/Cmd+,\`）
- 源码模式（\`Ctrl/Cmd+/\`）

\`\`\`js
console.log("hello")
\`\`\`
`

export default function App() {
  const editor = useEditorStore()

  const [md, setMd] = useState<string>(SAMPLE)
  const [theme, setTheme] = useState('github')
  const [language, setLanguage] = useState<Lang>('zh-CN')
  const [readonly, setReadonly] = useState(false)
  const [showToolbar, setShowToolbar] = useState(true)
  const [hotkeys, setHotkeys] = useState(true)

  const apiRef = useRef<EditorApi | null>(null)
  function onReady(a: EditorApi): void {
    apiRef.current = a
  }

  function onSave(): void {
    apiRef.current?.exportMarkdown()
  }

  function onExportHtml(): void {
    void apiRef.current?.exportHtml()
  }

  function onPrint(): void {
    void apiRef.current?.print()
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setMd(String(reader.result ?? ''))
    }
    reader.readAsText(file)
    e.target.value = '' // 允许重复导入同一文件
  }

  // 标题同步示范（替代被丢弃的 useWindowTitle）。
  useEffect(() => {
    document.title = `${editor.doc.name}${editor.doc.dirty ? ' •' : ''} — typo-md-editor demo`
    return () => {
      document.title = 'typo-md-editor demo'
    }
  }, [editor.doc.name, editor.doc.dirty])

  return (
    <div className="demo-shell">
      <header className="demo-toolbar">
        <span className="demo-brand">typo-md-editor</span>

        <label className="btn">
          导入 .md
          <input type="file" accept=".md,.markdown,.text" hidden onChange={onImportFile} />
        </label>
        <button className="btn" onClick={onSave}>
          保存（下载）
        </button>
        <button className="btn" onClick={onExportHtml}>
          导出 HTML
        </button>
        <button className="btn" onClick={onPrint}>
          打印 / PDF
        </button>
        <button className="btn" onClick={() => apiRef.current?.openSettings()}>
          设置
        </button>
        <button className="btn" onClick={() => apiRef.current?.openFind()}>
          查找
        </button>

        <label className="demo-field">
          主题
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="demo-field">
          语言
          <select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
            {SUPPORTED_LANGS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="demo-check">
          <input
            type="checkbox"
            checked={readonly}
            onChange={(e) => setReadonly(e.target.checked)}
          />
          只读
        </label>
        <label className="demo-check">
          <input
            type="checkbox"
            checked={showToolbar}
            onChange={(e) => setShowToolbar(e.target.checked)}
          />
          工具栏
        </label>
        <label className="demo-check">
          <input
            type="checkbox"
            checked={hotkeys}
            onChange={(e) => setHotkeys(e.target.checked)}
          />
          热键
        </label>
      </header>

      <div className="demo-body">
        <main className="demo-main">
          <MdEditor
            modelValue={md}
            theme={theme}
            language={language}
            readonly={readonly}
            showToolbar={showToolbar}
            hotkeys={hotkeys}
            onUpdateModelValue={setMd}
            onSave={onSave}
            onReady={onReady}
          />
        </main>
        <aside className="demo-side">
          <div className="demo-side-title">大纲</div>
          <OutlinePanel />
        </aside>
      </div>

      <footer className="demo-status">
        <span>{editor.doc.name}</span>
        <span>{editor.wordCount} 词</span>
        <span>{editor.doc.dirty ? '未保存' : '已保存'}</span>
        <span className="demo-hint">
          Ctrl/⌘+S 保存 · Ctrl/⌘+F 查找 · Ctrl/⌘+, 设置 · Ctrl/⌘+/ 源码模式
        </span>
      </footer>
    </div>
  )
}
