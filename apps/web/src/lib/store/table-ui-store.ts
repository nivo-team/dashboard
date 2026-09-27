import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerScopedStore } from './app-scope'
import { enableCrossTabSync } from './cross-tab-sync'
import { createScopedJSONStorage } from './scoped-storage'

/**
 * 单个表格的 UI 状态（per-app 持久化）。
 *
 * 这些状态**按应用隔离**：同一个表格在 Console 与 Analytics 下各存一份，
 * 切应用不会互相覆盖，切回来仍是上次的样子。
 *
 * 存的是「用户可以调、调完希望留住」的东西：
 * 列设置、扩展显示选项、筛选条件、排序、分页；
 * **不存**行选择（`rowSelection`）这类随会话生灭的临时状态。
 */
export interface TableUiState {
  /** 列显隐（key 为列 id） */
  columnVisibility?: Record<string, boolean>
  /** 扩展显示选项（如「显示全名」） */
  otherVisibility?: Record<string, boolean>
  /** 排序（TanStack SortingState 形态，读取方自行断言） */
  sorting?: unknown
  /** 高级筛选条件（各页面自定义形态，需可 JSON 往返） */
  filters?: unknown
  /** 当前页码 */
  page?: number
  /** 每页条数 */
  pageSize?: number
}

export type TableUiField = keyof TableUiState

interface TableUiStore {
  /** 表格 key → 状态片段（key 由调用方给定，如 `users/user`） */
  tables: Record<string, TableUiState>
  patchTable: (tableKey: string, patch: Partial<TableUiState>) => void
  /** 清除某个表格的全部持久化状态（恢复默认） */
  resetTable: (tableKey: string) => void
  resetAll: () => void
}

type PersistedTableUi = Pick<TableUiStore, 'tables'>

/**
 * 表格 UI 状态 store。
 *
 * storage 是**作用域化**的（`#/lib/store/scoped-storage`）：
 * 实际写入 `admin.table-ui:<appId>`，因此不同应用物理隔离。
 */
export const useTableUiStore = create<TableUiStore>()(
  persist(
    (set) => ({
      tables: {},
      patchTable: (tableKey, patch) =>
        set((state) => ({
          tables: {
            ...state.tables,
            [tableKey]: { ...state.tables[tableKey], ...patch },
          },
        })),
      resetTable: (tableKey) =>
        set((state) => {
          const next = { ...state.tables }
          delete next[tableKey]
          return { tables: next }
        }),
      resetAll: () => set({ tables: {} }),
    }),
    {
      name: 'admin.table-ui',
      storage: createScopedJSONStorage<PersistedTableUi>(),
      partialize: (state): PersistedTableUi => ({ tables: state.tables }),
    },
  ),
)

// 切换应用时重新水合：storage 键会换成 `admin.table-ui:<新 appId>`，
// localStorage 是同步 storage，rehydrate 同步完成，不会读到上一个应用的数据。
registerScopedStore('table-ui', () => {
  void useTableUiStore.persist.rehydrate()
})

// 多标签页同步：列设置 / 筛选 / 分页在其它标签页改动后跟随
enableCrossTabSync(useTableUiStore, {
  storageName: 'admin.table-ui',
  scoped: true,
})

