import { Select, Switch, Tabs, Tooltip } from '@cloudflare/kumo'
import {
  ArrowSquareOutIcon,
  ArrowsInLineHorizontalIcon,
  ArrowsOutLineHorizontalIcon,
  ColumnsIcon,
  DesktopIcon,
  MoonIcon,
  SidebarSimpleIcon,
  SunIcon,
} from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  APP_SHELL_PREVIEW_LIST_LAYOUT,
  AppShellPreview,
  type AppShellPreviewLayout,
} from '#/components/app-shell-preview'
import { PageHeader } from '#/components/page-header'
import {
  SettingChoicePreview,
  usePreviewAnimation,
} from '#/components/settings-choice-preview'
import { SettingsCard, SettingRow } from '#/components/settings-card'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { cn } from '#/lib/cn'
import {
  ACCENT_COLOR_OPTIONS,
  DEFAULT_COLOR_VALUE,
  NEUTRAL_COLOR_OPTIONS,
  usePreferencesStore,
  useShellUiStore,
  type DetailOpenMode,
  type FormOpenMode,
  type PageWidthMode,
  type ThemeColorOption,
} from '#/lib/store'
import { useColorMode } from '#/lib/use-color-mode'
import type { ColorMode } from '#/lib/use-color-mode'
import { useLocale } from '#/lib/use-locale'
import type { LocaleKey } from '#/lib/use-locale'
import { useTimezone } from '#/lib/timezone'
import type { TimezoneKey } from '#/lib/timezone'

/**
 * 设置 → 外观（/_main/settings/appearance.tsx -> "/settings/appearance"）
 *
 * 这一页装的是六项「本机偏好」，都是**即时生效 + 即时持久化**，
 * 所以这里是设置页而不是表单页：没有保存按钮，也没有 dirty 状态
 * （不要套 `#/components/unsaved-changes-bar` 那套编辑态契约）。
 *
 * - 主题：`#/lib/use-color-mode`（偏好 store 的 colorMode）
 * - 语言：`#/lib/use-locale`（偏好 store 的 locale，含 RTL 切换）
 * - 时区：`#/lib/timezone`（偏好 store 的 timezone，全站时间格式化共用同一份状态）
 * - 详情打开方式：`#/lib/store` 的 detailOpenMode（表格里点开详情的行为，见 .agents/docs/detail-preview.md）
 * - 页面宽度：`#/lib/store` 的 pageWidth（全宽 / 限宽居中，落点在 `#/lib/page-width`）
 * - 界面动效：`#/lib/store` 的 motionEnabled（关掉后 AI 面板与全屏对话页的过渡直接切换，
 *   判定在 `#/lib/use-motion`）
 *
 * 前五项持久化在 `admin.preferences:<appId>`（按应用隔离，见 .agents/docs/store.md）；
 * 最后一项是**全局**的 `admin.shell-ui` —— 「要不要动效」换个应用仍成立，不该按应用各存一份
 * （理由见 `#/lib/store/shell-ui-store` 里 `motionEnabled` 的注释）。
 * 布局是「一张卡片 + 若干设置行」，每行左 label、右控件（`SettingRow`）——
 * 用 flex 的书写方向自适应，RTL 下主轴翻转，label 自动落到右边，**不要写 rtl: 变体**。
 *
 * 控件选型：**短枚举（≤3 项）一律用 Kumo `Tabs` 的 segmented 分段控件**
 * （主题、详情打开方式、页面宽度），长枚举（语言 7 项、时区 8 项）用 `Select`，
 * **开关型偏好用 `Switch`**（界面动效）；
 * `Tabs` 是数据驱动 + 受控的，可访问名称需要外层 `role="group"` 兜（详见该处注释）。
 *
 * **三处「可视化说明」都用 `#/components/app-shell-preview` 的通用缩略图**：
 * 「调色盘」行右侧静态展示强调色的落点；「详情打开方式」与「页面宽度」则更进一步 ——
 * 每个分段选项悬浮时弹一个浮层，在缩略图里**把页面变化演一遍**
 * （主列被挤压 / 被覆盖 / 整块换成详情页；内容区收窄 / 展开），
 * 见 `DetailOpenModePreview` 与 `PageWidthPreview`。
 *
 * 账号安全、已连接应用、API Token 等更重的设置后续再扩展 —— 往侧边栏加一项即可。
 */
export const Route = createFileRoute('/_main/settings/appearance')({
  component: AppearanceSettingsPage,
})

