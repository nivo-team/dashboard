/**
 * 桌面壳 bridge —— 前端与桌面壳之间**唯一**的接口。
 *
 * 刻意不引任何第三方依赖（包括 `@wailsio/runtime`）：壳走的是 Wails 的
 * 「原始消息」通道（见 `apps/desktop/main.go` 的 `RawMessageHandler`），
 * 页面侧只需要 webview 自带的一个发送原语 + 一个全局接收函数。
 * 在浏览器里这段代码只做几次布尔判断，不产生任何网络请求。
 *
 * 三件事：
 *
 * | 能力 | 方向 | 用法 |
 * |---|---|---|
 * | `isDesktop()` | — | 当前是不是跑在桌面壳里 |
 * | `call()` | 页面 → 壳 | 按名字调用一个方法，等结果（Promise） |
 * | `on()` | 壳 → 页面 | 订阅壳推来的事件 |
 *
 * 线上协议的真值在 `apps/desktop/internal/bridge/wire.go`
 * （`{id, call, payload}` / `{id, ok, data}` / `{event, data}`）—— 一侧改了另一侧必须跟着改。
 */

import type { MouseEvent as ReactMouseEvent } from 'react'

/** `call()` 的可选项。 */
export interface CallOptions {
  /**
   * 超时毫秒数，默认 30s。
   *
   * 默认值存在的意义是「不要把请求无声地挂住」：超时会给出明确报错。
   * 原生对话框这类**等人操作**的方法属于合法长调用，传 `0` 关闭超时。
   */
  timeoutMs?: number
}

/** 暴露到 `window.__bridge` 的形态（方便在 devtools 里直接试）。 */
export interface DesktopBridge {
  /** 当前是否桌面端。 */
  readonly isDesktop: boolean
  /** 页面 → 壳：按名字调用，等结果。 */
  call: <T = unknown>(name: string, payload?: unknown, options?: CallOptions) => Promise<T>
  /** 壳 → 页面：订阅事件，返回取消订阅函数。 */
  on: <T = unknown>(name: string, handler: (data: T) => void) => () => void
  /** 壳 → 页面：退订。 */
  off: <T = unknown>(name: string, handler: (data: T) => void) => void
  /**
   * 某个事件**最近一次**的载荷（没有则 undefined）。
   *
   * 事件是即时的，不做重放；组件挂载晚于事件到达时用它补一次状态，
   * 或者干脆用 `call('core.info')` 主动拉。
   */
  last: <T = unknown>(name: string) => T | undefined
  /** 壳通过 URL 带来的自定义标记（`-mark k=v`）。 */
  marks: () => Readonly<Record<string, string>>
}

declare global {
  interface Window {
    /** 壳在导航前写进 URL、页面首屏脚本落地的桌面标记；浏览器里没有。 */
    __DESKTOP__?: boolean
    /** 壳运行的操作系统平台（如 'darwin' / 'windows' / 'linux'）。 */
    __DESKTOP_PLATFORM__?: string
    /** 桌面端标题栏/红绿灯注入高度（px，默认 54）。 */
    __DESKTOP_TITLE_BAR_H__?: number
    /** 壳带来的自定义标记。 */
    __DESKTOP_MARKS__?: Record<string, string>
    /** 壳投递消息进页面的入口（由本模块安装）。 */
    __bridgeRecv?: (message: unknown) => void
    /** 给人用的入口，等同于本模块的 `desktopBridge`。 */
    __bridge?: DesktopBridge
  }
}

/* ── 协议常量（与 wire.go 对齐） ─────────────────────────────────────────── */

/** 页面 bridge 装好后发的第一条消息：让壳把排队中的事件冲出来。没有 id，因此没有应答。 */
const READY_CALL = '__ready'

/**
 * Wails 的**系统**握手（裸字符串，不是 JSON）。
 *
 * 壳里的 `WebviewWindow.ExecJS` 只有在收到它之后才开始**立即执行**注入的 JS，
 * 在那之前一律排进 `pendingJS` 等着（见 `webview_window.go` 的 `runtimeLoaded`）。
 * 官方运行时 `@wailsio/runtime` 在加载时就会发这一条；我们刻意不引那个包，
 * 所以必须自己发 —— **少这一条，壳推回来的每条消息都会永远卡在壳的队列里。**
 */
const RUNTIME_READY = 'wails:runtime:ready'

/** 默认超时：见 CallOptions.timeoutMs。 */
const DEFAULT_TIMEOUT_MS = 30_000

