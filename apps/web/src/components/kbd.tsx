import { useSyncExternalStore } from 'react'

/**
 * 平台判断 Hook：
 * 区分 macOS 与非 Mac 平台（Windows / Linux / Android 等），
 * 在 SSR 与首次水合阶段保持一致，并在挂载后精准匹配客户端环境。
 */
function checkIsMac(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  if (nav.userAgentData?.platform) {
    return /^mac/i.test(nav.userAgentData.platform)
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || '')
}

let isMacCached: boolean | null = null

function getIsMac(): boolean {
  if (isMacCached === null) {
    isMacCached = checkIsMac()
  }
  return isMacCached
}

const emptySubscribe = () => () => {}

export function useIsMac(): boolean {
  return useSyncExternalStore(emptySubscribe, getIsMac, () => false)
}

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode
}

/**
 * 标准键盘按键展示组件：
 * 无边框包裹，使用轻量排版与标准语义。
 */
export function Kbd({ children, className = '', ...props }: KbdProps) {
  return (
    <kbd
      className={`font-sans text-xs/4 text-kumo-subtle whitespace-nowrap select-none ${className}`}
      {...props}
    >
      {children}
    </kbd>
  )
}

export interface ModifierKeyProps extends React.HTMLAttributes<HTMLElement> {
  /** 自定义非 Mac 平台的替代符号，默认为 "Ctrl" */
  fallback?: string
  /** 自定义 Mac 平台的修饰符，默认为 "⌘" */
  macSymbol?: string
}

/**
 * 平台感知修饰键组件（功能键）：
 * - 透明度降低（opacity-50），与常规主键形成层次感；
 * - 在 macOS 上渲染为 "⌘"；
 * - 在 Windows / Linux 等平台渲染为 "Ctrl"。
 */
export function ModifierKey({
  fallback = 'Ctrl',
  macSymbol = '⌘',
  className = '',
  ...props
}: ModifierKeyProps) {
  const isMac = useIsMac()
  return (
    <span className={`opacity-50 ${className}`} {...props}>
      {isMac ? macSymbol : fallback}
    </span>
  )
}

export interface ShortcutKbdProps extends React.HTMLAttributes<HTMLElement> {
  /** 快捷键主键，例如 "K"、"P"、"Enter" 等 */
  shortcutKey: string
  /** 是否需要修饰键（Ctrl/⌘），默认为 true */
  withModifier?: boolean
  /** 修饰键与主键之间的间隔，默认非 Mac 时使用非折行空格 &nbsp;，Mac 下紧凑对齐 */
  separator?: React.ReactNode
}

/**
 * 复合快捷键组件，如 `<span class="opacity-50">Ctrl</span>&nbsp;K` / `<span class="opacity-50">⌘</span>K`：
 * 自动根据平台切换，去除了 badge 的边框包裹，降低功能键的透明度。
 */
export function ShortcutKbd({
  shortcutKey,
  withModifier = true,
  separator,
  className = '',
  ...props
}: ShortcutKbdProps) {
  const isMac = useIsMac()
  const defaultSeparator = isMac ? null : ' ' // &nbsp;
  const sep = separator !== undefined ? separator : defaultSeparator

  return (
    <Kbd className={`ml-auto ${className}`} {...props}>
      {withModifier ? (
        <>
          <ModifierKey />
          {sep}
        </>
      ) : null}
      <span>{shortcutKey}</span>
    </Kbd>
  )
}
