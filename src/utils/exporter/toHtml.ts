import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import katex from 'katex'
// Inline the KaTeX stylesheet so the exported file is fully offline.
import katexCss from 'katex/dist/katex.min.css?raw'
import { escapeAttr } from '@/utils/markdown'

/** Pre-render `$...$` and `$$...$$` math to KaTeX HTML before the MD pipeline. */
async function renderMath(md: string): Promise<string> {
  let out = md.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => {
    try {
      return `<div class="math-block">${katex.renderToString(expr.trim(), {
        displayMode: true,
        throwOnError: false,
      })}</div>`
    } catch {
      return `<div class="math-block">$$${expr}$$</div>`
    }
  })
  out = out.replace(/(^|[^$])\$([^$\n]+?)\$(?!\$)/g, (_m, pre: string, expr: string) => {
    try {
      return `${pre}<span class="math-inline">${katex.renderToString(expr.trim(), {
        displayMode: false,
        throwOnError: false,
      })}</span>`
    } catch {
      return `${pre}<span class="math-inline">$${expr}$</span>`
    }
  })
  return out
}

/** Convert Markdown to a self-contained HTML document (offline-friendly). */
export async function toHtml(markdown: string, title = 'Document'): Promise<string> {
  const withMath = await renderMath(markdown)
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeHighlight, { detect: true, ignoreMissing: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(withMath)
  const body = String(file)
  return wrapHtml(body, title)
}

function wrapHtml(body: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeAttr(title)}</title>
<style>${katexCss}</style>
<style>
  body { max-width: 820px; margin: 40px auto; padding: 0 16px; font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; color: #24292f; }
  pre, code { background: #f6f8fa; border-radius: 6px; }
  pre { padding: 12px; overflow: auto; }
  code { padding: 1px 5px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9em; }
  blockquote { border-left: 4px solid #d0d7de; margin: 1em 0; padding: 0 1em; color: #57606a; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: 6px 10px; }
  img { max-width: 100%; }
  .math-block { text-align: center; overflow: auto; }
  .mermaid { text-align: center; }
</style>
</head>
<body>
${body}
</body>
</html>`
}
