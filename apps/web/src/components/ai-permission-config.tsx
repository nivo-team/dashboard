import { Checkbox, LayerCard, Tabs, Tooltip } from '@cloudflare/kumo'
import {
  BrowserIcon,
  DatabaseIcon,
  EyeIcon,
  InfoIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TextboxIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { SettingRow } from '#/components/settings-card'
import {
  AI_CAPABILITIES,
  isKnownCapabilityGrant,
  presetCapabilityGrants,
  type AiCapabilityGrant,
  type AiCapabilityKey,
} from '#/lib/ai/capabilities'
import type { AiPermissionMode } from '#/lib/ai'

interface AiPermissionOption {
  key: AiPermissionMode
  labelKey: string
  fallback: string
  /**
   * 该档位的说明 —— **不常显**，挂在档位文字的 tooltip 上（见 `renderTabs`）。
   * 三档只说名字没人知道边界在哪：「只读」到底能不能填表？悬停看一眼就有答案。
   */
  hintFallback: string
  icon: Icon
}

/**
 * 权限三档。默认在前的 `readonly` 就是默认值：AI 默认只能看，
 * 要让它改东西得用户自己来开。
 */
const AI_PERMISSION_OPTIONS: AiPermissionOption[] = [
  {
    key: 'readonly',
    labelKey: 'profile.settings.aiPermissionModes.readonly',
    fallback: '只读',
    hintFallback:
      '只能查看与读取：看页面数据、查接口、列导航、读表单、编排任务；不能填表、提交或调用写接口',
    icon: EyeIcon,
  },
  {
    key: 'full',
    labelKey: 'profile.settings.aiPermissionModes.full',
    fallback: '完全访问',
    hintFallback: '放行全部能力：填表、提交、调用写接口；写操作每一次仍会请你确认',
    icon: ShieldCheckIcon,
  },
  {
    key: 'custom',
    labelKey: 'profile.settings.aiPermissionModes.custom',
    fallback: '自定义',
    hintFallback: '逐项勾选 AI 能用的能力。切到「自定义」才能逐格调整',
    icon: SlidersHorizontalIcon,
  },
]

/**
 * 能力行的图标与行级说明 —— 行的**名称与动作**来自矩阵本身（`AI_CAPABILITIES`），
 * 这里只补「界面上怎么显示」（图标 + 一句话），**不另抄一份格子名单**。
 */
const CAPABILITY_ROW_META: Record<AiCapabilityKey, { icon: Icon; hintFallback: string }> = {
  page: { icon: BrowserIcon, hintFallback: '当前页面相关：读取、跳转、执行页面操作' },
  data: { icon: DatabaseIcon, hintFallback: '直接调接口：只读查询与写库' },
  form: { icon: TextboxIcon, hintFallback: '页面表单三段：读结构、替你填、提交入库' },
  task: { icon: ListChecksIcon, hintFallback: '批量任务的编排与推进' },
}

export interface AiPermissionConfigProps {
  /** 当前权限档（受控：草稿版由调用方持有，见 AI 面板的权限视图） */
  permission: AiPermissionMode
  /** `custom` 档下已勾选的**能力格子**（`page:read` / `data:write` …） */
  capabilities: readonly AiCapabilityGrant[]
  onPermissionChange: (permission: AiPermissionMode) => void
  onCapabilitiesChange: (capabilities: AiCapabilityGrant[]) => void
  /**
   * 布局形态：
   * - `settings`（默认）：设置页使用，嵌在 SettingsCard 内；
   * - `panel`：AI 面板专属形态，Tabs 居中、每个能力行用独立的 LayerCard 包裹。
   */
  variant?: 'settings' | 'panel'
}

/**
 * 「AI 权限」的配置体 —— 支持设置页与 AI 面板两种布局形态。
 *
 * ## 一行一个能力、行内是该能力的动作
 *
 * 这是这次权限改造的**核心呈现**：用户看到的不是 18 个工具名，而是四行
 * 「页面 / 数据 / 表单 / 任务」，每行右侧列出该行可授权的动作（读取 · 跳转 · 操作 / …）。
 * 每个动作是一枚 `Checkbox`，它们的值就是**能力格子键**，与运行时过滤用的是同一批键 ——
 * 界面上勾了什么，模型就拿到什么工具，不可能分叉。
 *
 * 「打开表单算读取还是更新」的答案在矩阵里：**打开表单与填写同属「表单·更新」** ——
 * 打开表单的唯一目的就是改数据，只看不改的路径是详情页。
 */
export function AiPermissionConfig({
  permission,
  capabilities,
  onPermissionChange,
  onCapabilitiesChange,
  variant = 'settings',
}: AiPermissionConfigProps) {
  const { t } = useTranslation('common')

  /*
    清单里勾选的集合 —— 两档 preset **按档位派生**，而不是去读 `capabilities`：
    - `readonly` → 预设的只读格子；
    - `full` → 全部格子；
    - `custom` → 用户自己勾的那些。

    这样切档时清单不闪、不跳：只是勾选跟着变，用户能直接对比「只读」和「完全访问」差在哪。
    切到 `custom` 时把这份派生集合继承进 `capabilities`（见下面的 `onValueChange`），
    于是从预设档过去是「接着改」，不是「从零勾」。
  */
  const checked: string[] =
    permission === 'custom' ? [...capabilities] : [...presetCapabilityGrants(permission)]
  /** 只有「自定义」能勾：preset 档的勾选由档位决定，点它没有意义 */
  const locked = permission !== 'custom'

  const renderTabs = () => (
    <Tabs
      value={permission}
      onValueChange={(next) => {
        const mode = next as AiPermissionMode
        /*
          从预设档（只读 / 完全访问）切到「自定义」时**继承当前档实际勾选的能力**，
          而不是从空开始 —— 三档本来就是对同一份勾选清单的预设，
          用户在只读下看到的那几格，切过去应当还勾着，否则他得从零再点一遍。
        */
        if (mode === 'custom' && permission !== 'custom') {
          onCapabilitiesChange(presetCapabilityGrants(permission))
        }
        onPermissionChange(mode)
      }}
      activateOnFocus
      tabs={AI_PERMISSION_OPTIONS.map((item) => {
        const ItemIcon = item.icon
        const label = t(item.labelKey, item.fallback)
        const hint = t(`profile.settings.aiPermissionModeHints.${item.key}`, item.hintFallback)
        return {
          value: item.key,
          label: (
            <span className="flex items-center gap-2">
              <ItemIcon size={16} className="text-kumo-subtle" />
              {/*
                触发元素是**文字本身**（不是整颗 tab）：悬停文字看说明、点 tab 切换档位互不打扰。
              */}
              <Tooltip content={hint} delay={120}>
                <span className="cursor-default">{label}</span>
              </Tooltip>
            </span>
          ),
        }
      })}
    />
  )

  /**
   * 一行能力：行首是行名（+ tooltip），行内是该行的动作勾选。
   *
   * 用 `Checkbox.Group` 包一行（它渲染成 fieldset + legend，读屏能听出分组），
   * `onValueChange` 拿到的是**这一行所有格子的当前勾选值** —— 所以增删只影响本行，
   * 不会与其它行互相覆盖（这正是"一行一个 Group"而不是一个大 Group 的原因）。
   */
  const renderCapabilityRow = (capability: (typeof AI_CAPABILITIES)[number]) => {
    const meta = CAPABILITY_ROW_META[capability.key]
    const RowIcon = meta.icon
    const rowLabel = t(`profile.settings.aiCapabilityRows.${capability.key}`, capability.label)
    const rowHint = t(`profile.settings.aiCapabilityRowHints.${capability.key}`, meta.hintFallback)
    const grants: string[] = capability.actions.map((action) => action.grant)

    return (
      <Checkbox.Group
        key={capability.key}
        value={checked}
        disabled={locked}
        onValueChange={(next) => {
          // Group 交回的是"这一行现在勾了哪些"，与其它行的勾选取并集
          const rowGrants = new Set<string>(grants)
          const others = capabilities.filter((grant) => !rowGrants.has(grant))
          const picked = next.filter(isKnownCapabilityGrant)
          onCapabilitiesChange([...others, ...picked])
        }}
      >
        <Checkbox.Legend className="flex items-center gap-2">
          <RowIcon size={16} className="text-kumo-subtle" />
          <span className="text-sm font-medium text-kumo-default">{rowLabel}</span>
          <Tooltip content={rowHint} delay={120}>
            <span className="flex cursor-pointer text-kumo-subtle transition-colors hover:text-kumo-default">
              <InfoIcon size={14} />
              <span className="sr-only">{rowHint}</span>
            </span>
          </Tooltip>
        </Checkbox.Legend>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {capability.actions.map((action) => {
            const actionLabel = t(
              `profile.settings.aiCapabilityActions.${action.grant}`,
              action.label,
            )
            const actionHint = t(
              `profile.settings.aiCapabilityActionHints.${action.grant}`,
              action.hint,
            )
            return (
              <Tooltip key={action.grant} content={actionHint} delay={120}>
                <span className="cursor-default">
                  <Checkbox.Item value={action.grant} label={actionLabel} />
                </span>
              </Tooltip>
            )
          })}
        </div>
      </Checkbox.Group>
    )
  }

  if (variant === 'panel') {
    return (
      <div className="flex flex-col gap-3">
        <div
          role="group"
          aria-label={t('profile.settings.aiPermissionMode', '权限范围')}
          className="flex justify-center"
        >
          {renderTabs()}
        </div>

        {/* 每个能力行独立包一张 LayerCard：标题后一枚 Info 图标，说明走它的 tooltip */}
        <div className="flex flex-col gap-3">
          {AI_CAPABILITIES.map((capability) => {
            const RowIcon = CAPABILITY_ROW_META[capability.key].icon
            const rowHint = t(
              `profile.settings.aiCapabilityRowHints.${capability.key}`,
              CAPABILITY_ROW_META[capability.key].hintFallback,
            )
            return (
              <LayerCard key={capability.key} className="p-0">
                <LayerCard.Secondary className="my-0 items-center gap-2 px-3.5 py-2">
                  <RowIcon size={16} className="text-kumo-subtle" />
                  <span className="text-sm font-semibold text-kumo-default">
                    {t(`profile.settings.aiCapabilityRows.${capability.key}`, capability.label)}
                  </span>
                  <Tooltip content={rowHint} delay={120}>
                    <span className="flex cursor-pointer text-kumo-subtle transition-colors hover:text-kumo-default">
                      <InfoIcon size={14} />
                      <span className="sr-only">{rowHint}</span>
                    </span>
                  </Tooltip>
                </LayerCard.Secondary>

                <LayerCard.Primary className="gap-2.5 p-3">
                  {renderCapabilityRow(capability)}
                </LayerCard.Primary>
              </LayerCard>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <SettingRow
        label={t('profile.settings.aiPermissionMode', '权限范围')}
        hint={t(
          'profile.settings.aiPermissionModeHint',
          '控制 AI 能做什么；改成「完全访问」它才能填表、提交与调用写接口',
        )}
      >
        <div role="group" aria-label={t('profile.settings.aiPermissionMode', '权限范围')}>
          {renderTabs()}
        </div>
      </SettingRow>

      {/*
        四行能力清单**始终列出来**，preset 档整行 `disabled`：
        档位之间只差「勾了哪些」，不是「有没有清单」—— 切到「完全访问」下面不会突然空掉，
        用户也一眼能看清这一档到底放行了哪些能力。
      */}
      <div className="flex flex-col gap-5 px-4 py-3.5">
        {AI_CAPABILITIES.map(renderCapabilityRow)}
      </div>
    </>
  )
}
