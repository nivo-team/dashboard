import { ClipboardText, cn, LinkButton } from '@cloudflare/kumo'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { NotFoundIllustration } from '#/components/not-found-illustration'
import { DEFAULT_APP_ID, isMultiAppEnabled, useAuth } from '#/lib/auth'

interface WireframeBlockProps {
  className?: string
  children?: ReactNode
}

/**
 * 线框网格的一行。
 *
 * 行与行之间的水平虚线、以及非末行两个下角的交点方块，由 `styles.css` 的
 * `[data-wireframe-row]` 规则绘制（上游 HTML 用一长串 Tailwind arbitrary variant
 * 表达，这里收敛为语义化选择器，避免在 JSX 里重复三遍）。
 */
function WireframeRow({ className, children }: WireframeBlockProps) {
  return (
    <div data-wireframe-row className={className}>
      {children}
    </div>
  )
}

/**
 * 线框网格的一格：左右两侧各一条竖直虚线，宽度居中且最大 1024px。
 *
 * `@2xl/wireframe:` / `@3xl/wireframe:` 是**命名**容器查询变体，容器由最外层声明
 * （`@container/wireframe`）。必须带上容器名 —— 不带名字的 `@2xl:` 会命中「最近的容器」，
 * 而 Kumo 组件内部也可能存在匿名容器，届时断点会按错误的宽度求值。
 */
