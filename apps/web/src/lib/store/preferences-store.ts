import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  isKnownCapabilityGrant,
  type AiCapabilityGrant,
} from '#/features/ai/core/capabilities'
import type { AiPermissionMode } from '#/features/ai/core/types'
import { getBrowserLocale, isLocaleKey, type LocaleKey } from '../locale'
import {
  DEFAULT_TIMEZONE,
  isTimezoneKey,
  type TimezoneKey,
} from '../timezone-options'
import { registerScopedStore } from './app-scope'
import { enableCrossTabSync } from './cross-tab-sync'
import { createScopedJSONStorage } from './scoped-storage'

/**
 * 本机偏好 store（语言 / 外观 / 时区）。
 *
 * **按应用隔离存储**：键形如 `admin.preferences:console` / `admin.preferences:analytics`，
 * 因此每个应用可以有自己的语言、主题与时区，互不影响。
 *
 * 继承规则（`fallbackToGlobal`）：某个应用还没有自己的偏好时，读取会回落到
 * 登录前/选择页所在的 `:global` 命名空间 —— 也就是「新应用默认继承你现在这套偏好」，
 * 在你于该应用中改过一次之后，它才写自己的键并从此独立。
 *
 * 单一真值约定：store 是这三项偏好的唯一来源 ——
 * - `i18n.ts` 初始化时读它，并订阅变化驱动 `changeLanguage`；
 * - `use-color-mode.ts` 订阅变化把主题写到 `<html data-mode>`；
 * - `timezone.ts` 的时间格式化从这里取时区。
 * 三者都只是「订阅 + 应用」，切应用时随 `rehydrate` 自动跟着换，无需额外交接。
 */

export type ColorMode = 'light' | 'dark' | 'system'

/**
 * 表格里打开详情的方式（见 `#/components/detail-preview`）：
 * - `split`：**分屏预览** —— 主内容缩到 2/3，右侧 1/3 直接内嵌详情（同屏各自滚动）；
 * - `sheet`：**右侧抽屉** —— 详情从行尾侧滑出、覆盖在主内容之上（带遮罩，Esc 可关）；
 * - `page`：**跳转详情页** —— 传统整页导航，无任何浮层。
 *
 * 前两种都只在桌面端生效：**移动端一律走 `page`**（视口放不下并列内容，
 * 抽屉也会把详情挤成一条），这条规则收在 `useDetailPreview().open()` 里，
 * 调用方不需要自己判断视口。
 */
export type DetailOpenMode = 'split' | 'sheet' | 'page'

/**
 * 默认打开方式是**跳转详情页**：分屏 / 抽屉是需要用户主动开启的增强，
 * 升级后既有的使用习惯（点行 → 整页详情）保持不变。
 */
export const DEFAULT_DETAIL_OPEN_MODE: DetailOpenMode = 'page'

export function isDetailOpenMode(value: unknown): value is DetailOpenMode {
  return value === 'split' || value === 'sheet' || value === 'page'
}

/**
 * 表单打开方式（新建 / 编辑）：
 * - `dialog`：**弹窗 / 抽屉** —— 居中弹窗或右侧抽屉，适合轻量快速录入；
 * - `split`：**分屏协同** —— 列表缩到 2/3，右侧 1/3 并列内嵌表单，边看列表边录入；
 * - `page`：**跳转独立页面** —— 导航到独立路由页面（如 new.tsx）。
 *
 * 移动端一律自动降级为 `page`。
 */
export type FormOpenMode = 'dialog' | 'split' | 'page'

export const DEFAULT_FORM_OPEN_MODE: FormOpenMode = 'dialog'

export function isFormOpenMode(value: unknown): value is FormOpenMode {
  return value === 'dialog' || value === 'split' || value === 'page'
}

/**
 * 内容区的**页面宽度**（见 `#/lib/page-width`）：
 * - `full`：**全宽** —— 内容铺满外壳剩余宽度（`w-full`），宽表格一屏能看到更多列；
 * - `boxed`：**限宽居中** —— 内容收在 `max-w-[1440px]` 内并水平居中，超宽屏上阅读更聚焦。
 *
 * 只影响内容区（两个外壳的 `<main>`），侧边栏与顶栏不受影响。
 */
export type PageWidthMode = 'full' | 'boxed'

/**
 * 默认**全宽**：这是后台系统，页面上大多是表格，「能看到更多列」比「行宽好看」重要 ——
 * 窄屏下有没有这个上限都一样，宽屏下全宽才是默认该有的形态。
 */
export const DEFAULT_PAGE_WIDTH_MODE: PageWidthMode = 'full'

export function isPageWidthMode(value: unknown): value is PageWidthMode {
  return value === 'full' || value === 'boxed'
}

