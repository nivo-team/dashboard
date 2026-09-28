import { Button, Dialog } from '@cloudflare/kumo'
import { ArrowsOutIcon, XIcon } from '@phosphor-icons/react'
import { useLocation } from '@tanstack/react-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CONTENT_PANEL_FRAME,
  SidePanelResizeHandle,
} from '#/components/side-panel'
import { cn } from '#/lib/cn'
import { pageContentWidthClass } from '#/lib/page-width'
import {
  DETAIL_PANEL_MAX_WIDTH,
  DETAIL_PANEL_MIN_WIDTH,
  persistDetailPanelWidth,
  usePreferencesStore,
  useShellUiStore,
} from '#/lib/store'
import type { DetailOpenMode } from '#/lib/store'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { usePanelResize } from '#/lib/use-panel-resize'
import { useLocale } from '#/lib/use-locale'

/**
 * 详情预览浮层：「表格点开详情但不离开当前页」的通用能力。
 *
 * 两种桌面端形态（由 `admin.preferences:<appId>` 的 `detailOpenMode` 决定）：
 * - **分屏（split）**：主内容缩到 2/3，行尾侧 1/3 内嵌详情，两边各自滚动 ——
 *   列表与详情同屏可见，适合「边翻列表边看详情」；
 * - **抽屉（sheet）**：详情从行尾侧滑出、覆盖在主内容之上，带遮罩、Esc 可关 ——
 *   适合「只想快速瞥一眼，看完就关」。
 *
 * 三个共同约定（业务模块接入时只需要记住这三条）：
 * 1. **不复用路由**：面板里渲染的是业务方通过 `render` 传进来的**详情组件**，
 *    因此详情页与预览面板天然是同一份 UI（同一组件、同一份数据取数逻辑）；
 * 2. **「展开」= 离开预览**：面板头部的展开按钮先关闭浮层，再执行调用方给的
 *    `onExpand`（通常就是一次 `navigate` 到详情路由），两者不会同时存在；
 * 3. **移动端一律降级**：视口窄于外壳断点时 `open()` 直接走 `onExpand`，
 *    不会出现「分屏挤成一列」或「抽屉遮住全部内容」的中间态。
 *
 * Provider 同时承担**布局职责**：它把路由内容包成 flex 主列，分屏面板作为行尾侧列
 * 渲染在同一行里（这是「挤压式分屏」而不是 overlay 的关键）；抽屉走 Kumo Dialog
 * 的 portal，不受这个 flex 容器影响。
 */

/** 预览形态：与偏好里的 `DetailOpenMode` 相比去掉了 `page`（那不是浮层）。 */
export type DetailPreviewVariant = 'split' | 'sheet'

/** `render` 收到的上下文。 */
export interface DetailPreviewRenderArgs {
  /** 实际采用的形态，详情组件据此调整排版（如隐藏自带页头、压缩间距） */
  variant: DetailPreviewVariant
  /** 关闭浮层（例如详情内容里的「取消」按钮） */
  close: () => void
}

export interface DetailPreviewRequest {
  /**
   * 内容标识（如 `uid`）。作用有二：换对象时 React 会重建主体、滚动位置自然复位；
   * 业务方也可用 `useDetailPreview().activeKey` 高亮当前正在预览的那一行。
   */
  key: string
  /** 面板标题：通常是被查看对象的名称 */
  title: ReactNode
  /** 标题下的次要信息（建议用等宽 ID） */
  description?: ReactNode
  /** 点击「展开」要去的地方：**由调用方负责导航**，Provider 只管关浮层 */
  onExpand: () => void
  /** 面板主体：复用详情组件 */
  render: (args: DetailPreviewRenderArgs) => ReactNode
}

interface DetailPreviewContextValue {
  /** 实际生效的打开方式（移动端已被降级为 `page`） */
  mode: DetailOpenMode
  /** 浮层当前是否展示 */
  isOpen: boolean
  /** 正在预览的对象 key；未展示时为 null */
  activeKey: string | null
  /** 打开预览：按 `mode` 分流（`page` 或移动端 → 直接 `onExpand`） */
  open: (request: DetailPreviewRequest) => void
  /** 关闭预览 */
  close: () => void
}

