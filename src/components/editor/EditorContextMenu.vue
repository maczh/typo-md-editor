<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as A from '@/commands/actions'
import { useEditorMenu } from '@/composables/useEditorMenu'
import { hk } from '@/composables/useHotkeys'
import Icon from '@/components/common/Icon.vue'

/**
 * Typora-style floating menu, shared by two entry points:
 *  - clicking the per-line block handle (opens on the block style submenu), and
 *  - right-clicking inside the editor (context-sensitive: table vs. paragraph).
 */

const { t } = useI18n()
const menu = useEditorMenu()
const openSub = ref<string | null>(null)

const isTable = computed(() => menu.kind.value === 'table')
const submenuTitle = computed(() => (isTable.value ? t('ctx.blockStyleTable') : t('ctx.blockStyle')))

const style = computed(() => {
  const w = 248
  const h = 360
  let left = menu.x.value
  let top = menu.y.value
  if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8)
  if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8)
  return { left: `${left}px`, top: `${top}px` }
})

/**
 * Run a menu action.
 *
 * Order matters: the menu is a `Teleport`ed overlay, so before dispatching
 * anything we hand the captured range *and* keyboard focus back to the editor.
 * Without this the ProseMirror selection has drifted away from the DOM selection
 * and commands silently no-op (clipboard items are the most obvious casualty,
 * since `document.execCommand` works on the live DOM selection).
 */
function run(fn?: () => void | Promise<void>): void {
  const r = menu.range.value
  menu.hide()
  if (r) A.restoreSelection(r.from, r.to)
  else A.focusEditor()
  if (fn) void fn()
}

function isPara(): boolean {
  return A.currentBlockType() === 'paragraph'
}
function isHeading(i: number): boolean {
  return A.nodeActive('heading', { level: i })
}
function markActive(...n: string[]): boolean {
  return A.markActive(...n)
}
function nodeActive(n: string): boolean {
  return A.nodeActive(n)
}

interface Item {
  sep?: boolean
  label?: string
  shortcut?: string
  run?: () => void | Promise<void>
  checked?: () => boolean
}

const paragraphItems = computed<Item[]>(() => {
  const items: Item[] = [
    { label: t('ctx.text'), shortcut: hk('paragraph'), run: A.setParagraph, checked: isPara },
  ]
  for (let i = 1; i <= 6; i += 1) {
    items.push({
      label: t(`ctx.h${i}`),
      shortcut: hk(`h${i}`),
      run: () => A.setHeading(i),
      checked: () => isHeading(i),
    })
  }
  return items
})

const insertItems = computed<Item[]>(() => [
  { label: t('ctx.image'), shortcut: hk('insertLocalImage'), run: A.insertLocalImage },
  { label: t('ctx.footnote'), run: A.insertFootnote },
  { label: t('ctx.linkRef'), run: A.insertLinkReference },
  { label: t('ctx.horizontalRule'), run: A.insertHorizontalRule },
  { label: t('ctx.table'), shortcut: hk('insertTable'), run: A.insertTable },
  { label: t('ctx.codeBlock'), shortcut: hk('codeBlock'), run: A.insertCodeBlock },
  { label: t('ctx.mathBlock'), shortcut: hk('mathBlock'), run: A.insertMathBlock },
  { label: t('ctx.toc'), run: A.insertToc },
  { label: t('ctx.yaml'), run: A.insertYamlFrontMatter },
  { sep: true },
  { label: t('ctx.paraAbove'), run: A.insertParagraphAbove },
  { label: t('ctx.paraBelow'), run: A.insertParagraphBelow },
])

