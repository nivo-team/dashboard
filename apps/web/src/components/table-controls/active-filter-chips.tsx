import { Button } from '@cloudflare/kumo'
import { XIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import type { ActiveFiltersConfig } from './types'

/**
 * 当前生效的筛选条件 chips（结构对齐 Cloudflare 控制台实现）。
 *
 * - 外层 role="list"，每个 chip 是 role="listitem" 的 div（rounded-lg + ring + tint 底色）；
 * - 左侧原生 button：回到筛选器并聚焦到该条件；
 * - 右侧 span 内放 Kumo Button：只移除这一条；
 * - 圆角与内边距统一用逻辑属性（rounded-s / ps / pe），RTL 下自动镜像。
 *
 * 未使用 ButtonGroup：它会拍平内侧圆角并用负边距重叠描边，
 * 与 chip 的 rounded-lg 容器叠加后视觉会变形。
 */
export function ActiveFilterChips({
  items,
  onEdit,
  onRemove,
  onClearAll,
}: ActiveFiltersConfig) {
  const { t } = useTranslation()

  if (items.length === 0) return null

  return (
    <div
      role="list"
      aria-label={t('table.filterChips.label', '活动筛选器')}
      className="flex flex-wrap items-center gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="listitem"
          className="inline-flex items-center rounded-lg bg-kumo-tint text-sm text-kumo-default ring-1 ring-kumo-line hover:bg-kumo-fill"
        >
          <button
            type="button"
            onClick={() => onEdit?.(item.id)}
            aria-label={t('table.filterChips.edit', {
              defaultValue: '编辑 {{label}} 筛选条件',
              label: item.label,
            })}
            className="cursor-pointer rounded-s-lg border-0 bg-transparent py-1 ps-2 pe-1 text-start text-sm text-inherit focus-visible:ring-2 focus-visible:ring-kumo-brand focus-visible:outline-none"
          >
            <span>{item.label}</span>
          </button>

          <span className="py-1 pe-2 ps-1">
            <Button
              variant="ghost"
              size="xs"
              shape="square"
              className="size-5! min-h-0! p-0!"
              icon={<XIcon size={10} />}
              aria-label={t('table.filterChips.remove', {
                defaultValue: '移除 {{label}} 筛选条件',
                label: item.label,
              })}
              onClick={() => onRemove?.(item.id)}
            />
          </span>
        </div>
      ))}

      <Button variant="ghost" size="xs" onClick={onClearAll}>
        {t('table.filterBuilder.clearAll', '全部清除')}
      </Button>
    </div>
  )
}