/** 等壳注入发送原语的上限与轮询间隔。 */
const HOST_READY_TIMEOUT_MS = 10_000
const HOST_READY_POLL_MS = 50

/** 「最近一次事件」缓存的名字条数上限。 */
const LAST_EVENT_LIMIT = 32

/* ── 协议载荷 ───────────────────────────────────────────────────────────── */

interface WireRequest {
  id?: string
  call: string
  payload?: unknown
}

interface WireResponse {
  id?: string
  ok?: boolean
  data?: unknown
  error?: string
}

interface WireEvent {
  event?: string
  data?: unknown
}

/* ── 模块状态 ───────────────────────────────────────────────────────────── */

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

const pendingCalls = new Map<string, Pending>()
const eventListeners = new Map<string, Set<(data: unknown) => void>>()
const lastEvents = new Map<string, unknown>()

/** 页面 → 壳 的发送原语；null = 还没找到（普通浏览器，或壳尚未注入）。 */
let hostInvoke: ((message: string) => void) | null = null
let hostReadyPromise: Promise<void> | null = null
let installed = false
let sequence = 0

/* ── 检测 ───────────────────────────────────────────────────────────────── */

/**
 * 当前是不是跑在桌面壳里。
 *
 * 真值是 `window.__DESKTOP__`：壳把 `__desktop=1` 写进 URL，站点首屏的内联脚本
 * （`apps/web/index.html`）在**任何应用代码之前**把它落地。默认 false ——
 * 浏览器、SSR、无标记的旧站点都走这条。
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.__DESKTOP__ === true
}

/** 桌面端标题栏/红绿灯高度（px），默认 40。 */
export function desktopTitleBarHeight(): number {
  if (typeof window === 'undefined') return 40
  return window.__DESKTOP_TITLE_BAR_H__ ?? 40
}

/** 获取当前桌面壳运行平台（如 'darwin' / 'windows' / 'linux'；浏览器环境返回空字符串）。 */
export function desktopPlatform(): string {
  if (typeof window === 'undefined') return ''
  return (
    window.__DESKTOP_PLATFORM__ ??
    document.documentElement.dataset.desktopPlatform ??
    ''
  )
}

/** 是否运行在 macOS 或 Windows 桌面壳中（支持窗口毛玻璃模糊与透明标题栏）。 */
export function isDesktopBlurredPlatform(): boolean {
  if (!isDesktop()) return false
  if (typeof window === 'undefined') return false
  const p = desktopPlatform()
  if (p === 'darwin' || p === 'windows') return true
  const root = document.documentElement
  return root.classList.contains('is_mac') || root.classList.contains('is_windows')
}

/**
 * 桌面壳 Header 空白处双击 = 最大化 / 还原窗口。
 * 落在按钮、链接、输入框、下拉菜单等交互控件上时不抢事件。
 */
export function handleDesktopHeaderDoubleClick(
  event: ReactMouseEvent<HTMLElement> | MouseEvent,
): void {
  if (!isDesktop()) return
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('button, a, input, select, textarea, [role="button"], [role="menu"], [role="menuitem"]')) {
    return
  }
  void call('window.toggleMaximise').catch(() => {
    /* 壳未实现该方法时静默忽略 */
  })
}

/** 壳带来的自定义标记（`-mark k=v`）；浏览器里是空对象。 */
export function desktopMarks(): Readonly<Record<string, string>> {
  if (typeof window === 'undefined') return {}
  return window.__DESKTOP_MARKS__ ?? {}
}

/* ── 页面 → 壳 ──────────────────────────────────────────────────────────── */

/**
 * 按名字调用壳里的一个方法。
 *
 * 名字由壳侧注册（`registry.Handle("core.info", …)`），约定 `<域>.<动作>`。
 * 未注册、参数不符、方法内部报错，都会以**带说明的 Error** 拒绝 —— 不会静默。
 */
export function call<T = unknown>(
  name: string,
  payload?: unknown,
  options: CallOptions = {},
): Promise<T> {
  if (!isDesktop()) {
    return Promise.reject(new Error(`[bridge] 当前不是桌面端，无法调用 ${name}()`))
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return whenHostReady().then(
    () =>
      new Promise<T>((resolve, reject) => {
        const id = nextCallId()
        const timer =
          timeoutMs > 0
            ? setTimeout(() => {
                pendingCalls.delete(id)
                reject(
                  new Error(
                    `[bridge] 调用 ${name}() 超时（${timeoutMs}ms）；` +
                      '长耗时方法请传 { timeoutMs: 0 } 关闭超时',
                  ),
                )
              }, timeoutMs)
            : undefined

        pendingCalls.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          ...(timer ? { timer } : {}),
        })

        const request: WireRequest = { id, call: name }
        if (payload !== undefined) request.payload = payload

        try {
          // 一定要发**字符串**：三平台的消息原语里，只有字符串是通用形态
          hostInvoke?.(JSON.stringify(request))
        } catch (error) {
          if (timer) clearTimeout(timer)
          pendingCalls.delete(id)
          reject(toError(error))
        }
      }),
  )
}

