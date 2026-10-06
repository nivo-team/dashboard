import i18n from '#/lib/i18n'
import { ALL_NAV_TARGETS } from '#/lib/navigation'
import type { AiPageCatalogEndpoint } from '../page-catalog'
import { findPageCatalogEntry } from '../page-catalog'
import { describeEndpointParams, findEndpointSpec } from '../endpoint-specs'
import { getAiShellBridge, getPageContext, resolveNavLabel } from '../page-context'
import { resolveActivePageCapabilities } from '../page-capabilities'
import { resolveAiPageContext } from '../page-context-registry'
import { NAVIGATION_GRANT } from '../session-permissions'
import type { AiToolDefinition } from '../types'

/**
 * 「位置」类工具：读当前上下文、列页面清单、带用户去某个页面。
 *
 * 三者是配套的：`list_navigation` 给出**可选目标**，`navigate_to` 执行跳转，
 * `get_page_context` 在跳转之后确认落到了哪里。模型因此不需要猜路由。
 */

export interface NavigationEntry {
  /** 当前语言下的页面名称 */
  name: string
  /** 绝对路径 */
  path: string
  /** 所属分组（业务导航的父级），外壳导航为 null */
  group: string | null
}

/**
 * 导航清单的记忆表 —— 键是「appId + 界面语言」。
 *
 * 算一次要遍历全部导航项、逐个走 i18n 取名字；而模型在一轮对话里反复问
 * 「有哪些页面」很常见（同一个问题、甚至同一轮里 `list_navigation` 被调多次）。
 * 输入只有 appId 与语言两个维度，导航配置本身是静态常量，所以结果可以放心复用。
 *
 * 语言变化、登录换账号都会自然 miss（两者都在键里），不需要手动失效。
 */
const navigationCache = new Map<string, readonly NavigationEntry[]>()
/** 上限：键只有「几个 app × 几种语言」的量级；超了说明有异常，清空重来 */
const NAVIGATION_CACHE_LIMIT = 32

/**
 * 汇总当前 app 的**业务导航** —— 给 AI 看的页面清单的**唯一出口**。
 *
 * 单列成函数（而不是把 `ALL_NAV_TARGETS` 直接丢给工具）就是为了留一道**过滤点**：
 * 将来若要按权限收窄可见页面（某档只能看部分模块、或某类页面不该被 AI 打开），
 * 条件加在**这里一处**即可 —— 工具、提示词、界面都不必知道「过滤」这回事。
 * 所以**不要**在别处再遍历 `ALL_NAV_TARGETS` 拼一份给模型的清单。
 *
 * **刻意不含外壳导航**（应用选择 / 个人资料 / 外观 / AI 设置）：那些是跨应用、跨模块的
 * 页面，回答不了「这个应用里有哪些页面」。一并交出去，既扩大了 AI 的可导航范围，
 * 也稀释了清单的信噪比。
 *
 * **`isAllowedPath` 也读这份清单**（见下），所以这里的收窄会同时收紧导航白名单 ——
 * 一处改、两处生效，别再各写一份判断。
 *
 * 业务导航（`ALL_NAV_TARGETS`）的 `to` 是**相对 appId** 的，要补前缀才成绝对路径。
 * 没有 appId 时返回**空数组**：业务页都需要 `/appId/...` 前缀，此时没有可去的地方，
 * 退化成外壳页面只会把用户带到应用选择页去。
 */

export function collectNavigation(appId: string | null): NavigationEntry[] {
  // 没有 appId 就没有可导航的业务页（它们都需要 /appId 前缀）
  if (!appId) return []

  const cacheKey = `${appId}|${i18n.resolvedLanguage ?? ''}`
  const cached = navigationCache.get(cacheKey)
  if (cached) return [...cached]

  const entries: NavigationEntry[] = ALL_NAV_TARGETS.map((target) => ({
    name: resolveNavLabel(target.labelKey, target.label),
    path: `/${appId}${target.to}`,
    group: target.parentLabel
      ? resolveNavLabel(target.parentLabelKey, target.parentLabel)
      : null,
  }))

  if (navigationCache.size >= NAVIGATION_CACHE_LIMIT) navigationCache.clear()
  navigationCache.set(cacheKey, entries)
  // 回副本：缓存的是内部那份数组，工具里会拿它 filter / slice，给独立数组更安全
  return [...entries]
}

/**
 * 站内路径白名单：目标必须落在某个**已知导航项之下**。
 *
 * 为什么用「前缀」而不是「完全相等」：详情页（`/console/example/table/10001`）本来就不在导航清单里，
 * 但它属于「表格示例」这个导航项之下，是合法目标；而 `/evil` 这种凭空来的路径一律拒绝。
 * 这样模型既能带用户去看具体某条记录，又没法把页面导到未知位置。
 */
export function isAllowedPath(path: string, appId: string | null): boolean {
  // 只接受站内绝对路径：`//host` 是协议相对的外链，`javascript:` 之类更是直接拒绝
  if (!path.startsWith('/') || path.startsWith('//')) return false
  return collectNavigation(appId).some(
    (entry) => path === entry.path || path.startsWith(`${entry.path}/`),
  )
}