/**
 * 全屏 AI 对话页（`/$appId/sphere`）的**内容宽度**（落点见 `#/lib/page-width` 的
 * `aiChatWidthClass`）：
 * - `follow`（默认）：**跟随外观** —— 沿用 设置 → 外观 → 页面宽度的**选择**
 *   （全宽 / 限宽居中）。注意只跟「选择」，实际最大宽度是聊天自己的 `max-w-4xl`，
 *   **比页面的 `max-w-[1440px]` 窄**：对话按行读，太宽反而难读；
 * - `full`：不跟外观，单独铺满；
 * - `boxed`：不跟外观，单独限宽居中（同样是 `max-w-4xl`）。
 *
 * 只作用于全屏对话页 —— AI 面板是外壳级的一列 / 浮窗，宽度由面板自己的拖拽决定。
 */
export type AiPageWidthMode = 'follow' | 'full' | 'boxed'

/** 默认跟随外观：AI 不该在用户没要求时给出与页面不同的宽度约定。 */
export const DEFAULT_AI_PAGE_WIDTH_MODE: AiPageWidthMode = 'follow'

export function isAiPageWidthMode(value: unknown): value is AiPageWidthMode {
  return value === 'follow' || value === 'full' || value === 'boxed'
}

/**
 * AI 面板（「Ask AI」）的打开方式（见 `#/features/ai/components/panel`）：
 * - `split`：**Split View** —— 与侧边栏同级的整屏高列，从视口顶端齐平，挤压内容区；
 * - `float`：**Float** —— 从页面底部弹出的小窗，停在行尾侧下角、浮在内容之上，不挤压布局。
 *
 * 形态差异只在桌面端充分展开：窄屏放不下并列两列，Split 会退化成覆盖式整屏面板，
 * Float 则收成贴底的大卡片 —— 两者都成了浮层，只剩尺寸与位置的差别。
 */
export type AiPanelMode = 'split' | 'float'

/**
 * 默认用 Split View：它与侧边栏同级、位置稳定，先给出「AI 一直在那儿」的空间感；
 * Float 更适合「临时问一句就走」的用法，交给用户在 设置 → AI 里主动选。
 */
export const DEFAULT_AI_PANEL_MODE: AiPanelMode = 'split'

export function isAiPanelMode(value: unknown): value is AiPanelMode {
  return value === 'split' || value === 'float'
}

/**
 * AI 输入框左下角的**输入模式**（见 `#/features/ai/components/composer`）：
 * - `ask`：**询问** —— 只回答问题，不动任何数据（默认）；
 * - `auto`：**自动** —— 交给 AI 自行决定要不要执行操作。
 *
 * 两者目前只是**状态**：AI 后端尚未接入，切换它不会改变任何请求
 * （`AiComposer` 只把当前模式读出来显示）。接入时按这个值分流即可，键名不用改。
 */
export type AiComposerMode = 'ask' | 'auto'

/** 默认 `ask`：先给出最保守的语义（只回答、不动数据），主动放权交给用户选。 */
export const DEFAULT_AI_COMPOSER_MODE: AiComposerMode = 'ask'

export function isAiComposerMode(value: unknown): value is AiComposerMode {
  return value === 'ask' || value === 'auto'
}

/**
 * AI 进行中的**页面级光晕**（视口四周的流动光带，见 `#/features/ai/components/activity-glow`）：
 * 默认开启 —— 它只在流式回复 / 等审批时出现，是「AI 还在跑」里最不打扰人的一种反馈；
 * 觉得晃眼可以在 设置 → AI 里关掉。
 */
export const DEFAULT_AI_ACTIVITY_GLOW = true

/**
 * 是否在会话里显示**详细信息** —— 目前包含两样：
 * 1. **工具调用**的状态卡片（执行中 / 完成 / 失败那一条）；
 * 2. **本轮用量**那一行（缓存命中 / 输入 / 输出 token）。
 *
 * 默认**关闭**：普通用户只关心回答内容，不关心中间调了哪个接口、更不关心 token 账；
 * 打开后才会看到模型每一步在做什么，排查问题（工具行为、prompt 前缀是否对齐）时再开。
 *
 * 注意它**不影响审批卡 / 任务卡 / 跳转建议卡** —— 那几样是一次交互或核心进度回显，
 * 不是可以隐藏的"输出"。
 */
export const DEFAULT_AI_SHOW_DETAILS = false