/* ── 壳 → 页面 ──────────────────────────────────────────────────────────── */

/**
 * 订阅壳推来的事件，返回取消订阅函数。
 *
 * 事件**不重放**：订阅之前到达的会丢（壳侧只保证「页面就绪后按顺序送达」）。
 * 需要初始状态请用 `call()` 主动拉，或用 `last()` 补最近一次。
 */
export function on<T = unknown>(name: string, handler: (data: T) => void): () => void {
  let set = eventListeners.get(name)
  if (!set) {
    set = new Set()
    eventListeners.set(name, set)
  }
  set.add(handler as (data: unknown) => void)
  return () => off(name, handler)
}

/** 取消订阅。 */
export function off<T = unknown>(name: string, handler: (data: T) => void): void {
  const set = eventListeners.get(name)
  if (!set) return
  set.delete(handler as (data: unknown) => void)
  if (set.size === 0) eventListeners.delete(name)
}

/** 某个事件最近一次的载荷。 */
export function last<T = unknown>(name: string): T | undefined {
  return lastEvents.get(name) as T | undefined
}

/* ── 安装 ───────────────────────────────────────────────────────────────── */

/**
 * 安装 bridge：挂上接收函数、宣告就绪、暴露 `window.__bridge`。
 *
 * 幂等。**必须尽早调用**（`main.tsx` 启动时就调）：壳在页面就绪之前推的事件
 * 会排队等着，而队列只有收到 `__ready` 才会冲出来。
 * 浏览器里是空操作。
 */
export function installDesktopBridge(): void {
  if (installed || typeof window === 'undefined' || !isDesktop()) return
  installed = true

  // 兜底：内联脚本可能没跑到（旧版站点、被裁掉的内联脚本）—— 标记以 JS 为准
  const root = document.documentElement
  root.classList.add('is_desktop')
  root.dataset.isDesktop = 'true'

  window.__bridgeRecv = receive
  window.__bridge = desktopBridge

  /*
   * 桌面壳精细化窗口拖拽分流：
   * 1. 当鼠标落点在 .no-drag（Tabs 包裹容器、右侧操作区、按钮等）内部时，绝不拖动，事件完整交由前端 DOM（dnd-kit 标签排序正常生效）；
   * 2. 当鼠标落在 Header 空白可拖拽区（.drag / [data-desktop-title-bar]）且移动超过 3px 阈值时，向宿主发送 "wails:drag"，唤起 macOS 原生窗口拖拽。
   */
  let dragCandidate: { startX: number; startY: number } | null = null

  window.addEventListener(
    'mousedown',
    (event) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement | null
      if (!target) return

      // 若落在 .no-drag 内部或常见交互控件，坚决不触发窗口拖拽
      if (target.closest('.no-drag, button, a, input, select, textarea, [role="button"], [data-page-tab]')) {
        dragCandidate = null
        return
      }

      // 若落在可拖拽 Header 上，记录起始位置
      if (target.closest('.drag, [data-desktop-title-bar]')) {
        dragCandidate = { startX: event.clientX, startY: event.clientY }
      }
    },
    { capture: true },
  )

  window.addEventListener(
    'mousemove',
    (event) => {
      if (!dragCandidate) return
      // 避免纯点击误触：指针微幅移动超过 3px 才正式激活窗口拖拽
      const dx = event.clientX - dragCandidate.startX
      const dy = event.clientY - dragCandidate.startY
      if (dx * dx + dy * dy >= 9) {
        dragCandidate = null
        try {
          hostInvoke?.('wails:drag')
        } catch {
          /* 忽略未连接情况 */
        }
      }
    },
    { capture: true },
  )

  window.addEventListener('mouseup', () => {
    dragCandidate = null
  })

  void whenHostReady()
    .then(() => {
      // 顺序不能反：先让壳的注入通道「活」起来，再报 bridge 就绪
      hostInvoke?.(RUNTIME_READY)
      // 握手：只报「能收消息了」，不需要应答
      hostInvoke?.(JSON.stringify({ call: READY_CALL } satisfies WireRequest))
    })
    .catch(() => {
      /* 拿不到通道就算了：之后每次 call() 会各自报错，不必在这里刷屏 */
    })
}