const tableItems = computed<Item[]>(() => [
  { label: t('ctx.rowAbove'), run: A.tableRowAbove },
  { label: t('ctx.rowBelow'), shortcut: hk('table-row-below'), run: A.tableRowBelow },
  { label: t('ctx.colLeft'), run: A.tableColLeft },
  { label: t('ctx.colRight'), run: A.tableColRight },
  { sep: true },
  { label: t('ctx.moveRowUp'), shortcut: hk('table-move-row-up'), run: A.tableMoveRowUp },
  { label: t('ctx.moveRowDown'), shortcut: hk('table-move-row-down'), run: A.tableMoveRowDown },
  { label: t('ctx.moveColLeft'), shortcut: hk('table-move-col-left'), run: A.tableMoveColLeft },
  { label: t('ctx.moveColRight'), shortcut: hk('table-move-col-right'), run: A.tableMoveColRight },
  { sep: true },
  { label: t('ctx.deleteRow'), shortcut: hk('table-del-row'), run: A.tableDeleteRow },
  { label: t('ctx.deleteCol'), run: A.tableDeleteCol },
  { sep: true },
  { label: t('ctx.copyTable'), run: A.tableCopy },
  { label: t('ctx.formatTable'), run: A.tableFormat },
  { sep: true },
  { label: t('ctx.deleteTable'), run: A.tableDelete },
])

