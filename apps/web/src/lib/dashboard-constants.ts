/**
 * 仪表盘栅格的几何约定（单一真值）。
 *
 * 整个仪表盘是一张**固定 8 列**的栅格，卡片只声明「占几列 / 占几行」，
 * 不写像素值 —— 这样同一份布局在 1280 与 1920 视口下都能等比铺开，
 * 也不会出现「某张卡片是 253px 高」这种无法对齐的野值。
 *
 * 高度按**行单位**约定：
 *
 * ```
 * 卡片高度 = h × DASHBOARD_ROW_HEIGHT + (h − 1) × DASHBOARD_GAP
 * ```
 *
 * 之所以要把 gap 算进去：栅格用 `grid-auto-rows` 时行与行之间还会额外留 gap，
 * 若按 `h × 行高` 估算会把卡片高度算少（h 越大偏差越大、错位越明显）。
 */

/** 桌面端栅格列数。移动端不按 8 列铺（降级为单列），判断见 `#/lib/use-mobile-viewport`。 */
export const DASHBOARD_COLUMNS = 8

/**
 * 单行的高度（px）。
 *
 * 取 56 的来历：Kumo 的正文行高约 20px，一张卡片至少要有
 * 「标题栏（约 40px）+ 一行正文 + 上下内边距」，2 行（128px）正好是最小可用卡片；
 * 同时 56 是 8 的倍数，沿用了全局 8px 栅格节奏。
 */
export const DASHBOARD_ROW_HEIGHT = 56

/** 卡片间距（px）。与 8 列栅格的列间距同一值，横竖一致才不会有「宽缝窄缝」的错觉。 */
export const DASHBOARD_GAP = 16

/**
 * 允许的高度档位（行数）。
 *
 * 刻意做成**离散档位**而不是任意值：① 用户拖出来的 5.5 行没有任何意义，
 * 只会让相邻卡片对不齐；② 档位是「内容形态」的语言 ——
 * 2 行放一个数字、3 行放一行摘要、4 行放三四行列表、6/8 行放图表或表格。
 * 调整尺寸时吸附到最近的档位。
 */
export const DASHBOARD_HEIGHT_STEPS = [2, 3, 4, 6, 8] as const

/** 卡片最小 / 最大宽度（列数）。1 列在 8 列栅格里太窄（约 120px），放不下任何内容。 */
export const DASHBOARD_MIN_WIDTH = 2
export const DASHBOARD_MAX_WIDTH = DASHBOARD_COLUMNS

/**
 * 移动端是否降级为单列堆叠，**不在这里判断**。
 *
 * 断点统一走 `#/lib/use-mobile-viewport` 的 `useIsMobileViewport()` ——
 * 它与外壳抽屉共用 `SHELL_MOBILE_BREAKPOINT`。仪表盘若自带一个 768 常量，
 * 迟早会出现「侧边栏已经变成抽屉、栅格却还是 8 列」的错位帧。
 */

/** 把任意行数吸附到最近的合法档位（用于编辑态调整尺寸后的归一化）。 */
export function snapHeight(h: number): number {
  const steps = DASHBOARD_HEIGHT_STEPS
  // 显式标注 number：`steps[0]` 会被推断成字面量类型 `2`，后面赋值 `3 | 4 | 6 | 8` 就会报错
  let closest: number = steps[0]
  let bestDelta = Number.POSITIVE_INFINITY
  for (const step of steps) {
    const delta = Math.abs(step - h)
    if (delta < bestDelta) {
      bestDelta = delta
      closest = step
    }
  }
  return closest
}

/** 把宽度收敛到 [DASHBOARD_MIN_WIDTH, DASHBOARD_COLUMNS]。 */
export function clampWidgetWidth(w: number): number {
  return Math.min(DASHBOARD_MAX_WIDTH, Math.max(DASHBOARD_MIN_WIDTH, Math.round(w)))
}

/** 把起始列收敛到 [0, DASHBOARD_COLUMNS - w]。 */
export function clampWidgetX(x: number, w: number): number {
  return Math.min(DASHBOARD_COLUMNS - clampWidgetWidth(w), Math.max(0, Math.round(x)))
}

/**
 * 沿档位前进 / 后退若干级（键盘调整尺寸用）。
 *
 * 与 `snapHeight` 的区别：吸附是「就近取整」（拖动时的连续值 → 档位），
 * 这里是「按档位跳」（按一次方向键换一档）。两者都用同一份 `DASHBOARD_HEIGHT_STEPS`，
 * 所以档位永远是这几个值。
 */
export function stepHeight(h: number, delta: number): number {
  const steps: readonly number[] = DASHBOARD_HEIGHT_STEPS
  const index = steps.indexOf(snapHeight(h))
  const next = Math.min(steps.length - 1, Math.max(0, index + delta))
  return steps[next]
}

/**
 * 栅格几何：把容器宽度换算成「一列多宽 / 一行的步长」。
 *
 * 拖动时**必须用步长（列宽 + 间距）而不是列宽本身**：卡片停在格子上，
 * 从第 1 列移到第 2 列，指针实际要移动的正是「列宽 + 一个 gap」。
 * 用列宽算会越拖越偏（每列差 16px）。
 */
export interface GridMetrics {
  /** 单列宽度（不含间距）。 */
  columnWidth: number
  /** 跨一列的位移量 = 列宽 + 间距。 */
  columnStep: number
  /** 跨一行的位移量 = 行高 + 间距。 */
  rowStep: number
}

export function getGridMetrics(containerWidth: number): GridMetrics {
  const gaps = (DASHBOARD_COLUMNS - 1) * DASHBOARD_GAP
  const columnWidth = Math.max(
    1,
    (containerWidth - gaps) / DASHBOARD_COLUMNS,
  )
  return {
    columnWidth,
    columnStep: columnWidth + DASHBOARD_GAP,
    rowStep: DASHBOARD_ROW_HEIGHT + DASHBOARD_GAP,
  }
}