const DetailPreviewContext = createContext<DetailPreviewContextValue | null>(null)

/**
 * 抽屉（sheet）的样式覆盖（**不含水平定位**，那部分见下面的 `sheetPositionStyle`）。
 *
 * Kumo 没有 sheet 组件，`Dialog` 是**居中模态**，这里用 `cn` 把它改造成行尾侧滑面板 ——
 * 只覆盖与圆角 / 尺寸 / 动画相关的类；遮罩层（backdrop）、Esc 关闭、焦点陷阱、
 * 滚动锁定仍然由 Kumo 的 Dialog（Base UI）负责，不自己手写。
 *
 * Kumo 内部也是用 tailwind-merge（cnfast）合并 `cn(默认类, 调用方 className)`，
 * 所以这里的同组类会**顶掉**默认值，而不是叠加：
 * - `top-8 sm:top-16` → 贴顶；
 * - `w-full max-w-[calc(100vw-2rem)] sm:w-96` → 固定 28rem、窄屏占满；
 * - `rounded-xl` → 直角（同组 `rounded-none` 顶掉），贴边全高面板不留圆角；
 * - `-translate-x-1/2` → `translate-x-0`（默认那半个身位的偏移是配合 `left-1/2` 居中的）；
 * - `data-starting-style:scale-90` / `data-ending-style:scale-90` → 换成从未尾侧滑入滑出。
 *
 * **水平定位（`left` / `right`）刻意不在这里**：默认类的 `left-1/2` 是**物理**属性，
 * 用逻辑属性（`end-0`）去表达「贴行尾」会在 RTL 下与它争抢同一个物理属性而翻车 ——
 * 完整成因见 `sheetPositionStyle` 的注释。
 *
 * 动画属性必须走 `style` 覆盖：Kumo 把 `transitionProperty: 'scale, opacity'` 写在
 * **内联样式**里，className 顶不掉它（内联优先级更高），而 `DialogContent` 的 style
 * 是 `{...默认, ...调用方}`，因此调用方能覆盖。
 *
 * RTL 下从另一侧滑入：CSS 的 `translate` 是物理方向，而 Tailwind 的 `rtl:` 变体
 * 被包在 `:where(...)` 里、特异性为 0，与 `data-starting-style:*` 同特异性 ——
 * 靠源码顺序或 important 都不干净。因此这里只挂一个钩子类 `detail-preview-sheet`，
 * 由 `src/styles.css` 里 `[dir='rtl'] .detail-preview-sheet[data-*] ` 那条规则
 * （特异性更高）负责反向位移。
 */
const SHEET_CLASSES = cn(
  // 钩子类：只给 styles.css 的 RTL 方向规则做锚点，本身不带任何样式
  'detail-preview-sheet',
  // 定位（left / right）**不在这里写**，见 sheetPositionStyle：必须在内联样式里用物理属性表达
  'top-0 h-svh max-h-svh w-full max-w-none',
  'rounded-none p-0',
  'sm:top-0 sm:w-[28rem] sm:max-w-[90vw]',
  'translate-x-0',
  'data-starting-style:scale-100 data-starting-style:opacity-100',
  'data-ending-style:scale-100 data-ending-style:opacity-100',
  'data-starting-style:translate-x-full data-ending-style:translate-x-full',
)

/**
 * 抽屉的水平定位（内联样式，优先级最高）。
 *
 * **这里踩过一次 RTL 的坑，别再改回逻辑属性**：Kumo 的默认类把弹层定位写死成物理的
 * `left-1/2`（居中）。最初用 `left-auto` 顶掉它、再配 `end-0`（`inset-inline-end`）
 * 来表达「贴行尾」，LTR 下没问题 —— `left-auto` 管左侧、`end-0` 解析成 `right: 0`。
 * 但 **RTL 下 `end-0` 解析成的正是 `left: 0`**，与 `left-auto` 争抢同一个物理属性，
 * 谁赢只看 Tailwind 生成的 CSS 顺序（实际是 `left-auto` 赢）；于是 `left` / `right`
 * 双双为 auto，弹层退回 static position，又按 RTL 包含块的块级盒过约束解贴到了**右侧**
 * —— 表现就是「切到阿拉伯语后抽屉仍然靠右」。
 *
 * 用内联物理属性 + 显式方向判断后，这条路径与 CSS 顺序、与 `inset-inline-*` 的解析
 * 都无关了（内联样式优先级最高，物理属性也不受 `direction` 影响）。
 */
