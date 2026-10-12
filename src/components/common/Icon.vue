<script setup lang="ts">
import { computed } from 'vue'
import { ICON_PATHS, type IconName } from './icons'

/**
 * Tiny inline-SVG icon. Real vector paths instead of text glyphs, so the menus
 * look identical on every font stack (the old `S̶` / `⌫` / `⧉` glyphs rendered as
 * tofu boxes on a plain Deepin/UOS system).
 */
const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 })

const path = computed(() => ICON_PATHS[props.name])
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="path" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex: none;
}
</style>
