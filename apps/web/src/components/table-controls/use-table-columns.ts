import { useCallback, useMemo, useState } from 'react'
import { normalizeColumns, normalizeOther } from './column-settings-dropdown'
import type {
  ColumnSettingsProps,
  TableColumnsConfig,
  TableOtherOptionsConfig,
} from './types'

/**
 * 管理数据表格各列显隐及扩展显示选项的 Hook
 *
 * @param columns 完全对应后端类型的扁平列定义（对象或数组）
 * @param other 可选的扩展设置组（例如 Other -> Show full name 等），默认无
 */
export function useTableColumns(
  columns: TableColumnsConfig,
  other?: TableOtherOptionsConfig,
) {
  const normalizedCols = useMemo(() => normalizeColumns(columns), [columns])
  const normalizedOther = useMemo(() => normalizeOther(other), [other])

  // 默认初始可见性状态
  const initialColumns = useMemo(() => {
    const map: Record<string, boolean> = {}
    normalizedCols.forEach((col) => {
      map[col.key] = col.defaultVisible
    })
    return map
  }, [normalizedCols])

  // 默认初始扩展状态
  const initialOther = useMemo(() => {
    const map: Record<string, boolean> = {}
    normalizedOther.forEach((opt) => {
      map[opt.key] = opt.defaultValue
    })
    return map
  }, [normalizedOther])

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(initialColumns)
  const [otherVisibility, setOtherVisibility] = useState<Record<string, boolean>>(initialOther)

  // 检查是否全为默认配置
  const isDefault = useMemo(() => {
    const colsMatch = Object.keys(initialColumns).every(
      (key) => columnVisibility[key] === initialColumns[key],
    )
    if (normalizedOther.length === 0) {
      return colsMatch
    }
    const otherMatch = Object.keys(initialOther).every(
      (key) => otherVisibility[key] === initialOther[key],
    )
    return colsMatch && otherMatch
  }, [initialColumns, initialOther, columnVisibility, otherVisibility, normalizedOther.length])

  // 重置恢复默认
  const reset = useCallback(() => {
    setColumnVisibility(initialColumns)
    setOtherVisibility(initialOther)
  }, [initialColumns, initialOther])

  // 打包好供 TableControls 直接传递的属性
  const columnProps: ColumnSettingsProps = useMemo(
    () => ({
      columns,
      columnVisibility,
      onColumnVisibilityChange: setColumnVisibility,
      other,
      otherVisibility,
      onOtherVisibilityChange: setOtherVisibility,
      onReset: reset,
      isDefault,
    }),
    [columns, columnVisibility, other, otherVisibility, reset, isDefault],
  )

  return {
    /** 各列可见性映射表（true 为显示，false 为隐藏） */
    columnVisibility,
    setColumnVisibility,
    /** 扩展选项映射表 */
    otherVisibility,
    setOtherVisibility,
    /** 当前是否全为默认值 */
    isDefault,
    /** 重置恢复默认 */
    reset,
    /** 直接传递给 TableControls 的列设置属性包 */
    columnProps,
  }
}
