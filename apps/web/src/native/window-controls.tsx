import { Tooltip } from '@cloudflare/kumo'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '#/lib/cn'
import { useT } from '#/lib/use-typed-t'
import { usesWindowsChrome } from './bridge'
import { runWindowControl } from './window-chrome'

/**
 * 窗口条行末的三条窗口按钮（最小化 / 最大化-还原 / 关闭）：**页面画、系统管**。
 *
 * ## 分工
 *
 * - **视觉**（图标 / 悬停底色 / 悬停提示 / aria / 尺寸）：这里。
 * - **命中、悬停与按下态、最大化键的 Win11 贴靠布局（Snap Layouts）**：Windows。
 *   三个按钮各自标 `--wails-non-client-region: minimize|maximize|close`，
 *   `#/native/window-chrome` 把它们（连同窗口条空白区的 `caption`）的矩形报给壳，
 *   壳转成 `HTMINBUTTON` / `HTMAXBUTTON` / `HTCLOSE`；壳侧开
 *   `Windows.WebView2CompositionHosting` 才有这条路径（见 `apps/native/main.go`）。
 * - **动作**（真的去最小化 / 最大化 / 关闭）：`#/native/window-chrome` 在窗口捕获阶段按下时记住
 *   是哪个键、松开时只有落回同一个键才调 `window.*` —— 为什么不直接挂 onClick、为什么是
 *   「按下 + 松开」而不是「按下」，见那个文件的注释。
 *
 * 为什么不是系统画的按钮：Windows 上壳去掉了系统标题栏，而系统画的那三个按钮**无法脱离
 * 标题栏存在**（实测：把整块 DWM 边框扩进客户区只会让它们「画出来但点不动」）。
 *
 * 只在 Windows 桌面壳里渲染：macOS 有系统红绿灯、Linux 保留 GTK 原生标题栏、浏览器里没有窗口。
 */
export function WindowControls({ className }: { className?: string }) {
  const t = useT('common')
  const [maximised, setMaximised] = useState(readMaximised)

  /*
   * 最大化状态没有事件可订阅：原生贴靠（拖到屏幕顶端）、双击窗口条、Win+↑ 都是系统直接接管，
   * 页面只看到窗口尺寸变了。所以在 resize 时对一次「视口 = 工作区」——
   * 这也是「最大化 / 还原」两个图标唯一的切换依据。
   */
  useEffect(() => {
    if (!usesWindowsChrome()) return
    const sync = () => setMaximised(readMaximised())
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  if (!usesWindowsChrome()) return null

  return (
    <div
      className={cn(
        'no-drag absolute inset-y-0 right-0 z-10 flex items-stretch',
        'w-[var(--shell-window-controls-w,138px)]',
        className,
      )}
    >
      <CaptionButton label={t('windowControls.minimise')} kind="minimize">
        <path d="M0 5h10" />
      </CaptionButton>

      <CaptionButton
        label={maximised ? t('windowControls.restore') : t('windowControls.maximise')}
        kind="maximize"
      >
        {maximised ? (
          <>
            <path d="M2.5 2.5V0.5h7v7h-2" />
            <rect x="0.5" y="2.5" width="7" height="7" />
          </>
        ) : (
          <rect x="0.5" y="0.5" width="9" height="9" />
        )}
      </CaptionButton>

      <CaptionButton label={t('windowControls.close')} kind="close" danger>
        <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
      </CaptionButton>
    </div>
  )
}

/**
 * 三个键的 `--wails-non-client-region` 类：必须是**静态字符串**。
 * 用 `` `[--wails-non-client-region:${kind}]` `` 拼出来的类 Tailwind 扫不到、不会生成，
 * 于是 `getComputedStyle` 读到空值、上报时被跳过 —— 实测那样三个键会退回 `HTCLIENT`，
 * 只有静态写法的 `caption` 生效（命中测试：caption=HTCAPTION，按钮=HTCLIENT）。
 */
const REGION_CLASS: Record<'minimize' | 'maximize' | 'close', string> = {
  minimize: '[--wails-non-client-region:minimize]',
  maximize: '[--wails-non-client-region:maximize]',
  close: '[--wails-non-client-region:close]',
}

/**
 * 系统标题栏按钮的视觉：整条高、宽度由父容器的 `flex-1` 决定（46px ≈ 系统按钮宽度），
 * 悬浮态跟窗口条其余部分一致（Kumo 的 tint / fill），关闭键用 Kumo 的 danger 语义色。
 *
 * 三个标记各司其职：`--wails-non-client-region` 让系统认它（命中/贴靠）、
 * `data-window-control` 给 `#/native/window-chrome` 的捕获监听算命中（动作）、
 * `Tooltip` 给悬停提示（跟系统标题栏一样：提示语就是按钮名）。
 *
 * 鼠标点击**不在这里处理**：壳转发过来的按下 / 松开由 `#/native/window-chrome` 按
 * 「按下与松开必须落在同一个键上」判定（这里拿不到 click 事件，见那个文件的注释）。
 * 这里只留键盘入口 —— Enter/Space 合成点击的 `detail` 恒为 0（鼠标点击的 detail ≥ 1）。
 */
function CaptionButton({
  label,
  kind,
  danger = false,
  children,
}: {
  label: string
  kind: 'minimize' | 'maximize' | 'close'
  danger?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip
      content={label}
      side="bottom"
      delay={120}
      render={
        <button
          type="button"
          aria-label={label}
          data-window-control={kind}
          onClick={(event) => {
            if (event.detail === 0) runWindowControl(kind)
          }}
          className={cn(
            REGION_CLASS[kind],
            'no-drag flex h-full flex-1 cursor-default items-center justify-center',
            'text-kumo-default transition-colors',
            danger
              ? 'hover:bg-kumo-danger hover:text-white active:bg-kumo-danger'
              : 'hover:bg-kumo-tint active:bg-kumo-fill',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-kumo-line focus-visible:ring-inset',
          )}
        />
      }
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        shapeRendering="crispEdges"
        aria-hidden
        className="pointer-events-none shrink-0"
      >
        {children}
      </svg>
    </Tooltip>
  )
}

/**
 * 窗口是不是最大化 —— 无边框窗口的客户区就是整个窗口，最大化时视口等于屏幕工作区。
 * 留 2px 容差：取整与 DPI 缩放会让两边差一两个像素。
 */
function readMaximised(): boolean {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return false
  return window.innerWidth >= screen.availWidth - 2 && window.innerHeight >= screen.availHeight - 2
}
