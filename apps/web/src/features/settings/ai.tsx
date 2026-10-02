import { Select, Switch, Tabs } from '@cloudflare/kumo'
import { BorderBeam } from 'border-beam'
import { BotAvatar } from 'bot-avatars'
import {
  ArrowsInLineHorizontalIcon,
  ArrowsOutLineHorizontalIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  ColumnsIcon,
  HourglassIcon,
  LightningIcon,
  PlusCircleIcon,
  SwatchesIcon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import {
  APP_SHELL_PREVIEW_LIST_LAYOUT,
  AppShellPreview,
  type AppShellPreviewLayout,
} from '#/components/app-shell-preview'
import {
  GLOW_COLOR_VARIANT,
  GLOW_REDUCED_MOTION_CSS,
  GLOW_STRENGTH,
} from '#/components/ai-activity-glow'
import { AiPermissionConfig } from '#/components/ai-permission-config'
import { PageHeader } from '#/components/page-header'
import {
  SettingChoicePreview,
  usePreviewAnimation,
} from '#/components/settings-choice-preview'
import { SettingsCard, SettingRow } from '#/components/settings-card'
import { BetaBadge } from '#/components/beta-badge'
import { cn } from '#/lib/cn'
import { SUPPORTED_LOCALES } from '#/lib/locale'
import {
  AI_BOT_AVATARS,
  usePreferencesStore,
  type AiOutputLanguage,
  type AiOutputMode,
  type AiPageWidthMode,
  type AiPanelMode,
  type AiSessionMode,
  type PageWidthMode,
} from '#/lib/store'
import { useColorMode } from '#/lib/use-color-mode'

interface AiModeOption {
  key: AiPanelMode
  labelKey: string
  fallback: string
  icon: typeof ColumnsIcon
}

/**
 * 显示方式的两项。
 *
 * 文案是**形态名**而不是产品术语，七种语言各自本地化（见 messages/common 的 `aiModes.*`）；
 * 各自的差别交给悬浮预览去演（下面的 `AiModePreview`），hint 只补一句降级说明 ——
 * 与「详情打开方式」同一套取舍：光看名字没人知道出来的是什么。
 */
const AI_MODE_OPTIONS: AiModeOption[] = [
  {
    key: 'split',
    labelKey: 'profile.settings.aiModes.split',
    fallback: '分屏视图',
    icon: ColumnsIcon,
  },
  {
    key: 'float',
    labelKey: 'profile.settings.aiModes.float',
    fallback: '浮窗',
    icon: ChatCircleDotsIcon,
  },
]

interface AiSessionModeOption {
  key: AiSessionMode
  labelKey: string
  fallback: string
  icon: typeof ColumnsIcon
}

/**
 * 「每次打开面板用哪一段会话」的两项。默认在前的 `continue` 就是默认值：
 * 接着刚才的继续说，比"每次都要先点一下新对话"更符合多数人的预期。
 */
const AI_SESSION_MODE_OPTIONS: AiSessionModeOption[] = [
  {
    key: 'continue',
    labelKey: 'profile.settings.aiSessionModes.continue',
    fallback: '继续上次会话',
    icon: ClockCounterClockwiseIcon,
  },
  {
    key: 'new',
    labelKey: 'profile.settings.aiSessionModes.new',
    fallback: '刷新后开新会话',
    icon: PlusCircleIcon,
  },
]

interface AiOutputModeOption {
  key: AiOutputMode
  labelKey: string
  fallback: string
  icon: typeof ColumnsIcon
}

/**
 * 全屏对话页的页面宽度三项。
 *
 * 前两项的文案与图标**复用外观页的 `pageWidths.full` / `pageWidths.boxed`**
 * （同一件事不该有两套说法）；只有「跟随外观」是这一页新增的档。
 * 它跟的是外观那个设置的**选择**，实际最大宽度用聊天自己的 `max-w-4xl`
 * （比页面的 1440px 窄，见 `#/lib/page-width` 的 `aiChatWidthClass`）。
 */
const AI_PAGE_WIDTH_OPTIONS: Array<{
  key: AiPageWidthMode
  labelKey: string
  fallback: string
  icon: typeof ColumnsIcon
}> = [
  {
    key: 'follow',
    labelKey: 'profile.settings.pageWidths.follow',
    fallback: '跟随外观',
    icon: SwatchesIcon,
  },
  {
    key: 'full',
    labelKey: 'profile.settings.pageWidths.full',
    fallback: '全宽',
    icon: ArrowsOutLineHorizontalIcon,
  },
  {
    key: 'boxed',
    labelKey: 'profile.settings.pageWidths.boxed',
    fallback: '限宽居中',
    icon: ArrowsInLineHorizontalIcon,
  },
]

/**
 * 输出方式的两项。默认在前的 `wait`：普通用户看"半截的 Markdown"很累 ——
 * 流式过程中标题、列表、代码块都在反复重排。想实时看进度的再选 `stream`。
 */
const AI_OUTPUT_MODE_OPTIONS: AiOutputModeOption[] = [
  {
    key: 'wait',
    labelKey: 'profile.settings.aiOutputModes.wait',
    fallback: '等待',
    icon: HourglassIcon,
  },
  {
    key: 'stream',
    labelKey: 'profile.settings.aiOutputModes.stream',
    fallback: '实时输出',
    icon: LightningIcon,
  },
]

/**
 * AI 打开方式 → 缩略图布局的映射。
 *
 * 两者是**形态**上的差别，缩略图只认形态、不认识「AI」：
 * - `split` → `shell`：外壳级侧列 —— 与侧边栏同级、从顶部到底部整屏高，
 *   连顶栏一起被挤窄（这正是它与详情分屏 `push` 的区别：后者只挤压内容区）；
 * - `float` → `float`：行尾侧下角的小窗，浮在内容之上、不挤压布局，从底部升起。
 *
 * 起点都是列表态，因为真实场景就是这样：人正停在某个页面上，点了顶栏的 Ask AI，
 * 差别体现在「面板怎么出现」；内容区是列表还是详情与这个设置无关。
 */
const AI_MODE_PREVIEW_LAYOUTS: Record<AiPanelMode, AppShellPreviewLayout> = {
  split: { content: 'list', panel: 'shell' },
  float: { content: 'list', panel: 'float' },
}

/**
 * 悬浮预览内容：两阶段时序（先基线态、停一下再切目标态）来自
 * `#/components/settings-choice-preview` 的 `usePreviewAnimation`。
 *
 * 宽度交给外层而不是给缩略图传 `w-*`：`AppShellPreview` 自带 `w-full max-w-80`，
 * 而本仓库的 `cn` 不做类名去重（纯 clsx），两个同类名同时存在时谁生效取决于
 * Tailwind 的产出顺序。
 */
function AiModePreview({
  mode,
  accentColor,
}: {
  mode: AiPanelMode
  accentColor: string
}) {
  const layout = usePreviewAnimation(
    APP_SHELL_PREVIEW_LIST_LAYOUT,
    AI_MODE_PREVIEW_LAYOUTS[mode],
  )

  return (
    <div className="w-72">
      <AppShellPreview layout={layout} accentColor={accentColor} />
    </div>
  )
}

/**
 * 页面宽度预览：**复用外观页那套「宽度变化」的缩略图动画**
 * （同一份 `#/components/app-shell-preview` + `#/components/settings-choice-preview`
 * 的 `usePreviewAnimation`），不另做一套视觉。
 *
 * 起点取**相反的档**，终点才是这一项的档 —— 只画终态的话「全宽」与默认态毫无区别，
 * 等于没演（与外观页同一个取舍）。
 *
 * `follow` 的终点按**外观当前的选择**解析：它演的就是「最终会变成外观说的那样」。
 */
function AiPageWidthPreview({
  mode,
  followMode,
  accentColor,
}: {
  mode: AiPageWidthMode
  followMode: PageWidthMode
  accentColor: string
}) {
  const resolved = mode === 'follow' ? followMode : mode
  const layout = usePreviewAnimation<AppShellPreviewLayout>(
    {
      content: 'list',
      panel: 'none',
      contentWidth: resolved === 'boxed' ? 'full' : 'boxed',
    },
    { content: 'list', panel: 'none', contentWidth: resolved },
  )

  return (
    <div className="w-80">
      <AppShellPreview layout={layout} accentColor={accentColor} />
    </div>
  )
}

/**
 * 光晕预览：先演「页面四周什么都没有」的基线，停一下再让光带亮起。
 *
 * 光本身交给真品 `border-beam`，**家族取 Pulse（呼吸，不旋转）**，档位 `pulse-inner`
 * （「收在边界内呼吸」）—— 运行时那层页面级光晕（`#/components/ai-activity-glow`）用的是**同一档**，
 * 参数也只差一个按尺寸调的 `glowSize`（这边默认 1，满视口那边 4），两处观感由此由同一份实现保证。
 * 另一族 Rotate（`md` / `sm` / `line`）是沿边框绕圈的旋转光带，那是「多了一条边框」的观感，
 * 不是光晕，所以不在这里用；Pulse 里的 `pulse-outside` 也不合适 —— 它的光晕长在元素外面，
 * 而浮层只有 `p-1.5`（6px）内边距，晕开的那圈会糊到浮层上（与当初否掉 `-inset-*` 是同一个理由）。
 *
 * 两个必须由我们给死的参数：
 * - `theme`：包自带的 `auto` 读的是祖先的 `data-theme` 属性或 `dark` class，而本项目的
 *   主题是 `data-mode` 驱动的 —— 与 `AiBotAvatar` 是同一个坑，统一传 `useColorMode().resolved`；
 * - `borderRadius`：包的自动探测取「第一个子元素」的圆角，而缩略图自己就是 `rounded-lg`（8px）。
 *   显式给死，免得探测失败时回落到该档的预设值、与缩略图错开。
 *
 * `active={showGlow}` 就是这套预览的「先基线、后亮起」：包自带淡入淡出（连同它自己的
 * `prefers-reduced-motion` 处理），外面不再需要一层 opacity 过渡。
 *
 * 依旧**不看开关的当前值**：预览要展示的是效果本身，关着的时候反而更该让人知道「打开会是什么样」。
 *
 * 包本身落在**主 bundle**（运行态那层在 AppShell 上，路由级懒加载兜不住它），
 * 所以这条路由不再为它多背一份 chunk —— 代价已经在主 bundle 里付过了。
 */
function AiActivityGlowPreview({ accentColor }: { accentColor: string }) {
  const showGlow = usePreviewAnimation(false, true)
  const { resolved } = useColorMode()

  return (
    <div className="w-72">
      <BorderBeam
        size="pulse-inner"
        colorVariant={GLOW_COLOR_VARIANT}
        strength={GLOW_STRENGTH}
        theme={resolved}
        active={showGlow}
        borderRadius={8}
        // 减动效下别把预览演成「这里什么都没有」（见 GLOW_REDUCED_MOTION_CSS）
        css={GLOW_REDUCED_MOTION_CSS}
        className="rounded-lg"
      >
        <AppShellPreview
          layout={APP_SHELL_PREVIEW_LIST_LAYOUT}
          accentColor={accentColor}
        />
      </BorderBeam>
    </div>
  )
}

/**
 * 「显示详细信息」的预览：演一遍**把它关掉之后长什么样**（工具行与用量行一起收起、只剩问答）。
 *
 * 刻意演"关掉"而不是"打开"：这个开关默认就是关的，人更需要知道的是
 * 「那些行能去掉」，而不是「打开会多出什么」。两行**共用一个信号** —— 它们本来就被
 * 同一个开关控制，演成两段时序反而误导。整块用 `max-h` + `opacity` 过渡，
 * 而不是直接不渲染 —— 浮层里要看清高度的变化，不然只是少了一行、看不出来。
 */
function AiDetailsPreview() {
  const showDetails = usePreviewAnimation(true, false)

  return (
    <div className="w-72 space-y-1.5 rounded-lg border border-kumo-line bg-kumo-base p-3">
      <div className="flex justify-end">
        <span className="rounded-lg bg-kumo-tint px-2 py-1 text-xs text-kumo-default">
          {"帮我看看今天的订单"}
        </span>
      </div>

      {/*
        这两行就是开关控制的东西：关掉后一起收起，下面的回答照常。
        包在同一个容器里过渡（而不是各自过渡）：收起时只留**一个** `space-y` 间隙，
        与原来单行时的观感一致，不会平白多出一段空白。
      */}
      <div
        className={cn(
          'space-y-1.5 overflow-hidden transition-all motion-safe:duration-300',
          showDetails ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="flex items-center gap-2 rounded-lg border border-kumo-line px-2 py-1 text-xs">
          <CheckCircleIcon size={12} className="shrink-0 text-kumo-success" />
          <span className="min-w-0 truncate text-kumo-default">{"查询订单"}</span>
          <span className="ms-auto shrink-0 text-kumo-subtle">{"完成"}</span>
        </div>

        {/* 本轮用量那一行（缓存命中 / 输入 / 输出）—— 信息密度低，所以不做卡片、只有一行灰字 */}
        <p className="truncate text-xs text-kumo-subtle">
          {"缓存命中 3.2K · 输入 4.1K · 输出 128"}
        </p>
      </div>

      <div className="rounded-lg bg-kumo-tint px-2 py-1.5 text-xs text-kumo-default">
        {"今天共 128 笔订单，比昨天多 12%。"}
      </div>
    </div>
  )
}

const OUTPUT_MODE_PREVIEW_TEXT = '今天共 128 笔订单，比昨天多 12%。'

/**
 * 输出方式预览：用同一句话演两种模式**出现的方式**。
 *
 * 「等待」是"先空着（只在想）、最后一整段出现"；「实时」是"文字一点点长出来"。
 * 两段时序共用（`usePreviewAnimation(false, true)`），差别只在中间那一帧画什么 ——
 * 这样两种模式的对比才落在"出现方式"上，而不是文案差异上。
 */
function AiOutputModePreview({ mode }: { mode: AiOutputMode }) {
  const arrived = usePreviewAnimation(false, true)

  return (
    <div className="w-72 rounded-lg border border-kumo-line bg-kumo-base p-3">
      {mode === 'wait' ? (
        arrived ? (
          <p className="text-xs text-kumo-default">{OUTPUT_MODE_PREVIEW_TEXT}</p>
        ) : (
          <p className="text-xs text-kumo-subtle">正在思考…</p>
        )
      ) : (
        <p className="text-xs text-kumo-default">
          {arrived ? OUTPUT_MODE_PREVIEW_TEXT : '今天共 128'}
        </p>
      )}
    </div>
  )
}

/**
 * 设置 → AI（`/settings/AI`）。
 *
 * 与 外观（`/settings/appearance`）同属「本机偏好」：改动**即时生效 + 按应用隔离持久化**
 * （`admin.preferences:<appId>` 的 `aiPanelMode`），所以**没有保存按钮、没有 dirty 状态**。
 *
 * 当前只有一项配置（打开方式）。后续 AI 相关偏好继续往这张卡片里加 `SettingRow`，
 * 或在其下方再加一张 `SettingsCard` 即可 —— 卡片外壳与行布局都来自
 * `#/components/settings-card`，不要在页面里手写 `LayerCard`。
 */
export function AiSettingsPage() {
  const { t } = useTranslation()
  const aiPanelMode = usePreferencesStore((state) => state.aiPanelMode)
  const setAiPanelMode = usePreferencesStore((state) => state.setAiPanelMode)
  const aiSessionMode = usePreferencesStore((state) => state.aiSessionMode)
  const setAiSessionMode = usePreferencesStore((state) => state.setAiSessionMode)
  // 全屏对话页的宽度：`follow` 档要读外观那一份才能解析出最终档位
  const aiPageWidth = usePreferencesStore((state) => state.aiPageWidth)
  const setAiPageWidth = usePreferencesStore((state) => state.setAiPageWidth)
  const pageWidth = usePreferencesStore((state) => state.pageWidth)
  const aiActivityGlow = usePreferencesStore((state) => state.aiActivityGlow)
  const setAiActivityGlow = usePreferencesStore((state) => state.setAiActivityGlow)
  const aiShowDetails = usePreferencesStore((state) => state.aiShowDetails)
  const setAiShowDetails = usePreferencesStore((state) => state.setAiShowDetails)
  const aiBotAvatar = usePreferencesStore((state) => state.aiBotAvatar)
  const setAiBotAvatar = usePreferencesStore((state) => state.setAiBotAvatar)
  const aiOutputMode = usePreferencesStore((state) => state.aiOutputMode)
  const setAiOutputMode = usePreferencesStore((state) => state.setAiOutputMode)
  const aiAutoScroll = usePreferencesStore((state) => state.aiAutoScroll)
  const setAiAutoScroll = usePreferencesStore((state) => state.setAiAutoScroll)
  const aiAutoNavigate = usePreferencesStore((state) => state.aiAutoNavigate)
  const setAiAutoNavigate = usePreferencesStore((state) => state.setAiAutoNavigate)
  const aiEnabled = usePreferencesStore((state) => state.aiEnabled)
  const setAiEnabled = usePreferencesStore((state) => state.setAiEnabled)
  const aiOutputLanguage = usePreferencesStore((state) => state.aiOutputLanguage)
  const setAiOutputLanguage = usePreferencesStore((state) => state.setAiOutputLanguage)
  const aiPermission = usePreferencesStore((state) => state.aiPermission)
  const setAiPermission = usePreferencesStore((state) => state.setAiPermission)
  const aiAllowedTools = usePreferencesStore((state) => state.aiAllowedTools)
  const setAiAllowedTools = usePreferencesStore((state) => state.setAiAllowedTools)
  // 头像网格里每个 canvas 都要知道坐在什么底色上（包的 auto 读不到本项目的 data-mode）
  const { resolved } = useColorMode()
  // 预览缩略图的品牌位（面板头行的 sparkle、底部输入位）跟着用户选的强调色走
  const accentColor = usePreferencesStore((state) => state.accentColor)

  return (
    <div className="flex w-full flex-col gap-6">
      {/* 标题旁挂 Beta：这个模块整体还在测试阶段（导航项上也有同一个徽章） */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {t('profileNav.ai', 'AI')}
            <BetaBadge />
          </span>
        }
      />

      {/*
        卡片标题直接复用外观页那一个 key（`profile.settings.general`）：
        这里就是「通用设置」，没有 AI 专属的前缀 —— 各语言只维护一份，不会漂移。
      */}
      <SettingsCard title={t('profile.settings.general', '通用设置')}>
        {/*
          总开关放最前：它是这一页其余设置的前提 —— 关掉之后顶栏的入口整个消失。
          用一个开关而不是把下面的选项藏起来，是因为「要不要这个功能」与「它怎么表现」
          是两件事，用户可能只是想暂时把入口收起来。
        */}
        <SettingRow
          label={t('profile.settings.aiEnabled', '启用 AI')}
          hint={t(
            'profile.settings.aiEnabledHint',
            '关掉后顶栏不再显示「Ask AI」入口',
          )}
        >
          <Switch
            checked={aiEnabled}
            onCheckedChange={setAiEnabled}
            aria-label={t('profile.settings.aiEnabled', '启用 AI')}
          />
        </SettingRow>

        {/*
          打开方式：两项短枚举，与「主题」「详情打开方式」同一套 Kumo `Tabs` segmented
          写法（数据驱动、受控 `value` / `onValueChange`、`activateOnFocus`、默认尺寸），
          可访问名称同样由外层 `role="group"` 提供 —— Kumo 的 `Tabs` 不透传 `aria-label`。

          与「详情打开方式」一样多一层**悬浮预览**：每段选项盖一层透明热区，指针停上去
          弹出浮层，用通用缩略图把两种形态演一遍（`split` 那个空档里面板从右侧长出来、
          与侧边栏同级整屏高；`float` 则是一张小窗从右下角升起来）。
          浮层本身的接法（为什么用 `Popover`、为什么受控只认 hover、为什么热区是
          `aria-hidden` 的 `span`）都在 `#/components/settings-choice-preview` 里。
        */}
        <SettingRow
          label={t('profile.settings.aiDisplayMode', '显示方式')}
          hint={t(
            'profile.settings.aiDisplayModeHint',
            'Ask AI 面板的显示方式；窄屏下都会收成浮层',
          )}
        >
          <div
            role="group"
            aria-label={t('profile.settings.aiDisplayMode', '显示方式')}
          >
            <Tabs
              value={aiPanelMode}
              onValueChange={(next) => setAiPanelMode(next as AiPanelMode)}
              activateOnFocus
              tabs={AI_MODE_OPTIONS.map((item) => {
                const ItemIcon = item.icon
                const label = t(item.labelKey, item.fallback)
                return {
                  value: item.key,
                  label: (
                    <span className="flex items-center gap-2">
                      <ItemIcon size={16} className="text-kumo-subtle" />
                      <span>{label}</span>
                      <SettingChoicePreview
                        label={label}
                        // id 既做 trigger 的 id、也做 Root 的 triggerId，页面内唯一即可
                        triggerId={`ai-open-mode-preview-${item.key}`}
                      >
                        <AiModePreview mode={item.key} accentColor={accentColor} />
                      </SettingChoicePreview>
                    </span>
                  ),
                }
              })}
            />
          </div>
        </SettingRow>

        {/*
          什么时候开一段新会话：两项短枚举，与「显示方式」同一套分段控件写法。
          **不做悬浮预览**：它描述的是"刷新那一刻发生什么"，一张静态缩略图演不出来，
          硬做反而是误导（与「跟随输出滚动」同一个理由）。

          真正生效的地方只有一处：`#/lib/ai/session-store` 的 `loadHistory({ fresh })`
          （`AiConversation` 挂载时传 `sessionMode === 'new' && isDocumentReload()`）。
          界面这里只管改值，**改完要等下一次刷新才见效**（判据每份文档只算一次）。
        */}
        <SettingRow
          label={t('profile.settings.aiSessionMode', '新会话时机')}
          hint={t(
            'profile.settings.aiSessionModeHint',
            '刷新页面后打开面板会开始新会话；同一页面里关掉再打开会接着当前对话',
          )}
        >
          <div
            role="group"
            aria-label={t('profile.settings.aiSessionMode', '新会话时机')}
          >
            <Tabs
              value={aiSessionMode}
              onValueChange={(next) => setAiSessionMode(next as AiSessionMode)}
              activateOnFocus
              tabs={AI_SESSION_MODE_OPTIONS.map((item) => {
                const ItemIcon = item.icon
                return {
                  value: item.key,
                  label: (
                    <span className="flex items-center gap-2">
                      <ItemIcon size={16} className="text-kumo-subtle" />
                      <span>{t(item.labelKey, item.fallback)}</span>
                    </span>
                  ),
                }
              })}
            />
          </div>
        </SettingRow>

        {/*
          全屏对话页的页面宽度：三项短枚举，同样走分段控件 + 悬浮预览。
          **只作用于 `/$appId/sphere`**：那一页的会话区 + 输入区被同一个宽度约束包住
          （见 `#/lib/page-width` 的 `aiChatWidthClass`）—— 面板是外壳级的一列 / 浮窗，
          宽度由拖拽决定，不受这一项影响。

          「跟随外观」跟的是外观「页面宽度」的**选择**，不是它的像素上限：
          聊天收在 `max-w-4xl`，比页面的 1440px 窄（对话按行读，太宽反而难读）。
          hint 里如实说明，免得用户以为两处限制应当一模一样。
        */}
        <SettingRow
          label={t('profile.settings.aiPageWidth', '页面宽度')}
          hint={t(
            'profile.settings.aiPageWidthHint',
            '全屏对话页的内容宽度；跟随外观即沿用「外观 → 页面宽度」的选择',
          )}
        >
          <div
            role="group"
            aria-label={t('profile.settings.aiPageWidth', '页面宽度')}
          >
            <Tabs
              value={aiPageWidth}
              onValueChange={(next) => setAiPageWidth(next as AiPageWidthMode)}
              activateOnFocus
              tabs={AI_PAGE_WIDTH_OPTIONS.map((item) => {
                const ItemIcon = item.icon
                const label = t(item.labelKey, item.fallback)
                return {
                  value: item.key,
                  label: (
                    <span className="flex items-center gap-2">
                      <ItemIcon size={16} className="text-kumo-subtle" />
                      <span>{label}</span>
                      <SettingChoicePreview
                        label={label}
                        triggerId={`ai-page-width-preview-${item.key}`}
                      >
                        <AiPageWidthPreview
                          mode={item.key}
                          followMode={pageWidth}
                          accentColor={accentColor}
                        />
                      </SettingChoicePreview>
                    </span>
                  ),
                }
              })}
            />
          </div>
        </SettingRow>

        {/*
          AI 进行中的页面级光晕：开关型偏好，所以用 Kumo `Switch` 而不是分段控件。
          **不传 `label`**（那会渲染一行可见文字，与 `SettingRow` 的 label 重复），
          改传 `aria-label` —— Kumo 的 Switch 会读它作为可访问名称。

          悬浮预览的热区挂在**左侧 label 文字**上，不碰右边的开关 —— 这一点是必须的：
          热区是 `absolute inset-0`（铺满最近的 positioned 祖先），若把它包在开关外层，
          它就会整个盖住开关、把点击全部吞掉，**开关会变成点不动**。
          挂在 label 上则与「显示方式」的交互一致：停在文字上看效果，控件照常可点。
        */}
        <SettingRow
          label={
            <span className="relative">
              {t('profile.settings.aiActivityGlow', '进行中光晕')}
              <SettingChoicePreview
                label={t('profile.settings.aiActivityGlow', '进行中光晕')}
                triggerId="ai-activity-glow-preview"
              >
                <AiActivityGlowPreview accentColor={accentColor} />
              </SettingChoicePreview>
            </span>
          }
          hint={t(
            'profile.settings.aiActivityGlowHint',
            'AI 回答时在页面四周显示一圈流动光带',
          )}
        >
          <Switch
            checked={aiActivityGlow}
            onCheckedChange={setAiActivityGlow}
            aria-label={t('profile.settings.aiActivityGlow', '进行中光晕')}
          />
        </SettingRow>

        {/*
          AI 的输出语言：与**界面语言**分开的两件事 —— 「界面中文但想让它用英文答」是真实需求
          （照着英文文档干活时）。默认跟随界面语言。

          8 项（跟随 + 7 种语言）用 Select；语言名用**自名**（「日本語」而不是「日语」），
          这样任何界面语言下都认得出是哪一门语言。
        */}
        <SettingRow
          label={t('profile.settings.aiOutputLanguage', '输出语言')}
          hint={t(
            'profile.settings.aiOutputLanguageHint',
            'AI 用什么语言回答；默认跟随界面语言',
          )}
        >
          <Select<string>
            aria-label={t('profile.settings.aiOutputLanguage', '输出语言')}
            className="w-56"
            value={aiOutputLanguage}
            onValueChange={(next) => {
              if (next) setAiOutputLanguage(next as AiOutputLanguage)
            }}
            items={[
              {
                value: 'auto',
                label: t('profile.settings.aiOutputLanguageAuto', '跟随界面语言'),
              },
              ...SUPPORTED_LOCALES.map((item) => ({
                value: item.key,
                label: item.nativeName,
              })),
            ]}
          />
        </SettingRow>

        {/*
          跟随输出滚动：只有开关、**不做预览** —— 它描述的是滚动行为，
          浮层里那张静态缩略图演不出"跟不跟"的差别，硬做一个反而是误导。
        */}
        <SettingRow
          label={t('profile.settings.aiAutoScroll', '跟随输出滚动')}
          hint={t(
            'profile.settings.aiAutoScrollHint',
            'AI 回答时自动滚到最新内容；手动往上翻会临时暂停',
          )}
        >
          <Switch
            checked={aiAutoScroll}
            onCheckedChange={setAiAutoScroll}
            aria-label={t('profile.settings.aiAutoScroll', '跟随输出滚动')}
          />
        </SettingRow>

        {/*
          自动跳转：询问模式下跳转默认要确认，这个开关是"我不介意被直接带过去"。
          只在**面板**生效 —— 全屏对话页永远给建议卡；**自动模式本来就不问**，所以文案限定"询问模式"。
        */}
        <SettingRow
          label={t('profile.settings.aiAutoNavigate', '自动跳转页面')}
          hint={t(
            'profile.settings.aiAutoNavigateHint',
            '询问模式下，AI 需要带你去某个页面时不再询问（自动模式本来就不问）',
          )}
        >
          <Switch
            checked={aiAutoNavigate}
            onCheckedChange={setAiAutoNavigate}
            aria-label={t('profile.settings.aiAutoNavigate', '自动跳转页面')}
          />
        </SettingRow>

        {/*
          详细信息的可见性：工具卡片 + 本轮用量由同一个开关控制，**默认关**（普通用户只看内容）。
          热区同样挂在 label 文字上，理由见上面那条 —— 包在开关外层会吞掉点击。
        */}
        <SettingRow
          label={
            <span className="relative">
              {t('profile.settings.aiShowDetails', '显示详细信息')}
              <SettingChoicePreview
                label={t('profile.settings.aiShowDetails', '显示详细信息')}
                triggerId="ai-show-details-preview"
              >
                <AiDetailsPreview />
              </SettingChoicePreview>
            </span>
          }
          hint={t(
            'profile.settings.aiShowDetailsHint',
            '在回答里显示 AI 调用了哪些工具、以及本轮的用量（缓存命中 / 输入 / 输出）；关闭后只显示回答内容',
          )}
        >
          <Switch
            checked={aiShowDetails}
            onCheckedChange={setAiShowDetails}
            aria-label={t('profile.settings.aiShowDetails', '显示详细信息')}
          />
        </SettingRow>

        {/*
          输出方式：两项短枚举，与「显示方式」同一套分段控件 + 悬浮预览。
          这一项直接在会话区生效（见 `#/components/ai-conversation` 的 AiMessageView / showThinking）：
          `wait` 下正在生成的那条整条不渲染、只留「正在思考…」，结束后一次给出。
        */}
        <SettingRow
          label={t('profile.settings.aiOutputMode', '输出方式')}
          hint={t(
            'profile.settings.aiOutputModeHint',
            '回答是边生成边显示，还是想完了一次性给出',
          )}
        >
          <div
            role="group"
            aria-label={t('profile.settings.aiOutputMode', '输出方式')}
          >
            <Tabs
              value={aiOutputMode}
              onValueChange={(next) => setAiOutputMode(next as AiOutputMode)}
              activateOnFocus
              tabs={AI_OUTPUT_MODE_OPTIONS.map((item) => {
                const ItemIcon = item.icon
                const label = t(item.labelKey, item.fallback)
                return {
                  value: item.key,
                  label: (
                    <span className="flex items-center gap-2">
                      <ItemIcon size={16} className="text-kumo-subtle" />
                      <span>{label}</span>
                      <SettingChoicePreview
                        label={label}
                        triggerId={`ai-output-mode-preview-${item.key}`}
                      >
                        <AiOutputModePreview mode={item.key} />
                      </SettingChoicePreview>
                    </span>
                  ),
                }
              })}
            />
          </div>
        </SettingRow>

        {/*
          助手头像：18 种形状，用**网格**而不是 Select —— 选头像本来就是个看形状的事，
          一列文字名（clover / pebble / puddle…）谁也挑不出来。
          选中的那个**动**、其余冻结在某一帧：一屏 18 个 canvas 同时跑动画是白烧 CPU，
          而"谁被选中"正好可以用"只有它在动"来表达。
        */}
        <SettingRow
          label={t('profile.settings.aiBotAvatar', '助手头像')}
          hint={t('profile.settings.aiBotAvatarHint', 'AI 在会话里出现时的小机器人形象')}
        >
          <div
            role="radiogroup"
            aria-label={t('profile.settings.aiBotAvatar', '助手头像')}
            className="grid grid-cols-5 gap-1"
          >
            {AI_BOT_AVATARS.map((type) => {
              const selected = type === aiBotAvatar
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  // 形状名本身没有本地化文案，直接用它当可访问名称（读屏也能区分）
                  aria-label={type}
                  onClick={() => setAiBotAvatar(type)}
                  className={cn(
                    // `flex` + 居中：grid 子项默认 stretch 撑满格子，
                    // 不居中的话头像会贴在格子左侧、整排看着是歪的
                    'flex items-center justify-center rounded-lg p-0.5 transition-colors',
                    selected ? 'bg-kumo-tint ring-1 ring-kumo-brand' : 'hover:bg-kumo-tint',
                  )}
                >
                  <BotAvatar
                    type={type}
                    size={30}
                    theme={resolved}
                    interactive={false}
                    paused={!selected}
                  />
                </button>
              )
            })}
          </div>
        </SettingRow>
      </SettingsCard>

      {/*
        AI 权限：**能用哪些工具**。

        它与上面的「输出方式 / 输入模式」是**正交**的两件事 —— 模式管"用起来要不要问"，
        这里管"有没有这个工具"。早先这两件事被写死在代码里（询问模式只给只读工具），
        于是那个模式变成了一个连表都填不了的模式。
      */}
      <SettingsCard title={t('profile.settings.aiPermission', 'AI 权限')}>
        {/*
          配置体与 AI 面板的权限视图**共用同一份**（见 `#/components/ai-permission-config`）。
          这里即时生效（直接写偏好 store）；面板那边先存草稿、点保存才写回。
        */}
        <AiPermissionConfig
          permission={aiPermission}
          allowedTools={aiAllowedTools}
          onPermissionChange={setAiPermission}
          onAllowedToolsChange={setAiAllowedTools}
        />
      </SettingsCard>
    </div>
  )
}
