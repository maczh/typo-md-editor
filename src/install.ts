import type { App } from 'vue'
import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { i18n as typoI18n } from './i18n'

/**
 * 确保存在活跃的 pinia 实例。
 *
 * 组件内部防御性调用：宿主忘装 `app.use(createPinia())` 时 store 仍可工作；
 * 已安装则为无操作（不会覆盖宿主的 pinia）。
 */
export function ensurePinia(): void {
  if (!getActivePinia()) setActivePinia(createPinia())
}

/**
 * 一键安装插件：装 i18n + 缺省时建 pinia。
 *
 * 标准装法：`app.use(createPinia()).use(typoPlugin)`
 * （宿主即使不显式装 pinia，ensurePinia 也会兜底）。
 */
export const typoPlugin = {
  install(app: App): void {
    ensurePinia()
    app.use(typoI18n)
  },
}