function sheetPositionStyle(isRtl: boolean) {
  return {
    left: isRtl ? 0 : ('auto' as const),
    right: isRtl ? ('auto' as const) : 0,
    transitionProperty: 'translate, opacity',
  }
}

/**
 * 主内容列的 padding 与宽度约束 —— **从 `AppShell` 的 `<main>` 原样搬过来的**。
 *
 * 搬家的原因：分屏面板要贴边满高，main 上不能再留 padding；但主内容的观感不能变，
 * 所以起始侧与纵向的档位逐字保留（`ps` / `py` 三档），只把**行尾侧**单独拆出来 ——
 * 分屏时那一侧已经紧邻拖拽手柄与面板，收一档才不会在两者之间留出 48px 的空档。
 */
const MAIN_COLUMN_CLASSES =
  'min-w-0 flex-1 ps-4 py-4 md:ps-6 md:py-5 lg:ps-8 lg:py-6'
/** 行尾侧内边距：面板关闭时与起始侧对称 */
const MAIN_COLUMN_END_PADDING = 'pe-4 md:pe-6 lg:pe-8'
/** 行尾侧内边距：面板打开时收一档（手柄自身已经占掉一段视觉间距） */
const MAIN_COLUMN_END_PADDING_SPLIT = 'pe-4 md:pe-6 lg:pe-6'

