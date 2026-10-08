import { cn } from '#/lib/cn'

/**
 * 通用「应用外壳缩略图」：用一层层 `div` 拼出的**极简应用截图**。
 *
 * 它不加载任何真实数据、也不参与交互，只回答一个问题 ——「这套界面长什么样」。
 * 目前三处用途都在设置页：
 * - 「调色盘」行（`/settings/appearance`）：展示强调色落在哪些位置（logo 描边、侧栏选中项、表头操作、状态块）；
 * - 「详情打开方式」行（`/settings/appearance`）：悬浮某个分段选项时，在浮层里演示**选了这一项之后页面会怎么变**
 *   （主列被挤压 / 被覆盖 / 整块换成详情页）；
 * - 「AI 打开方式」行（`/settings/AI`）：演示 Ask AI 面板的两种形态 —— 与侧边栏同级的整屏高列、
 *   还是行尾侧下角从底部弹出的浮窗（见 `settings/AI.tsx` 的 `AiModePreview`）；
 * - 「页面宽度」行（`/settings/appearance`）：演内容区在「全宽」与「限宽居中」之间收窄 / 展开
 *   （`layout.contentWidth`，见 `settings/appearance.tsx` 的 `PageWidthPreview`）。
 *
 * ## 布局由 `layout` 描述，动画由 CSS 过渡负责
 * 组件是**纯受控**的：`layout` 一变，缩略图就过渡到那个形态 —— 它自己没有内部状态、
 * 没有计时器，「什么时候播动画」由调用方决定（浮层里是「先渲染列表态，下一帧再切到
 * 目标态」，见 `#/components/settings-choice-preview` 的 `usePreviewAnimation`）。
 *
 * 三条硬约定：
 * - **只动逻辑属性**：面板贴 `end-0`、分隔线用 `border-s`、挤压用 `pe-*`
 *   （`padding-inline-end`），于是 RTL 下面板自动改从另一边长出，不需要任何 `rtl:` 分支；
 * - **过渡一律包在 `motion-safe:` 里**：`prefers-reduced-motion: reduce` 下状态仍然正确，
 *   只是不再播动画（不要改用 `motion-reduce:transition-none` 逐个去关）；
 * - **几何量尽量用百分比**：缩略图在不同位置宽度不同（设置页里 `max-w-80`、浮层里 `w-72`），
 *   固定像素的横条一旦落进被挤压的窄列就会溢出、被裁成半截，百分比才会跟着一起缩。
 *
 * 表面色照搬真实外壳（侧栏 `bg-kumo-base`、内容区 `bg-kumo-canvas`），结构元素走 Kumo
 * 语义令牌（`bg-kumo-recessed` / `bg-kumo-tint` / `border-kumo-line`），只有「品牌位」用
 * 传入的 `accentColor`（inline style —— 动态 Tailwind 类在构建期生成不出来）。
 *
 * 整块缩略图是**纯装饰**：没有任何可读文本，读屏不会播报出内容，也不需要可访问名称。
 */

/**
 * 面板形态（**形态**而不是用途，缩略图不认识「详情」「AI」这些业务概念）：
 * - `push` —— 内容区分屏：从顶栏下沿开始、只挤压主列；
 * - `cover` —— 内容区抽屉：覆盖主列、满内容区高；
 * - `shell` —— **外壳级侧列**：与 `Sidebar` 同级、从缩略图顶到底整屏高，挤压的是整个内容列
 *   （连顶栏一起变窄）—— AI 面板的 Split View 就是这个形态；
 * - `float` —— **行尾侧下角的浮窗**：浮在内容之上、不挤压任何东西，从底部升起 —— AI 的 Float。
 */
export type AppShellPreviewPanel = 'none' | 'push' | 'cover' | 'shell' | 'float'

/** 缩略图要呈现的布局状态。 */
export interface AppShellPreviewLayout {
  /** 内容区里是列表页还是详情页本身（`page` 打开方式就是后者） */
  content: 'list' | 'detail'
  /** 行尾有没有面板，以及它是哪种形态 */
  panel: AppShellPreviewPanel
  /**
   * 内容区里**页面内容**的宽度约束（对应 `设置 → 外观 → 页面宽度`）：
   * - `full`（默认）：内容铺满内容列；
   * - `boxed`：内容收窄并居中，两侧露出画布 —— 也就是「限宽居中」档。
   *
   * 注意它约束的是内容列**内部**的页面内容，顶栏与侧边栏始终满宽 ——
   * 真实外壳里限制宽度的是 `<main>`，而不是这些外壳 chrome。
   */
  contentWidth?: 'full' | 'boxed'
}

