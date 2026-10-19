import { Button, DropdownMenu, Tooltip } from '@cloudflare/kumo'
import { GearSixIcon, SlidersHorizontalIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

/**
 * 输入区行尾的**设置按钮**（滑杆图标）：面板与全屏对话页共用这一个输入区，只靠参数区分
 * —— 只有面板给「配置权限」（见 `AiComposerProps.onConfigurePermissions`）：
 * 权限视图是「整块替换面板内容」的，全屏对话页没有承载它的地方。
 * **没有入口时整颗不渲染**（没有可选项的空菜单不如不给），所以这个组件由调用方决定要不要挂。
 *
 * 图标分工按 Cloudflare 那张参照图来：触发按钮是**滑杆**，齿轮只出现在「配置权限」那一项上，
 * 别调换。尺寸取 `sm`（`size-6.5` = 26px），与提交位同档才齐平。
 *
 * `ms-auto` 挂在**这里**（行尾最左的那颗）：两处都挂会把剩余空隙平分、按钮跑到中间去
 * （全屏页踩过一次）。因此没有设置按钮时，提交位才自己顶到行尾。
 *
 * 模型相关项已从这里移除：真实模型与凭证都在 `apps/ai`（`AI_MODEL_ID` / AI Gateway），
 * 前端不再选模型、也不再声明模型能力。
 */
export function ComposerSettingsMenu({
  onConfigurePermissions,
}: {
  onConfigurePermissions: () => void
}) {
  const { t } = useTranslation('ai')

  return (
    <DropdownMenu>
      <Tooltip
        content={t('aiSettings', 'AI 设置')}
        className="cursor-pointer"
        render={
          <DropdownMenu.Trigger
            render={
              <Button
                type="button"
                variant="ghost"
                shape="circle"
                size="sm"
                aria-label={t('aiSettings', 'AI 设置')}
                className="ms-auto !text-kumo-subtle not-disabled:hover:!text-kumo-default"
              />
            }
          />
        }
      >
        <SlidersHorizontalIcon size={14} />
      </Tooltip>

      {/* 与输入模式菜单同一个理由：贴底的行尾，菜单必须往上弹 */}
      <DropdownMenu.Content side="top" align="end" className="w-64">
        <DropdownMenu.Item onClick={onConfigurePermissions} className="flex items-center gap-2.5">
          <GearSixIcon size={15} className="shrink-0 text-kumo-subtle" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-default">
            {t('configurePermissions', '配置权限')}
          </span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
