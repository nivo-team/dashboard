import { Badge } from '@cloudflare/kumo'
import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { MenuNodeSchema } from '#/api'
import type { MenuNode } from '#/api'
import { ArrayHoverCard } from '#/components/array-hover-card'
import { useSchemaColumns } from '#/components/data-table'
import type { ColumnRenderer, SchemaColumnSpec } from '#/components/data-table'
import { toDisplayText } from '#/lib/to-text'
import { useApiKeyLabel } from './feature-apis'
import {
  menuIsAction,
  menuIsFrameKey,
  menuNoCacheKey,
  menuStatusKey,
  menuTypeKey,
  menuVisibleKey,
  toEpochMs,
} from './feature-options'

/**
 * 功能列的共享编排（容器视图与详情视图的子项表共用，避免两处重复维护）。
 *
 * 约定：一列只呈现一项数据；列 id 与后端字段名一致；文案取 `features:columns.<字段名>`。
 */

/** 数据列统一最小宽度。 */
export const FEATURE_MIN_COLUMN_WIDTH = 'min-w-[120px]'
/** 功能名称列放宽，避免长名称被挤压。 */
export const FEATURE_NAME_COLUMN_WIDTH = 'min-w-[220px]'

/**
 * 默认隐藏列：**默认为空** —— 列表默认展示全部字段，
 * 「显示选项」只用于让用户按需临时收起，不再有「设计上默认收起」的列。
 */
export const FEATURE_DEFAULT_HIDDEN_COLUMNS: readonly string[] = []

/**
 * 列编排（顺序即白名单）：
 * - 枚举列统一渲染成 Badge；
 * - `api_keys` 把 md5 还原成可读的接口 label，用悬浮卡片展示；
 * - `created_at` / `updated_at` 是字符串时间，用自定义 datetime 渲染器兜底；
 * - `path`（**路由地址**）是目录与菜单的核心字段 —— 侧边栏按 `/${appId}${path}` 跳转，
 *   所以它必须成列、可读；操作（menu_type=3）没有落点，该列对它为空。
 *   `component` 才是在新架构里废弃的那个（真实数据是 `/ignore` 占位），白名单不含它。
 */
export const FEATURE_COLUMN_SPECS: SchemaColumnSpec<MenuNode>[] = [
  // 约定：ID 永远排在第一列（便于与后端数据对照）
  { field: 'menu_id', render: 'number' },
  {
    field: 'menu_name',
    render: 'featureName',
    meta: { headerClassName: FEATURE_NAME_COLUMN_WIDTH },
  },
  { field: 'menu_type', render: 'featureType' },
  { field: 'path', render: 'code' },
  { field: 'permission', render: 'code' },
  { field: 'icon', render: 'code' },
  { field: 'sort', render: 'number' },
  { field: 'status', render: 'status' },
  { field: 'visible', render: 'visible' },
  { field: 'is_frame', render: 'isFrame' },
  { field: 'no_cache', render: 'noCache' },
  { field: 'api_keys', render: 'apiKeys' },
  { field: 'created_at', render: 'datetime' },
  { field: 'updated_at', render: 'datetime' },
]

/**
 * 详情视图的子项表列（该表里全是权限点，只保留有意义的字段）：
 * - 去掉 `menu_type`：这张表里的节点必然是权限，类型没有信息量；
 * - 去掉 `visible`：权限没有「是否显示」的概念（表单也不提交该字段）；
 * - 去掉时间戳：权限的创建/更新时间不在这一层的关注范围内。
 */
export const FEATURE_CHILD_COLUMN_SPECS: SchemaColumnSpec<MenuNode>[] = [
  // 约定：ID 永远排在第一列
  { field: 'menu_id', render: 'number' },
  {
    field: 'menu_name',
    render: 'featureName',
    meta: { headerClassName: FEATURE_NAME_COLUMN_WIDTH },
  },
  { field: 'permission', render: 'code' },
  { field: 'sort', render: 'number' },
  { field: 'status', render: 'status' },
  { field: 'api_keys', render: 'apiKeys' },
]

/** 枚举值无法识别时的兜底展示：保留原始值，避免静默丢数据。 */
function RawEnumValue({ value, empty }: { value: unknown; empty: string }) {
  const text = value === null || value === undefined || value === '' ? empty : toDisplayText(value)
  return <span className="text-sm text-kumo-subtle">{text}</span>
}

/** 功能类型徽章（功能组 / 功能 / 操作）。 */
export function featureTypeBadge(value: unknown, t: TFunction, empty = '-'): ReactNode {
  const key = menuTypeKey(value)
  if (!key) return <RawEnumValue value={value} empty={empty} />
  const variant = key === 'directory' ? 'blue' : key === 'menu' ? 'neutral' : 'purple'
  return <Badge variant={variant}>{t(`menuType.${key}`)}</Badge>
}