/** 「只有列表」的基线状态：两个浮层演示都从这里起步，也正是「点行之前」的样子。 */
export const APP_SHELL_PREVIEW_LIST_LAYOUT: AppShellPreviewLayout = {
  content: 'list',
  panel: 'none',
}

/** 表格数据行的条数（够看出「表格」即可，不要画满）。 */
const TABLE_ROWS = 4

/** 详情骨架里字段行的条数。 */
const FIELD_ROWS = 4

/**
 * 被 `layout` 切换的属性各自一条过渡，抽成常量是为了让下面几处 `cn` 保持短。
 * 时长与缓动统一（500ms / ease-out），四个属性同时起步，读起来才是「一次布局变化」
 * 而不是几段互不相干的动画。
 */
const TRANSITION_PUSH =
  'motion-safe:transition-[padding] motion-safe:duration-500 motion-safe:ease-out'
const TRANSITION_PANEL =
  'motion-safe:transition-[width,opacity,border-color] motion-safe:duration-500 motion-safe:ease-out'
const TRANSITION_SWAP =
  'motion-safe:transition-[opacity,scale] motion-safe:duration-500 motion-safe:ease-out'
const TRANSITION_FADE =
  'motion-safe:transition-opacity motion-safe:duration-500 motion-safe:ease-out'
/**
 * 页面内容的宽度约束（`contentWidth`）：动的是 `max-width`。全宽与限宽都用**百分比**
 * （`max-w-full` / `max-w-[62%]`），同单位之间才会被插值成一条平滑的收窄 / 展开；
 * 一个百分比对一个像素值只会瞬间跳变。
 */
const TRANSITION_CONTENT_WIDTH =
  'motion-safe:transition-[max-width] motion-safe:duration-500 motion-safe:ease-out'
/**
 * 浮窗（AI 的 Float）：动的是「升起」这件事本身 —— 位移 + 淡入 + 极轻微放大，
 * 与真实浮窗的入场动画（`styles.css` 的 `ai-float-enter`）同一个读法。
 * Tailwind v4 的 `translate-y-*` / `scale-*` 落在独立变换属性上，所以过渡属性名就是它们。
 */
const TRANSITION_FLOAT =
  'motion-safe:transition-[opacity,translate,scale] motion-safe:duration-500 motion-safe:ease-out'

export interface AppShellPreviewProps {
  /**
   * 要呈现的布局状态。
   * @default APP_SHELL_PREVIEW_LIST_LAYOUT
   */
  layout?: AppShellPreviewLayout
  /** 品牌位（logo 描边、侧栏选中项、主操作）的强调色（十六进制） */
  accentColor?: string
  /**
   * 只用来补一些**不冲突**的类（外间距、透明度之类）。
   * 本仓库的 `cn` 是纯 clsx、**不做类名去重**，传 `w-*` / `max-w-*` 这类会与组件内置的
   * 同名类同时存在，谁生效取决于 Tailwind 的产出顺序 —— 要改宽度请在外面套一层容器。
   */
  className?: string
}