/**
 * AI 的小机器人头像（`bot-avatars` 包的 `type`）。
 *
 * 这里**自己列出 18 个值**，不 import 包的类型：store 是纯数据层，不该依赖一个渲染库。
 * 拼写是否与包一致交给使用处的 TS 检查 —— `<BotAvatar type={…}>` 那一行会把
 * `AiBotAvatar` 赋给 `BotAvatarType`，写错一个字母就编译不过。
 */
export const AI_BOT_AVATARS = [
  'clover',
  'flower',
  'triangle',
  'square',
  'blob',
  'ghost',
  'circle',
  'drop',
  'star',
  'droid',
  'mech',
  'alien',
  'hexagon',
  'cat',
  'cloud',
  'pill',
  'pebble',
  'puddle',
] as const

export type AiBotAvatar = (typeof AI_BOT_AVATARS)[number]

/** 默认 `clover` —— 与包自身的默认一致。 */
export const DEFAULT_AI_BOT_AVATAR: AiBotAvatar = 'clover'

/**
 * AI 的**输出方式**：
 * - `wait`（默认）：等这一轮想完，**一次性**把内容给出来（流式期间只显示"正在思考"）；
 * - `stream`：边生成边显示。
 *
 * 默认 `wait` 是因为"半截的 Markdown"读起来很碎：流式过程中标题、列表、代码块都在
 * 反复重排，普通用户盯着看反而累。想实时看进度的再切 `stream`。
 */
export type AiOutputMode = 'stream' | 'wait'

export const DEFAULT_AI_OUTPUT_MODE: AiOutputMode = 'wait'

export function isAiOutputMode(value: unknown): value is AiOutputMode {
  return value === 'stream' || value === 'wait'
}

/**
 * **什么时候开一段新会话**：
 * - `continue`（默认）：永远续上一个会话 —— 同一份文档里关掉面板再打开、刷新页面、
 *   甚至新标签页，都回到上次那段；
 * - `new`：**每次「重新载入」开一段新的** —— 也就是整页刷新、或在新标签页里打开。
 *   上一段不会丢，它还在会话列表里。
 *
 * 判定「重新载入」的是 `#/features/ai/core/session-boot` 的 `isDocumentReload()`（sessionStorage
 * 标记 + 卸载时清除）。所以 `new` 的粒度是**每份文档一段会话**，不是「每次打开面板」：
 * 同一页面里把面板关掉再打开，问的还是同一件事，接着上一段说。
 *
 * 生效点在 `#/features/ai/core/session-store` 的 `loadHistory({ fresh })` —— `AiConversation`
 * 挂载时传 `sessionMode === 'new' && isDocumentReload()`。面板自己不再插手会话
 * （旧实现在打开上升沿清内存会话，那与「同一页面内接着上一段」相矛盾）。
 *
 * 注意：设置改完要**等下一次重新载入**才生效（`isDocumentReload()` 每份文档只判一次）。
 */
export type AiSessionMode = 'continue' | 'new'

export const DEFAULT_AI_SESSION_MODE: AiSessionMode = 'continue'

export function isAiSessionMode(value: unknown): value is AiSessionMode {
  return value === 'continue' || value === 'new'
}

/**
 * AI 回答时是否**自动滚动到最新内容**（默认开）。
 *
 * 关掉之后新内容进来时视图不动，用户自己滚。要读历史时这个开关比"每次都被拽回底部"友好；
 * 而**开着的时候**手动往上翻也会临时暂停跟滚（滚回底部即恢复）—— 那是运行时的临时状态，
 * 不是这个设置，见 `#/features/ai/components/panel`。
 */
export const DEFAULT_AI_AUTO_SCROLL = true

/**
 * 「自动跳转」默认**关闭** —— 询问模式下跳转要先问用户。
 *
 * 跳转本身是只读动作（`navigate_to` 归 `read` 档），但它会把用户**带离当前页面**，
 * 所以在**询问模式**下面板会弹一张三选一确认卡（带我去 / 本会话自动跳转 / 先不跳）；
 * 选「本会话自动跳转」后本会话内不再问（会话级授权，见 `session-permissions.ts` 的
 * `NAVIGATION_GRANT`）。这个开关是给"我就要它直接带路"的用户开的后门：
 * 开了之后询问模式连那张卡都不弹。
 *
 * **自动模式不需要它**（自动模式本来就等于始终允许，直接跳）。它也**只作用于面板**：
 * 全屏对话页永远给建议卡（跳转由用户点卡片触发）。
 */
export const DEFAULT_AI_AUTO_NAVIGATE = false

/**
 * AI 权限默认档：**只读**。
 *
 * 刻意保守：它是「AI 能对我的数据做什么」的总闸，默认应该是"只能看"——
 * 想让它填表、提交、调写接口，用户得自己到设置里去开。这与"默认帮你做更多"
 * 的常规产品直觉相反，但对一个能改数据的 agent，稳妥优先。
 */
