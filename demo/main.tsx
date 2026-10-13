import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

// CSS 引入顺序（与库 style.css 一致，见共享约定）：
// variables → app → Crepe 主题（common + nord）→ mermaid → typora → 组件样式
// （typora 必须在 Crepe 主题之后，靠顺序覆盖）。主题 CSS 运行时动态加载。
import '@/styles/variables.css'
import '@/styles/app.css'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import '@/styles/mermaid.css'
import '@/styles/typora.css'
import '@/styles/components.css'

const container = document.getElementById('app')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
