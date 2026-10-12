import hljs from 'highlight.js/lib/common'

/**
 * Code highlighting helpers. Crepe's built-in code block already uses highlight.js;
 * this module documents the curated language subset (>= 20 languages) and exposes
 * a small API used by the exporter / previews.
 */

/** Curated subset of languages bundled with the editor (keeps the bundle small). */
export const HIGHLIGHT_LANGUAGES: string[] = [
  'typescript',
  'javascript',
  'json',
  'python',
  'rust',
  'go',
  'bash',
  'shell',
  'html',
  'xml',
  'css',
  'scss',
  'markdown',
  'yaml',
  'sql',
  'java',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'dart',
  'plaintext',
]

/** Returns the shared highlight.js instance. */
export function getHighlighter() {
  return hljs
}

/** Highlight `code` with the given language, falling back to auto-detection. */
export function highlightCode(code: string, lang?: string | null): string {
  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(code, { language: lang }).value
  }
  return hljs.highlightAuto(code).value
}