interface SettingsChoiceOption<TKey extends string> {
  key: TKey
  labelKey: string
  defaultLabel: string
  icon: typeof SunIcon
}

type ThemeOption = SettingsChoiceOption<ColorMode>

const THEME_OPTIONS: ThemeOption[] = [
  { key: 'light', labelKey: 'theme.light', defaultLabel: '浅色模式', icon: SunIcon },
  { key: 'dark', labelKey: 'theme.dark', defaultLabel: '深色模式', icon: MoonIcon },
  { key: 'system', labelKey: 'theme.system', defaultLabel: '跟随系统', icon: DesktopIcon },
]

/**
 * 表格里打开详情的方式（见 `#/components/detail-preview`）。
 *
 * 三项都是「桌面端限定」：移动端视口放不下并列内容、抽屉也会把详情挤成一条，
 * 因此移动端一律按 `page` 处理 —— 这条降级写在预览能力的 `open()` 里，
 * 这里只在 hint 里如实告知，不做「移动端隐藏选项」这种会让人以为设置丢了的处理。
 */
const DETAIL_OPEN_MODE_OPTIONS: SettingsChoiceOption<DetailOpenMode>[] = [
  {
    key: 'split',
    labelKey: 'profile.settings.detailOpenModes.split',
    defaultLabel: '分屏预览',
    icon: ColumnsIcon,
  },
  {
    key: 'sheet',
    labelKey: 'profile.settings.detailOpenModes.sheet',
    defaultLabel: '右侧抽屉',
    icon: SidebarSimpleIcon,
  },
  {
    key: 'page',
    labelKey: 'profile.settings.detailOpenModes.page',
    defaultLabel: '跳转详情页',
    icon: ArrowSquareOutIcon,
  },
]

/**
 * 表单打开方式（新建 / 编辑）：
 * - `dialog`：弹窗录入（默认，轻量快捷）；
 * - `split`：分屏协同（与列表并列）；
 * - `page`：跳转独立页面（独立全屏路由）。
 * 移动端始终跳转独立页面。
 */
const FORM_OPEN_MODE_OPTIONS: SettingsChoiceOption<FormOpenMode>[] = [
  {
    key: 'dialog',
    labelKey: 'profile.settings.formOpenModes.dialog',
    defaultLabel: '弹窗录入',
    icon: SidebarSimpleIcon,
  },
  {
    key: 'split',
    labelKey: 'profile.settings.formOpenModes.split',
    defaultLabel: '分屏协同',
    icon: ColumnsIcon,
  },
  {
    key: 'page',
    labelKey: 'profile.settings.formOpenModes.page',
    defaultLabel: '独立页面',
    icon: ArrowSquareOutIcon,
  },
]

const FORM_MODE_PREVIEW_LAYOUTS: Record<FormOpenMode, AppShellPreviewLayout> = {
  dialog: { content: 'list', panel: 'cover' },
  split: { content: 'list', panel: 'push' },
  page: { content: 'detail', panel: 'none' },
}

/**
 * 页面宽度：两项短枚举，同样走分段控件 + 悬浮预览。
 *
 * 默认**全宽**（见 `DEFAULT_PAGE_WIDTH_MODE`）：后台页面大多是表格，列看得越多越好。
 * 图标用「向外/向内」的一对横箭头 —— 正好对应内容区撑满与收窄这两个动作，
 * 比边框类图标更像「宽度」这件事本身。
 */
const PAGE_WIDTH_OPTIONS: SettingsChoiceOption<PageWidthMode>[] = [
  {
    key: 'full',
    labelKey: 'profile.settings.pageWidths.full',
    defaultLabel: '全宽',
    icon: ArrowsOutLineHorizontalIcon,
  },
  {
    key: 'boxed',
    labelKey: 'profile.settings.pageWidths.boxed',
    defaultLabel: '限宽居中',
    icon: ArrowsInLineHorizontalIcon,
  },
]

/**
 * 详情打开方式 → 缩略图布局的映射（缩略图本身与这三种模式无关，是通用的）。
 *
 * 三者都对应真实外壳里发生的事：`split` 主列让出约 1/3 给行尾面板（挤压），
 * `sheet` 面板覆盖在主列之上（抽屉是模态、满视口高），`page` 不出现面板，
 * 而是整块内容区换成详情页。这份映射是**呈现层**的约定，所以留在页面里，
 * `#/components/app-shell-preview` 只认 `content` / `panel` 两个字段。
 */
