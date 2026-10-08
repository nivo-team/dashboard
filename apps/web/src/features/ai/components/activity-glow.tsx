import type { CSSProperties } from 'react'
import { BorderBeam } from 'border-beam'
import { useAiSessionStore } from '#/features/ai/core'
import { usePreferencesStore } from '#/lib/store'
import { useColorMode } from '#/lib/use-color-mode'

/**
 * 光晕的两处（运行态 + 设置页预览）共用的两个外观参数。
 *
 * 刻意导出而不是各写一份：这两个值分叉不会报错，只会让「设置页演的」与「真跑起来的」
 * 悄悄不一样 —— 与铁律里「名单只有一个真值」是同一个道理。
 */

/** 色板（`border-beam` 的 `colorVariant`） */
export const GLOW_COLOR_VARIANT = 'colorful' as const

/** 光的强度（0–1，只影响光本身，不影响内容） */
export const GLOW_STRENGTH = 0.7

/**
 * **满视口这一层最要命的一个补偿：把渐变斑块放大。**
 *
 * `pulse-inner` 的光是 9 个 + 7 个 `radial-gradient` 斑块拼出来的一圈（进度条那套写法），
 * 而它们的**尺寸是写死的 px**（15 ~ 216px）、位置才是百分比。这套几何是**按卡片**调的：
 * 在 288px 的缩略图上这些斑块首尾相接，看着是一圈连续的光；到了 1440px 的视口上，
 * 216px 也就是边长的 15%，于是整圈退化成**几个孤立的彩点**，剩下的边缘全黑 ——
 * 实测截图就是这样，这也是「深色模式看不见光晕」的**主因**（浅色底上那几个点还认得出，
 * 换成近黑底就基本没了）。
 *
 * 修法用的是包自己留的钩子：源码里 `--pulse-glow-boost` 的注释是
 * "a consumer hook: a relative multiplier on top of the measured scale"（README 没写），
 * 它乘在每一层斑块的宽高上，所以放大它就能让这一圈重新连起来。
 * 4 是拿视口 / 缩略图的尺寸比试出来的（900×560 下的实测截图）。
 *
 * 设置页那张预览**不用它**：卡片尺寸下包自带的几何本来就是对的。
 */
export const GLOW_VIEWPORT_BOOST = 4

/**
 * **满视口这一层的明暗补偿** —— 深色模式下得比包自带的预设亮一档。
 *
 * 包为每个 `size` + 主题配了 `brightness` / `saturation`，但那套是按卡片调的：
 * 卡片上挑大梁的是那圈 **1px 描边**（深色档 `strokeOpacity` 给到 1.54 → 截断成 1），
 * 而满视口下 1px 描边等于看不见，真正看得见的是「内缘光带」与「模糊过的 bloom」——
 * 这两层的深色档透明度（0.44 / 0.66）与浅色档（0.40 / 0.80）几乎一样。
 *
 * 问题在于**同一个 alpha 压在白底和近黑底上完全不是一回事**（`rgb(255,50,100)`、
 * 光带 alpha ≈ 0.3 为例）：
 *
 * | 底色 | 合成结果 | 相对亮度 |
 * |---|---|---|
 * | 白 `#ffffff` | `rgb(255,198,212)` | 211 / 255 —— 一眼就是一圈粉光 |
 * | 深 `#0b0d10` | `rgb(86,24,42)` | 38 / 255 —— 屏幕边上的一圈暗酒红，等于没有 |
 *
 * 而深色档还把整层 `brightness` 压到 **0.75**（浅色档 1.3）：它补的是那圈 1px 描边，
 * 不是这两层宽光。所以深色档在满视口下要反过来提亮（1.4，实测截图里深度合适），
 * 浅色档就吃包自己的值。
 *
 * 设置页那张预览同样**不参与**：那一档是 1px 描边挑大梁，提亮会直接过曝。
 */
export function glowTuning(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { brightness: 1.4, saturation: 1.3 }
    : { brightness: 1.3, saturation: 0.75 }
}

/**
 * **`prefers-reduced-motion` 下的兜底：让光晕停在满亮，而不是消失。**
 *
 * 这个包的呼吸/淡入全都挂在 `--beam-opacity-{id}` 上，而那个属性的 `@property` 注册初值是 **0**；
 * 一旦进了 `prefers-reduced-motion: reduce`，包自己的媒体查询会 `animation: none !important`
 * 把淡入关掉 —— 于是这个变量永远停在 0，**整层光晕什么都不画**（它的 JS 呼吸循环同时也主动
 * 不启动，所以没有第二条路能把它顶上去）。
 *
 * 旧那层 CSS 在同样的偏好下只是「不呼吸」，光还在；换成这个包之后就成了「没有光」，
 * 是这次改造引入的回退。这里用包留给消费方的 `css` 口子（追加在它自己那份样式之后、
 * `{id}` 会按实例替换）把变量钉成 1：**要减的是动效，不是这个反馈本身** —— 这类用户仍然
 * 该看到「AI 正在跑」的一圈静止的光。
 *
 * 两处（运行态 + 设置页预览）共用。用 `!important` 是必须的：包那条
 * `animation: none !important` 是同一层里更靠前的 `!important` 声明，只有同级才能压住结果
 * （它关的是动画，我们直接给变量赋值，两者不冲突）。
 */
export const GLOW_REDUCED_MOTION_CSS =
  '@media (prefers-reduced-motion: reduce) { [data-beam="{id}"] { --beam-opacity-{id}: 1 !important } }'