export function DetailPreviewProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { isRtl } = useLocale()
  const configuredMode = usePreferencesStore((state) => state.detailOpenMode)
  /**
   * 页面宽度偏好：`boxed` 时主列收在 1440px 内居中，`full` 时铺满（`设置 → 外观 → 页面宽度`）。
   * 与 `MainLayout` 的 `<main>` 共用 `#/lib/page-width` 的同一份类名，两个外壳不会各自为政。
   */
  const pageWidth = usePreferencesStore((state) => state.pageWidth)
  const isMobile = useIsMobileViewport()
  const location = useLocation()

  const [request, setRequest] = useState<DetailPreviewRequest | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  /**
   * 分屏宽度：**持久化值在 `admin.shell-ui`（与侧边栏宽度同源），拖动中的即时值在本组件**。
   *
   * 两个值必须分开：`onChange` 每帧触发，直接写 store 会让 zustand persist 每帧写一次
   * localStorage（拖动卡顿）；而给 store 写入加节流又会让面板滞后几百毫秒才跟手。
   * 所以拖动只改本地 state，松手 / 每次键盘调整再由 `onCommit` 落盘一次。
   */
  const storedPanelWidth = useShellUiStore((state) => state.detailPanelWidth)
  const [panelWidth, setPanelWidth] = useState(storedPanelWidth)
  const panelRef = useRef<HTMLElement | null>(null)

  /** store 变化（其它标签页拖动、或存档水合）时把即时值拉平 */
  useEffect(() => {
    setPanelWidth(storedPanelWidth)
  }, [storedPanelWidth])

  /**
   * 拖拽手柄。`side` 必须是**物理侧**：RTL 下面板贴在左侧，拖拽方向与方向键语义都要跟着翻。
   */
  const { handleProps: resizeHandleProps } = usePanelResize({
    side: isRtl ? 'left' : 'right',
    min: DETAIL_PANEL_MIN_WIDTH,
    max: DETAIL_PANEL_MAX_WIDTH,
    width: panelWidth,
    onChange: setPanelWidth,
    onCommit: persistDetailPanelWidth,
    panelRef,
  })

  /** 移动端不支持任何浮层：整体降级为跳转详情页（见文件头注释第 3 条）。 */
  const mode: DetailOpenMode = isMobile ? 'page' : configuredMode

  const close = useCallback(() => setIsOpen(false), [])

  const open = useCallback(
    (next: DetailPreviewRequest) => {
      if (mode === 'page') {
        next.onExpand()
        return
      }
      setRequest(next)
      setIsOpen(true)
    },
    [mode],
  )

  /**
   * 路由一旦变化（点侧边栏、面包屑、浏览器前进后退），浮层里挂的就不再是当前页面的对象，
   * 直接收掉。用 ref 跳过首次渲染 —— 挂载时本来就没有浮层，不需要「关闭」。
   */
  const lastHrefRef = useRef<string | null>(null)
  useEffect(() => {
    if (lastHrefRef.current === null) {
      lastHrefRef.current = location.href
      return
    }
    if (lastHrefRef.current !== location.href) {
      lastHrefRef.current = location.href
      setIsOpen(false)
    }
  }, [location.href])

  /** 偏好被改成「跳转详情页」（或在设置页把视口拖窄）时，已打开的浮层要跟着收掉。 */
  useEffect(() => {
    if (mode === 'page') setIsOpen(false)
  }, [mode])

  /** 「展开」：先关浮层再导航，避免路由切换与浮层关闭两个动画叠在一起。 */
  const handleExpand = useCallback(() => {
    setIsOpen(false)
    request?.onExpand()
  }, [request])

  const value = useMemo<DetailPreviewContextValue>(
    () => ({
      mode,
      isOpen,
      activeKey: isOpen ? (request?.key ?? null) : null,
      open,
      close,
    }),
    [mode, isOpen, request, open, close],
  )

  const variant: DetailPreviewVariant = mode === 'sheet' ? 'sheet' : 'split'
  const showSplit = isOpen && variant === 'split'

  return (
    <DetailPreviewContext.Provider value={value}>
      {/*
        挤压式分屏：路由内容与预览面板同处一个 flex 行。
        面板宽度由 `admin.shell-ui.detailPanelWidth` 决定（默认 480 ≈ 1/3，可拖到 260–720），
        主内容吃掉剩余空间，因此面板变宽 = 主内容变窄（真正的「分屏」）。

        **padding 在这里分别发给两列**（外层 main 已经不带 padding，见 app-shell.tsx）：
        主列沿用从 main 搬过来的那一套，面板列自己不带外 padding ——
        它内部由 header / 内容区各自设置，面板才能贴住视口右缘与底部、满高成列。
      */}
      <div
        data-detail-preview-layout
        className="flex min-w-0 flex-1 items-start"
      >
        <div
          data-detail-preview-main
          className={cn(
            MAIN_COLUMN_CLASSES,
            showSplit ? MAIN_COLUMN_END_PADDING_SPLIT : MAIN_COLUMN_END_PADDING,
            // 宽度约束只在没有面板时生效 —— 分屏时主列只占行首一段，再居中收窄会留出空档
            !showSplit && pageContentWidthClass(pageWidth),
          )}
        >
          {children}
        </div>

        {showSplit && request ? (
          <>
            {/*
              拖拽手柄：几何与交互见 `#/components/side-panel`（与 AI 面板共用同一份）。
              它靠两侧负边距做到「占位为 0」—— 主列与面板因此严丝合缝，
              8px 的手柄以中心骑在面板那条 `border-s` 上。
            */}
            <SidePanelResizeHandle
              label={t('detailPreview.resize', '调整预览宽度')}
              handleProps={resizeHandleProps}
              frame={CONTENT_PANEL_FRAME}
            />

            <aside
              ref={panelRef}
              // 宽度走内联 px；`max-w` 是窄视口兜底（保证主内容至少 320px），
              // 被压缩时拖拽起点由实测宽度修正，不会跳。
              //
              // 观感是一条**贴边满高的列**而不是卡片：无 ring、无圆角、无外 padding，
              // 与主内容之间只有一条 `border-s` 分隔线（逻辑属性，RTL 自动镜像到另一侧）。
              style={{ width: panelWidth }}
              className={cn(
                'sticky hidden max-w-[calc(100%_-_320px)] shrink-0 border-s border-kumo-line bg-kumo-base md:block',
                CONTENT_PANEL_FRAME,
              )}
            >
              <DetailPreviewSurface
                // key 变化时重建主体：滚动位置与内部临时状态一并复位
                key={request.key}
                request={request}
                variant="split"
                onClose={close}
                onExpand={handleExpand}
              />
            </aside>
          </>
        ) : null}
      </div>

      {/*
        抽屉常驻挂载、只用 `open` 控制显隐：Kumo（Base UI）的 Dialog 靠
        data-starting-style / data-ending-style 属性驱动进出场动画，
        条件渲染会把关闭动画整段丢掉。
      */}
      <Dialog.Root
        open={isOpen && variant === 'sheet'}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        {/*
          注意：Kumo 的 `Dialog` 只接收 className / style / size / container，
          其余 props 不会透传到弹层元素上（`aria-label` 之类传了也没用）。
          可访问名称因此由下面的 `Dialog.Title` 提供。
        */}
        <Dialog
          className={SHEET_CLASSES}
          style={sheetPositionStyle(isRtl)}
        >
          {/*
            Base UI 的 Dialog 要求有可访问名称；这里放一个读屏可见的标题，
            视觉上的标题仍由 DetailPreviewSurface 渲染（两处不需要保持一致）。
          */}
          <Dialog.Title className="sr-only">
            {typeof request?.title === 'string'
              ? request.title
              : t('detailPreview.ariaLabel', '详情预览')}
          </Dialog.Title>
          {request && variant === 'sheet' ? (
            <DetailPreviewSurface
              key={request.key}
              request={request}
              variant="sheet"
              onClose={close}
              onExpand={handleExpand}
            />
          ) : null}
        </Dialog>
      </Dialog.Root>
    </DetailPreviewContext.Provider>
  )
}

