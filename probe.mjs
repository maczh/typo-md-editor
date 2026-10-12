// 临时 esbuild 探针（不随包发布）：证明指定入口的 import 图可解析。
// 手法同 tests/build.mjs：原生二进制 + @/ 别名 + ?raw/?url stub；
// .vue SFC 与 .css 以 stub 代替（SFC 编译由 vue-tsc/vite 负责，探针只验图）。
import { build } from 'esbuild'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, statSync } from 'node:fs'

const root = resolve(dirname(fileURLToPath(import.meta.url)))
const entry = process.argv[2]
if (!entry) {
  console.error('usage: node probe.mjs <entry-relative-to-root>')
  process.exit(1)
}

const aliasPlugin = {
  name: 'alias-at',
  setup(b) {
    const exts = ['.ts', '.tsx', '.js', '.mjs', '.json']
    b.onResolve({ filter: /^@\// }, (args) => {
      const p = resolve(root, 'src', args.path.slice(2))
      if (p.endsWith('.vue')) return { path: p, namespace: 'vuestub' }
      if (/\.css\?url$/.test(p)) return { path: p, namespace: 'urlasset' }
      if (/\.css\?raw$/.test(p)) return { path: p, namespace: 'rawcss' }
      if (p.endsWith('.css')) return { path: p, namespace: 'cssstub' }
      // 目录导入 → index 解析（同 tests/build.mjs）
      if (existsSync(p) && statSync(p).isDirectory()) {
        const idx = exts.map((e) => `${p}/index${e}`).find(existsSync)
        if (idx) return { path: idx }
      }
      if (existsSync(p)) return { path: p }
      const withExt = exts.map((e) => p + e).find(existsSync)
      return { path: withExt ?? p }
    })
  },
}

const stubPlugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /\.vue$/ }, (args) => ({
      path: args.path,
      namespace: 'vuestub',
    }))
    b.onLoad({ filter: /.*/, namespace: 'vuestub' }, () => ({
      contents: 'export default { name: "ProbeStub" }',
      loader: 'js',
    }))
    b.onResolve({ filter: /\.css(\?url|\?raw)?$/ }, (args) => ({
      path: args.path,
      namespace: 'cssstub',
    }))
    b.onLoad({ filter: /.*/, namespace: 'cssstub' }, (args) => ({
      // `?url` → URL 字符串；`?raw` → CSS 文本；裸 .css → 空副作用模块。
      contents: args.path.endsWith('?url')
        ? 'export default "/stub-asset.css"'
        : args.path.endsWith('?raw')
          ? 'export default ".stub{}"'
          : 'export default ""',
      loader: 'js',
    }))
    b.onResolve({ filter: /\?raw$/ }, (args) => ({ path: args.path, namespace: 'rawcss' }))
    b.onLoad({ filter: /.*/, namespace: 'rawcss' }, () => ({
      contents: 'export default ".katex{font-style:italic}"',
      loader: 'js',
    }))
    b.onResolve({ filter: /\?url$/ }, (args) => ({ path: args.path, namespace: 'urlasset' }))
    b.onLoad({ filter: /.*/, namespace: 'urlasset' }, () => ({
      contents: 'export default "/stub-asset.css"',
      loader: 'js',
    }))
  },
}

await build({
  entryPoints: [resolve(root, entry)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: resolve(root, 'tests', '.out', `probe-${entry.replace(/[\\/.]/g, '_')}.mjs`),
  plugins: [aliasPlugin, stubPlugin],
  logLevel: 'warning',
})
console.log('PROBE_OK', entry)