/** 状态徽章（启用 / 禁用）。 */
export function featureStatusBadge(value: unknown, t: TFunction, empty = '-'): ReactNode {
  const key = menuStatusKey(value)
  if (!key) return <RawEnumValue value={value} empty={empty} />
  return (
    <Badge variant={key === 'enabled' ? 'success' : 'neutral'} appearance="dot">
      {t(`status.${key}`)}
    </Badge>
  )
}

/** 是否可见徽章。 */
export function featureVisibleBadge(value: unknown, t: TFunction, empty = '-'): ReactNode {
  const key = menuVisibleKey(value)
  if (!key) return <RawEnumValue value={value} empty={empty} />
  return <Badge variant={key === 'visible' ? 'outline' : 'orange'}>{t(`visible.${key}`)}</Badge>
}

/** 是否外链徽章。 */
export function featureIsFrameBadge(value: unknown, t: TFunction, empty = '-'): ReactNode {
  const key = menuIsFrameKey(value)
  if (!key) return <RawEnumValue value={value} empty={empty} />
  return <Badge variant={key === 'yes' ? 'teal' : 'neutral'}>{t(`isFrame.${key}`)}</Badge>
}

/** 路由缓存徽章。 */
export function featureNoCacheBadge(value: unknown, t: TFunction, empty = '-'): ReactNode {
  const key = menuNoCacheKey(value)
  if (!key) return <RawEnumValue value={value} empty={empty} />
  return <Badge variant={key === 'cache' ? 'green' : 'neutral'}>{t(`noCache.${key}`)}</Badge>
}

/**
 * 生成功能列渲染器。
 *
 * @param onOpenNode 点击功能名称时的行为（容器视图与详情视图都用于「进入该节点」，
 *   由路由层按 `menu_type` 分流到容器视图或详情视图）
 */
export function useFeatureColumnRenderers(
  onOpenNode?: (node: MenuNode) => void,
): Record<string, ColumnRenderer<MenuNode>> {
  /** api_keys 存的是 md5，这里换算成可读的接口 label（清单走共享缓存） */
  const apiKeyLabel = useApiKeyLabel()

  return useMemo(
    () => ({
      featureName: ({ row, empty }) => {
        // 操作是功能下的权限点，本轮没有落点视图，渲染成纯文本而不是可点击入口
        const clickable = Boolean(onOpenNode) && !menuIsAction(row)
        const label = row.menu_name || empty

        return clickable ? (
          <button
            type="button"
            onClick={() => onOpenNode?.(row)}
            className="max-w-64 truncate text-start font-medium text-kumo-default hover:underline"
          >
            {label}
          </button>
        ) : (
          <span className="font-medium text-kumo-default whitespace-nowrap">{label}</span>
        )
      },
      featureType: ({ value, t, empty }) => featureTypeBadge(value, t, empty),
      apiKeys: ({ value, t, empty }) => {
        const keys = Array.isArray(value)
          ? value.filter((key): key is string => typeof key === 'string')
          : []

        if (keys.length === 0) {
          return <span className="text-sm text-kumo-subtle">{empty}</span>
        }

        return (
          <ArrayHoverCard
            title={t('columns.api_keys')}
            items={keys.map((key) => (
              <span key={key} className="font-mono text-xs">
                {apiKeyLabel(key)}
              </span>
            ))}
          />
        )
      },
      status: ({ value, t, empty }) => featureStatusBadge(value, t, empty),
      visible: ({ value, t, empty }) => featureVisibleBadge(value, t, empty),
      isFrame: ({ value, t, empty }) => featureIsFrameBadge(value, t, empty),
      noCache: ({ value, t, empty }) => featureNoCacheBadge(value, t, empty),
      // 时间列：toEpochMs 兜底解析字符串/数字时间，formatDateTime 跟随全局时区
      datetime: ({ value, empty, formatDateTime }) => {
        const ms = toEpochMs(value)
        return (
          <span className="text-xs text-kumo-subtle whitespace-nowrap">
            {ms === null ? empty : formatDateTime(ms)}
          </span>
        )
      },
    }),
    [apiKeyLabel, onOpenNode],
  )
}

/**
 * 组装功能列（容器视图与详情视图的子项表共用）。
 *
 * @param options.onOpenNode 功能名称点击行为
 * @param options.columns 覆盖列编排（详情视图用精简列集）
 */
export function useFeatureColumns(options?: {
  onOpenNode?: (node: MenuNode) => void
  columns?: SchemaColumnSpec<MenuNode>[]
}) {
  const renderers = useFeatureColumnRenderers(options?.onOpenNode)

  return useSchemaColumns<MenuNode>(MenuNodeSchema, {
    ns: 'menus',
    columns: options?.columns ?? FEATURE_COLUMN_SPECS,
    baseMeta: { headerClassName: FEATURE_MIN_COLUMN_WIDTH },
    renderers,
  })
}
