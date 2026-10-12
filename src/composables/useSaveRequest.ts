/**
 * 保存请求总线（模块级单例 handler）。
 *
 * Ctrl/Cmd+S 的语义是"宿主该保存了"：热键层 → actions.requestSave() →
 * 本模块 → MdEditor 注册的 handler → `emit('save')` → 宿主持久化。
 * 包内从不自行写文件（共享约定 §9.10）。
 */

type SaveHandler = () => void

let handler: SaveHandler | null = null

/** 注册保存处理器（MdEditor 挂载时调用）。 */
export function registerSaveHandler(fn: SaveHandler): void {
  handler = fn
}

/** 反注册保存处理器（MdEditor 卸载时调用）。 */
export function unregisterSaveHandler(): void {
  handler = null
}

/** 触发保存请求；无处理器时静默忽略。 */
export function requestSave(): void {
  handler?.()
}