export function AppShellPreview({
  layout = APP_SHELL_PREVIEW_LIST_LAYOUT,
  accentColor,
  className,
}: AppShellPreviewProps) {
  const isDetailPage = layout.content === 'detail'
  const isPushed = layout.panel === 'push'
  const isCovered = layout.panel === 'cover'
  const isShellPanel = layout.panel === 'shell'
  const isFloating = layout.panel === 'float'
  /** 限宽居中档：内容收窄并居中（`full` 与未传值都是铺满） */
  const isBoxed = layout.contentWidth === 'boxed'

  return (
    <div
      className={cn(
        'flex aspect-video w-full max-w-80 overflow-hidden rounded-lg border border-kumo-line bg-kumo-canvas shadow-xs',
        className,
      )}
    >
      <PreviewSidebar accentColor={accentColor} />

      {/*
        内容列。面板的几种出现方式各占一层，靠 DOM 顺序决定叠放：
        header → body（主列 + 详情页层 + 分屏面板）→ 遮罩 → 抽屉面板 → AI 浮窗；
        外壳级的那一列（AI 的 Split View）不在这里，它挂在内容列**之后**，
        因为它挤压的是整个内容列（连顶栏一起），而不是内容体里的某一层。
        分屏面板装在 body 里，所以它从顶栏下方开始长（真实外壳的面板正是 top-[58px]）；
        抽屉面板装在内容列上，于是它连顶栏一起盖住（真实抽屉是满视口高的模态）。
      */}
      <div className="relative flex min-w-0 flex-1 flex-col bg-kumo-canvas">
        <PreviewHeader accentColor={accentColor} />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/*
            主列：`push` 时被挤压 —— 动画的是 `padding-inline-end`（逻辑属性），
            所以 RTL 下自动改从另一侧让位。列表骨架同时淡出，避免 narrow 状态下横条挤成一团。
          */}
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col',
              TRANSITION_PUSH,
              isPushed ? 'pe-[38%]' : 'pe-0',
            )}
          >
            {/*
              页面内容的宽度约束（`contentWidth`）：外层是内容列，内层才是「页面」——
              限宽档下内层收窄居中，两侧露出 `bg-kumo-canvas`，与真实 `<main>` 的行为一致。
              62% 是试出来的：再宽看不出「收窄了」，再窄列表条的百分比几何会挤在一起。
            */}
            <div
              className={cn(
                'mx-auto flex min-h-0 w-full flex-1 flex-col',
                TRANSITION_CONTENT_WIDTH,
                isBoxed ? 'max-w-[62%]' : 'max-w-full',
              )}
            >
              <PreviewTable
                accentColor={accentColor}
                className={cn(TRANSITION_FADE, isDetailPage && 'opacity-0')}
              />
            </div>
          </div>

          {/*
            详情页（`page`）：铺满内容体、轻微放大后归位 + 淡入 —— 读作「跳到新页面」。
            注意它只盖内容体，顶栏（面包屑那一层）不动，与真实的路由切换一致。
            面板与详情页用的是**同一套骨架**，正如真实实现里两者复用同一个详情组件。
          */}
          <div
            className={cn(
              'absolute inset-0 flex flex-col bg-kumo-canvas',
              TRANSITION_SWAP,
              isDetailPage ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0',
            )}
          >
            {/* 详情页同样是「页面内容」，跟列表一起受 `contentWidth` 约束 */}
            <div
              className={cn(
                'mx-auto flex min-h-0 w-full flex-1 flex-col',
                TRANSITION_CONTENT_WIDTH,
                isBoxed ? 'max-w-[62%]' : 'max-w-full',
              )}
            >
              <PreviewDetail accentColor={accentColor} />
            </div>
          </div>

          {/* 分屏面板：宽度从 0 长出来（贴 `end` 边，RTL 自动从另一边长出） */}
          <PreviewPanel
            accentColor={accentColor}
            visible={isPushed}
            className={isPushed ? 'w-[38%]' : 'w-0'}
          />
        </div>

        {/*
          抽屉的模态遮罩：真实抽屉走 Kumo Dialog，遮罩是 `bg-kumo-recessed` + 80%。
          缩略图只有几十像素高，照搬 80% 会把列表压成一块黑，这里降到 50% 以便看清
          「背后的列表还在，只是被压暗了」。
        */}
        <div
          className={cn(
            'absolute inset-0 bg-kumo-recessed',
            TRANSITION_FADE,
            isCovered ? 'opacity-50' : 'opacity-0',
          )}
        />

        {/* 抽屉面板：满高（连顶栏一起盖），比主列宽，视觉上明确是「盖上去」而不是「挤开」 */}
        <PreviewPanel
          accentColor={accentColor}
          visible={isCovered}
          className={isCovered ? 'w-[62%] shadow-md' : 'w-0'}
        />

        {/*
          AI 浮窗（Float）：贴内容区右下角浮着，**不挤压任何东西** ——
          它与「详情抽屉」的区别就在这里（抽屉是满高模态、有遮罩；浮窗只是一张小窗）。
          装在内容列里、`overflow-hidden` 的内层之外，所以「从底部升起」的位移不会被裁。
        */}
        <PreviewAiFloat accentColor={accentColor} visible={isFloating} />
      </div>

      {/*
        外壳级侧列（AI 的 Split View）：装在内容列**之后**、与 `PreviewSidebar` 同一层 ——
        于是它天然是「整屏高的一列」（顶栏也被它挤窄），这正是真实实现里 AI 面板
        与 Sidebar 同级的形态；与上面那几个装在内容列内部的 `push` / `cover` 不是一回事。
      */}
      <PreviewAiColumn
        accentColor={accentColor}
        visible={isShellPanel}
        className={isShellPanel ? 'w-[30%]' : 'w-0'}
      />
    </div>
  )
}

