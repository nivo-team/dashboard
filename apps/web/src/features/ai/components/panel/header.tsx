import { Button, Tooltip } from '@cloudflare/kumo'
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ArrowsOutSimpleIcon,
  CaretDownIcon,
  CaretUpIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { AiBotAvatar } from '#/features/ai/components/bot-avatar'
import { AiSessionPicker, useActiveSessionTitle } from '#/features/ai/components/session-picker'
import { useAiSessionStore } from '#/features/ai/core'
import { cn } from '#/lib/cn'
import { isDesktop } from '#/native/bridge'

/**
 * 面板头行：**左侧「这段对话是谁」+ 右侧动作区**，三种形态共用同一个 `h-[58px]` 骨架。
 *
 * 左侧三分支（按优先级）：
 * - **权限视图**：「返回 + AI 权限」——换的是内容，不是骨架（返回箭头是方向性图标，RTL 下镜像）；
 * - **折叠态**：「AI 头像 + 当前会话标题」，不可点（窄条上开浮层会把选择器顶出去）；
 * - 否则：**会话选择器**（点开可搜索历史会话、切换、开新对话）。
 *
 * 动作区的顺序是「越靠近内容，越与当前这段对话有关」：新对话 → 新窗口 → 最大化 → 折叠 → 关闭。
 * 每颗按钮都由**回调的有无**决定要不要出现（折叠按钮只有 Float 传、新窗口只有桌面端有），
 * 而不是在这里判断 mode —— 与 `AiPanelProps` 的受控约定一致。
 *
 * 头行要**自己的底色**：点阵背景铺满了整个面板，不给底色它就会从这后面透出来。
 * 取与面板相同的 `bg-kumo-base` 而不是另找一个色 —— 与 Cloudflare 面板一致：
 * 头行与内容区靠**一条分隔线**区分，不靠色差。
 */