export const DEFAULT_AI_PERMISSION: AiPermissionMode = 'readonly'

/**
 * `custom` 档下勾选的**能力格子**（`page:read` / `data:write` / `form:submit` …，见 `#/features/ai/core/capabilities`）。
 *
 * 默认空 —— 选了自定义却什么都没勾，等于什么都做不了（与「只读」不同：只读还有预设的几格）。
 */
export const DEFAULT_AI_CAPABILITIES: readonly AiCapabilityGrant[] = []

export function isAiPermissionMode(value: unknown): value is AiPermissionMode {
  return value === 'full' || value === 'readonly' || value === 'custom'
}

/**
 * AI 的**输出语言**。
 *
 * - `auto`（默认）：跟随界面语言 —— 界面是什么语言，AI 就用什么语言回答；
 * - 具体语言：单独指定，用于「界面中文但想让 AI 答英文」这类情况。
 *
 * 注意它是**界面语言之外的第二个语言维度**，别把两者混起来：界面语言决定按钮和标题
 * 怎么写（`locale`），这个只决定 AI 怎么说话。
 */
export type AiOutputLanguage = 'auto' | LocaleKey

export const DEFAULT_AI_OUTPUT_LANGUAGE: AiOutputLanguage = 'auto'

export function isAiOutputLanguage(value: unknown): value is AiOutputLanguage {
  return value === 'auto' || isLocaleKey(value)
}

/**
 * AI 功能的**总开关**。
 *
 * 关掉后顶栏不再显示「Ask AI」按钮、面板也不会出现 —— 相当于把这个测试阶段的功能
 * 从界面上摘掉。默认开启：它已经在用，默认关掉会让现有用户以为功能没了。
 *
 * 与其它 AI 偏好一样按应用隔离（admin.preferences 的 appId 分区）：
 * 每个应用可以各自决定要不要这个入口。
 */
export const DEFAULT_AI_ENABLED = true

export function isAiBotAvatar(value: unknown): value is AiBotAvatar {
  return (
    typeof value === 'string' && (AI_BOT_AVATARS as readonly string[]).includes(value)
  )
}

/** 偏好存储键（实际落盘会带 `:<appId>` 后缀，见 `scoped-storage`）。 */
export const PREFERENCES_STORAGE_KEY = 'admin.preferences'

/**
 * 「默认」标记：选中它表示**不覆盖任何 Kumo 令牌**，完全使用 Kumo 自带主题色。
 *
 * 刻意用一个不等于任何具体色值的字符串，这样它既能被持久化，
 * 又不会与"用户真的选了某个颜色"混淆。
 */
export const DEFAULT_COLOR_VALUE = 'default'

/** 强调色 / 中性色的默认值：都是「默认」（不改动 Kumo 任何东西）。 */
export const DEFAULT_ACCENT_COLOR = DEFAULT_COLOR_VALUE
export const DEFAULT_NEUTRAL_COLOR = DEFAULT_COLOR_VALUE

/** 色板里的一个色点：值 + 用于 tooltip / 可访问名称的文案。 */
export interface ThemeColorOption {
  value: string
  /** `common` 命名空间下的文案键（`profile.settings.colors.*`） */
  labelKey: string
  /** i18n 缺失时的回落名称 */
  fallback: string
}

/**
 * 强调色调色盘。**第一项是「默认」**（Kumo 原生品牌色，不做任何覆盖）。
 */
export const ACCENT_COLOR_OPTIONS: readonly ThemeColorOption[] = [
  { value: DEFAULT_COLOR_VALUE, labelKey: 'profile.settings.colors.default', fallback: '默认' },
  { value: '#f6821f', labelKey: 'profile.settings.colors.orange', fallback: '橙色' },
  { value: '#3b82f6', labelKey: 'profile.settings.colors.blue', fallback: '蓝色' },
  { value: '#8b5cf6', labelKey: 'profile.settings.colors.purple', fallback: '紫色' },
  { value: '#10b981', labelKey: 'profile.settings.colors.green', fallback: '绿色' },
  { value: '#ef4444', labelKey: 'profile.settings.colors.red', fallback: '红色' },
]

/**
 * 中性色（灰阶）调色盘：决定分隔线 / 填充 / 控件底色的冷暖。
 * **第一项同样是「默认」**（Kumo 原生灰阶）。
 */
