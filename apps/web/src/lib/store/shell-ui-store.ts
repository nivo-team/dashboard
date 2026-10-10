import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isDesktop } from '#/desktop/bridge'

import { enableCrossTabSync } from './cross-tab-sync'

/**
 * 外壳（侧边栏）UI 偏好 store。
 *
 * 持久化**桌面端**的折叠状态与拖拽宽度，刷新后保持离开时的样子；
 * **移动端不参与**：抽屉开合由 Kumo `Sidebar.Provider` 的内部 `openMobile` 状态管理
 * （临时状态，不该跨会话保留），宽度在移动端也无意义。
 *
 * 为什么**全局**而不是按应用分区：侧边栏宽度/折叠是「外壳形态」偏好，不是数据域。
 * 若按 app 分，切应用时侧边栏会跳一下，反而打扰；两个外壳（`_main` 与 `$appId`）
 * 共用一个 store，因此在 `/settings` 收起的侧边栏，回到业务页也保持收起。
 *
 * 与 Kumo 的接线方式**统一在 `#/components/shell-sidebar-provider`**：桌面**非受控**
 * （只给 `defaultOpen` / `defaultWidth` 作初始值，用 `onOpenChange` / `onWidthChange`
 * 把变化写回这里）；移动端**受控**，`open` 跟随抽屉自己的开合 —— 否则桌面折叠态会顺着
 * Kumo 的 `state` 泄漏进移动端，抽屉里的二级菜单永远展开不出来（见那支组件与
 * `.agents/docs/store.md` §5.4）。
 */

/** 侧边栏布局常量：两个外壳共用，避免 Provider 参数各写一份而漂移。 */
export const SHELL_MOBILE_BREAKPOINT = 768
export const SIDEBAR_WIDTH = 256
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 360

/**
 * 详情预览面板（分屏形态）的宽度区间。
 *
 * 默认 480 ≈ 1440 内容区的 1/3（原始需求就是「主区域分 1/3」），可拖到 260–720。
 * 与侧边栏宽度同属「外壳形态偏好」，因此放在这个 store 而不是按应用隔离的偏好 store。
 */
export const DETAIL_PANEL_DEFAULT_WIDTH = 480
export const DETAIL_PANEL_MIN_WIDTH = 260
export const DETAIL_PANEL_MAX_WIDTH = 720

/**
 * AI 面板的宽度区间（与详情分屏面板同一套「外壳形态偏好」的存放规则）。
 *
 * 它是**挤压式分屏**而不是浮层：面板变宽 = 内容区变窄，所以默认值刻意不取满
 * （400px 只占 1440 内容区的约 28%），保证列表页还看得见主内容。
 */
export const AI_PANEL_DEFAULT_WIDTH = 400
export const AI_PANEL_MIN_WIDTH = 300
export const AI_PANEL_MAX_WIDTH = 720

/**
 * AI 浮窗（Float）的尺寸区间。
 *
 * 与分屏面板（只能拖宽度）不同，浮窗**两个方向都能拖**：宽度手柄在行首边、高度手柄在顶边，
 * 底边与行尾边是锚点。默认值就是它作为「小窗」的原始尺寸（380×560）。
 *
 * 上限有**两层**，缺一不可：
 * - 这里的静态上限（拖到底也不会盖满屏幕）；
 * - 视口给的上限 —— 浮窗贴底向上长，视口矮时必须把高度压回来，否则会顶出屏幕。
 *   视口高度只有运行时才知道，所以那层放在组件里（`AI_FLOAT_VIEWPORT_MARGIN` + `svh`），
 *   不能只靠这里的常量。
 */
export const AI_FLOAT_DEFAULT_WIDTH = 380
export const AI_FLOAT_MIN_WIDTH = 300
export const AI_FLOAT_MAX_WIDTH = 720
export const AI_FLOAT_DEFAULT_HEIGHT = 560
export const AI_FLOAT_MIN_HEIGHT = 320
export const AI_FLOAT_MAX_HEIGHT = 900

/**
 * 浮窗与视口之间必须留出的余量（px）：`bottom-4` 的 16px 贴底，加上顶部的呼吸空间。
 *
 * 拖拽的高度上限（JS，`ai-panel`）与 `max-height`（CSS，同一个内联 style）都从这个常量取值，
 * **不要再写第二个数**：两处一旦分叉，拖动到上限时面板会先停住、再被 CSS 悄悄压小。
 */
export const AI_FLOAT_VIEWPORT_MARGIN = 80

