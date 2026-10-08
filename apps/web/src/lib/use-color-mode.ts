import { useSyncExternalStore } from 'react'
import { usePreferencesStore, type ColorMode } from './store/preferences-store'

/**
 * 明暗主题状态。
 *
 * 单一真值在偏好 store（`#/lib/store/preferences-store` 的 `colorMode`），本文件只做两件事：
 * 1. 把生效主题写到 `<html data-mode>`（模块级订阅，任何入口改主题都会经过）；
 * 2. 提供 `useColorMode()` 给组件读状态。
 */
export type { ColorMode }

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
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

// 首次加载即应用一次，并跟随偏好 store 与系统主题变化。
if (typeof window !== 'undefined') {
  applyMode(usePreferencesStore.getState().colorMode)

  usePreferencesStore.subscribe((state, prevState) => {
    if (state.colorMode !== prevState.colorMode) {
      applyMode(state.colorMode)
    }
  })

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (usePreferencesStore.getState().colorMode === 'system') {
      applyMode('system')
    }
  })
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
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
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
