import { IdentificationCardIcon, type Icon } from '@phosphor-icons/react'
import i18n from '#/lib/i18n'
import { ALL_NAV_TARGETS } from '#/lib/navigation'
import { getPageContext, resolveNavLabel } from './page-context'

/**
 * `@` 引用 —— 用一条**极短的语法**说清「这一轮在讲哪一块」：
 *
 * ```
 * @table-example        模块（示例 · 目录页）
 * @table-example:list   模块里的某个页面（表格示例）
 * @table-example:1234   模块里的某条记录（表格示例详情 #1234）
 * ```
 *
 * 它是**给模型看的**：输入框里打的字会原样进会话（用户看到的还是自己打的那串），
 * 真正发给模型时由 `expandRouteRefs()` 展开成「模块 / 页面 / 路径」。这样两边都不吃亏 ——
 * 用户不用记住路径，模型也不靠猜。展开发生在 `runtime.toModelMessages()`，
 * 是**唯一**一处（见 `.agents/docs/ai-architecture.md` 的「@ 引用」）。
 *
 * 三条设计约定：
 *
 * 1. **只登记键，不复制名字 / 图标 / 路径**。模块与页面的显示名、路径全部来自
 *    `#/lib/navigation`（导航清单的唯一真值）—— 这里只回答「哪个英文键对应哪个 `to`」。
 *    导航改名或换路径，这里自动跟着变；`to` 在导航里没了（模块下线），这一项整块跳过，
 *    不会留下一个点进去 404 的菜单项。
 * 2. **详情路由必须单独登记**（`record`）：导航清单里只有列表页，详情页是「列表页 + `/id`」，
 *    不在导航里 —— 所以这是本文件**唯一**允许出现路径字面量的地方。
 *    加一个能按记录引用的模块 = 在 `AI_ROUTE_REF_SPECS` 里加一项。
 * 3. **匹配靠导航的 `keywords`**：所以 `@table-example` / `@example` / `@示例` / `@表格示例` 都指向同一个模块 ——
 *    英文键只是「插入到文本里的标准写法」，不是唯一能打的东西。
 *
 * 认不出来的 `@foo` **原样留着**（可能是邮箱后缀、也可能是别的工具的约定），
 * 不猜、不报错、也不往提示词里塞噪音。
 */

/**
 * `@` 面板里一行的归类 —— 只决定**分组标题**与展示顺序，别的什么都不影响。
 *
 * `add` 不是本文件产出的（那是输入区自己那行「添加照片和文件」），但归在同一套类型里，
 * 面板就能按同一个顺序把「添加 → 模块 → 页面 → 记录」四段画出来，不必在渲染处另拼名单。
 */
export type AiRouteRefKind = 'add' | 'module' | 'page' | 'record'

export interface AiRouteRefItem {
  /** 键：模块 `table-example`、页面 `table-example:list`、记录模板 `table-example:`（等用户补 ID） */
  id: string
  kind: AiRouteRefKind
  /** 插进输入框的那段（**不含** `@`） */
  token: string
  /** 展示用的完整语法，灰色小字：`@table-example` / `@table-example:list` / `@table-example:<id>` */
  syntax: string
  /** 菜单主行 —— **名字**（`表格示例`），不是语法；语法在右边的 `syntax` 里 */
  name: string
  /** 菜单右侧的一句说明：这一行指向哪儿 */
  description: string
  /** 菜单图标：直接用导航项自己的图标，模块在界面里长什么样，菜单里就长什么样 */
  icon: Icon
  /** 匹配词：模块名、页面名、导航关键词（中英文都能搜到） */
  keywords: readonly string[]
  /** 记录模板行：点了只插入到冒号，等用户补 ID */
  record?: boolean
}

/** 模块里的一个可引用页面：`key` 是 `@模块:key` 里那段，`to` 是导航里的相对路径 */
interface AiRouteRefPageSpec {
  key: string
  to: string
}

