// Pure Markdown / string helpers shared by the exporter and UI.

/** Escape a string for safe inclusion inside HTML text. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Escape a string for safe inclusion inside an HTML attribute value. */
export function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/"/g, '&quot;')
}

/** Make a string safe to use as a file name. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled'
}

/** Extract the first top-level heading text (used as export default title). */
export function getFirstHeading(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

/** Strip common Markdown syntax to approximate plain-text word count. */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_~`>]/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
