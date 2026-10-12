/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.css?url' {
  const src: string
  export default src
}

declare module '*.css?raw' {
  const src: string
  export default src
}