/** 记录型目标：`@模块:值` → 详情页 */
interface AiRouteRefRecordSpec {
  /** 参数名，与路由参数同名（`$id` → `id`），只用于展示 */
  param: string
  /** 相对 appId 的详情路径模板 */
  template: string
  /** 详情页在 `common` 命名空间下的文案键（导航里没有详情页，所以名字只能写在这） */
  nameKey: string
  /** i18n 兜底文案 */
  name: string
}

interface AiRouteRefModuleSpec {
  key: string
  /** 模块目录页在导航里的相对路径 */
  to: string
  pages: readonly AiRouteRefPageSpec[]
  record?: AiRouteRefRecordSpec
}

/**
 * `@` 引用的**模块规范表** —— 这张表就是「哪些模块可以被 @」的唯一真值。
 *
 * 目前只有 `table-example`（示例）作为样板：它是「目录 + 列表 + 详情」三段式最典型的模块，
 * 后续模块（功能 / 数据字典 / …）照它的形状抄一行即可。
 */
const AI_ROUTE_REF_SPECS: readonly AiRouteRefModuleSpec[] = [
  {
    key: 'table-example',
    to: '/example',
    pages: [{ key: 'list', to: '/example/user' }],
    record: {
      param: 'id',
      template: '/example/user/{id}',
      nameKey: 'nav.tableExampleDetail',
      name: '表格示例详情',
    },
  },
]

/** 按相对路径找导航项 —— 名字 / 关键词 / 是否存在都以导航清单为准 */
function findNavTarget(to: string) {
  return ALL_NAV_TARGETS.find((target) => target.to === to)
}

/** 该模块在导航里的显示名 */
function moduleNameOf(spec: AiRouteRefModuleSpec): string {
  const target = findNavTarget(spec.to)
  if (!target) return spec.key
  return resolveNavLabel(target.labelKey, target.label)
}

/** 按相对路径取页面显示名 */
function pageNameOf(to: string, fallback: string): string {
  const target = findNavTarget(to)
  if (!target) return fallback
  return resolveNavLabel(target.labelKey, target.label)
}

/** 面板右侧那句说明的兜底（7 语言在 `ai` 命名空间里，键名见 `messages/ai/*.json`） */
function aiText(key: string, fallback: string): string {
  return i18n.t(key, { ns: 'ai', defaultValue: fallback })
}

/**
 * `@` 菜单的行 —— 模块、页面、记录模板各一行（记录模板排最后）。
 *
 * **不在渲染处再拼一份名单**：菜单、匹配、展开都读这一份规范表（铁律：名单只有一个真值）。
 *
 * 每行给三样：**名字**（取自导航清单）、**语法**（`@table-example:list`，用户要打的那串）、
 * **说明**（它指向哪儿）。命令面板那种「名字 + 灰键 + 右侧说明」的写法要求名字与语法分开，
 * 所以这里不再把 `@table-example:list` 当主行 —— 主行是「表格示例」，看名字找东西比看语法快。
 */
export function listRouteRefItems(): AiRouteRefItem[] {
  const items: AiRouteRefItem[] = []

  for (const spec of AI_ROUTE_REF_SPECS) {
    const moduleTarget = findNavTarget(spec.to)
    // 导航里已经没有这个模块了（下线 / 改名）：整块跳过，不留指向 404 的项
    if (!moduleTarget) continue

    const moduleName = moduleNameOf(spec)
    items.push({
      id: spec.key,
      kind: 'module',
      token: spec.key,
      syntax: `@${spec.key}`,
      name: moduleName,
      description: aiText('routeRefModuleDesc', '模块目录页'),
      icon: moduleTarget.icon,
      keywords: [...moduleTarget.keywords, spec.key, moduleName],
    })

    for (const page of spec.pages) {
      const pageName = pageNameOf(page.to, page.key)
      const pageTarget = findNavTarget(page.to)
      items.push({
        id: `${spec.key}:${page.key}`,
        kind: 'page',
        token: `${spec.key}:${page.key}`,
        syntax: `@${spec.key}:${page.key}`,
        name: pageName,
        // 页面行右边写**所属模块**：一眼看出「这个页面在哪一块下面」
        description: moduleName,
        icon: pageTarget?.icon ?? moduleTarget.icon,
        keywords: [
          ...(pageTarget?.keywords ?? moduleTarget.keywords),
          spec.key,
          page.key,
          pageName,
        ],
      })
    }

    if (spec.record) {
      items.push({
        id: `${spec.key}:record`,
        kind: 'record',
        // 只插到冒号为止：剩下的 ID 由用户补（`recordTypingRef` 会压住面板）
        token: `${spec.key}:`,
        syntax: `@${spec.key}:<${spec.record.param}>`,
        name: resolveNavLabel(spec.record.nameKey, spec.record.name),
        description: aiText('routeRefRecordDesc', '输入 ID 引用某一条'),
        icon: IdentificationCardIcon,
        keywords: [...moduleTarget.keywords, spec.key, spec.record.param, 'id', 'ID'],
        record: true,
      })
    }
  }

  return items
}