export function PanelHeader({
  view,
  collapsed,
  onBack,
  onClose,
  onToggleCollapsed,
  onMaximize,
  onOpenNewWindow,
}: {
  view: 'chat' | 'permissions'
  /** 是否折成「只有头行」的窄条（Float 专属，Split 恒为 `false`） */
  collapsed: boolean
  /** 权限视图左侧那颗返回箭头 */
  onBack: () => void
  onClose: () => void
  /** 折叠 / 展开切换；**只有 Float 传** —— 不传就没有那颗按钮 */
  onToggleCollapsed?: () => void
  onMaximize?: () => void
  onOpenNewWindow?: () => void
}) {
  const { t } = useTranslation('ai')
  const activeSessionTitle = useActiveSessionTitle()
  /** 头行「新对话」快捷按钮：直接开一段新会话，不必先点开会话选择器 */
  const startNewSession = useAiSessionStore((state) => state.startNewSession)

  return (
    <header
      className={cn(
        'relative z-10 flex shrink-0 items-center justify-between gap-2 bg-kumo-base px-2',
        'h-[calc(58px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]',
        // 折叠态没有下半部分，那条底边线要收掉 —— 否则贴着浮窗下沿的一条线像是没画完
        collapsed ? 'border-b-0' : 'border-b border-kumo-line',
      )}
    >
      {view === 'permissions' ? (
        /*
          权限视图的头行：左侧「返回 + 标题」。高度与其余形态共用同一个 `h-[58px]`，
          底边线照画 —— 换的是内容，不是骨架。
          返回箭头是方向性图标：RTL 下镜像（`rtl-flip`），「返回」在那儿朝右。
        */
        <div className="flex min-w-0 items-center gap-1">
          <Tooltip
            content={t('permissionsBack', '返回对话')}
            className="cursor-pointer"
            render={
              <Button
                variant="ghost"
                shape="square"
                onClick={onBack}
                aria-label={t('permissionsBack', '返回对话')}
              />
            }
          >
            <ArrowLeftIcon size={16} className="rtl-flip" />
          </Tooltip>
          <span className="min-w-0 truncate text-sm font-medium text-kumo-default">
            {t('permissionsTitle', 'AI 权限')}
          </span>
        </div>
      ) : collapsed ? (
        /*
          折叠态：会话选择器换成「AI 头像 + 当前会话标题」，两者与展开时**同源**
          （`useActiveSessionTitle`）—— 折起来之后仍能认出是哪一段对话。
          头像**不加底**（没有圆形底色 / 描边），与消息行里的那个一致：一条窄条上，
          多一层底只是多一笔视觉噪音。
          这里刻意不再可点：窄条上开浮层会把选择器顶出去，想换会话就展开面板。
        */
        <div className="flex min-w-0 items-center gap-2">
          <AiBotAvatar size={24} className="shrink-0" />
          <span className="min-w-0 truncate text-sm font-medium text-kumo-default">
            {activeSessionTitle}
          </span>
        </div>
      ) : (
        <AiSessionPicker />
      )}

      {/*
        动作区：新对话 + 最大化（跳到全屏对话页）+ 折叠（只有 Float 有）+ 关闭。
        顺序上越靠近内容，越是「与当前这段对话有关」的动作：新对话在最前，
        关闭在最后。RTL 下由 flex 自己镜像到另一侧。

        **折叠态只留「展开」与「关闭」**：一条窄条上塞四颗按钮既挤又吵，而新对话 /
        最大化本来就得先看见内容才有意义 —— 想用先展开。
      */}
      <div className="flex shrink-0 items-center gap-1 no-drag">
        {/*
          「新对话」快捷按钮：会话选择器浮层里本来也有一个，但那是「点开 → 再点一下」；
          开新对话是高频动作，头行留一颗直给。
        */}
        {collapsed || view === 'permissions' ? null : (
          <Tooltip
            content={t('sessionNew', '新对话')}
            className="cursor-pointer no-drag"
            render={
              <Button
                variant="ghost"
                shape="square"
                className="no-drag"
                onClick={startNewSession}
                aria-label={t('sessionNew', '新对话')}
              />
            }
          >
            <PlusIcon size={16} />
          </Tooltip>
        )}

        {isDesktop() && !collapsed && view === 'chat' && onOpenNewWindow ? (
          <Tooltip
            content={t('openNewWindowTooltip', '在独立窗口中打开对话')}
            className="cursor-pointer no-drag"
            render={
              <Button
                variant="ghost"
                shape="square"
                className="no-drag"
                onClick={onOpenNewWindow}
                aria-label={t('openNewWindow', '新窗口打开')}
              />
            }
          >
            <ArrowSquareOutIcon size={16} />
          </Tooltip>
        ) : null}

        {!collapsed && view === 'chat' && onMaximize ? (
          <Tooltip
            content={t('maximizeTooltip', '在全屏对话中打开')}
            className="cursor-pointer no-drag"
            render={
              <Button
                variant="ghost"
                shape="square"
                className="no-drag"
                onClick={onMaximize}
                aria-label={t('maximize', '最大化')}
              />
            }
          >
            {/*
              `ArrowsOutSimple`（四角向外的双箭头）是**中心对称**图标，
              不随书写方向翻转，所以**不加 `rtl-flip`**。
            */}
            <ArrowsOutSimpleIcon size={16} />
          </Tooltip>
        ) : null}

        {view === 'chat' && onToggleCollapsed ? (
          <Tooltip
            content={
              collapsed
                ? t('expandTooltip', '展开对话')
                : t('collapseTooltip', '收起对话，只留标题栏')
            }
            // Kumo 会给 trigger 补一个 `cursor-default`，按钮要的是手型
            className="cursor-pointer no-drag"
            render={
              <Button
                variant="ghost"
                shape="square"
                className="no-drag"
                onClick={onToggleCollapsed}
                // 折叠按钮是开关：读屏要能听出「现在是展开还是收起」
                aria-expanded={!collapsed}
                aria-label={collapsed ? t('expand', '展开对话') : t('collapse', '收起对话')}
              />
            }
          >
            {/*
              `CaretDown` = 收起（把对话往下压扁）、`CaretUp` = 展开。
              上下向图标不随书写方向翻转，所以**不加 `rtl-flip`**。
            */}
            {collapsed ? <CaretUpIcon size={16} /> : <CaretDownIcon size={16} />}
          </Tooltip>
        ) : null}

        <Tooltip
          content={t('close', '关闭面板')}
          className="cursor-pointer no-drag"
          render={
            <Button
              variant="ghost"
              shape="square"
              className="no-drag"
              onClick={onClose}
              aria-label={t('close', '关闭面板')}
            />
          }
        >
          <XIcon size={16} />
        </Tooltip>
      </div>
    </header>
  )
}
