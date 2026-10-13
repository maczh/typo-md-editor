import type { ReactNode } from 'react'
import { i18n as typoI18n, SUPPORTED_LANGS, useTranslation, TypoI18nProvider } from './i18n'

export { typoI18n, SUPPORTED_LANGS, useTranslation, TypoI18nProvider }

/**
 * 确保存在活跃的 store 实例。
 *
 * 在 Vue/Pinia 时代这里会创建一个兜底 Pinia；React 端口使用 zustand，store 是
 * 模块级单例、无需激活，因此此处为幂等空操作，仅保留 API 兼容性（宿主仍可防御性
 * 调用）。
 */
export function ensureStore(): void {
  /* intentionally empty — zustand stores are module-level singletons */
}

/** 可选 React Provider —— 当前只是透传 children，并在挂载时确保 store 就绪。 */
export function TypoProvider({ children }: { children: ReactNode }): ReactNode {
  ensureStore()
  return children
}

/**
 * 一键安装插件（兼容 Vue 时代的 `app.use(typoPlugin)` 用法；React 宿主无需安装，
 * 但保留该导出以便平滑迁移）。
 */
export const typoPlugin = {
  install(): void {
    ensureStore()
  },
}