export const NEUTRAL_COLOR_OPTIONS: readonly ThemeColorOption[] = [
  { value: DEFAULT_COLOR_VALUE, labelKey: 'profile.settings.colors.default', fallback: '默认' },
  { value: '#64748b', labelKey: 'profile.settings.colors.coolGray', fallback: '冷灰' },
  { value: '#6b7280', labelKey: 'profile.settings.colors.gray', fallback: '中性灰' },
  { value: '#71717a', labelKey: 'profile.settings.colors.zinc', fallback: '锌灰' },
  { value: '#78716c', labelKey: 'profile.settings.colors.warmGray', fallback: '暖灰' },
]

/** 旧版三个独立键：迁移完成后删除，避免两份数据并存。 */
const LEGACY_PREFERENCE_KEYS = {
  locale: 'admin.locale',
  colorMode: 'admin.color-mode',
  timezone: 'admin.timezone',
} as const

export function isColorMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readLegacyPreference<T extends string>(
  key: string,
  isValid: (value: unknown) => value is T,
): T | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(key)
  return isValid(raw) ? raw : null
}

interface PreferencesState {
  locale: LocaleKey
  colorMode: ColorMode
  timezone: TimezoneKey
  /** 应用强调色（十六进制）：覆盖 `--color-kumo-brand`，全站品牌位即时生效 */
  accentColor: string
  /** 应用中性色（十六进制）：覆盖分隔线 / 填充等表面令牌 */
  neutralColor: string
  /** 表格里打开详情的方式（桌面端限定，移动端强制 `page`） */
  detailOpenMode: DetailOpenMode
  /** 表单打开方式：弹窗 / 分屏 / 跳转独立页面（移动端强制 `page`） */
  formOpenMode: FormOpenMode
  /** 内容区宽度：全宽 / 限宽居中（只影响两个外壳的 `<main>`） */
  pageWidth: PageWidthMode
  /** 全屏 AI 对话页的内容宽度：跟随外观 / 全宽 / 限宽居中（只影响 `/$appId/sphere`） */
  aiPageWidth: AiPageWidthMode
  /** AI 面板（「Ask AI」）的打开方式：分屏列 / 底部浮窗 */
  aiPanelMode: AiPanelMode
  /** 每次打开 AI 面板时用的是新会话，还是续上一个（默认续上） */
  aiSessionMode: AiSessionMode
  /** AI 输入框的输入模式：询问 / 自动 */
  aiComposerMode: AiComposerMode
  /** AI 进行中是否在视口四周显示流动光带 */
  aiActivityGlow: boolean
  /** 是否在会话里显示详细信息（工具调用卡片 + 本轮用量；默认关，只给内容） */
  aiShowDetails: boolean
  /** AI 的小机器人头像形状（默认 clover） */
  aiBotAvatar: AiBotAvatar
  /** AI 的回答是边生成边显示，还是想完一次性给出（默认后者） */
  aiOutputMode: AiOutputMode
  /** AI 回答时是否自动滚动到最新内容（默认开） */
  aiAutoScroll: boolean
  /** 面板里跳转页面是否免确认（默认关：先问一次；同意后本会话内不再问） */
  aiAutoNavigate: boolean
  /** AI 权限档（默认只读）——「能不能用」，与「要不要问」的模式正交 */
  aiPermission: AiPermissionMode
  /** `custom` 档下勾选的**能力格子**（`page:read` / `data:write` …） */
  aiCapabilities: readonly AiCapabilityGrant[]
  /** AI 用什么语言回答（默认跟随界面语言） */
  aiOutputLanguage: AiOutputLanguage
  /** AI 功能总开关（默认开）—— 关掉后顶栏不显示入口 */
  aiEnabled: boolean
  setLocale: (locale: LocaleKey) => void
  setColorMode: (colorMode: ColorMode) => void
  setTimezone: (timezone: TimezoneKey) => void
  setAccentColor: (accentColor: string) => void
  setNeutralColor: (neutralColor: string) => void
  setDetailOpenMode: (detailOpenMode: DetailOpenMode) => void
  setFormOpenMode: (formOpenMode: FormOpenMode) => void
  setPageWidth: (pageWidth: PageWidthMode) => void
  setAiPageWidth: (aiPageWidth: AiPageWidthMode) => void
  setAiPanelMode: (aiPanelMode: AiPanelMode) => void
  setAiSessionMode: (aiSessionMode: AiSessionMode) => void
  setAiComposerMode: (aiComposerMode: AiComposerMode) => void
  setAiActivityGlow: (aiActivityGlow: boolean) => void
  setAiShowDetails: (aiShowDetails: boolean) => void
  setAiBotAvatar: (aiBotAvatar: AiBotAvatar) => void
  setAiOutputMode: (aiOutputMode: AiOutputMode) => void
  setAiAutoScroll: (aiAutoScroll: boolean) => void
  setAiAutoNavigate: (aiAutoNavigate: boolean) => void
  setAiPermission: (aiPermission: AiPermissionMode) => void
  setAiCapabilities: (aiCapabilities: AiCapabilityGrant[]) => void
  setAiOutputLanguage: (aiOutputLanguage: AiOutputLanguage) => void
  setAiEnabled: (aiEnabled: boolean) => void
}

