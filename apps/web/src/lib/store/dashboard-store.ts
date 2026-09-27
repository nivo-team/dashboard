import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createDefaultLayout,
  normalizeLayout,
  type DashboardLayout,
} from '../dashboard-layout'
import { registerScopedStore } from './app-scope'
import { enableCrossTabSync } from './cross-tab-sync'
import { createScopedJSONStorage } from './scoped-storage'

/**
 * 仪表盘布局 store（**按应用隔离**持久化）。
 *
 * 存储键：`admin.dashboard:<appId>` —— 与表格 UI（`admin.table-ui:<appId>`）
 * 同一套 scoped storage，因此 Console 与 Analytics 各存一份布局，切回来还是上次的样子。
 *
 * ### 为什么只按应用分区、不按登录用户分区（刻意的取舍）
 *
 * 同一浏览器换账号登录时，两个账号会共用 `:<appId>` 这一个键 —— 也就是说
 * **后登录的账号会看到前一个账号的布局，改了就覆盖**。没有加用户维度的原因：
 * 1. 本仓库所有 per-app 状态（表格列设置、筛选、分页）都是同一粒度，
 *    单独给仪表盘加一层用户维度会让存储键出现两套规则，排查问题时更容易误判；
 * 2. 加它需要给 `scoped-storage` 与 `cross-tab-sync` 同时引入「第二段作用域」，
 *    并让认证 store 在**同一应用内换账号**时也广播一次 rehydrate ——
 *    这是基础设施级改动，应当独立评估，不该夹在「先做三张静态卡片」这一步里。
 *
 * 若将来确实需要（例如多人共用一台运营机），改造点是明确的两处：
 * `createScopedJSONStorage` 增加可选段落回调、`cross-tab-sync` 的 `matches` 用同一拼接函数。
 *
 * ### 为什么 `layout` 允许为 `null`
 *
 * `null` = **用户从未自定义过**，页面据此用 `createDefaultLayout()`。
 * 若用默认布局直接初始化 store，每个新用户第一次打开页面就会被写一份存档，
 * 以后想调整「默认长什么样」时，所有老用户都还停在旧的那份上。
 */
export const DASHBOARD_STORAGE_KEY = 'admin.dashboard'

interface DashboardState {
  /** 用户自定义的布局；`null` 表示从未自定义（页面回落默认布局）。 */
  layout: DashboardLayout | null
  /** 写入整份布局（写入前规范化：越界 / 重叠 / 非法档位都会被收敛）。 */
  setLayout: (layout: DashboardLayout) => void
  /** 清除自定义，回到默认布局。 */
  resetLayout: () => void
}

type PersistedDashboard = Pick<DashboardState, 'layout'>

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      layout: null,
      setLayout: (layout) => set({ layout: normalizeLayout(layout) }),
      resetLayout: () => set({ layout: null }),
    }),
    {
      name: DASHBOARD_STORAGE_KEY,
      // 不继承 `:global` 基线：仪表盘布局是数据域状态，不是「本机偏好」，
      // 登录页/应用选择页没有仪表盘，也就没有可继承的东西。
      storage: createScopedJSONStorage<PersistedDashboard>(),
      partialize: (state): PersistedDashboard => ({ layout: state.layout }),
      /** 存档可能来自旧版本或被手工改坏：这里逐项规范化，而不是原样送进渲染。 */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedDashboard>
        return {
          ...current,
          layout: saved.layout == null ? null : normalizeLayout(saved.layout),
        }
      },
    },
  ),
)

// 切换应用时从 `admin.dashboard:<新 appId>` 重新水合
registerScopedStore('dashboard', () => {
  void useDashboardStore.persist.rehydrate()
})

// 多标签页同步：另一个标签页调整了布局，本页立即跟随
enableCrossTabSync(useDashboardStore, {
  storageName: DASHBOARD_STORAGE_KEY,
  scoped: true,
})

/** 非 React 上下文读取当前应用的布局（未自定义时给默认布局的副本）。 */
export function getDashboardLayout(): DashboardLayout {
  return useDashboardStore.getState().layout ?? createDefaultLayout()
}
