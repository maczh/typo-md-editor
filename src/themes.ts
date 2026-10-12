import type { ThemeDef, ThemeKind } from '@/types'

/**
 * 主题目录 —— 全包唯一事实源（single source of truth）。
 *
 * 主题 id 是稳定标识（`github`/`night`/…），名字不再编码 "dark"，
 * 因此亮/暗判定一律查这里的 `themeKindMap` / `isDarkThemeId()`，
 * 其它模块（settings store、milkdown setup）禁止自带映射表。
 */

export { type ThemeDef, type ThemeKind }

export const THEMES: ThemeDef[] = [
  { id: 'github', name: 'Github', kind: 'light' },
  { id: 'gothic', name: 'Gothic', kind: 'dark' },
  { id: 'newsprint', name: 'Newsprint', kind: 'light' },
  { id: 'night', name: 'Night', kind: 'dark' },
  { id: 'pixyll', name: 'Pixyll', kind: 'light' },
  { id: 'whitey', name: 'Whitey', kind: 'light' },
]

/** 默认主题（与 settings store 的默认值保持一致）。 */
export const DEFAULT_THEME = 'github'

/** 主题 id → 亮/暗种类，由 THEMES 派生，避免两张表不同步。 */
export const themeKindMap: Record<string, ThemeKind> = Object.fromEntries(
  THEMES.map((t) => [t.id, t.kind]),
) as Record<string, ThemeKind>

/**
 * 判定主题 id 是否为暗色。
 *
 * 已注册主题查表；未注册 id（如主题 CSS 尚未加载完成时的短暂窗口）
 * 保留源项目的名字推断容错——该兜底只允许出现在本文件内
 * （共享约定 §9.6：其它文件不得硬编码 `id.includes('dark')`）。
 */
export function isDarkThemeId(id: string): boolean {
  const kind = themeKindMap[id]
  if (kind) return kind === 'dark'
  return id.includes('dark')
}