watch(
  () => menu.open.value,
  (o) => {
    if (o) openSub.value = null
  },
)

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') menu.hide()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="menu.open.value" class="ctx-layer" @pointerdown="menu.hide()" @contextmenu.prevent>
      <!-- `.prevent` on both pointerdown and mousedown keeps the editor from
           losing focus/selection while the menu is being clicked. -->
      <div
        class="ctx-menu"
        :style="style"
        @pointerdown.stop.prevent
        @mousedown.stop.prevent
        @contextmenu.prevent
      >
        <!-- clipboard -->
        <div class="ctx-bar">
          <button type="button" :title="t('ctx.cut')" :aria-label="t('ctx.cut')" @click="run(A.cut)">
            <Icon name="cut" />
          </button>
          <button type="button" :title="t('ctx.copy')" :aria-label="t('ctx.copy')" @click="run(A.copySelection)">
            <Icon name="copy" />
          </button>
          <button type="button" :title="t('ctx.paste')" :aria-label="t('ctx.paste')" @click="run(A.paste)">
            <Icon name="paste" />
          </button>
          <button type="button" :title="t('ctx.remove')" :aria-label="t('ctx.remove')" @click="run(A.deleteSelection)">
            <Icon name="delete" />
          </button>
        </div>

        <div class="ctx-bar">
          <button type="button" class="wide" :title="t('ctx.copyAsMarkdown')" @click="run(A.copyAsMarkdown)">
            <Icon name="copyAsMarkdown" :size="18" />
            <span>{{ t('ctx.copyAs') }} Markdown</span>
          </button>
          <button type="button" class="wide" :title="t('ctx.pasteAs')" @click="run(A.pasteAsPlainText)">
            <Icon name="pastePlain" :size="18" />
            <span>{{ t('ctx.pasteAs') }}</span>
          </button>
        </div>

        <div class="ctx-bar">
          <button
            type="button"
            :class="{ active: markActive('strong', 'bold') }"
            :title="t('ctx.bold')"
            :aria-label="t('ctx.bold')"
            @click="run(A.toggleBold)"
          >
            <Icon name="bold" />
          </button>
          <button
            type="button"
            :class="{ active: markActive('emphasis', 'em', 'italic') }"
            :title="t('ctx.italic')"
            :aria-label="t('ctx.italic')"
            @click="run(A.toggleItalic)"
          >
            <Icon name="italic" />
          </button>
          <button
            type="button"
            :class="{ active: markActive('inlineCode') }"
            :title="t('ctx.inlineCode')"
            :aria-label="t('ctx.inlineCode')"
            @click="run(A.toggleInlineCode)"
          >
            <Icon name="code" />
          </button>
          <button type="button" :title="t('ctx.link')" :aria-label="t('ctx.link')" @click="run(A.insertHyperlink)">
            <Icon name="link" />
          </button>
          <button
            type="button"
            :class="{ active: markActive('strike_through', 'strikethrough', 'strike') }"
            :title="t('ctx.strike')"
            :aria-label="t('ctx.strike')"
            @click="run(A.toggleStrike)"
          >
            <Icon name="strike" />
          </button>
          <button
            type="button"
            :title="t('ctx.clearFormat')"
            :aria-label="t('ctx.clearFormat')"
            @click="run(A.clearStyle)"
          >
            <Icon name="clearFormat" />
          </button>
        </div>

        <div class="ctx-bar">
          <button
            type="button"
            :class="{ active: nodeActive('blockquote') }"
            :title="t('ctx.quote')"
            :aria-label="t('ctx.quote')"
            @click="run(A.insertBlockquote)"
          >
            <Icon name="quote" />
          </button>
          <button
            type="button"
            :class="{ active: nodeActive('bullet_list') }"
            :title="t('ctx.bulletList')"
            :aria-label="t('ctx.bulletList')"
            @click="run(A.insertUnorderedList)"
          >
            <Icon name="bulletList" />
          </button>
          <button
            type="button"
            :class="{ active: nodeActive('ordered_list') }"
            :title="t('ctx.orderedList')"
            :aria-label="t('ctx.orderedList')"
            @click="run(A.insertOrderedList)"
          >
            <Icon name="orderedList" />
          </button>
          <button
            type="button"
            :class="{ active: nodeActive('task_list') }"
            :title="t('ctx.taskList')"
            :aria-label="t('ctx.taskList')"
            @click="run(A.insertTaskList)"
          >
            <Icon name="taskList" />
          </button>
        </div>

        <div class="ctx-sep"></div>

        <!-- block style / table submenu -->
        <div class="ctx-item has-sub" @mouseenter="openSub = isTable ? 'table' : 'style'">
          <span>{{ submenuTitle }}</span><span class="arrow">▸</span>
          <div v-if="openSub === 'table' || openSub === 'style'" class="ctx-submenu">
            <template v-if="isTable">
              <template v-for="(it, idx) in tableItems" :key="`t${idx}`">
                <div v-if="it.sep" class="ctx-sep"></div>
                <button v-else type="button" class="ctx-row-item" @click="run(it.run)">
                  <span class="lbl">{{ it.label }}</span>
                  <span class="sc">{{ it.shortcut || '' }}</span>
                </button>
              </template>
            </template>
            <template v-else>
              <button v-for="(it, idx) in paragraphItems" :key="`p${idx}`" type="button" class="ctx-row-item" @click="run(it.run)">
                <span class="lbl"><span class="check">{{ it.checked && it.checked() ? '✓' : '' }}</span>{{ it.label }}</span>
                <span class="sc">{{ it.shortcut || '' }}</span>
              </button>
            </template>
          </div>
        </div>

        <!-- insert submenu -->
        <div class="ctx-item has-sub" @mouseenter="openSub = 'insert'">
          <span>{{ t('ctx.insert') }}</span><span class="arrow">▸</span>
          <div v-if="openSub === 'insert'" class="ctx-submenu">
            <template v-for="(it, idx) in insertItems" :key="`i${idx}`">
              <div v-if="it.sep" class="ctx-sep"></div>
              <button v-else type="button" class="ctx-row-item" @click="run(it.run)">
                <span class="lbl">{{ it.label }}</span>
                <span class="sc">{{ it.shortcut || '' }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-layer {
  position: fixed;
  inset: 0;
  z-index: 1500;
}
.ctx-menu {
  position: fixed;
  min-width: 236px;
  padding: 6px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  font-size: 13px;
  user-select: none;
}
.ctx-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 0;
}
.ctx-bar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border: none;
  background: transparent;
  color: var(--fg);
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}
.ctx-bar button.wide {
  flex: 1 1 auto;
  justify-content: flex-start;
  font-size: 12px;
  padding: 0 8px;
  white-space: nowrap;
}
.ctx-bar button:hover {
  background: var(--accent-soft);
}
.ctx-bar button.active {
  background: var(--accent);
  color: #fff;
}
.ctx-sep {
  height: 1px;
  margin: 5px 4px;
  background: var(--border);
}
.ctx-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: default;
}
.ctx-item:hover {
  background: var(--accent-soft);
}
.ctx-item .arrow {
  color: var(--fg-muted);
  font-size: 11px;
}
.ctx-submenu {
  position: absolute;
  left: 100%;
  top: -6px;
  margin-left: 2px;
  min-width: 220px;
  padding: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  z-index: 1600;
}
.ctx-row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--fg);
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
.ctx-row-item:hover {
  background: var(--accent-soft);
}
.ctx-row-item .lbl {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.ctx-row-item .check {
  display: inline-block;
  width: 14px;
  color: var(--accent);
}
.ctx-row-item .sc {
  color: var(--fg-muted);
  font-size: 12px;
  white-space: nowrap;
}
</style>
