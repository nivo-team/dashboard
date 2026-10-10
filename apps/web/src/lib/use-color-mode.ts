import { useSyncExternalStore } from 'react'
import { invoke, isDesktop, subscribe } from '#/desktop/bridge'
import { usePreferencesStore, type ColorMode } from './store/preferences-store'

/**
 * 明暗主题状态。
 *
 * 单一真值在偏好 store（`#/lib/store/preferences-store` 的 `colorMode`），本文件只做两件事：
 * 1. 把生效主题写到 `<html data-mode>`（模块级订阅，任何入口改主题都会经过）；
 * 2. 提供 `useColorMode()` 给组件读状态。
 * 3. 在桌面端（Desktop）模式下与宿主窗口（Wails）进行双向主题变更互相同步。
 */
export type { ColorMode }

/**
 * 桌面壳读到的系统主题（`true` = 暗；`null` = 还没拿到）。
 *
 * **桌面端为什么不直接用 `prefers-color-scheme`**：Linux（WebKitGTK）上它跟着 **GTK 主题**
 * 走，而壳为了「强制深 / 浅」改的正是 GTK 主题 —— 于是它只反映我们上一次强制的结果，
 * 不再等于真正的系统偏好。表现就是：先选深 / 浅、再切回「跟随系统」时卡在上一次的深浅。
 * 真值由壳经 XDG 桌面门户（portal）读取，页面只消费 `theme.getSystem` / `theme:systemChanged`。
 */
let desktopSystemDark: boolean | null = null

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  if (isDesktop() && desktopSystemDark !== null) return desktopSystemDark
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveMode(mode: ColorMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

function applyMode(mode: ColorMode) {
  if (typeof document === 'undefined') return
  const resolved = resolveMode(mode)
  document.documentElement.dataset.mode = resolved
  document.documentElement.style.colorScheme = resolved
}

/** 在桌面端通知宿主壳主题已变更 */
function notifyDesktopShell(mode: ColorMode) {
  if (!isDesktop()) return
  void invoke('theme.set', {
    mode,
    resolved: resolveMode(mode),
  }).catch(() => {})
}

const systemThemeListeners = new Set<() => void>()

function notifySystemThemeChange() {
  for (const listener of systemThemeListeners) {
    listener()
  }
}

/** 采用壳读到的系统主题：更新缓存、按需重渲染，并把真值同步回壳。 */
function adoptDesktopSystemTheme(isDarkMode: boolean) {
  desktopSystemDark = isDarkMode
  if (usePreferencesStore.getState().colorMode === 'system') {
    applyMode('system')
  }
  notifySystemThemeChange()
  // 此刻 resolveMode('system') 才是真值：重新告诉壳，让原生窗口设成一致的形态
  notifyDesktopShell(usePreferencesStore.getState().colorMode)
}

/**
 * 主动向壳要一次当前系统主题。
 *
 * `theme:systemChanged` 是即时事件、不重放：启动时它可能已经发过，切到「跟随系统」时
 * 也可能刚好错过，所以除了订阅还要主动拉。
 */
function refreshDesktopSystemTheme() {
  void invoke('theme.getSystem')
    .then(({ isDarkMode }) => adoptDesktopSystemTheme(isDarkMode))
    .catch(() => {
      /* 拿不到就退回 prefers-color-scheme（见 systemPrefersDark） */
    })
}

// 首次加载即应用一次，并跟随偏好 store 与系统主题变化。
if (typeof window !== 'undefined') {
  applyMode(usePreferencesStore.getState().colorMode)
  notifyDesktopShell(usePreferencesStore.getState().colorMode)

  usePreferencesStore.subscribe((state, prevState) => {
    if (state.colorMode !== prevState.colorMode) {
      applyMode(state.colorMode)
      notifyDesktopShell(state.colorMode)
      // 切到「跟随系统」时重新拉一次：期间可能刚好错过系统主题事件
      if (state.colorMode === 'system' && isDesktop()) {
        refreshDesktopSystemTheme()
      }
    }
  })

  // 浏览器：媒体查询是可靠的系统主题来源。
  // 桌面壳里它跟着 GTK 主题走（见 desktopSystemDark），仅作拿不到壳值时的兜底。
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (usePreferencesStore.getState().colorMode === 'system') {
      applyMode('system')
      notifySystemThemeChange()
    }
  })

  // 桌面壳：系统主题由壳提供 —— 启动主动拉一次，再订阅后续变化
  if (isDesktop()) {
    refreshDesktopSystemTheme()
    subscribe('theme:systemChanged', ({ isDarkMode }) => adoptDesktopSystemTheme(isDarkMode))
  }
}

/** 切换主题：只写偏好 store，落盘与 DOM 同步都由 store 的订阅链负责。 */
export function setColorMode(mode: ColorMode) {
  usePreferencesStore.getState().setColorMode(mode)
}

/**
 * 系统主题订阅：`system` 模式下偏好 store 本身不变，但生效主题会变，
 * 靠这里驱动使用 `resolved` 的组件重渲染（否则主题切换器的高亮会停在旧值）。
 */
function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  systemThemeListeners.add(onChange)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => {
    systemThemeListeners.delete(onChange)
    media.removeEventListener('change', onChange)
  }
}

function getSystemThemeSnapshot(): boolean {
  return systemPrefersDark()
}

export function useColorMode() {
  const mode = usePreferencesStore((state) => state.colorMode)
  const systemDark = useSyncExternalStore(subscribeSystemTheme, getSystemThemeSnapshot, () => false)

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  return {
    mode,
    resolved,
    setMode: setColorMode,
    cycle: () => setColorMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'),
  }
}
