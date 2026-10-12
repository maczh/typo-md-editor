<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFind } from '@/composables/useFind'

/**
 * 查找替换栏。可见性由宿主控制（MdEditor 按 useUI().findOpen 做 v-if）；
 * 关闭动作经 `close` 事件上交，`modelValue` 供宿主自行布放时绑定。
 */
const props = withDefaults(defineProps<{ modelValue?: boolean }>(), { modelValue: true })
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const f = useFind()
const findInput = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  await nextTick()
  findInput.value?.focus()
  findInput.value?.select()
})

function closeBar(): void {
  f.close()
  emit('close')
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) f.findPrev()
    else f.findNext()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeBar()
  }
}
</script>

<template>
  <div v-if="modelValue" class="find-bar" @keydown="onKey">
    <input
      ref="findInput"
      v-model="f.findText.value"
      class="fld"
      :placeholder="t('find.placeholder')"
      @input="f.findNext()"
    />
    <label class="chk">
      <input v-model="f.matchCase.value" type="checkbox" /> {{ t('find.matchCase') }}
    </label>
    <button class="btn" :title="t('find.prev')" @click="f.findPrev()">↑</button>
    <button class="btn" :title="t('find.next')" @click="f.findNext()">↓</button>
    <button class="btn" @click="f.replaceVisible.value = !f.replaceVisible.value">
      {{ t('find.replace') }}
    </button>

    <template v-if="f.replaceVisible.value">
      <input v-model="f.replaceText.value" class="fld" :placeholder="t('find.replaceWith')" />
      <button class="btn" @click="f.replaceOne()">{{ t('find.replaceOne') }}</button>
      <button class="btn" @click="f.replaceAll()">{{ t('find.replaceAll') }}</button>
    </template>

    <button class="btn close" :title="t('common.close')" @click="closeBar">✕</button>
  </div>
</template>

<style scoped>
.find-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.fld {
  height: 28px;
  min-width: 160px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  border-radius: 4px;
  padding: 0 8px;
  font-size: 13px;
  outline: none;
}
.chk {
  font-size: 12px;
  color: var(--fg-muted);
  display: flex;
  align-items: center;
  gap: 3px;
}
.btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.btn:hover {
  background: var(--accent-soft);
}
.btn.close {
  margin-left: auto;
}
</style>
