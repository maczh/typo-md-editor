import type { ExportFormat } from '@/types'
import { toMarkdown } from './toMarkdown'
import { toHtml } from './toHtml'
import { toPdf } from './toPdf'
import { showToast } from '@/utils/toast'

/** Trigger a browser download of a Blob (a[download] + object URL). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Export the document to the requested format. Text formats (md/html) are
 * downloaded through the browser; pdf renders the HTML into a hidden iframe and
 * invokes the system print dialog. The package never touches the filesystem.
 */
export async function exportDocument(
  markdown: string,
  format: ExportFormat,
  baseName = 'untitled',
): Promise<void> {
  try {
    if (format === 'markdown') {
      downloadBlob(new Blob([toMarkdown(markdown)]), `${baseName}.md`)
    } else if (format === 'html') {
      const content = await toHtml(markdown, baseName)
      downloadBlob(new Blob([content]), `${baseName}.html`)
    } else if (format === 'pdf') {
      const html = await toHtml(markdown, baseName)
      await toPdf(html)
    }
    showToast(`✓ ${format}`)
  } catch (e) {
    showToast((e as Error).message || 'export failed', 'error')
  }
}

export { toMarkdown, toHtml, toPdf }
