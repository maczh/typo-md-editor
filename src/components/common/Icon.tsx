import { ICON_PATHS, type IconName } from './icons'

export interface IconProps {
  name: IconName
  size?: number
}

/**
 * Tiny inline-SVG icon. Real vector paths instead of text glyphs, so the menus
 * look identical on every font stack (the old `S̶` / `⌫` / `⧉` glyphs rendered as
 * tofu boxes on a plain Deepin/UOS system).
 */
export default function Icon({ name, size = 20 }: IconProps) {
  const path = ICON_PATHS[name]
  return (
    <svg
      className="app-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  )
}