/** 侧边栏：真实侧边栏的表面色，logo 与选中项用强调色。 */
function PreviewSidebar({ accentColor }: { accentColor?: string }) {
  return (
    <div className="flex w-16 shrink-0 flex-col gap-2 border-e border-kumo-line bg-kumo-base p-2.5">
      {/* logo：强调色描边 */}
      <span className="size-4 rounded-full border-2" style={{ borderColor: accentColor }} />
      {/* 当前选中项：强调色实心条；其余是普通占位条 */}
      <span className="mt-1 h-1.5 w-9 rounded-full" style={{ backgroundColor: accentColor }} />
      <span className="h-1.5 w-9 rounded-full bg-kumo-recessed" />
      <span className="h-1.5 w-7 rounded-full bg-kumo-recessed" />
      <span className="h-1.5 w-9 rounded-full bg-kumo-recessed" />
    </div>
  )
}

/** 顶栏：面包屑位 + 右侧三个图标位，其中一个用强调色（品牌入口/操作）。 */
function PreviewHeader({ accentColor }: { accentColor?: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-kumo-line px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="size-3 shrink-0 rounded-full bg-kumo-tint" />
        <span className="h-1.5 w-12 rounded-full bg-kumo-recessed" />
      </div>
      <div className="flex shrink-0 gap-1">
        <span className="size-2.5 rounded-[3px] bg-kumo-recessed" />
        <span className="size-2.5 rounded-[3px] bg-kumo-recessed" />
        <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: accentColor }} />
      </div>
    </div>
  )
}