/**
 * 界面动效的总开关（默认**开**）。
 *
 * 关掉后「AI 面板」与「全屏对话页 `/$appId/sphere`」的过渡**直接切换**，不做动画
 * （判定与接入见 `#/lib/use-motion`）。
 *
 * **为什么放这个全局 store，而不是按应用分区的偏好 store**：判定原则是「这个状态换个
 * 应用还成立吗」——「要不要动效」显然成立，与侧边栏宽度同属外壳形态偏好。放全局才能做到
 * 「关一次，所有应用都不动」；放进 `admin.preferences:<appId>` 反而会被单个应用改过的
 * 存档锁住（那个键一旦写过就整份独立，收不到 `:global` 基线的后续变化）。
 *
 * 与系统 `prefers-reduced-motion` 的关系：**取更严格的那个** —— 系统要求减少动效时，
 * 即使用户把这里开着也不播动画。
 */
export const DEFAULT_MOTION_ENABLED = true

/**
 * 页面标签页（`#/lib/page-tabs`）是否启用，**默认关**。
 *
 * 它是一套「访问过的页面各占一个标签」的多标签导航，形态见 `#/lib/page-tabs`。
 * 默认关是因为它替掉顶栏的面包屑（顶栏行首那一格只有一个位置），
 * 对多数人来说面包屑比多标签更常用；想要的人去 设置 → 外观 打开。
 *
 * **桌面壳里恒开**（`isDesktop() || pageTabsEnabled`，见 `usePageTabsEnabled`）：
 * 那边窗口条上除了标签条就只剩工具区，关掉换来的是一整条空着的窗口条 ——
 * 设置项在桌面壳里因此是禁用 + 提示，不会出现「开关关着却还开着」。
 *
 * 与 `motionEnabled` 同属「换个应用还成立」的外壳形态偏好，所以放这个全局 store，
 * 而不是按应用隔离的 `admin.preferences:<appId>`。
 */
export const DEFAULT_PAGE_TABS_ENABLED = false

/**
 * 桌面端窗口毛玻璃背景开关，默认**开**。
 *
 * 仅在桌面壳环境下生效；关掉后顶栏窗口条回退为纯色实底（bg-kumo-base），不穿透桌面壁纸。
 */
export const DEFAULT_DESKTOP_BLUR_ENABLED = true

/**
 * 侧边栏折叠时的快速展开方式：
 * - `logo`：**仅悬浮在 Logo 展开**（默认）—— 鼠标悬浮在侧边栏顶部的 Logo / 品牌区域时触发临时展开；悬浮其他菜单项时不展开；
 * - `full`：**悬浮展开** —— 鼠标悬浮在侧边栏任意区域均触发临时展开；
 * - `none`：**禁止悬浮展开** —— 完全关闭悬浮临时展开，仅通过底部折叠按钮切换展开状态。
 */
export type SidebarExpandMode = 'logo' | 'full' | 'none'
export const DEFAULT_SIDEBAR_EXPAND_MODE: SidebarExpandMode = 'logo'

export function isSidebarExpandMode(value: unknown): value is SidebarExpandMode {
  return value === 'logo' || value === 'full' || value === 'none'
}

/** 拖拽期间的写盘节流：`onWidthChange` 每帧都会触发，同步写 localStorage 会卡。 */
const WIDTH_PERSIST_DELAY_MS = 200

interface ShellUiState {
  /** 桌面端侧边栏是否展开 */
  sidebarOpen: boolean
  /** 桌面端侧边栏宽度（px） */
  sidebarWidth: number
  /** 折叠状态下的侧边栏快速展开方式 */
  sidebarExpandMode: SidebarExpandMode
  /** 详情预览面板（分屏形态）的宽度（px） */
  detailPanelWidth: number
  /** AI 面板的宽度（px） */
  aiPanelWidth: number
  /** AI 浮窗（Float）的宽度（px） */
  aiFloatWidth: number
  /** AI 浮窗（Float）的高度（px） */
  aiFloatHeight: number
  /** 界面动效总开关（默认开；关掉后 AI 面板与全屏对话页的过渡直接切换） */
  motionEnabled: boolean
  /** 页面标签页开关（默认关；桌面壳里恒开，见 `DEFAULT_PAGE_TABS_ENABLED`） */
  pageTabsEnabled: boolean
  /** 桌面端窗口毛玻璃背景开关（默认开；关掉后顶栏窗口条回退为实底） */
  desktopBlurEnabled: boolean
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  setSidebarExpandMode: (mode: SidebarExpandMode) => void
  setDetailPanelWidth: (width: number) => void
  setAiPanelWidth: (width: number) => void
  setMotionEnabled: (enabled: boolean) => void
  setPageTabsEnabled: (enabled: boolean) => void
  setDesktopBlurEnabled: (enabled: boolean) => void
  /**
   * 浮窗的两个方向一起写。
   *
   * **不给宽高各开一个 setter**：拖角手柄时两者是同一帧里的一次调整，
   * 分两次 `set` 会多触发一轮订阅（也更容易漏掉其中一个）。
   */
  setAiFloatSize: (width: number, height: number) => void
}

