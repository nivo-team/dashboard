import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_NEUTRAL_COLOR,
  usePreferencesStore,
} from './store/preferences-store'

/**
 * 自定义主题：把偏好里的**强调色 / 中性色**写到根元素的颜色令牌上。
 *
 * 机制（Kumo 的颜色令牌就是 Tailwind v4 的 `--color-*` 命名空间）：
 * Kumo 把语义令牌注册成 `--color-kumo-*`，Tailwind 的 `bg-kumo-brand` / `border-kumo-line`
 * 之类的工具类最终解析为 `var(--color-kumo-brand)` / `var(--color-kumo-line)`。
 * 因此**往根元素覆盖这些变量即可全站生效**，不需要重建样式表，也不需要 Provider。
 *
 * - **强调色** → `--color-kumo-brand`（外加 hover 态用 `color-mix` 压暗 12%），
 *   侧边栏选中态、按钮、链接等品牌位会立刻跟随；
 * - **中性色** → 只覆盖"表面 / 线条 / 填充"这几个最显眼的令牌，并且用 `color-mix`
 *   与**当前模式的底色**（浅色混白、深色混黑）按固定比例派生 —— 不去重建 Kumo 的
 *   `--color-kumo-neutral-25…1000` 整条阶梯（那是构建期 `theme-generator` 的活儿，
 *   运行时按一条基色线性插值反而容易出现层级错乱）。
 *
 * 触发时机：偏好变化（用户点色板）＋ 生效主题变化（浅色 / 深色 / 跟随系统）。
 */
