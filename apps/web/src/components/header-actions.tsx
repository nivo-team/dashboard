import { Button } from '@cloudflare/kumo'
import { QuestionIcon, SparkleIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { UserMenu } from '#/components/user-menu'
import { cn } from '#/lib/cn'

export interface HeaderActionsProps {
  /**
   * 是否展示 AI 入口。**默认不展示**：AI 与具体应用绑定，只有带 `appId` 的
   * 业务外壳（`AppShell` / `AppHeader`）才传它；`_main` 通用外壳（`MainLayout`，
   * 应用选择、个人资料、404 等没有 appId 的页面）不显示。
   */
  showAskAi?: boolean
  /**
   * AI 入口回调。**是个开关**：由调用方实现成 toggle（点一次开、再点一次关），
   * 状态本身不在这个组件里 —— 它只负责把 `aria-expanded` 与激活态画出来。
   * 目前由带 `appId` 的业务外壳（`AppHeader` → `AppShell`）传入。
   */
  onAskAi?: () => void
  /**
   * AI 面板当前是否展开。决定按钮的 `aria-expanded` 与激活态（面板开着时保持
   * `bg-kumo-tint`，看起来是「按下去」的），与 `onAskAi` 配套使用。
   */
  askAiExpanded?: boolean
  /** Support 入口回调。**当前无人传入**：这里只布局好位置与样式，点击暂无动作。 */
  onSupport?: () => void
  /** 透传给 UserMenu（与 AppHeader 既有调用签名一致）。 */
  onOpenCommandPalette?: () => void
}

/**
 * 两个外壳（`MainLayout` 与 `AppShell`）顶栏行末共用的工具区。
 *
 * Kumo 没有内置的 AI 入口组件，因此这里就是「同一排 ghost 按钮 + 账号菜单」：
 * `Ask AI`（SparkleIcon，可选）在左、`Support`（QuestionIcon）居中、账号菜单收尾 ——
 * 按钮都用 Kumo 默认尺寸（h-9），与 `UserMenu` 的方形触发器等高对齐。
 *
 * **`Ask AI` 是开关按钮**：它控制 `#/components/ai-panel` 那块面板的显隐，
 * 因此带上 `aria-expanded`，并在面板展开时保持浅底（`bg-kumo-tint`）——
 * 与 hover 同色，读起来就是「按钮还按着」。开关状态由调用方持有（`askAiExpanded`），
 * 这里不存状态，避免和 `AppShell` 里的真值分叉。
 *
 * 放外层 `ms-auto` 而不是让调用方各写一遍：两个 header 一个用 `justify-between`、
 * 一个用 `gap-2`，靠 `ms-auto` 统一推到行末才不会分叉（RTL 下自动换边）。
 * 按钮文案走 i18n，`Ask AI` 是产品入口名，故中文与英文都保持原文。
 */
export function HeaderActions({
  showAskAi = false,
  onAskAi,
  askAiExpanded = false,
  onSupport,
  onOpenCommandPalette,
}: HeaderActionsProps) {
  const { t } = useTranslation()
  const askAiLabel = t('profileNav.askAi', 'Ask AI')
  const supportLabel = t('profileNav.support', '支持')

  return (
    <div className="ms-auto flex shrink-0 items-center gap-2">
      {showAskAi ? (
        <Button
          variant="ghost"
          icon={<SparkleIcon size={16} />}
          className={cn(
            'text-kumo-subtle hover:text-kumo-default',
            // 展开态 = 「按下去」：与 hover 同色，面板一关就恢复
            askAiExpanded && 'bg-kumo-tint text-kumo-default',
          )}
          aria-label={askAiLabel}
          aria-expanded={askAiExpanded}
          onClick={onAskAi}
        >
          <span>{askAiLabel}</span>
        </Button>
      ) : null}

      <Button
        variant="ghost"
        icon={<QuestionIcon size={16} />}
        className="text-kumo-subtle hover:text-kumo-default"
        aria-label={supportLabel}
        onClick={onSupport}
      >
        <span>{supportLabel}</span>
      </Button>

      <UserMenu onOpenCommandPalette={onOpenCommandPalette} />
    </div>
  )
}