type PersistedShellUi = Pick<
  ShellUiState,
  | 'sidebarOpen'
  | 'sidebarWidth'
  | 'sidebarExpandMode'
  | 'detailPanelWidth'
  | 'aiPanelWidth'
  | 'aiFloatWidth'
  | 'aiFloatHeight'
  | 'motionEnabled'
  | 'pageTabsEnabled'
  | 'desktopBlurEnabled'
>

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

export function clampDetailPanelWidth(width: number): number {
  return Math.min(DETAIL_PANEL_MAX_WIDTH, Math.max(DETAIL_PANEL_MIN_WIDTH, Math.round(width)))
}

export function clampAiPanelWidth(width: number): number {
  return Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, Math.round(width)))
}

export function clampAiFloatWidth(width: number): number {
  return Math.min(AI_FLOAT_MAX_WIDTH, Math.max(AI_FLOAT_MIN_WIDTH, Math.round(width)))
}

export function clampAiFloatHeight(height: number): number {
  return Math.min(AI_FLOAT_MAX_HEIGHT, Math.max(AI_FLOAT_MIN_HEIGHT, Math.round(height)))
}

export const useShellUiStore = create<ShellUiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarWidth: SIDEBAR_WIDTH,
      sidebarExpandMode: DEFAULT_SIDEBAR_EXPAND_MODE,
      detailPanelWidth: DETAIL_PANEL_DEFAULT_WIDTH,
      aiPanelWidth: AI_PANEL_DEFAULT_WIDTH,
      aiFloatWidth: AI_FLOAT_DEFAULT_WIDTH,
      aiFloatHeight: AI_FLOAT_DEFAULT_HEIGHT,
      motionEnabled: DEFAULT_MOTION_ENABLED,
      pageTabsEnabled: DEFAULT_PAGE_TABS_ENABLED,
      desktopBlurEnabled: DEFAULT_DESKTOP_BLUR_ENABLED,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: clampSidebarWidth(sidebarWidth) }),
      setSidebarExpandMode: (sidebarExpandMode) => set({ sidebarExpandMode }),
      setDetailPanelWidth: (detailPanelWidth) =>
        set({ detailPanelWidth: clampDetailPanelWidth(detailPanelWidth) }),
      setAiPanelWidth: (aiPanelWidth) => set({ aiPanelWidth: clampAiPanelWidth(aiPanelWidth) }),
      setAiFloatSize: (width, height) =>
        set({
          aiFloatWidth: clampAiFloatWidth(width),
          aiFloatHeight: clampAiFloatHeight(height),
        }),
      setMotionEnabled: (motionEnabled) => set({ motionEnabled }),
      setPageTabsEnabled: (pageTabsEnabled) => set({ pageTabsEnabled }),
      setDesktopBlurEnabled: (desktopBlurEnabled) => set({ desktopBlurEnabled }),
    }),
    {
      name: 'admin.shell-ui',
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state): PersistedShellUi => ({
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        sidebarExpandMode: state.sidebarExpandMode,
        detailPanelWidth: state.detailPanelWidth,
        aiPanelWidth: state.aiPanelWidth,
        aiFloatWidth: state.aiFloatWidth,
        aiFloatHeight: state.aiFloatHeight,
        motionEnabled: state.motionEnabled,
        pageTabsEnabled: state.pageTabsEnabled,
        desktopBlurEnabled: state.desktopBlurEnabled,
      }),
      /**
       * 旧存档没有 `detailPanelWidth` / `aiPanelWidth`（后续新增）—— 缺失或非法一律回落
       * 默认值，否则 `undefined` 会被当成宽度写进 `style.width`（渲染成 `width: undefinedpx`）。
       * `aiFloatWidth` / `aiFloatHeight` 同理（浮窗可拖拽尺寸是更后面才加的）；
       * `sidebarExpandMode`：缺失或非法回落到默认值 `logo`；
       * `motionEnabled` 是布尔：只认 boolean，缺失时回落到**默认开**（升级用户不该突然没动画）。
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedShellUi>
        return {
          ...current,
          sidebarOpen:
            typeof saved.sidebarOpen === 'boolean' ? saved.sidebarOpen : current.sidebarOpen,
          sidebarWidth:
            typeof saved.sidebarWidth === 'number' && Number.isFinite(saved.sidebarWidth)
              ? clampSidebarWidth(saved.sidebarWidth)
              : current.sidebarWidth,
          sidebarExpandMode: isSidebarExpandMode(saved.sidebarExpandMode)
            ? saved.sidebarExpandMode
            : current.sidebarExpandMode,
          detailPanelWidth:
            typeof saved.detailPanelWidth === 'number' && Number.isFinite(saved.detailPanelWidth)
              ? clampDetailPanelWidth(saved.detailPanelWidth)
              : current.detailPanelWidth,
          aiPanelWidth:
            typeof saved.aiPanelWidth === 'number' && Number.isFinite(saved.aiPanelWidth)
              ? clampAiPanelWidth(saved.aiPanelWidth)
              : current.aiPanelWidth,
          aiFloatWidth:
            typeof saved.aiFloatWidth === 'number' && Number.isFinite(saved.aiFloatWidth)
              ? clampAiFloatWidth(saved.aiFloatWidth)
              : current.aiFloatWidth,
          aiFloatHeight:
            typeof saved.aiFloatHeight === 'number' && Number.isFinite(saved.aiFloatHeight)
              ? clampAiFloatHeight(saved.aiFloatHeight)
              : current.aiFloatHeight,
          motionEnabled:
            typeof saved.motionEnabled === 'boolean' ? saved.motionEnabled : current.motionEnabled,
          /* 标签页是布尔：只认 boolean，缺失时回落到**默认关**（升级用户不该突然多出一条标签栏） */
          pageTabsEnabled:
            typeof saved.pageTabsEnabled === 'boolean'
              ? saved.pageTabsEnabled
              : current.pageTabsEnabled,
          desktopBlurEnabled:
            typeof saved.desktopBlurEnabled === 'boolean'
              ? saved.desktopBlurEnabled
              : current.desktopBlurEnabled,
        }
      },
    },
  ),
)

