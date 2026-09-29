import { Checkbox, LayerCard, Tabs } from '@cloudflare/kumo'
import {
  EyeIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { SettingRow } from '#/components/settings-card'
import { AI_TOOLS, resolveAllowedToolNames, type AiPermissionMode } from '#/lib/ai'

interface AiPermissionOption {
  key: AiPermissionMode
  labelKey: string
  fallback: string
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
    icon: EyeIcon,
  },
  {
    key: 'full',
    labelKey: 'profile.settings.aiPermissionModes.full',
    fallback: '完全访问',
    icon: ShieldCheckIcon,
  },
  {
    key: 'custom',
    labelKey: 'profile.settings.aiPermissionModes.custom',
    fallback: '自定义',
    icon: SlidersHorizontalIcon,
  },
]

/**
 * 工具清单按注册表里的 `group` 分堆 —— **只有 `AI_TOOLS` 一份真值**，
 * 这里不另抄名单（加工具时只改工具文件，界面自动跟上）。
 */
const TOOL_GROUPS = [
  { key: 'page', fallback: '页面', hintFallback: '读取当前页面、列出导航、跳转' },
  { key: 'data', fallback: '数据', hintFallback: '查接口、读数据；写接口每次都会请你确认' },
  { key: 'form', fallback: '表单', hintFallback: '读取页面表单、填写、提交' },
].map((group) => ({
  ...group,
  tools: AI_TOOLS.filter((tool) => tool.group === group.key),
}))

export interface AiPermissionConfigProps {
  /** 当前权限档（受控：草稿版由调用方持有，见 AI 面板的权限视图） */
  permission: AiPermissionMode
  /** `custom` 档下已勾选的工具名（类型跟 Kumo `Checkbox.Group` 的 `value` 对齐，不用 readonly 数组） */
  allowedTools: string[]
  onPermissionChange: (permission: AiPermissionMode) => void
  onAllowedToolsChange: (allowedTools: string[]) => void
  /**
   * 布局形态：
   * - `settings`（默认）：设置页使用，嵌在 SettingsCard 内，左 label 右 Tabs，工具列表连通；
   * - `panel`：AI 面板专属形态，Tabs 直接居中在容器内（不包外层卡片），三个工具分组分别用独立的 LayerCard 包裹。
   */
  variant?: 'settings' | 'panel'
}

/**
 * 「AI 权限」的配置体 —— 支持设置页与 AI 面板两种布局形态。
 *
 * 两处共用同一份状态联动逻辑（预设切换继承、工具分组与勾选计算），但视觉上做出区分：
 * - 设置页（`variant="settings"`）：标准的设置卡片行布局；
 * - AI 面板（`variant="panel"`）：Tabs 居中凸显、页面/数据/表单三组工具各自独立包裹 LayerCard。
 */
export function AiPermissionConfig({
  permission,
  allowedTools,
  onPermissionChange,
  onAllowedToolsChange,
  variant = 'settings',
}: AiPermissionConfigProps) {
  const { t } = useTranslation('common')

  /*
    清单里勾选的集合 —— 两档 preset **按档位派生**，而不是去读 `allowedTools`：
    - `readonly` → `read` 类工具（`resolveAllowedToolNames` 的预设）；
    - `full` → 全部工具；
    - `custom` → 用户自己勾的那些。

    这样切档时清单不闪、不跳：只是勾选跟着变，用户能直接对比「只读」和「完全访问」差在哪。
    切到 `custom` 时把这份派生集合继承进 `allowedTools`（见下面的 `onValueChange`），
    于是从预设档过去是「接着改」，不是「从零勾」。
  */
  const checkedTools =
    permission === 'custom' ? allowedTools : resolveAllowedToolNames(permission)
  /** 只有「自定义」能勾：preset 档的勾选由档位决定，点它没有意义 */
  const locked = permission !== 'custom'

  const renderTabs = () => (
    <Tabs
      value={permission}
      onValueChange={(next) => {
        const mode = next as AiPermissionMode
        /*
          从预设档（只读 / 完全访问）切到「自定义」时**继承当前档实际勾选的工具**，
          而不是从空开始 —— 三档本来就是对同一份勾选清单的预设，
          用户在只读下看到的那几项，切过去应当还勾着，否则他得从零再点一遍。
        */
        if (mode === 'custom' && permission !== 'custom') {
          onAllowedToolsChange(resolveAllowedToolNames(permission, allowedTools))
        }
        onPermissionChange(mode)
      }}
      activateOnFocus
      tabs={AI_PERMISSION_OPTIONS.map((item) => {
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
  )

  const renderToolGroup = (group: (typeof TOOL_GROUPS)[number]) => {
    const names = group.tools.map((tool) => tool.name)
    return (
      <Checkbox.Group
        key={group.key}
        legend={t(`profile.settings.aiToolGroups.${group.key}`, group.fallback)}
        description={t(
          `profile.settings.aiToolGroupHints.${group.key}`,
          group.hintFallback,
        )}
        value={checkedTools}
        disabled={locked}
        onValueChange={(next) =>
          onAllowedToolsChange([
            ...allowedTools.filter((name) => !names.includes(name)),
            ...next,
          ])
        }
      >
        {group.tools.map((tool) => (
          <Checkbox.Item
            key={tool.name}
            value={tool.name}
            label={t(`profile.settings.aiToolNames.${tool.name}`, tool.name)}
          />
        ))}
      </Checkbox.Group>
    )
  }

  if (variant === 'panel') {
    return (
      <div className="flex flex-col gap-3">
        {/* Tabs 直接居中放在容器中，不需要任何卡片包裹 */}
        <div
          role="group"
          aria-label={t('profile.settings.aiPermissionMode', '权限范围')}
          className="flex justify-center"
        >
          {renderTabs()}
        </div>

        <p className="px-1 text-xs leading-snug text-kumo-subtle">
          {t(
            'profile.settings.aiToolListHint',
            '只读与完全访问由上方档位决定；想逐项调整就切到「自定义」',
          )}
        </p>

        {/* 页面、数据、表单 三组工具单独用 LayerCard 包裹 */}
        <div className="flex flex-col gap-3">
          {TOOL_GROUPS.map((group) => (
            <LayerCard key={group.key} className="p-3">
              {renderToolGroup(group)}
            </LayerCard>
          ))}
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
        三组清单**始终列出来**，preset 档整组 `disabled`：
        档位之间只差「勾了哪些」，不是「有没有清单」—— 切到「完全访问」下面不会突然空掉，
        用户也一眼能看清这一档到底放行了哪些工具。想逐项改就切到「自定义」。

        每个分组一个 `Checkbox.Group`（它渲染成 fieldset + legend，读屏能听出分组），
        但 `onValueChange` 拿到的是**该组自己**的勾选值 —— 所以合并时要先把这一组原有的
        成员摘掉、再并上新的，否则组与组之间会互相覆盖。
      */}
      <div className="flex flex-col gap-4 px-4 py-3.5">
        <p className="text-xs leading-snug text-kumo-subtle">
          {t(
            'profile.settings.aiToolListHint',
            '只读与完全访问由上方档位决定；想逐项调整就切到「自定义」',
          )}
        </p>

        {TOOL_GROUPS.map(renderToolGroup)}
      </div>
    </>
  )
}
