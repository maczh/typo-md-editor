<script setup lang="ts">
import { useMilkdown } from '@/composables/useMilkdown'
import { useI18n } from 'vue-i18n'
import * as table from '@/milkdown/plugins/table'

const milkdown = useMilkdown()
const { t } = useI18n()

function run(fn: (editor: Parameters<typeof table.insertTable>[0]) => void): void {
  const editor = milkdown.getEditor()
  if (editor) fn(editor)
}
</script>

<template>
  <div class="table-toolbar">
    <button class="icon-btn" :title="t('menu.insertTable')" @click="run(table.insertTable)">
      ⊞ {{ t('menu.insertTable') }}
    </button>
    <span class="sep"></span>
    <button class="icon-btn" title="Row +" @click="run((e) => table.addRow(e, true))">＋行</button>
    <button class="icon-btn" title="Row −" @click="run((e) => table.removeRow(e))">－行</button>
    <button class="icon-btn" title="Col +" @click="run((e) => table.addColumn(e))">＋列</button>
    <button class="icon-btn" title="Col −" @click="run((e) => table.removeColumn(e))">－列</button>
  </div>
</template>

<style scoped>
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-bg);
  font-size: 12px;
  transition: opacity 0.2s ease;
}
.sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}
</style>
