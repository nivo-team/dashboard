import {
  ChartLineUpIcon,
  GaugeIcon,
  InfoIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { ComponentType } from 'react'
import { MetricsCard } from '../-components/cards/metrics-card'
import { OverviewCard } from '../-components/cards/overview-card'
import { QuickActionsCard } from '../-components/cards/quick-actions-card'
import { VersionCard } from '../-components/cards/version-card'

/**
 * 仪表盘卡片注册表 —— 「有哪些卡片可选」的唯一真值。
 *
 * 新增一张卡片只需要在这里加一条：栅格渲染、添加卡片面板、默认布局
 * 都从这份清单派生，页面本身不用改。
 *
 * 三条约定：
 * 1. **`content` 只是内容**，不含卡片外壳。标题、图标、编辑态的移除 / 拖拽手柄
 *    统一由栅格渲染（`DashboardWidgetFrame`）—— 否则每张卡片都要自己实现一遍编辑态，
 *    而且一旦忘记处理，编辑模式下这张卡片就会「拖不动也没法删」。
 * 2. **`defaultSize` 用行单位**，高度必须是 `DASHBOARD_HEIGHT_STEPS` 里的档位。
 * 3. **中文文案键指向 `dashboard` 命名空间**；`title` / `description` 同时供
 *    「添加卡片」面板与未知卡片占位使用。
 */
export interface DashboardWidgetDefinition {
  /** 注册 key，写进布局的 `DashboardWidget.type`；**一旦上线不要再改**（存档里存的是它）。 */
  type: string
  /** `dashboard` 命名空间下的标题键。 */
  titleKey: string
  /** `dashboard` 命名空间下的说明键，「添加卡片」面板里显示。 */
  descriptionKey?: string
  /** 标题与添加面板共用的图标。 */
  icon: Icon
  /** 卡片内容组件。 */
  content: ComponentType
  /** 加入栅格时的默认尺寸（列 / 行）。 */
  defaultSize: { w: number; h: number }
  /**
   * 是否允许同时存在多张实例。
   *
   * 概览 / 快捷入口这类「全局唯一」的卡片设为 `false`：再放一张内容完全一样，
   * 只会白占位置（添加面板会把已添加的项置灰）。默认 `true`。
   */
  allowMultiple?: boolean
}

export const DASHBOARD_WIDGETS: readonly DashboardWidgetDefinition[] = [
  {
    type: 'overview',
    titleKey: 'cards.overview.title',
    icon: GaugeIcon,
    content: OverviewCard,
    // 概览是「信息密度低、但要一眼看完」的卡片：整行铺开，3 行（200px）刚好
    defaultSize: { w: 8, h: 3 },
    allowMultiple: false,
  },
  {
    type: 'quick-actions',
    titleKey: 'cards.quickActions.title',
    descriptionKey: 'cards.quickActions.description',
    icon: SquaresFourIcon,
    content: QuickActionsCard,
    defaultSize: { w: 4, h: 4 },
    allowMultiple: false,
  },
  {
    type: 'metrics',
    titleKey: 'cards.metrics.title',
    descriptionKey: 'cards.metrics.description',
    icon: ChartLineUpIcon,
    content: MetricsCard,
    defaultSize: { w: 4, h: 4 },
  },
  {
    type: 'version',
    titleKey: 'cards.version.title',
    descriptionKey: 'cards.version.description',
    icon: InfoIcon,
    content: VersionCard,
    // 三行「标签 + 值」：4 列宽 + 3 行（200px）刚好放下
    defaultSize: { w: 4, h: 3 },
    allowMultiple: false,
  },
]

/** 按 `type` 取卡片定义；存档里出现未知类型时返回 `null`（由栅格渲染「未知卡片」占位）。 */
export function getWidgetDefinition(type: string): DashboardWidgetDefinition | null {
  return DASHBOARD_WIDGETS.find((widget) => widget.type === type) ?? null
}
