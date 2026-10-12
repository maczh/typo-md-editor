/**
 * Markdown export. Markdown is the source of truth, so this just normalises the
 * trailing newline. (Serialisation from the live editor already happens via
 * `crepe.getMarkdown()` before reaching this function.)
 */
export function toMarkdown(markdown: string): string {
  return markdown.replace(/\n+\s*$/, '') + '\n'
}
