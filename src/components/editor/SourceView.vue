<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const ta = ref<HTMLTextAreaElement | null>(null)

onMounted(async () => {
  await nextTick()
  ta.value?.focus()
  ta.value?.select()
})

function onInput(e: Event): void {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div class="source-view">
    <textarea
      ref="ta"
      class="source-textarea"
      :value="modelValue"
      spellcheck="false"
      @input="onInput"
    ></textarea>
  </div>
</template>

<style scoped>
.source-view {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  background: var(--bg);
}
.source-textarea {
  flex: 1 1 auto;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 24px 28px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: calc(var(--font-size, 16px) * 0.92);
  line-height: var(--line-height, 1.6);
  background: var(--bg);
  color: var(--fg);
  tab-size: 2;
}
</style>
