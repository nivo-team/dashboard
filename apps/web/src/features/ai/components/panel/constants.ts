/**
 * 面板的时间与尺寸常量 —— **两种形态共用**，所以单独放一处。
 *
 * 每个数都有一条「必须与某处一致」的契约，写在各自的注释里；改之前先看那一处。
 */

/**
 * Split 形态展开 / 收起的时长（ms）。
 *
 * **必须与 `aside` 上的 `duration-200` 一致**：过渡是 CSS 跑的，而「什么时候可以卸载」
 * 只能由 JS 计时（过渡被打断 / 减动效时 `transitionend` 不会来）。两者分叉的症状是
 * 收起后残留一小会儿（或提前被砍掉）。
 */
export const SPLIT_SLIDE_MS = 200

/**
 * Float 浮窗「展开 ↔ 折叠成窄条」的变形时长（ms）与缓动。
 *
 * 缓动与 `Sidebar` 用的是同一条曲线（`styles.css` 的 `--sidebar-easing`），
 * 于是「收起来」这件事在侧边栏和浮窗上读起来是同一种手感。
 *
 * 变形期间不卸载任何内容（见 `float-geometry` 的 `surfaceCollapsed`），所以这里**不需要**
 * 「动画跑完才能卸载」那种计时契约 —— 计时只用来决定什么时候把内容切成折叠态。
 */
export const FLOAT_COLLAPSE_MS = 220

/** 交给 `motion` 的缓动（四参贝塞尔要显式标注成元组，否则推断成 `number[]` 不被接受）。 */
export const FLOAT_COLLAPSE_EASE: [number, number, number, number] = [0.77, 0, 0.175, 1]

/**
 * AI 面板头行的高度（px）。
 *
 * **必须与头行上的 `h-[58px]` 一致**（也与 `AppHeader` 同高）：浮窗折叠后就是
 * 这一条，动画的终点高度直接用它。
 */
export const AI_PANEL_HEADER_HEIGHT = 58
