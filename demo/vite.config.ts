import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

// inotify 实例配额（fs.inotify.max_user_instances，默认 128）会被 IDE/浏览器等进程占满，
// 此时 fs.watch 直接抛 EMFILE，dev server 无法启动。先探测一次：失败则退化为轮询。
// 也可显式用 CHOKIDAR_USEPOLLING=false/true 覆盖。
function watchNeedsPolling(): boolean {
  const env = process.env.CHOKIDAR_USEPOLLING
  if (env !== undefined) return env.toLowerCase() !== 'false'
  try {
    fs.watch(fileURLToPath(import.meta.url), () => {}).close()
    return false
  } catch {
    return true
  }
}

// demo 开发宿主（独立 Vite 应用）：库构建与 demo 构建彻底分离。
// 端口固定 1420/1421（同源项目约定），相对 base 保证静态部署可用。
export default defineConfig({
  plugins: [vue()],
  root: './demo',
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 1421,
    },
    watch: {
      usePolling: watchNeedsPolling(),
      interval: 300,
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist*/**', '**/tests/.out/**'],
    },
  },
  build: {
    target: 'esnext',
    outDir: '../dist-demo',
    emptyOutDir: true,
    // 与库一致：规避 @milkdown/components 循环依赖 TDZ（详见根 vite.config.ts）。
    minify: 'terser',
    chunkSizeWarningLimit: 3000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  // 预打包 Mermaid + CodeMirror 主题 + language-data（Crepe 代码块按语言懒加载），
  // 避免会话中动态 import 触发重复优化（同源项目实践）。
  optimizeDeps: {
    include: ['mermaid', '@codemirror/theme-one-dark', '@codemirror/language-data'],
  },
})