/** 暴露给页面代码与 devtools 的单例。 */
export const desktopBridge: DesktopBridge = {
  get isDesktop() {
    return isDesktop()
  },
  call,
  on,
  off,
  last,
  marks: desktopMarks,
}

/* ── 内部实现 ───────────────────────────────────────────────────────────── */

/**
 * 壳投递消息进页面的唯一入口。壳执行的是 `window.__bridgeRecv(<JSON>)`，
 * 所以这里拿到的已经是对象；兼容字符串是为了手工调试试用。
 */
function receive(message: unknown): void {
  const parsed = typeof message === 'string' ? parseJson(message) : message
  if (!parsed || typeof parsed !== 'object') return

  const maybeEvent = parsed as WireEvent
  if (typeof maybeEvent.event === 'string') {
    emitToListeners(maybeEvent.event, maybeEvent.data)
    return
  }

  const response = parsed as WireResponse
  if (typeof response.id !== 'string') return

  const caller = pendingCalls.get(response.id)
  if (!caller) return
  pendingCalls.delete(response.id)
  if (caller.timer) clearTimeout(caller.timer)

  if (response.ok) caller.resolve(response.data)
  else caller.reject(new Error(response.error || '[bridge] 壳返回了未说明的失败'))
}

function emitToListeners(name: string, data: unknown): void {
  if (lastEvents.has(name)) lastEvents.delete(name)
  lastEvents.set(name, data)
  if (lastEvents.size > LAST_EVENT_LIMIT) {
    const oldest = lastEvents.keys().next()
    if (!oldest.done) lastEvents.delete(oldest.value)
  }

  const set = eventListeners.get(name)
  if (!set) return
  for (const handler of [...set]) {
    try {
      handler(data)
    } catch (error) {
      // 一个订阅者抛错不该影响其它订阅者
      console.error(`[bridge] 事件 ${name} 的订阅者抛错`, error)
    }
  }
}

/**
 * 找到「页面 → 壳」的发送原语。
 *
 * 三平台各有一个（判断顺序与 Wails 运行时 `system.ts` 一致，只是不引那个包）：
 * Windows WebView2、macOS / Linux WebKit，最后才是壳注入的包装。
 * 全都没有 = 普通浏览器。
 */
function resolveHostInvoke(): ((message: string) => void) | null {
  try {
    const host = window as unknown as {
      chrome?: { webview?: { postMessage?: (message: string) => void } }
      webkit?: { messageHandlers?: { external?: { postMessage?: (message: string) => void } } }
      _wails?: { invoke?: (message: string) => void }
    }

    const webview2 = host.chrome?.webview
    if (typeof webview2?.postMessage === 'function') {
      return (message) => webview2.postMessage?.(message)
    }

    const webkit = host.webkit?.messageHandlers?.external
    if (typeof webkit?.postMessage === 'function') {
      return (message) => webkit.postMessage?.(message)
    }

    const injected = host._wails
    if (typeof injected?.invoke === 'function') {
      return (message) => injected.invoke?.(message)
    }
  } catch {
    /* 个别 webview 在访问这些对象时会抛：按「没有」处理 */
  }
  return null
}

/**
 * 等壳注入发送原语。
 *
 * Wails 三平台都是**页面加载完成之后**才注入，所以首屏的调用必然要等一下。
 * 等不到就明确报错 —— 与其让请求凭空挂住，不如说清楚发生了什么。
 */
function whenHostReady(): Promise<void> {
  if (hostInvoke) return Promise.resolve()
  hostReadyPromise ??= waitForHost()
  return hostReadyPromise
}

function waitForHost(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + HOST_READY_TIMEOUT_MS

    const poll = () => {
      const found = resolveHostInvoke()
      if (found) {
        hostInvoke = found
        resolve()
        return
      }
      if (Date.now() >= deadline) {
        hostReadyPromise = null // 允许之后再试（例如页面被壳重新加载后）
        reject(
          new Error('[bridge] 没等到桌面壳的消息通道：请确认应用是从桌面端启动的（而不是浏览器）'),
        )
        return
      }
      setTimeout(poll, HOST_READY_POLL_MS)
    }

    poll()
  })
}

function nextCallId(): string {
  sequence += 1
  return `${Date.now().toString(36)}-${sequence.toString(36)}`
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
