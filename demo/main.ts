import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { typoPlugin } from '@/index'
import './style.css'

// CSS 引入顺序（与库 style.css 一致，见共享约定）：
// variables → app → Crepe 主题（common + nord）→ mermaid → typora
// （typora 必须在 Crepe 主题之后，靠顺序覆盖）。主题 CSS 运行时动态加载。
import '@/styles/variables.css'
import '@/styles/app.css'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import '@/styles/mermaid.css'
import '@/styles/typora.css'

const app = createApp(App)
app.use(createPinia()).use(typoPlugin)
app.mount('#app')