export const getPageContextTool: AiToolDefinition = {
  name: 'get_page_context',
  catalogDescription: '获取当前页面或指定页面的接口信息',
  description:
    '读取页面用到的接口和参数明细（参数名 / 位置 / 是否必填）。不传 path 时读用户此刻所在页面；传 path（来自 search_pages / list_navigation）则读**指定页面**——跨页面统计时用它逐页拿接口，不必真的跳过去。查数据或调接口前先调用它，接口路径与参数以返回为准、不要猜测。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          '可选。要读取的页面路径（相对 appId，如 /system/roles），取自 search_pages 或 list_navigation；不传则读当前所在页面。',
      },
    },
    additionalProperties: false,
  },
  capability: 'page:read',
  execute: async (input, ctx) => {
    const requested = typeof input.path === 'string' ? input.path.trim() : ''

    /*
      指定了 path 就**读那一页**（跨页面聚合的入口）：按目录项反查，
      都取不到时如实说明"这一页没有登记接口"。

      上下文一律经 `ctx.getPageContext()` 取（与 `get_page_data` / `run_page_command` 一致）——
      不要直接调模块级的 `getPageContext()`：两者在生产里同源，但工具层统一走 ctx
      才能在非浏览器环境（自检 / 测试）里注入一份可控快照。
    */
    const context = ctx.getPageContext()
    if (requested) return readRequestedPage(requested, context.appId)

    const capabilities = resolveActivePageCapabilities(context.routePath)
    const page = capabilities || resolveAiPageContext(context.routePath)
    // 页面没声明上下文就只给基础信息 —— 不编造「这个页面大概会用到什么」
    if (!page) return { ...context, note: PAGE_NOT_DECLARED }

    return {
      ...context,
      page: {
        description: page.description,
        ...(page.entities?.length ? { entities: page.entities } : {}),
        ...(page.forms?.length ? { forms: page.forms } : {}),
        ...(capabilities?.actions?.length ? { actions: capabilities.actions } : {}),
        ...(capabilities?.searchParams ? { searchParams: capabilities.searchParams } : {}),
        endpoints: await describeEndpoints(page.endpoints ?? []),
      },
    }
  },
}

/** 页面没登记接口时的统一说明（两条分支共用，避免措辞分叉）。 */
const PAGE_NOT_DECLARED =
  '这一页没有向 AI 登记接口与字段。若需要取数，请用 search_api + call_read_api 按模块检索接口。'

/** 按页面路径读取**指定页面**（来自 `search_pages` / `list_navigation`）。 */
async function readRequestedPage(requested: string, appId: string | null): Promise<unknown> {
  const entry = findPageCatalogEntry(normalizeCatalogPath(requested, appId))
  const page = entry ?? undefined

  if (!page) {
    return {
      requested,
      found: false,
      note: `页面目录里没有「${requested}」。请先用 search_pages 按功能描述检索出准确的路径，不要猜路径。`,
    }
  }

  return {
    found: true,
    path: page.path,
    title: page.title,
    description: page.desc,
    ...(page.entities?.length ? { entities: page.entities } : {}),
    ...(page.permission ? { permission: page.permission } : {}),
    endpoints: await describeEndpoints(page.endpoints ?? []),
    note: '这是**指定页面**的接口清单（参数明细已补）。可直接按它调 call_read_api 取数；要真正打开这一页用 navigate_to。',
  }
}

/**
 * 路径归一化：目录里存的是 `/example/table`（**相对 appId**），
 * 而模型可能给出带 appId 的绝对路径（`/app1/example/table`）或带尾斜杠的形式。
 * 三者都收敛到目录里的形态，避免因为一个前缀就查不到。
 *
 * `appId` **由调用方传入**（取 `getPageContext()` 的那一份）：函数内部再去读一次
 * 模块级上下文，既多算一遍，也会在测试 / 非浏览器环境里读到与调用方不同的快照。
 */
function normalizeCatalogPath(path: string, appId: string | null): string {
  let normalized = path.trim()
  if (appId && normalized.startsWith(`/${appId}/`)) {
    normalized = normalized.slice(appId.length + 1)
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

/** 把接口引用补成带参数明细的一行（`get_page_context` 两处共用）。 */
async function describeEndpoints(
  refs: readonly AiPageCatalogEndpoint[],
): Promise<unknown[]> {
  return Promise.all(
    refs.map(async (ref) => {
      const spec = await findEndpointSpec(ref.method, ref.path)
      const params = describeEndpointParams(spec)
      return {
        method: ref.method,
        path: ref.path,
        // purpose 是本页面视角的用途，比接口自己的 summary 更贴合当前场景
        ...(ref.purpose ? { purpose: ref.purpose } : {}),
        ...(spec?.summary ? { summary: spec.summary } : {}),
        // 参数明细：**模型最常错的三个信息**（名字 / 位置 / 是否必填）都在这一行里
        ...(params ? { params } : {}),
      }
    }),
  )
}

export const listNavigationTool: AiToolDefinition = {
  name: 'list_navigation',
  catalogDescription: '查找后台的页面路径',
  description: '列出后台页面的名称与路径，供 navigate_to 选择，路径不得猜测。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '可选。按名称或路径过滤，例如「用户」「字典」',
      },
    },
    additionalProperties: false,
  },
  capability: 'page:read',
  execute: async (input) => {
    const keyword = typeof input.keyword === 'string' ? input.keyword.trim().toLowerCase() : ''
    const entries = collectNavigation(getPageContext().appId)
    const items = keyword
      ? entries.filter(
          (entry) =>
            entry.name.toLowerCase().includes(keyword) ||
            entry.path.toLowerCase().includes(keyword) ||
            (entry.group ?? '').toLowerCase().includes(keyword),
        )
      : entries

    // 全量约几十条，直接给模型即可；仍设上限，避免导航项爆炸时把上下文撑满
    return { total: items.length, items: items.slice(0, 80) }
  },
}

