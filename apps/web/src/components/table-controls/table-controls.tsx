import { Button, InputGroup } from '@cloudflare/kumo'
import {
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useId } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActiveFilterChips } from './active-filter-chips'
import { ColumnSettingsDropdown } from './column-settings-dropdown'
import { FilterBuilderPopover } from './filter-builder-popover'
import type { TableControlsProps } from './types'

/** 统计文案中被 <Trans> 替换的高亮数值样式 */
const COUNT_CLASS = 'font-medium text-kumo-default tabular-nums'

/**
 * 搜索框默认宽度：窄屏占满整行，宽屏按剩余空间自适应伸长但不超过 max-w-xs（320px），
 * 避免宽屏下输入框被拉得过长；左侧查询组在 lg 及以上带 flex-1，负责把右侧动作区推到最右。
 */
const SEARCH_WIDTH_CLASS = 'w-full sm:flex-1 max-w-xs'

/**
 * 通用查询与表格控制栏组件 (TableControls)
 * - 既可作为独立查询参数构建栏用于任意列表/卡片/图表
 * - 也可直接挂载 TanStack Table 实例，将 Display options 作为 Table 插件运行
 */
export function TableControls({
  searchSuffix,
  search,
  filters,
  table,
  columnSettings,
  otherOptions,
  otherVisibility,
  onOtherVisibilityChange,
  actions,
  summary,
  activeFilters,
  className = '',
}: TableControlsProps) {
  const { t } = useTranslation()

  // 输入框兜底唯一 id：Kumo 的 label 容器已隐式关联输入框，
  // 显式 id 便于表单关联、自动化测试定位；调用方可用 search.id 覆盖。
  const generatedSearchId = useId()

  const handleClearSearch = () => {
    if (search?.onClear) {
      search.onClear()
    } else {
      search?.onChange('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      search?.onSearch?.(search.value)
    }
  }

  // 计算多选计数与清空选区（优先使用传入的 summary，其次自动读取 table 插件）
  const selectedCount =
    summary?.selectedCount !== undefined
      ? summary.selectedCount
      : table
        ? table.getSelectedRowModel().rows.length
        : 0

  const handleClearSelection = () => {
    if (summary?.onClearSelection) {
      summary.onClearSelection()
    } else if (table) {
      table.resetRowSelection()
    }
  }

  // 装配列设置插件：如果传入了 table，自动作为插件接入
  const effectiveColumnSettings = columnSettings
    ? {
        ...columnSettings,
        table: columnSettings.table || table,
        other: columnSettings.other || otherOptions,
        otherVisibility: columnSettings.otherVisibility || otherVisibility,
        onOtherVisibilityChange: columnSettings.onOtherVisibilityChange || onOtherVisibilityChange,
      }
    : table
      ? {
          table,
          other: otherOptions,
          otherVisibility,
          onOtherVisibilityChange,
        }
      : null

  return (
    <div className={`flex flex-col gap-2 pt-3 ${className}`}>
      {/* 顶部主控制条：左侧查询组与右侧动作组，窄屏时动作组整体换行 */}
      <div className="flex items-center flex-wrap text-sm gap-3">
        {/* 左侧组：搜索输入框（**永远排第一**）+ 搜索后置插槽 + Filters 筛选器插件 + Display options 列设置插件 */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-1">
          {search ? (
            <InputGroup className={search.width || search.className || SEARCH_WIDTH_CLASS}>
              <InputGroup.Addon>
                <MagnifyingGlassIcon size={16} />
              </InputGroup.Addon>
              <InputGroup.Input
                id={search.id ?? generatedSearchId}
                name={search.name ?? 'search'}
                type="search"
                placeholder={search.placeholder ?? t('table.search.placeholder', '搜索记录…')}
                aria-label={search.ariaLabel ?? t('table.search.ariaLabel', '搜索')}
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="hide-native-search-clear"
              />
              {search.value ? (
                <InputGroup.Addon align="end">
                  <InputGroup.Button
                    shape="square"
                    icon={XIcon}
                    aria-label={t('table.search.clear', '清除搜索')}
                    onClick={handleClearSearch}
                  />
                </InputGroup.Addon>
              ) : null}
            </InputGroup>
          ) : null}

          {/* 搜索后置插槽：主搜索框与「显示选项」之间（如状态筛选下拉） */}
          {searchSuffix}

          {/* 高级筛选浮层插件 */}
          {filters ? <FilterBuilderPopover {...filters} /> : null}

          {/* 列设置与扩展选项下拉插件（直接与 TanStack Table 联动） */}
          {effectiveColumnSettings ? <ColumnSettingsDropdown {...effectiveColumnSettings} /> : null}
        </div>

        {/* 右侧动作区：< sm 独占一整行并与查询组同侧起排（justify-start，LTR 靠左 / RTL 靠右）；
            sm ~ lg 紧跟查询组；lg 起由左侧组 flex-1 推到最右 */}
        {actions ? (
          <div className="flex shrink-0 basis-full flex-wrap items-center justify-start gap-2 sm:basis-auto">
            {/* 工具型操作固定在动作区最前：刷新当前页数据 */}
            {actions.onRefresh ? (
              <Button
                variant="secondary"
                size="base"
                icon={<ArrowClockwiseIcon size={16} />}
                loading={actions.refreshLoading}
                onClick={actions.onRefresh}
              >
                {actions.refreshLabel ?? t('table.actions.refresh', '刷新')}
              </Button>
            ) : null}

            {actions.afterRefresh}

            {actions.onImport ? (
              <Button
                variant="secondary"
                size="base"
                icon={<UploadSimpleIcon size={16} />}
                onClick={actions.onImport}
              >
                {actions.importLabel ?? t('table.actions.import', '导入')}
              </Button>
            ) : null}

            {actions.onExport ? (
              <Button
                variant="secondary"
                size="base"
                icon={<DownloadSimpleIcon size={16} />}
                onClick={actions.onExport}
              >
                {actions.exportLabel ?? t('table.actions.export', '导出')}
              </Button>
            ) : null}

            {actions.onAddRecord ? (
              <Button
                variant="primary"
                size="base"
                icon={<PlusIcon size={16} />}
                onClick={actions.onAddRecord}
              >
                {actions.addRecordLabel ?? t('table.actions.addRecord', '新增记录')}
              </Button>
            ) : null}

            {actions.extra}
          </div>
        ) : null}
      </div>

      {/* 当前生效的筛选条件 chips：仅有条件时出现，便于随时确认生效中的筛选 */}
      {activeFilters ? <ActiveFilterChips {...activeFilters} /> : null}

      {/* 底部统计提示条 */}
      {summary ? (
        <div className="flex items-center justify-between text-sm text-kumo-subtle">
          <div>
            {summary.totalLabel !== undefined ? (
              summary.totalLabel
            ) : (
              <Trans
                i18nKey="table.summary.total"
                defaults="当前共检索到 <b>{{total}}</b> 条符合条件的记录"
                values={{ total: summary.total ?? 0 }}
                components={{ b: <b className={COUNT_CLASS} /> }}
              />
            )}
            {summary.extra}
          </div>

          {selectedCount > 0 ? (
            <div className="flex items-center gap-2">
              <Trans
                i18nKey="table.summary.selected"
                defaults="已选中 <b>{{selected}}</b> 项"
                values={{ selected: selectedCount }}
                components={{ b: <b className={COUNT_CLASS} /> }}
              />
              <Button variant="ghost" size="xs" onClick={handleClearSelection}>
                {t('table.summary.clearSelection', '取消选中')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