/**
 * 当前是否桌面视口（与 Provider 的 `mobileBreakpoint` 一致）。
 *
 * 桌面壳（isDesktop）恒为 true，保证小窗口缩放下依然持久化外壳状态；
 * 浏览器视口则由媒体查询根据 SHELL_MOBILE_BREAKPOINT 判定。
 */
export function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return false
  if (isDesktop()) return true
  return window.matchMedia(`(min-width: ${SHELL_MOBILE_BREAKPOINT}px)`).matches
}

/** 记录桌面端折叠状态。 */
export function persistSidebarOpen(open: boolean) {
  if (!isDesktopViewport()) return
  useShellUiStore.getState().setSidebarOpen(open)
}

let widthTimer: number | null = null

/** 记录桌面端拖拽宽度（节流，拖拽结束时的那次一定会落盘）。 */
// 多标签页同步：侧边栏宽度 / 折叠状态 / 分屏宽度跟着其它标签页走（移动端本来就不写盘）
enableCrossTabSync(useShellUiStore, { storageName: 'admin.shell-ui' })

export function persistSidebarWidth(width: number) {
  if (!isDesktopViewport()) return
  if (widthTimer !== null) window.clearTimeout(widthTimer)
  widthTimer = window.setTimeout(() => {
    widthTimer = null
    useShellUiStore.getState().setSidebarWidth(width)
  }, WIDTH_PERSIST_DELAY_MS)
}

/**
 * 记录详情预览面板的拖拽宽度。
 *
 * **刻意不加节流**（与侧边栏宽度不同）：调用方是把「拖动结束 / 键盘每次按键」
 * 作为写入时机（`usePanelResize` 的 `onCommit`），一次调整只写一次；
 * 拖动过程中的跟手是组件本地状态的事。若在这里再套一层节流，
 * 只会让松手后的落盘时机变得不确定，而不会省下任何写盘次数。
 *
 * 仍保留与侧边栏一致的**移动端不记录**：分屏本来就只在桌面端存在。
 */
export function persistDetailPanelWidth(width: number) {
  if (!isDesktopViewport()) return
  useShellUiStore.getState().setDetailPanelWidth(width)
}

/**
 * 记录 AI 面板的拖拽宽度。约定与详情面板完全一致：调用方以 `onCommit` 为写入时机
 * （一次拖动 / 一次按键只写一次），因此这里不再套节流；移动端不记录（移动端是覆盖式，
 * 不存在可拖拽的宽度）。
 */
export function persistAiPanelWidth(width: number) {
  if (!isDesktopViewport()) return
  useShellUiStore.getState().setAiPanelWidth(width)
}

/**
 * 记录 AI 浮窗的拖拽尺寸。约定同上：以 `onCommit` 为写入时机（一次拖动 / 一次按键只写一次）。
 *
 * 存档里就是**用户当时看到的那一档**（可能已被视口上限压小）：把「拖到的值」与「看到的值」
 * 分开存，等用户换到大屏幕时会莫名其妙弹成存档里那个更大的值。
 */
export function persistAiFloatSize(size: { width: number; height: number }) {
  if (!isDesktopViewport()) return
  useShellUiStore.getState().setAiFloatSize(size.width, size.height)
}