type PersistedPreferences = Pick<
  PreferencesState,
  | 'locale'
  | 'colorMode'
  | 'timezone'
  | 'accentColor'
  | 'neutralColor'
  | 'detailOpenMode'
  | 'formOpenMode'
  | 'pageWidth'
  | 'aiPageWidth'
  | 'aiPanelMode'
  | 'aiSessionMode'
  | 'aiComposerMode'
  | 'aiActivityGlow'
  | 'aiShowDetails'
  | 'aiBotAvatar'
  | 'aiOutputMode'
  | 'aiAutoScroll'
  | 'aiAutoNavigate'
  | 'aiPermission'
  | 'aiCapabilities'
  | 'aiOutputLanguage'
  | 'aiEnabled'
>

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // 初始值优先取旧键（一次性迁移），否则按浏览器语言 / 系统主题 / 默认时区
      locale:
        readLegacyPreference(LEGACY_PREFERENCE_KEYS.locale, isLocaleKey) ??
        getBrowserLocale(),
      colorMode:
        readLegacyPreference(LEGACY_PREFERENCE_KEYS.colorMode, isColorMode) ??
        'system',
      timezone:
        readLegacyPreference(LEGACY_PREFERENCE_KEYS.timezone, isTimezoneKey) ??
        DEFAULT_TIMEZONE,
      accentColor: DEFAULT_ACCENT_COLOR,
      neutralColor: DEFAULT_NEUTRAL_COLOR,
      detailOpenMode: DEFAULT_DETAIL_OPEN_MODE,
      formOpenMode: DEFAULT_FORM_OPEN_MODE,
      pageWidth: DEFAULT_PAGE_WIDTH_MODE,
      aiPageWidth: DEFAULT_AI_PAGE_WIDTH_MODE,
      aiPanelMode: DEFAULT_AI_PANEL_MODE,
      aiSessionMode: DEFAULT_AI_SESSION_MODE,
      aiComposerMode: DEFAULT_AI_COMPOSER_MODE,
      aiActivityGlow: DEFAULT_AI_ACTIVITY_GLOW,
      aiShowDetails: DEFAULT_AI_SHOW_DETAILS,
      aiBotAvatar: DEFAULT_AI_BOT_AVATAR,
      aiOutputMode: DEFAULT_AI_OUTPUT_MODE,
      aiAutoScroll: DEFAULT_AI_AUTO_SCROLL,
      aiAutoNavigate: DEFAULT_AI_AUTO_NAVIGATE,
      aiPermission: DEFAULT_AI_PERMISSION,
      aiCapabilities: DEFAULT_AI_CAPABILITIES,
      aiOutputLanguage: DEFAULT_AI_OUTPUT_LANGUAGE,
      aiEnabled: DEFAULT_AI_ENABLED,
      setLocale: (locale) => set({ locale }),
      setColorMode: (colorMode) => set({ colorMode }),
      setTimezone: (timezone) => set({ timezone }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setNeutralColor: (neutralColor) => set({ neutralColor }),
      setDetailOpenMode: (detailOpenMode) => set({ detailOpenMode }),
      setFormOpenMode: (formOpenMode) => set({ formOpenMode }),
      setPageWidth: (pageWidth) => set({ pageWidth }),
      setAiPageWidth: (aiPageWidth) => set({ aiPageWidth }),
      setAiPanelMode: (aiPanelMode) => set({ aiPanelMode }),
      setAiSessionMode: (aiSessionMode) => set({ aiSessionMode }),
      setAiComposerMode: (aiComposerMode) => set({ aiComposerMode }),
      setAiActivityGlow: (aiActivityGlow) => set({ aiActivityGlow }),
      setAiShowDetails: (aiShowDetails) => set({ aiShowDetails }),
      setAiBotAvatar: (aiBotAvatar) => set({ aiBotAvatar }),
      setAiOutputMode: (aiOutputMode) => set({ aiOutputMode }),
      setAiAutoScroll: (aiAutoScroll) => set({ aiAutoScroll }),
      setAiAutoNavigate: (aiAutoNavigate) => set({ aiAutoNavigate }),
      setAiPermission: (aiPermission) => set({ aiPermission }),
      setAiCapabilities: (aiCapabilities) => set({ aiCapabilities }),
      setAiOutputLanguage: (aiOutputLanguage) => set({ aiOutputLanguage }),
      setAiEnabled: (aiEnabled) => set({ aiEnabled }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      storage: createScopedJSONStorage<PersistedPreferences>({
        // 新应用先继承 `:global` 基线，改过之后才独立
        fallbackToGlobal: true,
        // 兼容上一版的无后缀 `admin.preferences`（升级期只读一次）
        legacyUnscoped: true,
      }),
      // 只持久化数据，不持久化 action
      partialize: (state): PersistedPreferences => ({
        locale: state.locale,
        colorMode: state.colorMode,
        timezone: state.timezone,
        accentColor: state.accentColor,
        neutralColor: state.neutralColor,
        detailOpenMode: state.detailOpenMode,
        formOpenMode: state.formOpenMode,
        pageWidth: state.pageWidth,
        aiPageWidth: state.aiPageWidth,
        aiPanelMode: state.aiPanelMode,
        aiSessionMode: state.aiSessionMode,
        aiComposerMode: state.aiComposerMode,
        aiActivityGlow: state.aiActivityGlow,
        aiShowDetails: state.aiShowDetails,
        aiBotAvatar: state.aiBotAvatar,
        aiOutputMode: state.aiOutputMode,
        aiAutoScroll: state.aiAutoScroll,
        aiAutoNavigate: state.aiAutoNavigate,
        aiPermission: state.aiPermission,
        aiCapabilities: state.aiCapabilities,
        aiOutputLanguage: state.aiOutputLanguage,
        aiEnabled: state.aiEnabled,
      }),
      /**
       * 旧存档可能缺字段（`detailOpenMode` / `aiPanelMode` 都是后续新增的），
       * 枚举也不该被外部写坏 —— 合并时**逐项校验**，非法 / 缺失一律回落到当前值
       * （也就是各字段的默认值）。
       *
       * 不能只写 `{...current, ...saved}`：那样 `saved` 的可选属性会把必填字段
       * 推断成 `T | undefined`（旧存档缺字段时运行时也真的会变 undefined）。
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedPreferences>
        /*
          旧存档迁移：这个开关原名 `aiShowToolCalls`（只控制工具卡片），后来扩成
          「显示详细信息」（工具卡片 + 本轮用量）并改名为 `aiShowDetails` ——
          旧值直接继承，不让已经打开它的用户再开一次。
        */
        const legacyShowToolCalls = (
          saved as { aiShowToolCalls?: unknown }
        ).aiShowToolCalls
        return {
          ...current,
          locale: isLocaleKey(saved.locale) ? saved.locale : current.locale,
          colorMode: isColorMode(saved.colorMode)
            ? saved.colorMode
            : current.colorMode,
          timezone: isTimezoneKey(saved.timezone)
            ? saved.timezone
            : current.timezone,
          accentColor: saved.accentColor ?? current.accentColor,
          neutralColor: saved.neutralColor ?? current.neutralColor,
          detailOpenMode: isDetailOpenMode(saved.detailOpenMode)
            ? saved.detailOpenMode
            : current.detailOpenMode,
          formOpenMode: isFormOpenMode(saved.formOpenMode)
            ? saved.formOpenMode
            : current.formOpenMode,
          pageWidth: isPageWidthMode(saved.pageWidth)
            ? saved.pageWidth
            : current.pageWidth,
          aiPageWidth: isAiPageWidthMode(saved.aiPageWidth)
            ? saved.aiPageWidth
            : current.aiPageWidth,
          aiPanelMode: isAiPanelMode(saved.aiPanelMode)
            ? saved.aiPanelMode
            : current.aiPanelMode,
          aiSessionMode: isAiSessionMode(saved.aiSessionMode)
            ? saved.aiSessionMode
            : current.aiSessionMode,
          aiComposerMode: isAiComposerMode(saved.aiComposerMode)
            ? saved.aiComposerMode
            : current.aiComposerMode,
          // 布尔没有现成的校验器：只认 boolean，旧存档缺字段或被写坏时回落默认值
          aiActivityGlow:
            typeof saved.aiActivityGlow === 'boolean'
              ? saved.aiActivityGlow
              : current.aiActivityGlow,
          aiShowDetails:
            typeof saved.aiShowDetails === 'boolean'
              ? saved.aiShowDetails
              : typeof legacyShowToolCalls === 'boolean'
                ? legacyShowToolCalls
                : current.aiShowDetails,
          aiBotAvatar: isAiBotAvatar(saved.aiBotAvatar)
            ? saved.aiBotAvatar
            : current.aiBotAvatar,
          aiOutputMode: isAiOutputMode(saved.aiOutputMode)
            ? saved.aiOutputMode
            : current.aiOutputMode,
          aiAutoScroll:
            typeof saved.aiAutoScroll === 'boolean'
              ? saved.aiAutoScroll
              : current.aiAutoScroll,
          aiAutoNavigate:
            typeof saved.aiAutoNavigate === 'boolean'
              ? saved.aiAutoNavigate
              : current.aiAutoNavigate,
          aiPermission: isAiPermissionMode(saved.aiPermission)
            ? saved.aiPermission
            : current.aiPermission,
          aiOutputLanguage: isAiOutputLanguage(saved.aiOutputLanguage)
            ? saved.aiOutputLanguage
            : current.aiOutputLanguage,
          aiEnabled:
            typeof saved.aiEnabled === 'boolean' ? saved.aiEnabled : current.aiEnabled,
          aiCapabilities: Array.isArray(saved.aiCapabilities)
            ? saved.aiCapabilities.filter(isKnownCapabilityGrant)
            : current.aiCapabilities,
        }
      },
    },
  ),
)

