/// <reference types="vite/client" />

declare module '*.css?url' {
  const src: string
  export default src
}

declare module '*.css?raw' {
  const src: string
  export default src
}