/**
 * 读取详情预览能力。
 *
 * ```tsx
 * const preview = useDetailPreview()
 * const openDetail = (row) =>
 *   preview.open({
 *     key: String(row.id),
 *     title: row.nickname,
 *     onExpand: () => navigate({ to: '/$appId/users/user/$id', params: { appId, id: String(row.id) } }),
 *     render: ({ variant }) => <UserDetailView id={String(row.id)} variant={variant} />,
 *   })
 * ```
 */
export function useDetailPreview(): DetailPreviewContextValue {
  const value = useContext(DetailPreviewContext)
  if (!value) {
    throw new Error('useDetailPreview 必须在 <DetailPreviewProvider> 内使用')
  }
  return value
}

/** 预览面板的骨架：头部（标题 + 展开 + 关闭）固定，主体独立滚动。 */
function DetailPreviewSurface({
  request,
  variant,
  onClose,
  onExpand,
}: {
  request: DetailPreviewRequest
  variant: DetailPreviewVariant
  onClose: () => void
  onExpand: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col bg-kumo-base',
        // 抽屉与分屏面板都被外层撑成一屏高（h-svh / h-[...]），这里跟随父级即可
        'h-full',
      )}
    >
      {/*
        面板内部**自己管 padding**（外层 aside / Dialog 都不带）：
        header 与内容区各自内缩，所以分隔线能通到面板两侧边缘，看起来是一整列而不是被包起来的卡片。
      */}
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-kumo-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-kumo-default">
            {request.title}
          </p>
          {request.description ? (
            <p className="mt-0.5 truncate font-mono text-xs text-kumo-subtle">
              {request.description}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            onClick={onExpand}
            aria-label={t('detailPreview.expand', '展开')}
          >
            {/* 展开 = 进入详情页：语义是「放大到整页」，RTL 下图标需镜像 */}
            <ArrowsOutIcon size={16} className="rtl-flip" />
          </Button>
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            onClick={onClose}
            aria-label={t('detailPreview.close', '关闭预览')}
          >
            <XIcon size={16} />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {request.render({ variant, close: onClose })}
      </div>
    </div>
  )
}
