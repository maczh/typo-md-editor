import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vitePluginDts from 'vite-plugin-dts'
import { fileURLToPath, URL } from 'node:url'

// 库构建配置（lib mode）：产出 ESM 入口 + 单 style.css + d.ts。
// 与源项目一致使用 terser 压缩：esbuild 默认压缩会重排模块初始化顺序，
// 触发 @milkdown/components 循环依赖 TDZ 崩溃，terser 保序故必须保留。
// React 作为对等依赖 externalize（宿主提供），避免把 React 打进库里。
export default defineConfig({
  plugins: [react(), vitePluginDts({ include: ['src'], exclude: ['demo', 'tests'] })],
  // Crepe 内置 Vue 3 运行时（其 table/image/code-block 等 node view 是 Vue 组件），
  // 但本项目用 @vitejs/plugin-react 而非 plugin-vue，Vue 的 esm-bundler 特性开关不会被
  // 自动注入，从而刷出 __VUE_OPTIONS_API__ 等告警。这里手动注入，消除这些噪声告警。
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
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
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