/**
 * **满视口那一档的模糊半径倍率**（预览那处不传，用包默认的 1）。
 *
 * `border-beam` 的 pulse 档是按「一张卡片」调的半径，而这里的元素是整块视口（1440px 上下）——
 * 同一个像素半径在 320px 的缩略图上与在满视口上差一个数量级，照抄会细到看不见。
 * 旧那层 CSS 的做法是两处各写一套半径（预览 28px / 运行时 120px，约 4.3 倍），
 * 这里用包自己的 `glowSize` 做同一件事：它**成比例缩放每一层的模糊半径**，
 * 各层之间原有的比例关系不变。
 *
 * 4 是按上面那组旧值折出来的，觉得太重就往下调这一个数。
 */
export const GLOW_VIEWPORT_SCALE = 4

/**
 * AI 进行中的**页面级**光晕：视口四周向内发光，呼吸式明暗。
 *
 * ## 实现
 *
 * 交给 `border-beam` 的 `pulse-inner` 档 —— 「收在边界内呼吸」，与这里要的观感同义，
 * 而且它自带工具已经调好的东西：只动 `opacity` 的呼吸（共享一条 rAF 循环、约 30fps 上限）、
 * `prefers-reduced-motion` 下直接不跑、离屏时暂停。设置页那张预览（`AiActivityGlowPreview`）
 * 用的是同一档；**满视口这一层另外加了两处按尺寸的补偿**（`GLOW_VIEWPORT_BOOST` 把斑块放大、
 * `glowTuning` 提亮深色档），预览不加 —— 理由都在那两个常量的注释里。
 *
 * 为什么不取另外几档：
 * - `md` / `sm` / `line` 是「沿边框绕圈的旋转光带」，看着像**多了一条边框**，不是光晕；
 * - `pulse-outside` 的光晕长在元素**外面** —— 而这里的元素是满视口，外面就是屏幕外，
 *   只剩内侧一点余光，既不贴边也不像光晕，而且它要求子元素不透明（这里没有子元素）。
 *
 * ## 四个接线上的讲究
 *
 * - **定位必须用内联样式给**：包生成的那份 CSS 把根写成 `position: relative` +
 *   `overflow: hidden`（属性选择器，与 Tailwind 的类同级，但它的 `<style>` 挂在 body 里、
 *   排在后头 → 会赢）。所以这里 `position: fixed` / `inset: 0` / `z-index` 全部写在 `style`
 *   上，只用类名会被压掉。`overflow: hidden` 留着正好：光晕就裁在视口边上。
 * - **`pointerEvents: 'none'` 也要写在 `style` 上**：包的三个光层自带 `pointer-events: none`，
 *   但**根节点没有** —— 它盖在所有内容之上，漏了这一个属性就吞掉整屏点击。
 * - **`theme` 必须由我们传**：包自带的 `auto` 读的是祖先的 `data-theme` 或 `dark` class，
 *   而本项目的主题是 `data-mode` 驱动的（与 `AiBotAvatar` 是同一个坑），统一传 `resolved`。
 * - **`--pulse-glow-boost` 写在 `style` 上**：它是包留给消费方的缩放钩子，不写就是 1，
 *   满视口下光晕会退化成几个孤立的彩点（见 `GLOW_VIEWPORT_BOOST`）。
 *
 * `borderRadius={0}` 显式给零：满视口这层不该有圆角，也不指望包去猜（它猜的是「第一个子元素」，
 * 而这里刻意不包任何子元素）。
 *
 * 代价：这个包会被打进**主 bundle**（这里不能用路由级懒加载兜住，它在 AppShell 上）。
 * dist 约 99 KB、gzip 14 KB。要省的话只能给这层再包一个懒加载边界，但那样 AI 开始跑的
 * 那一刻才去取 chunk，正是光晕该出现的时候 —— 不划算。
 */
export function AiActivityGlow() {
  const status = useAiSessionStore((state) => state.status)
  const pendingApproval = useAiSessionStore((state) => state.pendingApproval)
  // 设置 → AI 里可以关掉它（默认开）；关掉时整层都不渲染
  const glowEnabled = usePreferencesStore((state) => state.aiActivityGlow)
  const { resolved } = useColorMode()

  /*
    等审批也算「进行中」：那一刻卡住的是用户而不是模型，但对用户来说页面仍在等待，
    给一层光晕比什么都不给更符合预期。
  */
  const isRunning = status === 'streaming' || pendingApproval !== null

  // 不进行时直接不渲染：不常驻一层 fixed，也不会有残留的光
  if (!glowEnabled || !isRunning) return null

  const tuning = glowTuning(resolved)

  return (
    <BorderBeam
      aria-hidden
      size="pulse-inner"
      colorVariant={GLOW_COLOR_VARIANT}
      strength={GLOW_STRENGTH}
      glowSize={GLOW_VIEWPORT_SCALE}
      brightness={tuning.brightness}
      saturation={tuning.saturation}
      theme={resolved}
      borderRadius={0}
      // 减动效下别把整个反馈一起减掉（见 GLOW_REDUCED_MOTION_CSS）
      css={GLOW_REDUCED_MOTION_CSS}
      style={
        {
          position: 'fixed',
          inset: 0,
          zIndex: 30,
          pointerEvents: 'none',
          '--pulse-glow-boost': GLOW_VIEWPORT_BOOST,
        } as CSSProperties
      }
    >
      {null}
    </BorderBeam>
  )
}