const DETAIL_MODE_PREVIEW_LAYOUTS: Record<DetailOpenMode, AppShellPreviewLayout> = {
  split: { content: 'list', panel: 'push' },
  sheet: { content: 'list', panel: 'cover' },
  page: { content: 'detail', panel: 'none' },
}

/**
 * 悬浮预览内容：起点固定是列表态（`APP_SHELL_PREVIEW_LIST_LAYOUT`）—— 这正是真实场景的起点，
 * 人正停在列表页上、点了一行，然后才会看到三种打开方式的差别。两阶段时序收在
 * `usePreviewAnimation`（见 `#/components/settings-choice-preview`）。
 */
function DetailOpenModePreview({
  mode,
  accentColor,
}: {
  mode: DetailOpenMode
  accentColor: string
}) {
  const layout = usePreviewAnimation(
    APP_SHELL_PREVIEW_LIST_LAYOUT,
    DETAIL_MODE_PREVIEW_LAYOUTS[mode],
  )

  // 宽度交给外层：缩略图自己带 `w-full max-w-80`，而本仓库的 `cn` 不做类名去重（纯 clsx），
  // 调用处再传一个 `w-*` 会与 `w-full` 同时存在、谁生效取决于 Tailwind 的产出顺序。
  // 288px 是试出来的下限：再窄，分屏态下被挤压的主列就只剩几根看不清的短横条了。
  return (
    <div className="w-72">
      <AppShellPreview layout={layout} accentColor={accentColor} />
    </div>
  )
}

/**
 * 把「详情打开方式」的某个选项接到悬浮预览上。
 *
 * 浮层本身的讲究（hover 热区、只认 hover 打开、可访问名称、内边距、用 `Popover` 而不是
 * `Tooltip` 的原因）都在公共件 `#/components/settings-choice-preview` 里，这里只负责
 * 给出「这一项演什么」—— 页面内保留这一层封装，而不是把业务映射塞进公共件：
 * 缩略图不认识「详情」这些概念，哪种模式对应哪种形态是呈现层的约定。
 */
function DetailOpenModePopover({
  mode,
  label,
  accentColor,
  triggerId,
}: {
  mode: DetailOpenMode
  label: string
  accentColor: string
  triggerId: string
}) {
  return (
    <SettingChoicePreview label={label} triggerId={triggerId}>
      <DetailOpenModePreview mode={mode} accentColor={accentColor} />
    </SettingChoicePreview>
  )
}

function FormOpenModePreview({
  mode,
  accentColor,
}: {
  mode: FormOpenMode
  accentColor: string
}) {
  const layout = usePreviewAnimation(
    APP_SHELL_PREVIEW_LIST_LAYOUT,
    FORM_MODE_PREVIEW_LAYOUTS[mode],
  )

  return (
    <div className="w-72">
      <AppShellPreview layout={layout} accentColor={accentColor} />
    </div>
  )
}

function FormOpenModePopover({
  mode,
  label,
  accentColor,
  triggerId,
}: {
  mode: FormOpenMode
  label: string
  accentColor: string
  triggerId: string
}) {
  return (
    <SettingChoicePreview label={label} triggerId={triggerId}>
      <FormOpenModePreview mode={mode} accentColor={accentColor} />
    </SettingChoicePreview>
  )
}

/**
 * 页面宽度 → 缩略图布局。
 *
 * 与「详情打开方式」不同，这里要演的是**宽度约束本身**，所以起点取**相反的档** ——
 * `boxed` 从全宽收窄、`full` 从限宽展开。只画终态的话，缩略图里「全宽」与默认态
 * 看不出区别，等于没演；两边各自演一遍「动作」，差别才真正落在内容区怎么变上。
 * 列表与面板那部分（`content: 'list'` / `panel: 'none'`）保持基线不动。
 */
const PAGE_WIDTH_PREVIEW_LAYOUTS: Record<PageWidthMode, AppShellPreviewLayout> = {
  full: { content: 'list', panel: 'none', contentWidth: 'full' },
  boxed: { content: 'list', panel: 'none', contentWidth: 'boxed' },
}

/** 两个档位各自的动画起点：一律从另一档起步，于是悬浮哪一项都有「变化」可看。 */
const PAGE_WIDTH_PREVIEW_START: Record<PageWidthMode, AppShellPreviewLayout> = {
  full: { content: 'list', panel: 'none', contentWidth: 'boxed' },
  boxed: { content: 'list', panel: 'none', contentWidth: 'full' },
}