function resolvedMode(): 'light' | 'dark' {
  const { colorMode } = usePreferencesStore.getState()
  if (colorMode !== 'system') return colorMode
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * 中性色参与混合的令牌与比例（百分比 = 中性色占比，其余是与白/黑的混合）。
 *
 * 比例是"看起来对不对"的经验值：浅色模式下线比填充深一点、控件底色居中；
 * 深色模式整体反过来（底色是黑，所以要用更高的占比才看得见）。
 */
/**
 * 自定义主题的**总开关**。
 *
 * ⏸️ 当前为 `false`：**强调色与中性色都不再写入**，界面完全回到 Kumo 原生主题，
 * 并且会把此前可能注入过的覆盖全部 `removeProperty` 清掉（inline style 不持久化，
 * 但同一会话里可能已经写过，不清会残留到刷新前）。
 *
 * 与下面 `NEUTRAL_COLOR_OVERRIDE_ENABLED` 的关系：这是总闸，它为 false 时两者都不生效；
 * 重新启用时把这里打开，再按需决定中性色那个子开关。
 */
const CUSTOM_THEME_ENABLED = false

/**
 * 中性色覆盖的**子开关**（历史遗留：中性色曾单独停用过一段时间）。
 *
 * ⏸️ 当前为 `false`：中性色调整整体停用，界面完全使用 Kumo 原生灰阶。
 * 派生逻辑与 25 个令牌的比例表都保留着，重新启用只需改成 `true`。
 * 关闭时会主动 `removeProperty` 清掉上一次可能写入的覆盖 —— 否则用户之前点过
 * 色板（值已落 localStorage）时会停在那个灰阶上，看起来像"关不掉"。
 */
const NEUTRAL_COLOR_OVERRIDE_ENABLED = false

interface NeutralRule {
  /** 浅色模式下的中性色占比（%），其余与底色混合 */
  light: number
  /** 深色模式下的中性色占比（%） */
  dark: number
  /**
   * 方向反转的令牌（文字 / 反色块 / 阴影）：表面是「浅色偏白、深色偏黑」，
   * 而它们必须「浅色偏黑、深色偏白」才读得出来。
   */
  inverse?: boolean
}

/**
 * 参与中性色派生的**全部**令牌：表面、边框线条、阴影、文字、反色块。
 *
 * 比例是经验值，层级关系比绝对值重要：
 * `base/canvas` 最贴近底色 → `elevated/recessed/tint/fill` 逐级加重 →
 * `line/hairline`（边框）要比填充更明显 → `text-*` 最重（保证对比度）。
 */
const NEUTRAL_TOKENS: Record<string, NeutralRule> = {
  // ---- 表面：画布、卡片、控件底、悬浮与填充 ----
  '--color-kumo-canvas': { light: 4, dark: 8 },
  '--color-kumo-base': { light: 2, dark: 12 },
  '--color-kumo-elevated': { light: 6, dark: 9 },
  '--color-kumo-recessed': { light: 10, dark: 15 },
  '--color-kumo-tint': { light: 12, dark: 18 },
  '--color-kumo-control': { light: 4, dark: 16 },
  '--color-kumo-fill': { light: 14, dark: 22 },
  '--color-kumo-fill-hover': { light: 18, dark: 28 },
  '--color-kumo-interact': { light: 24, dark: 32 },
  '--color-kumo-overlay': { light: 8, dark: 26 },

  // ---- 边框 / 分隔线 / 焦点环 / 阴影 ----
  '--color-kumo-line': { light: 26, dark: 32 },
  '--color-kumo-hairline': { light: 18, dark: 24 },
  '--color-kumo-focus': { light: 60, dark: 45, inverse: true },
  '--color-kumo-shadow-edge': { light: 30, dark: 40, inverse: true },
  '--color-kumo-shadow-drop': { light: 20, dark: 30, inverse: true },
  // tooltip 箭头的描边也走中性色，漏掉它会在深色下露出原来的灰
  '--color-kumo-arrow-edge': { light: 26, dark: 32 },
  '--color-kumo-arrow-stroke': { light: 26, dark: 32 },

  // ---- 反色块（浅色模式下是深色块，深色模式反之）----
  '--color-kumo-contrast': { light: 88, dark: 10, inverse: true },

  // ---- 文字（独立命名空间 `--text-color-*`）----
  '--text-color-kumo-default': { light: 78, dark: 8, inverse: true },
  '--text-color-kumo-strong': { light: 92, dark: 4, inverse: true },
  '--text-color-kumo-subtle': { light: 55, dark: 38, inverse: true },
  '--text-color-kumo-inactive': { light: 42, dark: 52, inverse: true },
  '--text-color-kumo-placeholder': { light: 48, dark: 46, inverse: true },
  // 反色文字用在 contrast 块上，所以方向与表面一致
  '--text-color-kumo-inverse': { light: 4, dark: 92 },
}

/** 把当前的强调色 / 中性色写到根元素（幂等，可反复调用）。 */
export function applyAppearanceTheme() {
  if (typeof document === 'undefined') return

  const { accentColor, neutralColor } = usePreferencesStore.getState()
  const mode = resolvedMode()
  const style = document.documentElement.style

  // ⏸️ 自定义主题整体停用：把所有可能注入过的令牌清掉后直接返回
  if (!CUSTOM_THEME_ENABLED) {
    for (const token of [
      '--color-kumo-brand',
      '--color-kumo-brand-hover',
      '--text-color-kumo-brand',
      ...Object.keys(NEUTRAL_TOKENS),
    ]) {
      style.removeProperty(token)
    }
    return
  }

  // 强调色：选「默认」时**移除覆盖**，回到 Kumo 原生品牌色
  if (accentColor === DEFAULT_ACCENT_COLOR) {
    style.removeProperty('--color-kumo-brand')
    style.removeProperty('--color-kumo-brand-hover')
    style.removeProperty('--text-color-kumo-brand')
  } else {
    // 注意：`text-*` 用的是**独立命名空间** —— `text-kumo-brand` 读 `--text-color-kumo-brand`，
    // 而 `bg-kumo-brand` 读 `--color-kumo-brand`（Kumo 里两者默认色甚至不同：蓝 / Cloudflare 橙）。
    // 只覆盖一个会出现「背景变了、文字没变」，所以两个都要写。
    style.setProperty('--color-kumo-brand', accentColor)
    style.setProperty(
      '--color-kumo-brand-hover',
      `color-mix(in oklab, ${accentColor} 88%, black)`,
    )
    style.setProperty('--text-color-kumo-brand', accentColor)
  }

  // ⏸️ 中性色暂时整体禁用：先清理残留覆盖，再直接返回
  if (!NEUTRAL_COLOR_OVERRIDE_ENABLED) {
    for (const token of Object.keys(NEUTRAL_TOKENS)) {
      style.removeProperty(token)
    }
    return
  }

  // 中性色：选「默认」时移除全部覆盖；否则**整套**派生
  // （表面 / 边框线条 / 阴影 / 文字 / 反色块，两类方向不同）
  const surfaceToward = mode === 'dark' ? 'black' : 'white'
  const inverseToward = mode === 'dark' ? 'white' : 'black'

  for (const [token, rule] of Object.entries(NEUTRAL_TOKENS)) {
    if (neutralColor === DEFAULT_NEUTRAL_COLOR) {
      style.removeProperty(token)
      continue
    }
    const percent = mode === 'dark' ? rule.dark : rule.light
    const toward = rule.inverse ? inverseToward : surfaceToward
    style.setProperty(token, `color-mix(in oklab, ${neutralColor} ${percent}%, ${toward})`)
  }
}

// 偏好或生效主题变化时重算
usePreferencesStore.subscribe((state, prevState) => {
  if (
    state.accentColor !== prevState.accentColor ||
    state.neutralColor !== prevState.neutralColor ||
    state.colorMode !== prevState.colorMode
  ) {
    applyAppearanceTheme()
  }
})

if (typeof window !== 'undefined') {
  // 首帧即应用（模块在 main.tsx 里于渲染前引入）
  applyAppearanceTheme()

  // 「跟随系统」时，系统深浅变化也要重算（colorMode 本身没变）
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (usePreferencesStore.getState().colorMode === 'system') {
        applyAppearanceTheme()
      }
    })
}
