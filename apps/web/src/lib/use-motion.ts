import { useSyncExternalStore } from 'react'
import { useShellUiStore } from '#/lib/store'

/**
 * 「现在能不能播动画」的**唯一判定点**。
 *
 * 两个输入，取更严格的那个：
 * 1. **用户开关** —— 设置 → 外观 → 「界面动效」（`admin.shell-ui` 的 `motionEnabled`，
 *    全局一份、默认开）；
 * 2. **系统 `prefers-reduced-motion: reduce`** —— 无障碍要求，优先级更高：
 *    系统说减少动效时，即使用户把开关开着也不播。
 *
 * 为什么要有这个模块：动效判定原先散在三处（`ai-panel` 自己的 `prefersReducedMotion()`、
 * styles.css 的媒体查询、各处的 `motion-safe:` 变体）。加一个用户开关之后，如果每处再各写
 * 一遍，出现「开关关了但某一处还在动」只是时间问题 —— 判定收在这里，接入点只问这一个问题。
 *
 * 目前接入的是 **AI 面板** 与 **全屏对话页（`/$appId/sphere`）**；其余过渡
 * （详情分屏、侧边栏、设置页缩略图）暂时仍只跟随系统设置，见 `.agents/docs/ui-and-styling.md`。
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** 系统是否要求「减少动态效果」（`useSyncExternalStore` 的取值处用它）。 */
function systemPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  )
}

/*
  下面三个函数必须是**模块级**的：`useSyncExternalStore` 会按引用比较 subscribe，
  写成内联箭头函数会在每次渲染时重新订阅一遍。
*/
function subscribeReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const media = window.matchMedia(REDUCED_MOTION_QUERY)
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

function getReducedMotionSnapshot(): boolean {
  return systemPrefersReducedMotion()
}

/** 服务端 / 首帧没有 `matchMedia` 时按「不减少」——与本仓库 SPA 的实际行为一致 */
function getReducedMotionServerSnapshot(): boolean {
  return false
}

/**
 * 现在能不能播动画：用户开关打开 **且** 系统没要求减少动效。
 *
 * 跟随两个来源的变化即时更新（用户拨开关、系统改设置都算）。
 * **不要**在别处重新拼这两个条件 —— 那是这个模块存在的理由。
 */
export function useMotionEnabled(): boolean {
  const motionEnabled = useShellUiStore((state) => state.motionEnabled)
  const systemReduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  )

  return motionEnabled && !systemReduced
}
