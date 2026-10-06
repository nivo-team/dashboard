import { BotAvatar } from 'bot-avatars'
import type { BotAvatarState } from 'bot-avatars'
import { usePreferencesStore } from '#/lib/store'
import { useColorMode } from '#/lib/use-color-mode'

/**
 * AI 的小机器人头像（`bot-avatars` 的一层薄封装）。
 *
 * 为什么要有这层封装，而不是各处直接写 `<BotAvatar>`：
 * - **形状来自设置**（设置 → AI，默认 `clover`），而使用点不止一处，
 *   统一在这里读 store，免得每处各写一遍；
 * - **`theme` 必须由我们给**：包自带的 `auto` 读的是祖先的 `data-theme` 属性或
 *   `dark` / `light` class，而本项目的主题是 `data-mode` 驱动的 —— 交给 `auto`
 *   在「跟随系统」那一档会读错。所以统一传仓库的 `resolved`。
 *
 * 默认 `interactive={false}`：这个包支持「鼠标靠近时眼睛跟着转、点一下跳一跳」，
 * 但在 AI 面板里那不表达任何意图，只会白多一个指针监听器。想要的话传 `true` 即可。
 */
export function AiBotAvatar({
  size,
  state = 'default',
  interactive = false,
  paused,
  className,
}: {
  /** 渲染尺寸（px）。头像画在 canvas 上，是**位图**，所以按需要的显示尺寸给。 */
  size: number
  /** `default` 四处张望 / `working` 跳跃旋转 / `sleeping` 低头呼吸 */
  state?: BotAvatarState
  interactive?: boolean
  /** 冻结在当前帧：列表里一大排头像时用它省性能（见设置页的头像网格） */
  paused?: boolean
  className?: string
}) {
  const type = usePreferencesStore((state) => state.aiBotAvatar)
  const { resolved } = useColorMode()

  return (
    <BotAvatar
      type={type}
      state={state}
      size={size}
      theme={resolved}
      interactive={interactive}
      paused={paused}
      className={className}
    />
  )
}
