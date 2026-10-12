/**
 * 图片引用处理（纯前端版）。
 *
 * 与桌面版的差异：
 *  - **不落盘**：粘贴 / 拖拽 / 选择文件 / Crepe `image-block.onUpload`
 *    四路统一走注入的上传器，默认实现为 FileReader → `data:` URL；
 *    宿主可通过 MdEditor 的 `onUpload` prop（内部落到 `setImageUploader`）
 *    换成自有 CDN / 后端。
 *  - **不做磁盘路径双向转换**：本地图片 src 的显示解析由
 *    `setImageSrcResolver` 注入（默认恒等 —— 相对路径原样渲染）；
 *    远程图片（http/https）默认原样引用，宿主如需本地化请在
 *    `@save` 事件里自行处理。
 */

/** 上传器：接收图片文件，返回用于插入文档的 src。 */
export type ImageUploader = (file: File) => Promise<string>

// Markdown image destinations may be bare (CommonMark forbids raw spaces, but we
// tolerate ones written by other editors such as Typora) or wrapped in `<…>`;
// an optional quoted title may follow. `[^)\n]+?` keeps a match on a single line
// and stops at the closing `)`.
const MD_IMG_RE = /!\[[^\]]*\]\(\s*(<[^<>]*>|[^)\n]+?)\s*(?:"[^"]*"|'[^']*')?\s*\)/g
const HTML_IMG_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi

/** Strip the optional `<…>` wrapper CommonMark allows around a link/image URL. */
function unwrapRef(token: string): string {
  const t = token.trim()
  return t.startsWith('<') && t.endsWith('>') ? t.slice(1, -1).trim() : t
}

/** 默认上传器：FileReader → data: URL（纯浏览器，不落盘）。 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** 默认上传器常量（未注入宿主上传器时使用）。 */
export const defaultUploader: ImageUploader = fileToDataUrl

// 注入点（模块级单例）：MdEditor 据 props 设置，卸载时恢复默认。
let uploader: ImageUploader = defaultUploader
let srcResolver: (src: string) => string = (src: string) => src

/** 注入图片上传器（MdEditor 的 `onUpload` prop 落到这里）。 */
export function setImageUploader(fn: ImageUploader): void {
  uploader = fn
}

/** 取当前图片上传器（默认 `fileToDataUrl`）。 */
export function getImageUploader(): ImageUploader {
  return uploader
}

/** 注入本地图片 src 的显示解析器（MdEditor 的 `resolveImageSrc` prop 落到这里）。 */
export function setImageSrcResolver(fn: (src: string) => string): void {
  srcResolver = fn
}

/** 取当前 src 解析器（默认恒等）。 */
export function getImageSrcResolver(): (src: string) => string {
  return srcResolver
}

/**
 * Collect every unique image destination token referenced in the Markdown
 * (md + html forms). Tokens are returned verbatim — Markdown ones may still
 * carry the optional `<…>` wrapper; use `unwrapRef` before resolving them.
 */
export function collectImageSrcs(md: string): string[] {
  const set = new Set<string>()
  for (const m of md.matchAll(MD_IMG_RE)) if (m[1]) set.add(m[1])
  for (const m of md.matchAll(HTML_IMG_RE)) if (m[1]) set.add(m[1])
  return [...set]
}

/**
 * Rewrite every image reference in `md` through `resolve` (display-time src
 * resolution). Tokens whose resolved value equals the original are skipped, so
 * the default identity resolver makes this a no-op.
 */
export function rewriteImageSrcs(md: string, resolve: (src: string) => string): string {
  let out = md
  for (const token of collectImageSrcs(md)) {
    const src = unwrapRef(token)
    if (!src) continue
    const display = resolve(src)
    if (display !== src) out = out.split(token).join(display)
  }
  return out
}