function WireframeCell({ className, children }: WireframeBlockProps) {
  return (
    <div
      data-wireframe-cell
      className={cn(
        // calc() 里的运算符用下划线占位（Tailwind arbitrary value 会还原成空格）
        'relative flex h-full w-[calc(100%_-_2rem)] max-w-[1024px] p-6 @2xl/wireframe:w-[calc(100%_-_4rem)] @2xl/wireframe:p-14',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * 404 缺省页版式。
 *
 * 三行虚线网格：顶部「返回首页 + 当前路径」、中间「标题 + 说明 + 插图」、底部留白行。
 *
 * 与上游 HTML 的差异（均为本仓库约定）：
 * - 文案全部走 i18n（`common:notFound.*`），路由本身用 `<Trans>` 插值；
 * - 颜色改用 Kumo 语义令牌，不写 `dark:` 变体（主题由根节点 `data-mode` 驱动）；
 * - 线框装饰收敛到 `styles.css`；返回箭头加 `rtl-flip`、外边距用 `-ms-3` 适配 RTL；
 * - 工具行右侧不再是面包屑，改成 `ClipboardText`：显示去掉前导斜杠的路径段，
 *   复制的是地址栏里的完整链接；
 * - 根节点声明 `data-notfound`：外壳内容区据此收回 padding 与宽度上限
 *   （规则见 `styles.css`），整页线框才能铺满内容区；
 * - 根节点是 `div` 而非上游的 `main`：本组件既可能整屏渲染，也可能嵌在外壳的
 *   `<main>` 内容区里，用 `main` 会造成嵌套。
 */
function NotFoundPage({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { availableApps } = useAuth()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  // 额外订阅含 search / hash 的 href：地址栏任何部分变化都会重渲染，
  // 保证复制出去的始终是当前地址（href 不含 origin，故与 origin 拼接）
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })

  // 展示：去掉前导斜杠的路径段（"djskadja"），比整串 URL 轻；
  // 复制：地址栏里的完整链接，贴给别人能直接打开。
  const pathLabel = pathname.replace(/^\//, '') || '/'
  const currentUrl = `${window.location.origin}${locationHref}`

  // 路径首段是已登录应用时（业务外壳内的 404），「返回首页」回到该应用主页；
  // 否则（非法 appId、_main 外壳）回到应用选择页。
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  const isKnownApp = !!firstSegment && availableApps.some((app) => app.id === firstSegment)
  const defaultHome = isMultiAppEnabled() ? '/' : `/${DEFAULT_APP_ID}/home`
  const homeHref = isKnownApp && firstSegment ? `/${firstSegment}/home` : defaultHome

  return (
    <div
      data-notfound
      className={cn(
        'flex w-full grow flex-col bg-kumo-canvas shadow-[0_100px_var(--color-kumo-canvas)]',
        className,
      )}
    >
      <div className="@container/wireframe flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center">
        {/* 工具行：返回首页（左）+ 当前路径剪贴板（右，窄容器下隐藏） */}
        <WireframeRow className="h-fit min-[880px]:h-full">
          <WireframeCell className="items-end py-4 @2xl/wireframe:py-6">
            <div className="flex w-full items-center justify-between gap-4">
              <LinkButton
                href={homeHref}
                variant="ghost"
                icon={<CaretLeftIcon size={16} className="rtl-flip" />}
                className="-ms-3 shrink-0"
              >
                {t('notFound.backHome', '返回首页')}
              </LinkButton>

              {/*
                当前路径：显示去掉前导斜杠的路径段，复制的是地址栏里的完整链接。
                路径是 LTR 语义（URL），外层的 dir="ltr" 保证 RTL 界面下不被 bidi 重排、
                并保持左对齐；Kumo 的 ClipboardText 不透传 dir，所以放在包裹层上。
              */}
              <div dir="ltr" className="hidden min-w-0 @3xl/wireframe:flex">
                <ClipboardText
                  text={pathLabel}
                  textToCopy={currentUrl}
                  size="base"
                  className="w-full max-w-[min(40ch,40vw)]"
                  tooltip={{
                    text: t('notFound.copyLink', '复制链接'),
                    copiedText: t('notFound.copied', '已复制'),
                    side: 'top',
                  }}
                  labels={{ copyAction: t('notFound.copyLink', '复制链接') }}
                />
              </div>
            </div>
          </WireframeCell>
        </WireframeRow>

        {/* 主体行：标题 + 说明 + 角色插图 */}
        <WireframeRow className="h-fit min-[880px]:h-full">
          <WireframeCell className="flex-col gap-4 py-10 @2xl/wireframe:flex-row @2xl/wireframe:py-14">
            <div className="order-1 flex w-full min-w-0 flex-col gap-12 @2xl/wireframe:order-0 @2xl/wireframe:gap-6">
              <h1 className="text-4xl leading-tight text-kumo-subtle @2xl/wireframe:text-5xl">
                <span className="font-medium text-kumo-default">
                  {t('notFound.title', '页面不存在')}
                </span>
              </h1>
              <p className="mb-4 max-w-prose text-lg leading-relaxed text-pretty text-kumo-subtle">
                <Trans
                  i18nKey="notFound.description"
                  defaults="路由 <b>{{route}}</b> 不存在<br/>控制台的其他部分运行正常，<br/>你可以放心返回。"
                  values={{ route: pathname }}
                  components={{
                    b: <span dir="ltr" className="font-medium wrap-break-word text-kumo-default" />,
                    br: <br />,
                  }}
                />
              </p>
            </div>

            <div
              className="hidden w-full items-center justify-center p-4 @3xl/wireframe:flex"
              aria-hidden="true"
            >
              <NotFoundIllustration />
            </div>
          </WireframeCell>
        </WireframeRow>

        {/* 收尾行：宽屏下补足剩余高度，让上面两行保持满高 */}
        <WireframeRow className="h-auto grow min-[880px]:h-full min-[880px]:grow-0">
          <WireframeCell className="flex-1 py-2" />
        </WireframeRow>
      </div>
    </div>
  )
}

/** 在外壳内容区内渲染（`_main/$.tsx`、`$appId/$.tsx`、`_main` 布局兜底）。 */
export function NotFound() {
  return <NotFoundPage className="min-h-[60svh]" />
}

/** root 兜底：没有外壳可用时占满整个视口。 */
export function NotFoundFullScreen() {
  return <NotFoundPage className="min-h-svh" />
}