/**
 * 目标路径对应的**可读页面名**（给确认卡 / 建议卡显示）。
 *
 * 取名规则与 `isAllowedPath` 同一套：优先精确命中导航项，否则取最长的前缀命中
 * （详情页 `/console/example/table/10001` → 「表格示例」）。取不到就退化成路径本身 ——
 * 卡片上永远不能出现空白标题。
 */
function resolveTargetLabel(path: string, appId: string | null): string {
  const entries = collectNavigation(appId)
  let best: NavigationEntry | null = null
  for (const entry of entries) {
    if (path !== entry.path && !path.startsWith(`${entry.path}/`)) continue
    if (!best || entry.path.length > best.path.length) best = entry
  }
  return best?.name ?? path
}

export const navigateToTool: AiToolDefinition = {
  name: 'navigate_to',
  catalogDescription: '跳转到后台指定页面',
  description:
    '把用户带到后台某个页面（前端路由跳转）。path 必须来自 list_navigation，不得猜测。询问模式下会先请用户确认；用户拒绝后不要重试同一目标，改为在当前对话给出数据或反问用户。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '目标路径，例如 /console/example/table 或 /console/example/table/10001',
      },
      reason: {
        type: 'string',
        description: '可选。为什么建议去这个页面（给用户看的一句话）',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  /*
    归到 `read` 而不是 `act`：导航**不改变任何东西** —— 它只是把用户带到另一个页面，
    「看哪里」不是「改什么」。所以只读档也应该能用它；否则一个只读的 AI 连
    「带我去表格示例」都做不到，那显然过严了。

    但「只读」不等于「免确认」：跳转会带离当前页面，所以**询问模式下**要用户点头
    （自动模式 = 始终允许，直接跳）。三个落点：
    - **面板 · 询问模式**：`requestApproval` 弹三选一确认卡（带我去 / 本会话自动跳转 / 先不跳）；
      「本会话自动跳转」写 `NAVIGATION_GRANT`（本会话免问），设置里的「自动跳转」开着时直接跳；
    - **面板 · 自动模式**：不问，直接跳；
    - **全屏**：不跳、不阻塞 —— 返回一份建议，由运行时翻成 `nav-proposal` part，
      用户点卡片才真正跳（那一跳是用户自己的动作）。
  */
  capability: 'page:navigate',
  execute: async (input, ctx) => {
    const path = typeof input.path === 'string' ? input.path.trim() : ''
    if (!path) throw new Error('缺少目标路径')

    const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
    const { appId } = ctx.getPageContext()
    if (!isAllowedPath(path, appId)) {
      throw new Error(
        `拒绝跳转到未知路径：${path}。请先用 list_navigation 确认可用的页面路径。`,
      )
    }

    const label = resolveTargetLabel(path, appId)

    /*
      全屏容器：不跳，交回一张建议卡（非阻塞）。
      返回里刻意带一句 note 告诉模型「等用户点击、不要重复提议」—— 否则它会以为
      跳转没生效，在同一轮里反复调用。
    */
    if (ctx.surface === 'sphere') {
      return {
        ok: true,
        proposed: { path, label, ...(reason ? { reason } : {}) },
        note: '已向用户展示跳转建议卡片，等待用户点击。不要重复提议同一个目标；先把用户要的数据直接在这里给出来。',
      }
    }

    // 面板容器：**询问模式才问**（自动模式 = 始终允许，"自动"就是不要打断）；
    // 「自动跳转」设置开着时连询问模式也不问。grant 的短路在 chat.ts 里。
    if (ctx.mode === 'ask' && !ctx.autoNavigate) {
      const approved = await ctx.requestApproval({
        kind: 'navigate',
        // 授权键是「跳转」这项能力，不是工具名（见 session-permissions.ts）
        toolName: NAVIGATION_GRANT,
        path,
        label,
        ...(reason ? { reason } : {}),
      })
      if (!approved) {
        throw new Error(
          `用户拒绝了跳转到「${label}」（${path}）。不要重试同一个目标：改为在当前对话里给出数据，或换一个目标、或反问用户想去哪里。`,
        )
      }
    }

    const bridge = getAiShellBridge()
    if (!bridge) throw new Error('当前环境不支持页面跳转（外壳尚未就绪）')

    bridge.navigate(path)
    return { ok: true, path, label }
  },
}
