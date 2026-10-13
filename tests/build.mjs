// Bundles the TypeScript test suites into plain ESM using esbuild's NATIVE
// binary (no WebAssembly — the container cannot instantiate any WASM, which is
// why vite / vitest / tsc-strip / tsx all fail). Resolves the `@/` alias and
// stubs Vite-only `?raw` asset imports so pure-logic modules run under Node.
import { build } from 'esbuild'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, existsSync, statSync } from 'node:fs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'tests', '.out')

const entries = [
  'tests/file.test.ts',
  'tests/exporter-toHtml.test.ts',
  'tests/exporter-toMarkdown.test.ts',
  'tests/outline.test.ts',
  'tests/i18n.test.ts',
  'tests/prose-line.test.ts',
]

const aliasPlugin = {
  name: 'alias-at',
  setup(b) {
    const exts = ['.ts', '.tsx', '.js', '.mjs', '.json']
    b.onResolve({ filter: /^@\// }, (args) => {
      let p = resolve(root, 'src', args.path.slice(2))
      if (existsSync(p) && statSync(p).isDirectory()) {
        const idx = exts.map((e) => `${p}/index${e}`).find(existsSync)
        if (idx) p = idx
      } else {
        const withExt = exts.map((e) => p + e).find(existsSync)
        if (withExt) p = withExt
      }
      return { path: p }
    })
  },
}

const rawCssPlugin = {
  name: 'raw-css-stub',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: args.path,
      namespace: 'rawcss',
    }))
    b.onLoad({ filter: /.*/, namespace: 'rawcss' }, () => ({
      // Vite-only `?raw` import; under Node we stub representative CSS content
      // (the real katex CSS is irrelevant to logic tests, but we keep the
      // `katex` namespace so inlining assertions stay meaningful).
      contents: 'export default ".katex{font-style:italic}"',
      loader: 'js',
    }))
  },
}

mkdirSync(outDir, { recursive: true })

for (const entry of entries) {
  await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile: resolve(outDir, basename(entry).replace(/\.ts$/, '.mjs')),
    plugins: [aliasPlugin, rawCssPlugin],
    logLevel: 'warning',
  })
  console.log('bundled', entry)
}

console.log('done')