/**
 * 页面宽度预览：两阶段时序来自 `#/components/settings-choice-preview` 的
 * `usePreviewAnimation`（先画起点、停一下再切到目标档）。
 *
 * 宽度交给外层而不是给缩略图传 `w-*`：`AppShellPreview` 自带 `w-full max-w-80`，
 * 本仓库的 `cn` 不做类名去重。这里用 `w-80` 撑满它的上限 —— 限宽档两侧空出来的
 * canvas 需要足够宽度才看得清，窄一档就只剩「表格变窄」这一种读法了。
 */
function PageWidthPreview({
  mode,
  accentColor,
}: {
  mode: PageWidthMode
  accentColor: string
}) {
  const layout = usePreviewAnimation(
    PAGE_WIDTH_PREVIEW_START[mode],
    PAGE_WIDTH_PREVIEW_LAYOUTS[mode],
  )

  return (
    <div className="w-80">
      <AppShellPreview layout={layout} accentColor={accentColor} />
    </div>
  )
}

/** 与「详情打开方式」同一套接法：只负责把某一档接到悬浮浮层上，浮层的讲究在公共件里。 */
function PageWidthPopover({
  mode,
  label,
  accentColor,
  triggerId,
}: {
  mode: PageWidthMode
  label: string
  accentColor: string
  triggerId: string
}) {
  return (
    <SettingChoicePreview label={label} triggerId={triggerId}>
      <PageWidthPreview mode={mode} accentColor={accentColor} />
    </SettingChoicePreview>
  )
}

