// Patch for an upstream bug in @milkdown/components (used by @milkdown/crepe).
//
// Bug #4 root cause: in `image-block`'s `parseMarkdown` runner, `caption` is taken
// from `node.title`. For a title-less image (`![alt](url)` — the normal case) the
// markdown title is `null`, so the node is created with `caption: null`. That
// bypasses the schema's `default: ""` and Milkdown's attribute validation throws,
// which silently drops the WHOLE image node on every parse/load (open file, leave
// source mode, find/replace). The image file stays on disk but its reference
// vanishes from the document.
//
// Fix: coalesce `node.title` to an empty string so the node round-trips.
//
// This script is idempotent and safe to run repeatedly / on fresh installs. If a
// future @milkdown/components release fixes the bug upstream, the buggy line will
// be gone and the script becomes a harmless no-op.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const BUGGY = /const caption = node\.title;/
// "Already fixed" exists in two shapes: the TypeScript source form
// (`node.title ?? ""`) and the form published to npm after transpilation
// (`(_a = node.title) != null ? _a : ""`). Both must count as fixed, otherwise
// the probe reports "nothing to do" on a healthy install and could misjudge a
// future upstream regression that ships in the other transpile shape.
const FIXED = /const caption = (\(_a = )?node\.title(\) != null \? _a :| \?\?) "";/

function patchFile(absPath) {
  if (!existsSync(absPath)) return false
  const src = readFileSync(absPath, 'utf8')
  if (FIXED.test(src)) {
    console.log(`[patch] ${absPath}: already fixed — skipped`)
    return false
  }
  if (!BUGGY.test(src)) {
    console.log(`[patch] ${absPath}: buggy line not found (likely fixed upstream) — skipped`)
    return false
  }
  const next = src.replace(
    BUGGY,
    'const caption = node.title ?? ""; // patched: tolerate title-less images (bug #4)',
  )
  writeFileSync(absPath, next)
  console.log(`[patch] ${absPath}: fixed image-block caption null-coalesce`)
  return true
}

let patched = false
const require = createRequire(import.meta.url)

try {
  const pkgPath = require.resolve('@milkdown/components/package.json')
  patched = patchFile(join(dirname(pkgPath), 'lib/image-block/index.js'))
} catch {
  // Fallback: known relative path (handles pnpm-style layouts too).
  const fallback = join(projectRoot, 'node_modules/@milkdown/components/lib/image-block/index.js')
  patched = patchFile(fallback)
}

if (!patched) {
  console.log('[patch] @milkdown/components image-block: nothing to do')
}
