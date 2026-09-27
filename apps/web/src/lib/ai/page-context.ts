import { getAuthSnapshot } from '#/lib/auth'
import i18n from '#/lib/i18n'
import { ALL_NAV_TARGETS, ALL_SHELL_NAV_TARGETS } from '#/lib/navigation'
import type { AiPageContext } from './types'

/**
 * 「外壳桥」：把只有 React 侧才拿得到的能力（router 实例、导航函数）交给工具层。
 *
 * 为什么需要它：`router` 实例由 `main.tsx` 里的 `getRouter()` 现场创建、**没有全局单例**，
 * 工具模块不能直接 import 它；而工具又不是 React 组件，用不了 `useNavigate()`。
 * 于是由 `AppShell` 在挂载时把这两件事注册进来，工具执行时通过 `getAiShellBridge()` 取。
 *
 * 桥是**可选**的：注册前（或在没有 shell 的场景）工具依然可用，只是 `routePath` 为 null、
 * `navigate_to` 会明确报错而不是静默失败。
 */
export interface AiShellBridge {
  /** 客户端路由跳转（TanStack Router 的 `navigate`） */
  navigate: (to: string) => void
  /** 当前匹配到的路由模板，如 `/$appId/system/features/$featureId` */
  getRoutePath: () => string | null
}

let bridge: AiShellBridge | null = null

export function registerAiShellBridge(next: AiShellBridge | null): void {
  bridge = next
}

export function getAiShellBridge(): AiShellBridge | null {
  return bridge
}

/**
 * 取当前页面的上下文快照。
 *
 * 数据来源分三处，缺一不可：
 * - **URL / 路径**：`window.location` —— 工具层不在 React 树里，拿不到 router 的 location；
 * - **应用信息**：认证 store 快照（`getAuthSnapshot`，非 hook 版本）；
 * - **路由模板**：外壳桥注入（拿不到时为 null）。
 */
export function getPageContext(): AiPageContext {
  if (typeof window === 'undefined') {
    return {
      url: '',
      pathname: '',
      search: '',
      appId: null,
      appName: null,
      routePath: null,
      navLabel: null,
      title: null,
    }
  }

  const { pathname, search, href } = window.location
  const auth = getAuthSnapshot()
  const currentApp = auth.currentApp ?? null

  return {
    url: href,
    pathname,
    search,
    appId: currentApp?.id ?? null,
    appName: currentApp?.name ?? null,
    routePath: bridge?.getRoutePath() ?? null,
    navLabel: matchNavLabel(pathname, currentApp?.id ?? null),
    title: readPageTitle(),
  }
}

/** 页面标题：优先后端渲染的 `<h1>`（`PageHeader`），没有就退回 `document.title`。 */
function readPageTitle(): string | null {
  const heading = document.querySelector('h1')?.textContent?.trim()
  if (heading) return heading
  const docTitle = document.title?.trim()
  return docTitle || null
}

/** 把 i18n 的 `labelKey` 翻成当前语言下的文案；缺失时用导航项自带的兜底 `label`。 */
export function resolveNavLabel(labelKey: string | undefined, fallback: string): string {
  if (!labelKey) return fallback
  return i18n.t(labelKey, { ns: 'common', defaultValue: fallback })
}

/**
 * 找出当前路径命中的导航项名称（最长前缀匹配）。
 *
 * **这里刻意不做权限过滤** —— 与 `collectNavigation` 的分工要分清：
 * - `collectNavigation`（`tools/page-tools.ts`）：给 AI 的**可选目标清单**（"AI 能去哪"），
 *   那里是权限过滤点；
 * - 本函数：反查**用户当前在哪**（"现在这个页面叫什么"）。用户自己打开了什么页面，
 *   与 AI 的权限没有关系；若在这里也按权限过滤，AI 反而会在受限页面上"不知道自己在哪"。
 *
 * 所以两处都在遍历 `ALL_NAV_TARGETS`，但**只有前者是过滤点**。
 *
 * 业务导航（`ALL_NAV_TARGETS`）的 `to` 是**相对 appId** 的，要先补上 `/<appId>` 前缀；
 * 外壳导航（`ALL_SHELL_NAV_TARGETS`）本来就是绝对路径 —— 这两份数据源的差异见 `#/lib/navigation`。
 *
 * 边界对齐很重要：`/users/user` 不该匹配到 `/users/user-archive`，所以除了相等之外
 * 只接受「后面紧跟 `/`」的情况。
 */
/**
 * `matchNavLabel` 的记忆表。
 *
 * 这是 `getPageContext()` 里**最贵的一步**：遍历全部导航项、逐个走 i18n 取名字，
 * 而每次发消息都要采一次页面上下文。键取「appId + 语言 + pathname」——
 * 导航配置是静态常量，这三者不变时结果必然一致。
 *
 * **刻意没有连整个 `getPageContext()` 一起缓存**：它还含 `title`，而标题会随页面
 * 异步加载变化，缓存整份反而会把过期标题喂给模型。
 */
const navLabelCache = new Map<string, string | null>()
/** 上限：键是「app × 语言 × 路径」，正常用不到这么多；超了说明有异常，清空重来 */
const NAV_LABEL_CACHE_LIMIT = 64

export function matchNavLabel(pathname: string, appId: string | null): string | null {
  const cacheKey = `${appId ?? ''}|${i18n.resolvedLanguage ?? ''}|${pathname}`
  if (navLabelCache.has(cacheKey)) return navLabelCache.get(cacheKey) ?? null

  const candidates: Array<{ path: string; labelKey?: string; label: string }> = []

  if (appId) {
    for (const target of ALL_NAV_TARGETS) {
      candidates.push({
        path: `/${appId}${target.to}`,
        labelKey: target.labelKey,
        label: target.label,
      })
    }
  }

  for (const item of ALL_SHELL_NAV_TARGETS) {
    candidates.push({ path: item.to, labelKey: item.labelKey, label: item.label })
  }

  // 最长前缀优先：`/users/user/10001` 同时命中「用户列表」与「用户运营」时取更具体的那个
  const hit = candidates
    .filter(
      (item) =>
        item.path &&
        (pathname === item.path || pathname.startsWith(`${item.path}/`)),
    )
    .sort((a, b) => b.path.length - a.path.length)[0]

  const label = hit ? resolveNavLabel(hit.labelKey, hit.label) : null

  if (navLabelCache.size >= NAV_LABEL_CACHE_LIMIT) navLabelCache.clear()
  navLabelCache.set(cacheKey, label)
  return label
}

/**
 * 把页面上下文压成一段给模型看的文本。
 *
 * 放在 system 提示里而不是让模型每轮调一次 `get_page_context`：「我在哪」是每轮都要用的信息，
 * 多花一次工具调用（以及一次往返延迟）不划算；工具保留给「导航之后想确认位置」的场景。
 */
export function formatPageContext(context: AiPageContext): string {
  const lines = [
    `- 当前地址：${context.url || '未知'}`,
    `- 路径：${context.pathname || '未知'}`,
    context.search ? `- 查询参数：${context.search}` : null,
    `- 应用：${context.appName ?? '未知'}${context.appId ? `（${context.appId}）` : ''}`,
    context.navLabel ? `- 所在页面：${context.navLabel}` : null,
    context.routePath ? `- 路由模板：${context.routePath}` : null,
    context.title ? `- 页面标题：${context.title}` : null,
  ]
  return lines.filter((line): line is string => line !== null).join('\n')
}
