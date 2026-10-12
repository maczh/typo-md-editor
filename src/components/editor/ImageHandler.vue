<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useMilkdown } from '@/composables/useMilkdown'
import { insertImage } from '@/milkdown/plugins/image'
import { getImageUploader } from '@/utils/images'
import { showToast } from '@/utils/toast'

const milkdown = useMilkdown()

async function handleImageFile(file: File): Promise<void> {
  const editor = milkdown.getEditor()
  if (!editor) return
  try {
    // 统一走注入的上传器（宿主 onUpload / 默认 FileReader → data: URL）。
    const src = await getImageUploader()(file)
    insertImage(editor, src, file.name)
  } catch (e) {
    showToast(`${(e as Error).message || 'image failed'}`, 'error')
  }
}

/**
 * Fallback paste handler. Milkdown's upload plugin — which drives Crepe's
 * `image-block` `onUpload` — already consumes pasted image *files*; we only step
 * in when the clipboard exposes an image as an *item* but no file, so the image
 * is never inserted twice.
 */
function onPaste(e: ClipboardEvent): void {
  const dt = e.clipboardData
  if (!dt) return
  if (dt.files && Array.from(dt.files).some((f) => f.type.startsWith('image/'))) return
  const items = dt.items
  if (!items) return
  for (const it of Array.from(items)) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) {
        e.preventDefault()
        void handleImageFile(f)
        return
      }
    }
  }
}

// Image files are handled by Milkdown's upload plugin (Crepe `image-block`
// `onUpload`); only stop the webview from treating a stray file drop as a nav.
function onDrop(e: DragEvent): void {
  if (e.dataTransfer?.files?.length) e.preventDefault()
}

function onDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
}

onMounted(() => {
  document.addEventListener('paste', onPaste)
  document.addEventListener('drop', onDrop)
  document.addEventListener('dragover', onDragOver)
})

onBeforeUnmount(() => {
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('drop', onDrop)
  document.removeEventListener('dragover', onDragOver)
})
</script>

<template>
  <!-- Invisible helper; it hooks document-level paste / drop to insert images. -->
  <div class="image-handler" aria-hidden="true"></div>
</template>

<style scoped>
.image-handler {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}
</style>
