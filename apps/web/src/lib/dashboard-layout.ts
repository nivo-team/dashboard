import {
  clampWidgetWidth,
  clampWidgetX,
  snapHeight,
} from './dashboard-constants'

/**
 * 仪表盘布局的数据模型与持久化格式。
 *
 * 刻意与「渲染成什么样」解耦：这里只有位置与尺寸，**没有任何组件引用**，
 * 因此可以直接 JSON 往返落到 localStorage。
 */

/** 一次布局的格式版本。将来字段语义变化时靠它做迁移（旧版本读进来先升级再使用）。 */
export const DASHBOARD_LAYOUT_VERSION = 1

/** 栅格上的一张卡片实例。 */
export interface DashboardWidget {
  /** 实例 id：拖拽定位与持久化的主键，**与 `type` 不同**（同一类型可以放多张）。 */
  id: string
  /** 卡片类型，对应 `-data/widget-registry` 的注册 key。 */
  type: string
  /** 起始列（0-based，0 ~ DASHBOARD_COLUMNS - w）。 */
  x: number
  /** 起始行（0-based，自上而下）。 */
  y: number
  /** 跨列数（DASHBOARD_MIN_WIDTH ~ DASHBOARD_COLUMNS）。 */
  w: number
  /** 跨行数（`DASHBOARD_HEIGHT_STEPS` 里的档位）。 */
  h: number
  /**
   * 卡片私有配置。
   *
   * 当前三张卡片都是静态的，用不到；保留它是为了让「带参数的卡片」将来
   * 不必改布局格式（否则升级要迁移所有人的存档）。约定：**只放可 JSON 往返的值**。
   */
  config?: Record<string, unknown>
}

export interface DashboardLayout {
  version: number
  widgets: DashboardWidget[]
}

/**
 * 默认布局（首次进入、或「恢复默认布局」时的样子）。
 *
 * 三张卡片刚好铺满前三行且**不留空洞**：概览整行占满，下面两张各占一半。
 * id 用固定字符串而不是随机值 —— 「恢复默认」应该每次都得到同一份布局，
 * 否则反复重置会不断产生新 id（后续若按 id 存卡片级配置就再也对不上）。
 */
export const DEFAULT_DASHBOARD_WIDGETS: readonly DashboardWidget[] = [
  { id: 'overview', type: 'overview', x: 0, y: 0, w: 8, h: 3 },
  { id: 'quick-actions', type: 'quick-actions', x: 0, y: 3, w: 4, h: 4 },
  { id: 'metrics', type: 'metrics', x: 4, y: 3, w: 4, h: 4 },
]

export function createDefaultLayout(): DashboardLayout {
  return {
    version: DASHBOARD_LAYOUT_VERSION,
    widgets: DEFAULT_DASHBOARD_WIDGETS.map((widget) => ({ ...widget })),
  }
}

/** 生成实例 id（`crypto.randomUUID` 在目标浏览器全量可用，仍留一个兜底）。 */
export function createWidgetId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 把任意来源（localStorage 存档、将来的后端下发）的布局**收敛成合法布局**。
 *
 * 为什么必须做：局部损坏的存档（手工改过、旧版本写入、将来字段改名）
 * 一旦直接送进渲染，会得到 NaN 坐标、越界的 `grid-column-start` 或重复 key，
 * 表现为整页错位且难以排查。这里逐项校验，非法值就地回落而不是整份丢弃 ——
 * 用户宁可丢一张卡片，也不愿意丢掉整份布局。
 */