/** 列表：表头（含强调色操作位）+ 若干数据行，首行是「选中行」。 */
function PreviewTable({ accentColor, className }: { accentColor?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-0 flex-1', className)}>
      <div className="m-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-kumo-line">
        {/* 表头 */}
        <div className="flex items-center gap-2 border-b border-kumo-line bg-kumo-recessed px-2 py-1.5">
          <span className="h-1.5 w-[22%] rounded-full bg-kumo-tint" />
          <span className="h-1.5 w-[30%] rounded-full bg-kumo-tint" />
          <span className="h-1.5 w-[16%] rounded-full bg-kumo-tint" />
          {/* 表头右侧的「新建」操作位：品牌色，宽度固定 */}
          <span
            className="ms-auto h-2 w-6 shrink-0 rounded-sm"
            style={{ backgroundColor: accentColor }}
          />
        </div>

        {/* 数据行 */}
        {Array.from({ length: TABLE_ROWS }).map((_, index) => (
          <div
            key={index}
            className="flex flex-1 items-center gap-2 border-b border-kumo-line px-2 last:border-b-0"
          >
            <span className="size-3 shrink-0 rounded-full bg-kumo-tint" />
            <span className="h-1 w-[26%] rounded-full bg-kumo-recessed" />
            <span className="h-1 w-[34%] rounded-full bg-kumo-recessed" />
            {/* 选中行：末列是强调色状态块；其余行是中性状态块 */}
            <span
              className="ms-auto h-1.5 w-[16%] rounded-full"
              style={index === 0 ? { backgroundColor: accentColor } : undefined}
            />
            {index !== 0 ? <span className="h-1.5 w-[16%] rounded-full bg-kumo-tint" /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 详情骨架：标题行 + 字段行 + 底部主操作。
 *
 * 分屏面板与详情页共用这一份 —— 面板只是被压窄的一列，同一套百分比几何会自动缩下去，
 * 这也正是真实实现的形态：两种打开方式复用同一个详情组件。
 */
function PreviewDetail({ accentColor }: { accentColor?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
      {/* 标题行：标题条 + 行尾操作位（真实预览面板的头部就是「标题 + 展开按钮」） */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="h-1.5 w-[38%] rounded-full bg-kumo-tint" />
        <span
          className="ms-auto size-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: accentColor }}
        />
      </div>

      <div className="h-px shrink-0 bg-kumo-line" />

      {/* 字段行：标签 + 值 */}
      {Array.from({ length: FIELD_ROWS }).map((_, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <span className="h-1 w-[30%] shrink-0 rounded-full bg-kumo-recessed" />
          <span
            className={cn(
              'h-1 rounded-full bg-kumo-recessed',
              index % 2 === 0 ? 'w-[52%]' : 'w-[38%]',
            )}
          />
        </div>
      ))}

      {/* 底部主操作（保存 / 编辑） */}
      <span
        className="mt-auto h-2 w-[34%] shrink-0 self-end rounded-sm"
        style={{ backgroundColor: accentColor }}
      />
    </div>
  )
}

/**
 * 行尾详情面板的外壳：位置（贴 `end` 边、满高）与分隔线在这里，宽度由调用方按状态给，
 * 于是「0 宽度 ↔ 有宽度」就是一条纯 CSS 的宽度过渡。宽度为 0 时边框也必须透明，
 * 否则会留下一条 1px 的竖线（`w-0` 不吃掉 border）。
 */
function PreviewPanel({
  accentColor,
  visible,
  className,
}: {
  accentColor?: string
  visible: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'absolute inset-y-0 end-0 flex flex-col overflow-hidden border-s bg-kumo-base',
        TRANSITION_PANEL,
        visible ? 'border-kumo-line opacity-100' : 'border-transparent opacity-0',
        className,
      )}
    >
      <PreviewDetail accentColor={accentColor} />
    </div>
  )
}

/**
 * AI 面板的内容骨架：头行（sparkle + 标题）+ 一对方块气泡 + 底部输入位。
 *
 * 头行与 `PreviewHeader` **逐像素同高**（同样的 `px-2 py-2` + 首元素 `size-3` + `border-b`）——
 * 真实实现里 AI 面板头行就是 `h-[58px]`（与 `AppHeader` 同高），缩略图里也必须齐平，
 * 否则 Split View 下两条底边线错开，反而演错了「面板与顶栏同高」这件事。
 *
 * 两种形态（外壳级侧列 / 右下角浮窗）共用这一份，只是被塞进不同的外壳里
 * —— 正如真实实现里两者复用同一个 `AiPanelSurface`。
 */
function PreviewAiBody({ accentColor }: { accentColor?: string }) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-kumo-line px-2 py-2">
        <span className="size-3 shrink-0 rounded-[3px]" style={{ backgroundColor: accentColor }} />
        <span className="h-1.5 w-[42%] rounded-full bg-kumo-tint" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
        {/* 交替的对话气泡：AI 一条、用户一条（用户那条用中性填充区分开） */}
        <span className="h-3.5 w-[78%] rounded-md bg-kumo-recessed" />
        <span className="ms-auto h-2.5 w-[56%] rounded-md bg-kumo-tint" />
        <span className="h-3.5 w-[64%] rounded-md bg-kumo-recessed" />
        {/* 底部输入 / 发送位：品牌位用强调色 */}
        <span
          className="mt-auto h-2 w-[40%] shrink-0 self-end rounded-sm"
          style={{ backgroundColor: accentColor }}
        />
      </div>
    </>
  )
}

/**
 * AI 面板的**外壳级侧列**（Split View）：宽度 0 ↔ 30% 的纯 CSS 过渡，与 `PreviewPanel`
 * 同一套「宽度为 0 时边框也必须透明」的处理。
 *
 * 它是文档流里的 flex item（不是 `absolute`）—— 这正是「挤压」与「覆盖」的分界：
 * 浮窗/抽屉浮在内容上不动布局，而这一列会把内容区（含顶栏）真的挤窄。
 */
function PreviewAiColumn({
  accentColor,
  visible,
  className,
}: {
  accentColor?: string
  visible: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-s bg-kumo-base',
        TRANSITION_PANEL,
        visible ? 'border-kumo-line opacity-100' : 'border-transparent opacity-0',
        className,
      )}
    >
      <PreviewAiBody accentColor={accentColor} />
    </div>
  )
}

/**
 * AI 面板的**浮窗**（Float）：贴内容区右下角、不挤压布局，从底部升起来。
 *
 * 位置只用逻辑属性（`end-*`），RTL 下自动换到另一侧 —— 真实浮窗同理（`end-4 bottom-4`）。
 * 尺寸用百分比，缩略图被放进更窄的容器时会跟着一起缩。
 */
function PreviewAiFloat({ accentColor, visible }: { accentColor?: string; visible: boolean }) {
  return (
    <div
      className={cn(
        'absolute end-[4%] bottom-[5%] flex h-[64%] w-[48%] flex-col overflow-hidden rounded-md border border-kumo-line bg-kumo-base shadow-md',
        TRANSITION_FLOAT,
        visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0',
      )}
    >
      <PreviewAiBody accentColor={accentColor} />
    </div>
  )
}
