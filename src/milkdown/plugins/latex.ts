import type { Editor } from '@milkdown/core'
import { insert } from '@milkdown/utils'
import katex from 'katex'

/**
 * LaTeX / math helpers. Crepe already ships KaTeX-powered math nodes
 * (`math_inline` / `math_block`); these helpers insert math at the caret and
 * render LaTeX to HTML for previews / export.
 */

/** Insert a math expression (inline `$...$` or block `$$...$$`) at the caret. */
export function insertMath(editor: Editor, latex: string, displayMode = false): void {
  const md = displayMode ? `\n$$\n${latex}\n$$\n` : `$${latex}$`
  editor.action(insert(md))
}

/** Render a LaTeX string to an HTML string via KaTeX (offline, synchronous). */
export function renderLatex(latex: string, displayMode = false): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: 'html',
    })
  } catch {
    return displayMode ? `$$${latex}$$` : `$${latex}$`
  }
}