// 切换应用时重新水合：从 `admin.preferences:<新 appId>` 读取，
// 没有则回落 `:global` 基线；订阅方（i18n / 主题 / 时区）随之自动切换。
registerScopedStore('preferences', () => {
  void usePreferencesStore.persist.rehydrate()
})

// 多标签页同步：其它标签页改了语言 / 外观 / 主题色，这一页立即跟随
enableCrossTabSync(usePreferencesStore, {
  storageName: PREFERENCES_STORAGE_KEY,
  scoped: true,
})


/** 非 React 上下文读取偏好（i18n 初始化、时间格式化等）。 */
export function getPreferences() {
  return usePreferencesStore.getState()
}

// 一次性迁移：把旧版的三个独立键与无后缀的 `admin.preferences` 收进当前命名空间
// （模块加载时作用域还是 `:global`，也就是登录前基线），然后删除旧键。
// 放在模块末尾而不是 onRehydrateStorage 里：后者只在新键缺失时触发，
// 而这里要的是「只要旧键还在就收拢一次」。
if (typeof window !== 'undefined') {
  const legacyKeys = [
    ...Object.values(LEGACY_PREFERENCE_KEYS),
    PREFERENCES_STORAGE_KEY,
  ]
  const hasLegacy = legacyKeys.some(
    (key) => window.localStorage.getItem(key) !== null,
  )
  if (hasLegacy) {
    // setState 传入新对象才会触发 persist 写盘（同引用会被 zustand 跳过）
    const { locale, colorMode, timezone } = usePreferencesStore.getState()
    usePreferencesStore.setState({ locale, colorMode, timezone })
    legacyKeys.forEach((key) => window.localStorage.removeItem(key))
  }
}


