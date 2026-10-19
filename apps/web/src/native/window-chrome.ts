import { call, desktopWindowName, sendHostMessage, usesWindowsChrome } from './bridge'

/**
 * Windows 桌面壳的**窗口 chrome**：标题栏空白区（原生 caption）+ 行末三个窗口键。
 *
 * 只做两件事，且都只在 Windows 分支里生效：
 *
 * 1. **申报非客户区**：把页面里带 `--wails-non-client-region` 的矩形报给壳，让 Windows
 *    把它们当原生命中区 —— `caption`（窗口条空白）按下即拖动，`minimize` / `maximize` /
 *    `close` 拿到 `HTMINBUTTON` / `HTMAXBUTTON` / `HTCLOSE`（含悬停态与 Win11 贴靠布局浮层）。
 *    线上格式是裸消息 `wails:non-client-region:` + `{ version, regions: [...] }`，
 *    坐标**物理像素**（壳侧 `nonClientHitTestRegion` 的注释：client-area 矩形，物理像素）。
 * 2. **执行窗口动作**：落在申报区域里的点击到不了 DOM 按钮（壳只把 `WM_NCLBUTTON*` 转成
 *    WebView2 的鼠标输入，beta.28 实测按钮的 `onClick` 不触发），所以在 `window` 的捕获阶段
 *    按 `data-window-control` 做矩形命中，再调壳的 `window.*`。
 *
 * macOS 有系统红绿灯、Linux 保留 GTK 原生标题栏 —— 两边都不需要这些。
 *
 * 为什么按钮不是系统画的：Windows 壳没有系统标题栏时系统画的那三个键无法独立存在
 * （实测扩 DWM 边框只会「画出来但点不动」），详见 `apps/native/README.md`。
 */

/** 壳认得的非客户区类型（对应 Go 侧 `nonClientHitTestKind`）。 */
const NON_CLIENT_REGION_KINDS: Record<string, true> = {
  caption: true,
  minimize: true,
  maximize: true,
  close: true,
}

/** 上一次发出去的载荷，用来去重（窗口条不动时不必反复发同一份）。 */
let lastNonClientRegions = ''

/** 执行一个窗口动作（最小化 / 最大化-还原 / 关闭）。 */
export function runWindowControl(kind: 'minimize' | 'maximize' | 'close'): void {
  const name = desktopWindowName()
  const request =
    kind === 'close'
      ? call('window.close', { name })
      : call(kind === 'minimize' ? 'window.minimise' : 'window.toggleMaximise', { name })
  request.catch(() => {
    /* 壳没就绪（握手未完成）时静默：窗口按钮不该把页面打崩 */
  })
}

/**
 * 把窗口条上标了 `--wails-non-client-region` 的矩形报给壳，让 Windows 把它们当**原生**非客户区。
 *
 * 为什么自己扫 DOM：Wails 自带的那套扫描在它注入的运行时里（`@wailsio/runtime`），
 * 而本壳刻意不加载它（见 `apps/native/README.md` 的「为什么不用 Wails 默认的运行时通道」）。
 * 只扫窗口条那几个容器，不扫整棵树 —— 业务页面动辄上千节点，每帧全量 `getComputedStyle`
 * 是白烧 CPU。
 */
export function reportNonClientRegions(): void {
  if (!usesWindowsChrome() || typeof document === 'undefined') return

  const scale = window.devicePixelRatio || 1
  const regions: { kind: string; left: number; top: number; right: number; bottom: number }[] = []

  for (const bar of document.querySelectorAll('[data-desktop-title-bar], header')) {
    for (const el of [bar, ...bar.querySelectorAll('*')]) {
      const kind = getComputedStyle(el).getPropertyValue('--wails-non-client-region').trim()
      if (!Object.hasOwn(NON_CLIENT_REGION_KINDS, kind)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      regions.push({
        kind,
        left: Math.round(rect.left * scale),
        top: Math.round(rect.top * scale),
        right: Math.round(rect.right * scale),
        bottom: Math.round(rect.bottom * scale),
      })
    }
  }

  const payload = JSON.stringify({ version: 1, regions })
  if (payload === lastNonClientRegions) return
  lastNonClientRegions = payload
  sendHostMessage('wails:non-client-region:' + payload)
}

/**
 * 安装窗口 chrome：
 * - 立即上报一次非客户区，之后跟随尺寸 / 滚动 / DOM 变化（rAF 合帧）；
 * - 在 `window` 捕获阶段接管三个窗口键的按下（事件到不了按钮本身，见文件头注释）。
 *
 * 幂等；只在 Windows 桌面壳里生效，其它平台直接返回。
 */
export function installWindowChrome(): void {
  if (typeof window === 'undefined' || !usesWindowsChrome()) return

  reportNonClientRegions()

  let queued = false
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      reportNonClientRegions()
    })
  }
  window.addEventListener('resize', schedule)
  window.addEventListener('scroll', schedule, true)
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  })

  window.addEventListener(
    'mousedown',
    (event) => {
      if (event.button !== 0) return
      const kind = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-window-control]')?.dataset.windowControl
      if (kind !== 'minimize' && kind !== 'maximize' && kind !== 'close') return

      // 这次按下归窗口键：别再当成拖动窗口条的空白区
      event.stopPropagation()
      event.preventDefault()
      runWindowControl(kind)
    },
    { capture: true },
  )
}