function AppearanceSettingsPage() {
  const { t } = useTranslation()
  const { mode, setMode } = useColorMode()
  const accentColor = usePreferencesStore((state) => state.accentColor)
  const setAccentColor = usePreferencesStore((state) => state.setAccentColor)
  const neutralColor = usePreferencesStore((state) => state.neutralColor)
  const setNeutralColor = usePreferencesStore((state) => state.setNeutralColor)
  const detailOpenMode = usePreferencesStore((state) => state.detailOpenMode)
  const setDetailOpenMode = usePreferencesStore((state) => state.setDetailOpenMode)
  const formOpenMode = usePreferencesStore((state) => state.formOpenMode)
  const setFormOpenMode = usePreferencesStore((state) => state.setFormOpenMode)
  const pageWidth = usePreferencesStore((state) => state.pageWidth)
  const setPageWidth = usePreferencesStore((state) => state.setPageWidth)
  // 界面动效是**全局**偏好（不按应用隔离），所以在另一个 store 里
  const motionEnabled = useShellUiStore((state) => state.motionEnabled)
  const setMotionEnabled = useShellUiStore((state) => state.setMotionEnabled)
  const { locale, setLocale, supportedLocales } = useLocale()
  const { currentApp, availableApps, selectAppAndComplete } = useAuth()
  const {
    timezone,
    setTimezone,
    supportedTimezones,
    getTimezoneOffsetLabel,
  } = useTimezone()

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title={t('profileNav.settings', '设置')}
        actions={
          availableApps.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-kumo-subtle">
                {t('profile.settings.currentApp', '当前应用：')}
              </span>
              <Select<string>
                aria-label={t('profile.settings.currentApp', '当前应用')}
                className="w-44"
                value={currentApp?.id || availableApps[0]?.id || DEFAULT_APP_ID}
                onValueChange={(next) => {
                  if (next) selectAppAndComplete(next)
                }}
                items={availableApps.map((app) => ({
                  value: app.id,
                  label: app.name,
                }))}
              />
            </div>
          ) : undefined
        }
      />

      {/* 这几项本机偏好同属「通用设置」：都是即时生效、按应用隔离持久化的偏好项 */}
      <SettingsCard title={t('profile.settings.general', '通用设置')}>
          {/*
            主题：三项短枚举，用 Kumo Tabs 的 **segmented** 形态（分段控件）而不是一排 Radio ——
            选项等宽相邻、选中态是一整块滑块，一眼能看出「当前在哪一档」，也更省横向空间。

            用法要点（Kumo 的 Tabs 与 shadcn 那类 compound 组件不同）：
            - **数据驱动**：把选项映射成 `tabs` 数组（`{ value, label }`），没有 Tabs.List / Tabs.Tab 子组件；
            - **受控**：`value` + `onValueChange`，正好映射到偏好 store 的读写；
            - `activateOnFocus`：方向键移动即选中（默认要再按 Enter/Space）——
              设置项是即时生效的，自动激活手感与原来的 Radio 一致；
            - **尺寸用默认值**（不传 `size`）：`base` 的高度与下方 `Select` 一致，
              分段控件本身也需要足够的高度才撑得起选中滑块（`sm` 会明显矮一截）；
            - **可访问名称要自己兜**：Kumo 的 Tabs 只解构固定 props、不透传 `aria-label`
              （同 `Dialog`），所以外面包一层 `role="group"` + `aria-label`，
              读屏进入时先播报是哪一个设置项。
          */}
          <SettingRow
            label={t('theme.label', '主题')}
            hint={t('profile.settings.appearanceHint', '选择界面的主题模式')}
          >
            <div role="group" aria-label={t('theme.label', '主题')}>
              <Tabs
                value={mode}
                onValueChange={(next) => setMode(next as ColorMode)}
                activateOnFocus
                tabs={THEME_OPTIONS.map((item) => {
                  const ItemIcon = item.icon
                  return {
                    value: item.key,
                    label: (
                      <span className="flex items-center gap-2">
                        <ItemIcon size={16} className="text-kumo-subtle" />
                        <span>{t(item.labelKey, item.defaultLabel)}</span>
                      </span>
                    ),
                  }
                })}
              />
            </div>
          </SettingRow>

          {/* 语言：7 项，用下拉；选项名一律用母语自称（nativeName），不随当前界面语言变化 */}
          <SettingRow
            label={t('language', '语言')}
            hint={t('profile.settings.languageHint', '切换管理后台的界面语言')}
          >
            {/* 无可见 label：按 Kumo 的建议走 aria-label（label + hideLabel 已废弃） */}
            <Select<LocaleKey>
              aria-label={t('language', '语言')}
              className="w-56"
              value={locale}
              onValueChange={(next) => {
                if (next) setLocale(next)
              }}
              items={supportedLocales.map((item) => ({
                value: item.key,
                label: item.nativeName,
              }))}
            />
          </SettingRow>

          {/* 时区：8 项，偏移按时区动态计算（马德里 / 纽约有夏令时，不能写死） */}
          <SettingRow
            label={t('timezone.label', '时区')}
            hint={t('profile.settings.timezoneHint', '全站时间展示使用的时区')}
          >
            <Select<TimezoneKey>
              aria-label={t('timezone.label', '时区')}
              className="w-56"
              value={timezone}
              onValueChange={(next) => {
                if (next) setTimezone(next)
              }}
              items={supportedTimezones.map((item) => ({
                value: item.key,
                label: `${t(item.labelKey, item.defaultName)} (${getTimezoneOffsetLabel(item.key)})`,
              }))}
            />
          </SettingRow>

          {/*
            详情打开方式：表格里点开详情时的默认行为（分屏预览 / 右侧抽屉 / 跳转详情页）。
            三项都是即时生效、随偏好按应用隔离持久化 —— 与上面三项同属「通用设置」。
            移动端不支持前两项，降级规则在 #/components/detail-preview，hint 里如实说明。

            这里比「主题」多一层**悬浮预览**：每段选项都盖了一层透明触发区，
            鼠标停上去弹出一个浮层，用通用缩略图把「选了这一项之后页面会怎么变」演一遍
            （分屏 / 抽屉 / 换页三种变化，以及为什么需要它：光看「分屏预览」四个字，
            没人知道出来的是什么）。触发区与浮层的全部讲究（为什么用 `Popover` 而不是
            `Tooltip`、为什么受控只认 hover 这一种打开原因、为什么触发区是不可聚焦的
            `span`）都在公共件 `#/components/settings-choice-preview` 的注释里；
            页面这边只留「选项 → 演示画面」的映射。
          */}
          <SettingRow
            label={t('profile.settings.detailOpenMode', '详情打开方式')}
            hint={t(
              'profile.settings.detailOpenModeHint',
              '表格中打开详情的方式；移动端始终跳转详情页',
            )}
          >
            {/* 与主题同一套分段控件写法（受控 value + activateOnFocus + 默认尺寸 + 外层 group 提供可访问名称） */}
            <div
              role="group"
              aria-label={t('profile.settings.detailOpenMode', '详情打开方式')}
            >
              <Tabs
                value={detailOpenMode}
                onValueChange={(next) => setDetailOpenMode(next as DetailOpenMode)}
                activateOnFocus
                tabs={DETAIL_OPEN_MODE_OPTIONS.map((item) => {
                  const ItemIcon = item.icon
                  const label = t(item.labelKey, item.defaultLabel)
                  return {
                    value: item.key,
                    label: (
                      <span className="flex items-center gap-2">
                        <ItemIcon size={16} className="text-kumo-subtle" />
                        <span>{label}</span>
                        <DetailOpenModePopover
                          mode={item.key}
                          label={label}
                          accentColor={accentColor}
                          // id 既做 trigger 的 id、也做 Root 的 triggerId，页面内唯一即可
                          triggerId={`detail-open-mode-preview-${item.key}`}
                        />
                      </span>
                    ),
                  }
                })}
              />
            </div>
          </SettingRow>

          <SettingRow
            label={t('profile.settings.formOpenMode', '表单打开方式')}
            hint={t(
              'profile.settings.formOpenModeHint',
              '新建或编辑数据时表单的打开方式；移动端始终跳转独立页面',
            )}
          >
            <div
              role="group"
              aria-label={t('profile.settings.formOpenMode', '表单打开方式')}
            >
              <Tabs
                value={formOpenMode}
                onValueChange={(next) => setFormOpenMode(next as FormOpenMode)}
                activateOnFocus
                tabs={FORM_OPEN_MODE_OPTIONS.map((item) => {
                  const ItemIcon = item.icon
                  const label = t(item.labelKey, item.defaultLabel)
                  return {
                    value: item.key,
                    label: (
                      <span className="flex items-center gap-2">
                        <ItemIcon size={16} className="text-kumo-subtle" />
                        <span>{label}</span>
                        <FormOpenModePopover
                          mode={item.key}
                          label={label}
                          accentColor={accentColor}
                          triggerId={`form-open-mode-preview-${item.key}`}
                        />
                      </span>
                    ),
                  }
                })}
              />
            </div>
          </SettingRow>

          {/*
            页面宽度：内容区是全宽还是限宽居中。默认全宽 —— 后台以表格为主，
            屏幕越宽越该把列铺开。它同时作用于两个外壳的 `<main>`（`#/lib/page-width`），
            与「详情打开方式」一样是即时生效、按应用隔离持久化的本机偏好。

            悬浮预览这里演的是**档位切换这个动作**（全宽 ↔ 限宽居中），起点取另一档，
            而不是缩略图的默认态 —— 否则「全宽」那一项的预览与静止画面毫无区别。
          */}
          <SettingRow
            label={t('profile.settings.pageWidth', '页面宽度')}
            hint={t(
              'profile.settings.pageWidthHint',
              '内容区是否限制最大宽度；后台表格建议全宽',
            )}
          >
            {/* 同「详情打开方式」：受控 Tabs + activateOnFocus + 外层 group 兜可访问名称 */}
            <div
              role="group"
              aria-label={t('profile.settings.pageWidth', '页面宽度')}
            >
              <Tabs
                value={pageWidth}
                onValueChange={(next) => setPageWidth(next as PageWidthMode)}
                activateOnFocus
                tabs={PAGE_WIDTH_OPTIONS.map((item) => {
                  const ItemIcon = item.icon
                  const label = t(item.labelKey, item.defaultLabel)
                  return {
                    value: item.key,
                    label: (
                      <span className="flex items-center gap-2">
                        <ItemIcon size={16} className="text-kumo-subtle" />
                        <span>{label}</span>
                        <PageWidthPopover
                          mode={item.key}
                          label={label}
                          accentColor={accentColor}
                          triggerId={`page-width-preview-${item.key}`}
                        />
                      </span>
                    ),
                  }
                })}
              />
            </div>
          </SettingRow>

          {/*
            界面动效：**开关型**偏好，所以用 Kumo `Switch`（同 设置 → AI 的「进行中光晕」），
            并且像那里一样**不传 `label`** —— 那会渲染一行可见文字、与 `SettingRow` 的
            label 重复；改传 `aria-label`，Kumo 的 Switch 会读它作为可访问名称。

            值**不与上面几项同源**：它落在全局的 `admin.shell-ui`（`motionEnabled`），
            不按应用隔离 —— 「要不要动效」换个应用仍然成立，放全局才能关一次全站生效
            （理由见 `#/lib/store/shell-ui-store` 里该字段的注释）。
            系统「减少动态效果」优先级更高：系统要求减少动效时，这个开关开着也不播，
            判定统一在 `#/lib/use-motion`。
          */}
          <SettingRow
            label={t('profile.settings.motion', '界面动效')}
            hint={t(
              'profile.settings.motionHint',
              '关闭后 AI 面板与全屏对话页的过渡直接切换，不做动画；系统的「减少动态效果」始终优先',
            )}
          >
            <Switch
              checked={motionEnabled}
              onCheckedChange={setMotionEnabled}
              aria-label={t('profile.settings.motion', '界面动效')}
            />
          </SettingRow>
      </SettingsCard>

      {/* 应用外观：一栏一个主题，左 label 右内容（调色盘那栏右侧就是预览） */}
      <SettingsCard title={t('profile.settings.appBoard', '应用外观')}>
          {/* 调色盘：右侧整块就是白板预览，选中的强调色实时反映在里面
              （不传 layout：默认就是「只有列表」的基线形态） */}
          <SettingRow label={t('profile.settings.palette', '调色盘')}>
            <AppShellPreview accentColor={accentColor} />
          </SettingRow>

          {/* 主题色：⏸️ 与中性色一起暂停（见 apply-appearance-theme 的总开关），
              色板保留可见但不可点，界面回到 Kumo 原生主题 */}
          <SettingRow
            label={t('profile.settings.accentColor', '主题色')}
            hint={t('profile.settings.themeDisabled', '自定义主题暂未启用')}
          >
            <ColorSwatches
              options={ACCENT_COLOR_OPTIONS}
              value={accentColor}
              onChange={setAccentColor}
              label={t('profile.settings.accentColor', '主题色')}
              disabled
            />
          </SettingRow>

          {/* 中性色：⏸️ 暂时整体禁用（见 apply-appearance-theme 的总开关），
              保留色板只为让人看到可选范围，点击与派生都已停用 */}
          <SettingRow
            label={t('profile.settings.neutralColor', '中性色')}
            hint={t('profile.settings.themeDisabled', '自定义主题暂未启用')}
          >
            <ColorSwatches
              options={NEUTRAL_COLOR_OPTIONS}
              value={neutralColor}
              onChange={setNeutralColor}
              label={t('profile.settings.neutralColor', '中性色')}
              disabled
            />
          </SettingRow>
      </SettingsCard>
    </div>
  )
}

