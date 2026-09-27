import { useAiSessionStore } from '#/lib/ai'
import { usePreferencesStore } from '#/lib/store'

/**
 * AI 进行中的**页面级**光晕：视口四周向内发光，呼吸式明暗。
 *
 * ## 为什么是一层 CSS，而不是 `border-beam`
 *
 * 这个包的两族都不合适：
 * - `md` / `sm` / `line` 是「沿边框绕圈的旋转光带」，看着像**多了一条边框**；
 * - `pulse-outside` 的光晕长在元素**外面** —— 而这里的元素是满视口（`fixed inset-0`），
 *   外面就是屏幕外，只剩内侧一点余光，既不贴边也不像光晕；
 * - `pulse-inner` 收在边界内，但观感与设置页那张预览（`AiActivityGlowPreview`）差别明显。
 *
 * 而预览里的效果本就是一层 CSS `inset box-shadow`。改成同一套光之后：两处**完全一致**、
 * 零依赖、颜色可调，也不必再为它懒加载一个 80 KB 的 chunk。
 *
 * ## 两个几何约定
 *
 * - **容器是 `fixed inset-0`**：盖住整个视口（含侧边栏与顶栏），`z-30` 在它们之上、
 *   在命令面板与 Dialog 之下；`pointer-events-none` 保证它绝不吞点击。
 * - **模糊半径按满视口定，比预览大一档**：预览那张缩略图宽 320px，这里宽 1440px 上下 ——
 *   同一个像素半径在两处的观感差一个数量级。按比例放大后，两处「光晕占屏幕的厚度」才一致。
 */
export function AiActivityGlow() {
  const status = useAiSessionStore((state) => state.status)
  const pendingApproval = useAiSessionStore((state) => state.pendingApproval)
  // 设置 → AI 里可以关掉它（默认开）；关掉时整层都不渲染
  const glowEnabled = usePreferencesStore((state) => state.aiActivityGlow)

  /*
    等审批也算「进行中」：那一刻卡住的是用户而不是模型，但对用户来说页面仍在等待，
    给一层光晕比什么都不给更符合预期。
  */
  const isRunning = status === 'streaming' || pendingApproval !== null

  // 不进行时直接不渲染：不常驻一层 fixed，也不会有残留的光
  if (!glowEnabled || !isRunning) return null

  return (
    <div
      aria-hidden
      // 呼吸动画挂在 styles.css（`ai-glow-pulse`），与设置页预览共用同一套 keyframes
      data-ai-activity-glow="true"
      className="pointer-events-none fixed inset-0 z-30"
      style={{
        // 与预览同色（紫 + 粉），只把半径按视口尺寸放大
        boxShadow:
          'inset 0 0 120px rgb(129 140 248 / 0.42), inset 0 0 48px rgb(240 171 252 / 0.28)',
      }}
    />
  )
}
