import { Button, DropdownMenu, InputGroup } from '@cloudflare/kumo'
import { GearSixIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ColumnSettingsProps,
  NormalizedColumnItem,
  NormalizedOtherOptionItem,
  TableColumnsConfig,
  TableOtherOptionsConfig,
} from './types'

/**
 * 归一化扁平列配置（支持对象或数组）
 */
export function normalizeColumns(cols?: TableColumnsConfig): NormalizedColumnItem[] {
  if (!cols) return []
  if (Array.isArray(cols)) {
    return cols.map((col) => ({
      key: col.key,
      label: col.label ?? col.key,
      defaultVisible: col.defaultVisible ?? true,
    }))
  }

  return Object.entries(cols).map(([key, val]) => {
    if (typeof val === 'string') {
      return {
        key,
        label: val,
        defaultVisible: true,
      }
    }
    return {
      key,
      label: val.label ?? key,
      defaultVisible: val.defaultVisible ?? true,
    }
  })
}

/**
 * 归一化扩展配置组（支持对象或数组，默认无）
 */
export function normalizeOther(other?: TableOtherOptionsConfig): NormalizedOtherOptionItem[] {
  if (!other) return []
  if (Array.isArray(other)) {
    return other.map((opt) => ({
      key: opt.key,
      label: opt.label ?? opt.key,
      defaultValue: opt.defaultValue ?? true,
    }))
  }

  return Object.entries(other).map(([key, val]) => {
    if (typeof val === 'string') {
      return {
        key,
        label: val,
        defaultValue: true,
      }
    }
    return {
      key,
      label: val.label ?? key,
      defaultValue: val.defaultValue ?? true,
    }
  })
}

/**
 * Display options 列设置与显示控制下拉组件
 * - 既可作为 TanStack Table 的插件无缝接入，也可作为独立组件使用
 * - 内置过滤输入框，支持实时搜索与筛选各列
 * - 支持 Reset 一键恢复至初始默认列
 */