/**
 * 色板：一组可选色点（`role="radiogroup"`，每点 `role="radio"`）。
 *
 * 色值本身可读，直接当可访问名称与 tooltip，不必再维护一套色名文案。
 * 选中态用**同色 outline** 而不是额外套一层边框，避免改变色点自身的可见面积。
 */
function ColorSwatches({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: {
  options: readonly ThemeColorOption[]
  value: string
  onChange: (color: string) => void
  label: string
  /** 禁用后仅展示当前选择，不接受点击（中性色当前就处于这个状态） */
  disabled?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap items-center gap-2"
    >
      {options.map((option) => {
        const isSelected = value === option.value
        // 悬浮/读屏都用本地化名称（「默认」「橙色」…），而不是色值
        const name = t(option.labelKey, option.fallback)
        const isDefault = option.value === DEFAULT_COLOR_VALUE

        return (
          // 用 Kumo Tooltip 的 `render` 把 trigger 换成色点自己。
          // 不这么写的话，Tooltip 会渲染出**它自己的** `<button>` 把色点包进去，
          // 而色点本身就是 button —— 非法的 button 嵌套，React 会直接报 hydration 错误。
          <Tooltip
            key={option.value}
            content={name}
            delay={120}
            render={
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={name}
                disabled={disabled}
                onClick={() => onChange(option.value)}
                // 「默认」不画具体颜色：它表示"不覆盖 Kumo 任何令牌"，用中性底即可
                style={
                  isDefault
                    ? undefined
                    : { backgroundColor: option.value, outlineColor: option.value }
                }
                className={cn(
                  'size-6 rounded-full transition-transform hover:scale-110',
                  isDefault && 'bg-kumo-recessed',
                  isSelected
                    ? 'outline outline-2 outline-offset-2'
                    : 'ring-1 ring-kumo-line ring-inset',
                  disabled && 'cursor-not-allowed opacity-50 hover:scale-100',
                )}
              />
            }
          >
            {null}
          </Tooltip>
        )
      })}
    </div>
  )
}

