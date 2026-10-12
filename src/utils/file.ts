// Pure path helpers (no Node APIs — runs in the browser/webview).

/** Return the directory portion of a path (best-effort, cross-platform). */
export function dirname(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx <= 0 ? '.' : norm.slice(0, idx)
}

/** Return the file name portion of a path. */
export function basename(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx < 0 ? norm : norm.slice(idx + 1)
}

/** Replace a file's extension: `a.md` -> `a.html`. */
export function replaceExtension(path: string, ext: string): string {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  const name = dot > 0 ? base.slice(0, dot) : base
  const prefix = path.slice(0, path.length - base.length)
  const extWithDot = ext.startsWith('.') ? ext : `.${ext}`
  return `${prefix}${name}${extWithDot}`
}

/** Resolve a document-relative asset path against the document directory. */
export function resolveAssetPath(docPath: string, assetRel: string): string {
  const dir = dirname(docPath)
  return `${dir}/${assetRel}`.replace(/\/+/g, '/')
}