export function ColumnSettingsDropdown({
  table,
  columns,
  columnVisibility = {},
  onColumnVisibilityChange,
  other,
  otherVisibility,
  onOtherVisibilityChange,
  onReset,
  isDefault,
  triggerLabel,
  searchPlaceholder,
}: ColumnSettingsProps) {
  const { t } = useTranslation()

  // 未显式传入文案时回退至 i18n 默认文案
  const resolvedTriggerLabel = triggerLabel ?? t('table.displayOptions.trigger', '显示选项')
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t('table.displayOptions.filterPlaceholder', '过滤列…')

  // 列搜索过滤关键字状态
  const [filterQuery, setFilterQuery] = useState('')

  // 当传入 table 实例时，从 TanStack Table 自动获取可显隐的列
  const tableColumns = useMemo(() => {
    if (!table) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return table.getAllLeafColumns().filter((col: any) => col.getCanHide())
  }, [table])

  const normalizedCols = useMemo(() => {
    if (tableColumns) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return tableColumns.map((col: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = col.columnDef.meta as Record<string, any> | undefined
        const label =
          meta?.label ||
          (typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id)
        return {
          key: col.id,
          label,
          defaultVisible: true,
        }
      })
    }
    return normalizeColumns(columns)
  }, [tableColumns, columns])

  const normalizedOther = useMemo(() => normalizeOther(other), [other])

  // 匹配过滤条件过滤列项
  const displayTableColumns = useMemo(() => {
    if (!tableColumns) return null
    const q = filterQuery.trim().toLowerCase()
    if (!q) return tableColumns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tableColumns.filter((col: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = col.columnDef.meta as Record<string, any> | undefined
      const label = (
        meta?.label ||
        (typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id)
      ).toLowerCase()
      return label.includes(q) || col.id.toLowerCase().includes(q)
    })
  }, [tableColumns, filterQuery])

  const displayNormalizedCols = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return normalizedCols
    return normalizedCols.filter(
      (col: NormalizedColumnItem) =>
        col.label.toLowerCase().includes(q) || col.key.toLowerCase().includes(q),
    )
  }, [normalizedCols, filterQuery])

  const displayOther = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return normalizedOther
    return normalizedOther.filter(
      (opt: NormalizedOtherOptionItem) =>
        opt.label.toLowerCase().includes(q) || opt.key.toLowerCase().includes(q),
    )
  }, [normalizedOther, filterQuery])

  const hasAnyMatch =
    (displayTableColumns
      ? displayTableColumns.length > 0
      : displayNormalizedCols.length > 0) || displayOther.length > 0

  // 计算是否处于初始默认配置
  const computedIsDefault = useMemo(() => {
    if (typeof isDefault === 'boolean') {
      return isDefault
    }

    let colsMatch = true
    if (tableColumns) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      colsMatch = tableColumns.every((col: any) => col.getIsVisible())
    } else {
      colsMatch = normalizedCols.every(
        (col: NormalizedColumnItem) =>
          (columnVisibility[col.key] ?? true) === col.defaultVisible,
      )
    }

    if (normalizedOther.length === 0) {
      return colsMatch
    }

    const otherMatch = normalizedOther.every(
      (opt) => (otherVisibility?.[opt.key] ?? true) === opt.defaultValue,
    )

    return colsMatch && otherMatch
  }, [
    isDefault,
    tableColumns,
    normalizedCols,
    normalizedOther,
    columnVisibility,
    otherVisibility,
  ])

  const handleReset = () => {
    setFilterQuery('')

    if (onReset) {
      onReset()
      return
    }

    if (table) {
      table.resetColumnVisibility()
    } else if (onColumnVisibilityChange) {
      const defaultCols: Record<string, boolean> = {}
      normalizedCols.forEach((col: NormalizedColumnItem) => {
        defaultCols[col.key] = col.defaultVisible
      })
      onColumnVisibilityChange(defaultCols)
    }

    if (normalizedOther.length > 0 && onOtherVisibilityChange) {
      const defaultOther: Record<string, boolean> = {}
      normalizedOther.forEach((opt) => {
        defaultOther[opt.key] = opt.defaultValue
      })
      onOtherVisibilityChange(defaultOther)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="secondary"
            size="base"
            icon={<GearSixIcon size={16} />}
            aria-label={resolvedTriggerLabel}
          >
            {resolvedTriggerLabel}
          </Button>
        }
      />
      {/* 列数可能很多，限制下拉最高 500px 并允许内部滚动。
          Kumo 的 cn 基于 tailwind-merge，此处的 max-h 会覆盖 popup 内置的
          max-h-[var(--available-height)]；用 min() 保留 Base UI 的可用高度约束，
          小屏下不会顶出视口（纯 className，不使用行内样式）。 */}
      <DropdownMenu.Content
        align="start"
        className="max-h-[min(500px,var(--available-height))] min-w-48 max-w-64 overflow-y-auto overscroll-contain p-1.5"
      >
        {/* 第一组：扁平业务数据列 */}
        <DropdownMenu.Group>
          <div className="flex items-center justify-between gap-3 px-1 py-0.5">
            <DropdownMenu.Label className="px-1 py-1 text-base font-semibold text-kumo-default">
              {t('table.displayOptions.title', '编辑列')}
            </DropdownMenu.Label>
            <Button
              variant="ghost"
              size="xs"
              className="h-6.5 gap-1 rounded-md px-2 text-xs text-kumo-default hover:bg-kumo-tint shadow-none bg-inherit cursor-pointer disabled:cursor-not-allowed disabled:text-kumo-subtle disabled:opacity-50"
              disabled={computedIsDefault}
              onClick={handleReset}
            >
              {t('table.displayOptions.reset', '重置')}
            </Button>
          </div>

          {/* 列过滤搜索输入框 */}
          <div className="my-1.5 px-0.5">
            <InputGroup className="w-full">
              <InputGroup.Addon>
                <MagnifyingGlassIcon />
              </InputGroup.Addon>
              <InputGroup.Input
                type="search"
                placeholder={resolvedSearchPlaceholder}
                aria-label={resolvedSearchPlaceholder}
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="hide-native-search-clear"
              />
              {filterQuery ? (
                <InputGroup.Addon align="end" className="pr-1">
                  <InputGroup.Button
                    shape="square"
                    icon={XIcon}
                    aria-label={t('table.displayOptions.clearFilter', '清除过滤')}
                    onClick={() => setFilterQuery('')}
                  />
                </InputGroup.Addon>
              ) : null}
            </InputGroup>
          </div>

          {!hasAnyMatch ? (
            <div className="px-3 py-4 text-center text-xs text-kumo-subtle">
              {t('table.displayOptions.noMatch', '未找到匹配的列')}
            </div>
          ) : null}

          {displayTableColumns
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? displayTableColumns.map((col: any) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const meta = col.columnDef.meta as Record<string, any> | undefined
                const label =
                  meta?.label ||
                  (typeof col.columnDef.header === 'string'
                    ? col.columnDef.header
                    : col.id)
                const isChecked = col.getIsVisible()

                return (
                  <DropdownMenu.CheckboxItem
                    key={col.id}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      col.toggleVisibility(!!checked)
                    }}
                  >
                    {label}
                  </DropdownMenu.CheckboxItem>
                )
              })
            : displayNormalizedCols.map((col: NormalizedColumnItem) => {
                const isChecked = columnVisibility[col.key] ?? col.defaultVisible
                return (
                  <DropdownMenu.CheckboxItem
                    key={col.key}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      onColumnVisibilityChange?.({
                        ...columnVisibility,
                        [col.key]: !!checked,
                      })
                    }}
                  >
                    {col.label}
                  </DropdownMenu.CheckboxItem>
                )
              })}
        </DropdownMenu.Group>

        {/* 第二组：可选的 Other 组，默认不会显示，只有传入 other 时渲染 */}
        {displayOther.length > 0 ? (
          <>
            <DropdownMenu.Separator />
            <DropdownMenu.Group>
              <DropdownMenu.Label className="px-2 py-1.5 text-base font-semibold text-kumo-default">
                {t('table.displayOptions.other', '其他')}
              </DropdownMenu.Label>
              {displayOther.map((opt) => {
                const isChecked = otherVisibility?.[opt.key] ?? opt.defaultValue
                return (
                  <DropdownMenu.CheckboxItem
                    key={opt.key}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      onOtherVisibilityChange?.({
                        ...(otherVisibility ?? {}),
                        [opt.key]: !!checked,
                      })
                    }}
                  >
                    {opt.label}
                  </DropdownMenu.CheckboxItem>
                )
              })}
            </DropdownMenu.Group>
          </>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
