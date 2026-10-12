import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

/**
 * HTML → Markdown conversion for *clipboard paste* only.
 *
 * File import of HTML / DOCX has been removed (see req: delete docx/html import);
 * the open-dialog and folder listing now only accept Markdown. This module keeps
 * the paste path, where pasting rich HTML from another app into the editor is
 * converted to Markdown via Turndown.
 */

let turndown: TurndownService | null = null

function getTurndown(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
    })
    // Tables, strikethrough and task lists — the bits GitHub-flavoured Markdown
    // adds on top of the original Turndown rules.
    turndown.use(gfm)
    // Drop machinery that has no Markdown equivalent (and would otherwise leak
    // as stray text or empty nodes).
    turndown.remove(['script', 'style', 'meta', 'link', 'head', 'title'])
  }
  return turndown
}

/** Convert an HTML string to Markdown. Returns `''` on empty / failure. */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return ''
  try {
    return getTurndown().turndown(html).trim()
  } catch {
    return ''
  }
}
