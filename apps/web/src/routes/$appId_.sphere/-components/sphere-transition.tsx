import { useReducedMotion } from 'motion/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

/**
 * 全屏对话页（`/$appId/sphere`）**整块面板的进出场编排**。
 *
 * ## 两件事为什么必须在同一处
 *
 * 1. **入场**：面板从 80% 放大到 100% + 淡入 —— 由布局里的 `motion.div` 播，
 *    参数就写在布局那里（与 `ai-panel.tsx` 的内联风格一致）；
 * 2. **出场**：点「收起」要先把面板缩小淡出、动画跑完**再**导航 —— 而导航目标来自
 *    `useSphereCollapseNow`（`#/routes/$appId_.sphere/-components/use-sphere-collapse`）。
 *
 * 收起按钮在 `sphere-header.tsx`、导航逻辑在 hook、动画在布局 —— 三处各写一份状态就会漂移。
 * 于是状态收在这里：布局提供（`SphereTransitionProvider`），
 * `useSphereCollapse` 优先取本上下文里的 `requestCollapse`（没有 provider 时退化为立即导航）。
 *
 * ## 只有一个出口被包住，为什么还值得单独一层
 *
 * 「收起」是全屏对话页唯一的退出口（会话 404 时头行仍在，出口也是它）。将来别处再加出口
 * （例如某个空态里的「返回」），只要调 `useSphereCollapse` 就自动带上过渡，不必知道动画细节。
 */

/**
 * 面板**入场**（0.8 → 1 + 淡入）的时长（ms）。
 *
 * 与退场时长并排放在这里只是为了「动画参数集中、一眼能对比」—— 它**不参与**收起编排，
 * 没有任何计时契约依赖它，改它只影响观感。
 */
export const SPHERE_PANEL_ENTER_MS = 200

/**
 * 面板收起（退场）动画时长（ms）。
 *
 * **必须与布局里 `motion.div` 的退场 `transition.duration` 一致**：动画什么时候跑完由
 * `motion` 的 `onAnimationComplete` 通知，但那条通路可能被打断（浏览器节流、组件被替换、
 * 动效库不上报），所以这里还有一条**兜底计时**读同一个常量。两者分叉的症状是
 * 「收起点了没反应」或「动画还在播就切走了」。
 */
export const SPHERE_PANEL_EXIT_MS = 200

/** 兜底计时的余量（ms）：动画回调没来时必须有人把用户送出去。 */
const EXIT_FALLBACK_MARGIN_MS = 200

export interface SphereTransitionValue {
  /** 正在播放收起过渡（面板已在缩小淡出，等待动画跑完后导航） */
  leaving: boolean
  /**
   * 请求收起：优先播退场动画，动画结束后才执行真正的导航。
   * **重复调用是安全的**（收起只发生一次，第二次是空操作）。
   */
  requestCollapse: () => void
  /** 面板的退场动画播完了（由布局的 `motion.div` 调） */
  notifyLeaveComplete: () => void
  /**
   * 取消正在进行的收起（把面板放回原位）。
   *
   * 收起是个**两百毫秒的窗口**，用户在动画期间又导航到别的会话（侧边栏 / 命令面板 /
   * AI 工具）时，这一次收起就不该再算数 —— 否则兜底计时会把刚落地的人强行送回来源页。
   * 未在收起时调用是空操作。
   */
  cancelCollapse: () => void
}

export const SphereTransitionContext = createContext<SphereTransitionValue | null>(null)

/** 读过渡上下文。只有布局内部用得到 —— 按钮侧请调 `useSphereCollapse`。 */
export function useSphereTransition(): SphereTransitionValue {
  const value = useContext(SphereTransitionContext)
  if (!value) {
    throw new Error('useSphereTransition 必须在 SphereTransitionProvider 内使用')
  }
  return value
}

export function SphereTransitionProvider({
  onExited,
  children,
}: {
  /**
   * 退场动画播完（或兜底计时到点）后真正执行导航。
   *
   * 传进来的必须是**立即导航**那个函数（`useSphereCollapseNow`），不能是本文件外面那个
   * 「带过渡的收起」—— 否则会绕回 `requestCollapse` 形成死循环。
   */
  onExited: () => void
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const [leaving, setLeaving] = useState(false)

  /*
    `leaving` 的镜像：`requestCollapse` / `notifyLeaveComplete` 都需要读它，但都不该因此
    重新生成（收起是一次性动作，回调换个引用只会让下游的 `useMemo` 白算）。
  */
  const leavingRef = useRef(false)
  /** 导航只会走一次 —— 动画完成与兜底计时是两条并行的通路 */
  const exitedRef = useRef(false)

  const onExitedRef = useRef(onExited)
  onExitedRef.current = onExited

  const exitOnce = useCallback(() => {
    if (exitedRef.current) return
    exitedRef.current = true
    onExitedRef.current()
  }, [])

  /**
   * 收起。
   *
   * **要求减少动效时直接导航**：那种情况下不该播动画，但「点了收起要能出去」这个状态
   * 正确性不能依赖动画（与 `ai-panel.tsx` 里 Split 形态的处理同义）。
   */
  const requestCollapse = useCallback(() => {
    if (leavingRef.current) return
    if (reduceMotion) {
      exitOnce()
      return
    }
    leavingRef.current = true
    setLeaving(true)
  }, [reduceMotion, exitOnce])

  /*
    兜底：`motion` 的 `onAnimationComplete` 正常会先到；万一没来（动效被打断、标签页在
    后台被节流时动画帧不推进），用户就会卡在一块正在淡出的面板上 —— 按「时长 + 余量」
    再送一次。
  */
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(
      exitOnce,
      SPHERE_PANEL_EXIT_MS + EXIT_FALLBACK_MARGIN_MS,
    )
    return () => window.clearTimeout(timer)
  }, [leaving, exitOnce])

  const notifyLeaveComplete = useCallback(() => {
    if (leavingRef.current) exitOnce()
  }, [exitOnce])

  /**
   * 取消收起：只复位状态，**不重启动画计时** —— `leaving` 变回 false 后兜底的
   * `setTimeout` 会在 effect cleanup 里被清掉，`motion` 则自己把面板弹回终态。
   * 已经跑过 `exitOnce` 的情况不存在：那时导航已经发出，组件正在卸载。
   */
  const cancelCollapse = useCallback(() => {
    if (!leavingRef.current) return
    leavingRef.current = false
    setLeaving(false)
  }, [])

  const value = useMemo<SphereTransitionValue>(
    () => ({ leaving, requestCollapse, notifyLeaveComplete, cancelCollapse }),
    [leaving, requestCollapse, notifyLeaveComplete, cancelCollapse],
  )

  return (
    <SphereTransitionContext.Provider value={value}>
      {children}
    </SphereTransitionContext.Provider>
  )
}