/**
 * `(行首或空白)@键[:目标]`。
 *
 * 前面必须紧跟行首或空白：`zhang@example.com` 里的 `@example` 因此不会被当成引用。
 * 目标段不收空白与冒号（`table-example:list` / `table-example:1234` 都吃，`table-example:` 也吃 —— 表示还没补完）。
 */
const ROUTE_REF_PATTERN = /(^|\s)@([a-z][a-z0-9-]*)(?::([^\s:]*))?/gi

/** 把一条引用解析成人话 + 路径；认不出来（模块没登记 / 目标不存在）就返回 null */
function resolveRouteRef(
  moduleKey: string,
  target: string,
  appId: string,
): string | null {
  const spec = AI_ROUTE_REF_SPECS.find((item) => item.key === moduleKey)
  if (!spec) return null

  const moduleName = moduleNameOf(spec)

  if (!target) return `${moduleName}（目录）：\`/${appId}${spec.to}\``

  const page = spec.pages.find((item) => item.key === target)
  if (page) {
    const pageName = pageNameOf(page.to, page.key)
    return `${moduleName} / ${pageName}：\`/${appId}${page.to}\``
  }

  if (spec.record) {
    const path = `/${appId}${spec.record.template.replace(
      `{${spec.record.param}}`,
      encodeURIComponent(target),
    )}`
    const recordName = resolveNavLabel(spec.record.nameKey, spec.record.name)
    return `${moduleName} / ${recordName}（${spec.record.param}=${target}）：\`${path}\``
  }

  return null
}

/**
 * 把用户消息里的 `@` 引用展开成一段**模型能直接用**的说明，追加在原文之后。
 *
 * 刻意加在**原文后面**而不是替换掉 `@table-example:1234`：原文保持原样，模型既看得到用户的写法，
 * 也看得到解析结果 —— 万一解析错了（比如模块换过名字），它还有原文可对照。
 *
 * 没有 appId（不在某个应用里）、没有 `@`、或者一条都没认出来时**原样返回**：不产生任何多余内容。
 */
export function expandRouteRefs(text: string): string {
  const { appId } = getPageContext()
  if (!appId || !text.includes('@')) return text

  const lines: string[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(ROUTE_REF_PATTERN)) {
    const moduleKey = match[2].toLowerCase()
    const target = match[3] ?? ''
    const resolved = resolveRouteRef(moduleKey, target, appId)
    if (!resolved) continue

    const mention = target ? `@${moduleKey}:${target}` : `@${moduleKey}`
    // 同一句里重复提同一个位置只展开一次
    if (seen.has(mention)) continue
    seen.add(mention)
    lines.push(`- \`${mention}\` → ${resolved}`)
  }

  if (lines.length === 0) return text

  return [
    text,
    '',
    '# 用户 @ 引用的位置',
    '（用户手动指定了具体页面位置。对于针对该位置的查询或查看需求，必须优先通过 navigate_to 前往该路径，并配合 update_search_params 在界面上直接呈现检索结果，切勿直接调用只读接口。）',
    ...lines,
  ].join('\n')
}
