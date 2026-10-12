<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
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
 * demo 宿主外壳 —— 同时充当回归宿主（T05 浏览器回归清单的载体）：
 * 顶部按钮组演示宿主侧动作（导入/保存/导出/打印/对话框/主题/语言/只读/开关），
 * 左右分栏演示 MdEditor + OutlinePanel 的自由组合，底部状态行演示宿主如何读
 * editor store，标题同步示范替代被丢弃的 useWindowTitle。
 */

const editor = useEditorStore()

const md = ref<string>('# typo-md-editor demo\n\n左侧编辑，右侧大纲。试试：\n\n- 输入文字，v-model 实时同步\n- `Ctrl/Cmd+S` 触发宿主保存（下载 .md）\n- 粘贴 HTML / 粘贴图片\n- 切换主题、语言、只读\n- 查找替换（`Ctrl/Cmd+F`）、设置对话框（`Ctrl/Cmd+,`）\n- 源码模式（`Ctrl/Cmd+/`）\n\n```js\nconsole.log("hello")\n```\n')

const theme = ref('github')
const language = ref<Lang>('zh-CN')
const readonly = ref(false)
const showToolbar = ref(true)
const hotkeys = ref(true)

const api = ref<EditorApi | null>(null)
function onReady(a: EditorApi): void {
  api.value = a
}

/** 宿主保存：浏览器下载 .md（生产环境可换成自有后端）。 */
function onSave(): void {
  api.value?.exportMarkdown()
}

function onExportHtml(): void {
  void api.value?.exportHtml()
}

function onPrint(): void {
  void api.value?.print()
}

function onImportFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    md.value = String(reader.result ?? '')
  }
  reader.readAsText(file)
  input.value = '' // 允许重复导入同一文件
}

// 标题同步示范（3 行，替代被丢弃的 useWindowTitle）。
watch(
  () => [editor.doc.name, editor.doc.dirty],
  () => {
    document.title = `${editor.doc.name}${editor.doc.dirty ? ' •' : ''} — typo-md-editor demo`
  },
  { immediate: true },
)

// 卸载时恢复标题，避免离开 demo 后标题残留。
onBeforeUnmount(() => {
  document.title = 'typo-md-editor demo'
})
</script>

<template>
  <div class="demo-shell">
    <header class="demo-toolbar">
      <span class="demo-brand">typo-md-editor</span>

      <label class="btn">
        导入 .md
        <input type="file" accept=".md,.markdown,.text" hidden @change="onImportFile" />
      </label>
      <button class="btn" @click="onSave">保存（下载）</button>
      <button class="btn" @click="onExportHtml">导出 HTML</button>
      <button class="btn" @click="onPrint">打印 / PDF</button>
      <button class="btn" @click="api?.openSettings()">设置</button>
      <button class="btn" @click="api?.openFind()">查找</button>

      <label class="demo-field">
        主题
        <select v-model="theme">
          <option v-for="t in THEMES" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </label>
      <label class="demo-field">
        语言
        <select v-model="language">
          <option v-for="l in SUPPORTED_LANGS" :key="l" :value="l">{{ l }}</option>
        </select>
      </label>
      <label class="demo-check">
        <input v-model="readonly" type="checkbox" /> 只读
      </label>
      <label class="demo-check">
        <input v-model="showToolbar" type="checkbox" /> 工具栏
      </label>
      <label class="demo-check">
        <input v-model="hotkeys" type="checkbox" /> 热键
      </label>
    </header>

    <div class="demo-body">
      <main class="demo-main">
        <MdEditor
          v-model="md"
          :theme="theme"
          :language="language"
          :readonly="readonly"
          :show-toolbar="showToolbar"
          :hotkeys="hotkeys"
          @save="onSave"
          @ready="onReady"
        />
      </main>
      <aside class="demo-side">
        <div class="demo-side-title">大纲</div>
        <OutlinePanel />
      </aside>
    </div>

    <footer class="demo-status">
      <span>{{ editor.doc.name }}</span>
      <span>{{ editor.wordCount }} 词</span>
      <span>{{ editor.doc.dirty ? '未保存' : '已保存' }}</span>
      <span class="demo-hint">Ctrl/⌘+S 保存 · Ctrl/⌘+F 查找 · Ctrl/⌘+, 设置 · Ctrl/⌘+/ 源码模式</span>
    </footer>
  </div>
</template>

<style scoped>
.demo-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.demo-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 12px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.demo-brand {
  font-weight: 600;
  color: var(--accent);
  margin-right: 4px;
}
.demo-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--fg-muted);
}
.demo-field select {
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--fg);
  font-size: 12px;
}
.demo-check {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--fg-muted);
}
.demo-body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}
.demo-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
}
.demo-side {
  width: 232px;
  flex: 0 0 auto;
  border-left: 1px solid var(--border);
  background: var(--sidebar-bg);
  padding: 10px 8px;
  overflow: auto;
}
.demo-side-title {
  font-size: 12px;
  color: var(--fg-muted);
  margin-bottom: 6px;
}
.demo-status {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 12px;
  border-top: 1px solid var(--border);
  background: var(--sidebar-bg);
  color: var(--fg-muted);
  font-size: 12px;
}
.demo-hint {
  margin-left: auto;
}
</style>