/**
 * 一次性迁移：把「上一版的具体默认色」收敛回 `DEFAULT_COLOR_VALUE`。
 *
 * 背景：最初这两项的默认值是**具体色值**（强调色 `#f6821f`、中性色 `#64748b`），
 * 它们随偏好一起被写进过存档。后来语义改成「默认 = 不覆盖任何 Kumo 令牌」，
 * 但老存档里那个 `#f6821f` 会被当成「用户主动选的橙色」继续写 `--color-kumo-brand` ——
 * 典型症状是品牌色从 Kumo 原生**蓝**变成 Cloudflare **橙**，整片界面（焦点环、选中态、
 * 按钮）都跟着偏，看起来"颜色不正常"。
 *
 * 用标记位保证**只跑一次**：否则用户之后主动选的橙色（恰好也是 `#f6821f`）会被反复改回去。
 * 迁移只 `setState`，不直接调 `applyAppearanceTheme` —— 那会造成 store ↔ apply 的循环依赖；
 * 而 `apply-appearance-theme` 模块自己在加载时会应用一次，并订阅了后续变化。
 */
const APPEARANCE_MIGRATION_FLAG = 'admin.appearance-default-migrated'
const LEGACY_DEFAULT_COLORS = new Set(['#f6821f', '#64748b'])

if (
  typeof window !== 'undefined' &&
  !window.localStorage.getItem(APPEARANCE_MIGRATION_FLAG)
) {
  const { accentColor, neutralColor } = usePreferencesStore.getState()
  const patch: { accentColor?: string; neutralColor?: string } = {}
  if (LEGACY_DEFAULT_COLORS.has(accentColor)) patch.accentColor = DEFAULT_COLOR_VALUE
  if (LEGACY_DEFAULT_COLORS.has(neutralColor)) patch.neutralColor = DEFAULT_COLOR_VALUE

  if (Object.keys(patch).length > 0) {
    usePreferencesStore.setState(patch)
  }
  window.localStorage.setItem(APPEARANCE_MIGRATION_FLAG, '1')
}
