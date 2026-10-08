import { Popover } from '@cloudflare/kumo'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * 设置页「分段选项的悬浮预览」公共件。
 *
 * 设置页里凡是**光看名字不知道出来是什么样**的选项（详情打开方式、AI 打开方式），
 * 都给它的分段选项盖一层透明热区：指针停上去弹一个浮层，用通用缩略图
 * （`#/components/app-shell-preview`）把「选了这一项之后页面会怎么变」演一遍。
 *
 * 两个页面共用这里的两件东西：
 * - `SettingChoicePreview` —— 浮层本身（热区、打开原因、可访问名称、内边距）；
 * - `usePreviewAnimation` —— 两阶段时序：**先画基线态、停一下再切到目标态**，
 *   于是纯 CSS 过渡就把「变化」演出来了。
 *
 * 页面各自只需要提供「选项 → 缩略图布局」的映射与预览内容（见
 * `settings/appearance.tsx` 的 `DetailOpenModePreview`、`settings/AI.tsx` 的 `AiModePreview`）。
 */

/**
 * 缩略图**动画起手**前的等待时间（毫秒）。
 *
 * 浮层自己有一段约 150ms 的缩放淡入，如果缩略图的动画同时起步，两段动画会糊在一起，
 * 「页面怎么变」反而看不清。先让浮层落定，再演变化 —— 这也是这里用一个定时器
 * 而不是「挂载即过渡」的原因。
 */
const PREVIEW_PLAY_DELAY = 180

/**
 * 指针要在选项上停多久才弹浮层（毫秒）—— 对应 `Popover.Trigger` 的 `delay`。
 *
 * 160ms 是「停一下才弹」：掠过这一行时不该弹，真正停下来看某个选项时才弹。
 */
const PREVIEW_HOVER_DELAY = 160

/** 离开后关闭的宽限时间：从选项移向浮层的那一小段路上不要闪掉。 */
const PREVIEW_CLOSE_DELAY = 80

/**
 * 两阶段预览动画：挂载时先给 `initial`（基线态），`PREVIEW_PLAY_DELAY` 之后再切到 `target`。
 *
 * - 调用方每次悬浮都是**全新挂载**（Base UI 关闭时会卸载 popup），所以动画自然重播；
 * - 动画播完就停在终态，不再循环 —— 反复播放会在设置页的余光里一直动，且
 *   `prefers-reduced-motion` 下（缩略图里所有过渡都包在 `motion-safe:` 里）
 *   状态会直接切换、不播动画，循环也没有意义。
 *
 * `initial` 刻意不进依赖：它只是**初值**，之后变化的是 `target`；把它放进依赖会让
 * 「切选项」时先跳回基线态再播一遍，那不是这里想要的时序。
 */
export function usePreviewAnimation<T>(initial: T, target: T): T {
  const [value, setValue] = useState(initial)

  useEffect(() => {
    const timer = window.setTimeout(() => setValue(target), PREVIEW_PLAY_DELAY)
    return () => window.clearTimeout(timer)
  }, [target])

  return value
}

export interface SettingChoicePreviewProps {
  /** 浮层的可访问名称（`role="dialog"` 需要）：直接复用选项自己的 label，不必新增文案 */
  label: string
  /** 页面内唯一的 id：同时交给 `Popover` 的 `triggerId` 与 trigger 自己的 `id` */
  triggerId: string
  /** 浮层内容（通常是「动画演示」的那个缩略图） */
  children: ReactNode
}

/**
 * 悬浮预览浮层：把「选了这一项之后页面会怎么变」演给用户看。
 *
 * 用 Kumo 的 `Popover`（Base UI）而不是 `Tooltip`，因为它更合适这个场景：
 * - `Popover.Trigger` **支持 `openOnHover`**（原生 hover 打开，`mouseOnly`，触屏不会误触），
 *   并且**透传 `nativeButton`** —— 我们的触发区是铺满选项的 `<span>`（见下面注释），
 *   `nativeButton={false}` 才不会被 Base UI 在开发期警告「期望一个原生 button」；
 * - hover 打开时 Base UI 会**关掉焦点管理器**（`PopoverPopup` 里
 *   `disabled: openReason === 'triggerHover'`）、`modal` 默认也是 `false`，
 *   所以浮层不会抢走分段控件的焦点，也不会把页面变成不可交互；
 * - `Popover.Content` **收 `className` 并且会合并到浮层上**（Kumo 内部走 cnfast），
 *   于是内边距能直接用 prop 改成四边等距的 `p-1.5`（`Tooltip` 的 `className`
 *   只落到 trigger 上，浮层的内边距改不到，只能去 `styles.css` 挂钩子类）。
 *
 * 受控只认一种打开原因（`details.reason === 'trigger-hover'`）：
 * `Popover.Trigger` 的**点击也是开合开关**，如果放行，触屏上点一下选项就会弹出这个
 * 「桌面端专属」的预览（窄屏下这些形态本来就会降级，弹出来就是假信息），鼠标快速点一下
 * 也会把浮层留在屏幕上。关闭则一律接受（移开、Esc、点击、失焦都该关）。
 *
 * 触发区是**绝对定位的 `span`，不是包裹分段控件的元素**：Kumo 的分段控件本身就是
 * `<button>`，往里塞 button 是非法嵌套（同 `SettingRow` 的 info 图标、`ColorSwatches`
 * 的色点）。`span` 不可聚焦、且标了 `aria-hidden` —— 它只是悬浮热区，没有任何可读内容，
 * 让读屏在 tab 里再看到一个 `role="button"` 反而是噪音；预览要表达的信息对键盘用户
 * 也已经通过「方向键选中即生效」传达过了。
 */
export function SettingChoicePreview({ label, triggerId, children }: SettingChoicePreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    /*
      注意这里是 `<Popover>` 而**不是** `<Popover.Root>`：Kumo 的 `Popover` 是
      `Object.assign(PopoverRoot, { Trigger, Content, Title, Description, Close })` 的返回值，
      也就是 **Root 自己**（`Object.assign` 返回 target），所以 `Popover.Root` 是 `undefined`，
      写成 `<Popover.Root>` 会直接报 “Element type is invalid … got: undefined”。
      与 `Tabs`（本身就是组件、没有 `Tabs.List`）是同一类形态。
    */
    <Popover
      open={open}
      // 受控模式下要显式告诉 Root「浮层归哪个 trigger 管」，id 必须与下面的 `id` 一致
      triggerId={triggerId}
      onOpenChange={(next, details) => {
        // 只放行 hover 发起的打开；关闭（移开、Esc、点击、失焦）一律照做
        setOpen(next && details.reason === 'trigger-hover')
      }}
    >
      <Popover.Trigger
        id={triggerId}
        nativeButton={false}
        openOnHover
        delay={PREVIEW_HOVER_DELAY}
        closeDelay={PREVIEW_CLOSE_DELAY}
        aria-hidden
        className="absolute inset-0 cursor-pointer"
        render={<span />}
      >
        {null}
      </Popover.Trigger>

      {/* `p-1.5`（四边 6px）：Kumo 默认是 `px-4 py-3`（横向 16px / 纵向 12px），
          缩略图要的是四边等距的窄边框，不是「文字卡」那种宽松内距 */}
      <Popover.Content side="top" className="p-1.5">
        <Popover.Title className="sr-only">{label}</Popover.Title>
        {children}
      </Popover.Content>
    </Popover>
  )
}