export function normalizeLayout(input: unknown): DashboardLayout {
  const raw = (input ?? {}) as Partial<DashboardLayout>
  const list = Array.isArray(raw.widgets) ? raw.widgets : []

  const seen = new Set<string>()
  const widgets: DashboardWidget[] = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<DashboardWidget>
    if (typeof candidate.type !== 'string' || candidate.type.length === 0) continue

    const id =
      typeof candidate.id === 'string' && candidate.id.length > 0 && !seen.has(candidate.id)
        ? candidate.id
        : createWidgetId()
    seen.add(id)

    const w = clampWidgetWidth(toNumber(candidate.w, 4))
    const h = snapHeight(toNumber(candidate.h, 3))
    const x = clampWidgetX(toNumber(candidate.x, 0), w)
    const y = Math.max(0, Math.round(toNumber(candidate.y, 0)))

    widgets.push({
      id,
      type: candidate.type,
      x,
      y,
      w,
      h,
      ...(candidate.config && typeof candidate.config === 'object'
        ? { config: candidate.config as Record<string, unknown> }
        : {}),
    })
  }

  return { version: DASHBOARD_LAYOUT_VERSION, widgets: compactLayout(widgets) }
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 垂直压缩（gravity up）：把每张卡片尽量往上推，直到顶上或碰到别的卡片。
 *
 * 为什么需要它：卡片可以跨行，拖动 / 改尺寸后很容易在原地留下空洞
 * （典型场景是把一张 4 行卡换成 2 行，下面立刻空出两行）。浏览器的 CSS Grid
 * 自动排布**不能**回填这些空洞（`grid-auto-flow` 的游标只前进不回退，
 * `dense` 又会打乱用户设定的顺序），所以压缩必须自己算。
 *
 * 算法：按「先 y 后 x」排序后依次落位 —— 每张卡片从 y=0 开始逐行试，
 * 与已落位的卡片做矩形相交判定，找到第一个不冲突的位置。
 * 顺序确定性保证了同一个布局压缩结果稳定（不会来回抖动）。
 *
 * ### `pinnedId`：拖动 / 键盘调整中的那张卡片
 *
 * 正在被操作的卡片**不参与向上压缩**，而是钉在用户给它的位置上先落位，
 * 其余卡片再绕开它压缩。没有这个参数会出一个很隐蔽的交互 bug：
 * 两张卡片上下排列时，把下面那张往**上**拖是永远拖不动的 ——
 * 它和目标位置重叠，排序时又排在后面，压缩会把它原样推回下面的位置。
 * 钉住之后，用户拖到哪它就停在哪，让位的是别人。
 *
 * 返回顺序**保持入参顺序**（而不是压缩顺序）：数组顺序即 DOM 顺序，
 * 压缩只是改坐标，不该让 React 把节点搬来搬去。
 */
export function compactLayout(
  widgets: readonly DashboardWidget[],
  pinnedId?: string | null,
): DashboardWidget[] {
  const pinned = pinnedId
    ? widgets.find((widget) => widget.id === pinnedId)
    : undefined

  const placed: DashboardWidget[] = pinned ? [pinned] : []
  const rest = widgets
    .filter((widget) => widget.id !== pinned?.id)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

  // 搜索上限 = 所有卡片行数之和：最坏情况也不过是它们首尾相接，这个高度一定够，
  // 同时保证 while 循环必然终止（缺了它就是死循环，不是性能问题）
  const limit = widgets.reduce((total, item) => total + item.h, 0) + 1

  for (const widget of rest) {
    let y = 0
    while (y < limit && placed.some((other) => overlaps(widget, other, y))) {
      y += 1
    }
    placed.push({ ...widget, y })
  }

  const byId = new Map(placed.map((widget) => [widget.id, widget]))
  return widgets.map((widget) => byId.get(widget.id) ?? { ...widget })
}

/** 判断 `widget` 落在 `y` 行时是否与已落位的 `other` 相交（列必须重叠才算）。 */
function overlaps(widget: DashboardWidget, other: DashboardWidget, y: number): boolean {
  const sameColumnBand =
    widget.x < other.x + other.w && other.x < widget.x + widget.w
  if (!sameColumnBand) return false
  return y < other.y + other.h && other.y < y + widget.h
}

/** 布局是否为空（用于渲染空态）。 */
export function isEmptyLayout(layout: DashboardLayout): boolean {
  return layout.widgets.length === 0
}
