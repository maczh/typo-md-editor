import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vitePluginDts from 'vite-plugin-dts'
import { fileURLToPath, URL } from 'node:url'

// 库构建配置（lib mode）：产出 ESM 入口 + 单 style.css + d.ts。
// 与源项目一致使用 terser 压缩：esbuild 默认压缩会重排模块初始化顺序，
// 触发 @milkdown/components 循环依赖 TDZ 崩溃，terser 保序故必须保留。
export default defineConfig({
  plugins: [vue(), vitePluginDts({ include: ['src'], exclude: ['demo', 'tests'] })],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'terser',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 3000,
    lib: {
      entry: './src/index.ts',
      name: 'TypoMdEditor',
      formats: ['es'],
      fileName: () => 'typo-md-editor.js',
    },
    rollupOptions: {
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
