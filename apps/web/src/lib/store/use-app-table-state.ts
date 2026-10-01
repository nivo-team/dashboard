import { useCallback, useRef } from 'react'
import {
  useTableUiStore,
  type TableUiField,
  type TableUiState,
} from './table-ui-store'

/**
 * 把一个表格 UI 状态片段挂到「按应用隔离」的持久化 store 上。
 *
 * 用法与 `useState` 基本一致（含函数式更新），区别是：
 * - 值的命名空间是 `<tableKey>`，且整个 store 按 app 作用域分区 ——
 *   同一个表格在 Console / Analytics 下互不影响；
 * - 未写入过时用 `initial` 兜底（`initial` 只在首次渲染求值一次，可放心传函数）；
 * - 想恢复默认用 `useTableUiStore.getState().resetTable(tableKey)`。
 *
 * @param tableKey 表格的唯一标识（页面内保持稳定），如 `example/user`
 * @param field    状态片段名（`columnVisibility` / `filters` / `page` …）
 * @param initial  没有持久化值时的初始值（或惰性求值函数）
 */
export function useAppTableState<T>(
  tableKey: string,
  field: TableUiField,
  initial: T | (() => T),
): [T, (next: T | ((prev: T) => T)) => void] {
  const storedValue = useTableUiStore(
    (state) => state.tables[tableKey]?.[field] as T | undefined,
  )

  // 初始值只算一次：调用方常写成 `() => Object.fromEntries(...)`，不必每帧重算
  const initialRef = useRef<{ value: T } | null>(null)
  if (initialRef.current === null) {
    initialRef.current = {
      value: typeof initial === 'function' ? (initial as () => T)() : initial,
    }
  }

  const value = storedValue !== undefined ? storedValue : initialRef.current.value

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const store = useTableUiStore.getState()
      const current =
        (store.tables[tableKey]?.[field] as T | undefined) ??
        initialRef.current!.value
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(current) : next
      // 计算属性名写法需要断言：patch 的形状由 field 决定
      store.patchTable(tableKey, { [field]: resolved } as Partial<TableUiState>)
    },
    [tableKey, field],
  )

  return [value, setValue]
}
