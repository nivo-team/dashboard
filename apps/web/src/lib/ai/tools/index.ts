import { isToolGranted } from '../tool-permission'
import type { AiPermissionMode, AiSurface, AiToolDefinition } from '../types'
import {
  callReadApiTool,
  callWriteApiTool,
  listDictOptionsTool,
  searchApiTool,
} from './data-tools'
import { getPageContextTool, listNavigationTool, navigateToTool } from './page-tools'
import { getPageDataTool, runPageCommandTool } from './feature-tools'
import {
  fillFormTool,
  listPageFormsTool,
  openFormTool,
  submitFormTool,
} from './form-tools'
import { manageTasksTool } from './task-tools'
import { requestPermissionTool } from './permission-tools'
import { updateSearchParamsTool } from './search-tools'
import { checkResultMatchTool } from './check-result-match-tool'
import { analyzeDataTool } from './analyze-tool'

/**
 * 工具注册表 —— 「AI 能做什么」的**唯一真值**。
 *
 * 加一个工具 = 写一个 `AiToolDefinition`（名字 / 描述 / JSON Schema / access / execute）
 * 然后加到这个数组里，**不要**在运行时或 UI 里再维护一份名单：
 * 权限过滤、给模型的定义、执行时的查找都从这里来。
 */
export const AI_TOOLS: readonly AiToolDefinition[] = [
  getPageContextTool,
  getPageDataTool,
  listNavigationTool,
  searchApiTool,
  callReadApiTool,
  listDictOptionsTool,
  callWriteApiTool,
  navigateToTool,
  updateSearchParamsTool,
  manageTasksTool,
  requestPermissionTool,
  openFormTool,
  listPageFormsTool,
  fillFormTool,
  submitFormTool,
  runPageCommandTool,
  checkResultMatchTool,
  analyzeDataTool,
]

/**
 * 权限档 → **一组工具名**。
 *
 * 三档本质是同一件事：**一份勾选清单**。
 * - `full`：全选；
 * - `readonly`：**预设**勾了那几个只读工具（它不是一条特殊分支，只是一组预设的勾）；
 * - `custom`：用户自己勾的。
 *
 * 把它显式化成"一组名字"有实际好处：界面上能如实显示「只读 = 勾了这 7 项」，
 * 用户从只读切到自定义时也能**从当前这组继续改**，而不是清空重来。
 *
 * 返回的是注册表里确实存在的名字（`custom` 里可能残留已下线的工具名，在这里剔掉）。
 */
export function resolveAllowedToolNames(
  permission: AiPermissionMode,
  customTools: readonly string[] = [],
): string[] {
  const all = AI_TOOLS.map((tool) => tool.name)
  if (permission === 'full') return all
  if (permission === 'readonly') {
    return AI_TOOLS.filter((tool) => tool.access === 'read').map((tool) => tool.name)
  }
  return customTools.filter((name) => all.includes(name))
}

/**
 * 按**权限**挑出可用的工具 —— 「能不能用」只看这里。
 *
 * 它与「模式」正交：模式（`ask` / `auto`）管的是**用起来要不要问**，
 * 由各工具的 `execute` 读 `ctx.mode` 自己决定（见 `fill_form` / `submit_form`）。
 *
 * 早先这里是 `getToolsForMode`：拿模式当权限用，于是 `ask` 只给 `read`、
 * 连表都填不了。那是个把两个维度揉在一起的错误抽象，别再退回去。
 *
 * 一律返回**新数组**：调用方（运行时）可能按自己的需要增删，不该动到注册表。
 */
/**
 * **依赖「当前挂载了业务页面」的工具** —— 全屏对话页里没有页面，它们调用只会拿到一句报错
 * （`get_page_data` / `run_page_command` 读页面特性注册表，`update_search_params` 要表格调度器，
 * `check_result_match` / `analyze_data` 读页面数据源），白费一次往返。
 *
 * 收成一处真值：以后有新的"页面绑定"工具，加到这个数组即可 —— 不要在过滤里再写一串 `||`。
 */
const PAGE_BOUND_TOOLS: readonly string[] = [
  'update_search_params',
  'get_page_data',
  'run_page_command',
  'check_result_match',
  'analyze_data',
]

export function getAllowedTools(
  permission: AiPermissionMode,
  customTools: readonly string[] = [],
  options: {
    hasForms?: boolean
    surface?: AiSurface
    /** 后端下发的权限点；**不传表示不按权限过滤**（保持老调用方可用） */
    permissions?: readonly string[]
  } = {},
): AiToolDefinition[] {
  const allowed = new Set(resolveAllowedToolNames(permission, customTools))
  return AI_TOOLS.filter((tool) => {
    if (!allowed.has(tool.name)) return false

    /*
      权限点过滤 —— **在把工具交给模型之前**的第一道闸。
      `permissions` 不传就跳过（老调用方不受影响）；传了就要求工具声明的权限点都满足。
      它与「模式」正交：这里只回答"能不能用"，"要不要问"仍由各工具读 `ctx.mode`。
    */
    if (options.permissions && !isToolGranted(tool, options.permissions)) return false
    /*
      页面上**一张表单都没有**时，表单组那三个工具（列出 / 填写 / 提交）纯属占位 ——
      而它们的定义（描述 + JSON Schema）是**每一轮都要发**的固定开销。
      权限档已经把范围说清楚了，这里只是再省掉一组明知用不上的定义。

      传 `undefined` 表示"不知道"，那就照旧全给（宁多勿缺）。
    */
    if (options.hasForms === false && tool.group === 'form') return false
    /*
      **容器的过滤点**（`AiSurface`）：全屏对话页里没有挂载的业务页面，
      这三样"只对当前页面成立"的工具不发给模型：
      - `update_search_params` 依赖页面表格注册的调度器（`useTableQuery` → `search-params-bridge`），
        在全屏里调用只会走兜底分支、把参数拼到 `/$appId/sphere` 自己的 URL 上 —— 原地打转、
        既没用又会让模型以为"筛选已生效"；
      - `get_page_data` / `run_page_command` 依赖页面登记的 `feature.ts`（数据源 / 指令），
        全屏里没有任何页面特性可读，调用只会拿到一句报错 —— 白费一次往返。

      容器相关的策略只加在这里（与权限、表单组同一处收口）：将来全屏要放开写操作，
      也在这一个函数里判断，不要在工具内部再散一份。
    */
    if (options.surface === 'sphere' && PAGE_BOUND_TOOLS.includes(tool.name)) {
      return false
    }
    return true
  })
}

/** 按名字找工具（执行前的最后一道校验：模型给的名字可能根本不存在）。 */
export function findTool(name: string): AiToolDefinition | undefined {
  return AI_TOOLS.find((tool) => tool.name === name)
}

// ---------------------------------------------------------------- Tool Catalog（Router 阶段）

/** Catalog 里的一行：名字 + 一句话（`catalogDescription`，不含 schema）。 */
export interface AiToolCatalogEntry {
  name: string
  summary: string
}

/**
 * 把「当前可用的工具」压成 Router 阶段的 Catalog 条目。
 *
 * 入参必须是**已经过权限 / 容器 / 表单过滤**的工具（`getAllowedTools` 的产物）——
 * 否则模型会选中一个它其实拿不到的工具档，然后回头告诉用户"我没权限"（真实踩过）。
 *
 * `catalog: false` 的工具不进清单（仍可被依赖补齐，只是不摆在选择列表里）。
 */
export function listToolCatalog(
  allowedTools: readonly AiToolDefinition[],
): AiToolCatalogEntry[] {
  return allowedTools
    .filter((tool) => tool.catalog !== false)
    .map((tool) => ({ name: tool.name, summary: tool.catalogDescription }))
}

/**
 * Catalog 的**文本形态**（一行一个工具）—— 交给服务端拼进 Router 阶段的 system。
 *
 * 刻意不带 JSON Schema：那是 Execution 阶段才下发的完整定义。
 */
export function buildToolCatalogText(
  allowedTools: readonly AiToolDefinition[],
): string {
  return listToolCatalog(allowedTools)
    .map((entry) => `- ${entry.name}：${entry.summary}`)
    .join('\n')
}

// ---------------------------------------------------------------- Context Resolver（两阶段之间）

/** 一次工具选择的**确定性解析结果** —— Router 输出不可信，这里才是真值。 */
export interface AiToolSelection {
  /** 最终交给 Execution Agent 的工具（已被权限过滤，并补全依赖，顺序按注册表） */
  tools: AiToolDefinition[]
  /** 模型明确选中且真实存在的名字（去重后的原样顺序） */
  selected: string[]
  /** Runtime 依据 `dependencies` 自动补上的名字 */
  addedByDependency: string[]
  /** 被丢掉的名字与原因 —— 进 token / 选择日志，便于发现 Router 选错或模型幻觉 */
  rejected: Array<{
    name: string
    reason: 'unknown' | 'not-allowed' | 'not-executable'
  }>
}

export interface ResolveToolsOptions {
  permission: AiPermissionMode
  customTools: readonly string[]
  hasForms?: boolean
  surface?: AiSurface
  /** 后端权限点；不传表示不按权限点过滤（与 `getAllowedTools` 同义） */
  permissions?: readonly string[]
}

/**
 * **Context Resolver**：把 Router 选出来的工具名解析成 Execution Agent 真正持有的工具集。
 *
 * 这是「不要让 Router 负责业务判断」的落点 —— Router 只回答"需要哪些工具"，
 * 而下面这些**全部由 Runtime 确定性决定**，不信任模型输出：
 * 1. 名字是否真实存在（幻觉直接丢掉）；
 * 2. 是否在**当前权限 / 容器 / 表单 / 后端权限点**下可用（复用 `getAllowedTools`，不另写一套）；
 * 3. `dependencies` 声明的依赖自动补齐（模型不必记住工具之间的依赖）；
 * 4. `execution: false` 的工具即使被选中也不进执行阶段。
 *
 * 返回值里的 `rejected` 只用于观测；执行阶段拿到的 `tools` 已经是安全且自足的一份。
 */
export function resolveTools(
  selectedNames: readonly string[],
  options: ResolveToolsOptions,
): AiToolSelection {
  const allowed = getAllowedTools(options.permission, options.customTools, {
    hasForms: options.hasForms,
    surface: options.surface,
    permissions: options.permissions,
  })
  const executable = allowed.filter((tool) => tool.execution !== false)
  const available = new Set(executable.map((tool) => tool.name))

  const selected: string[] = []
  const rejected: AiToolSelection['rejected'] = []
  /** 已经处理过的名字（选中的 + 依赖补上的），避免重复与环 */
  const handled = new Set<string>()

  for (const raw of selectedNames) {
    const name = typeof raw === 'string' ? raw.trim() : ''
    if (!name || handled.has(name)) continue
    handled.add(name)

    const tool = findTool(name)
    if (!tool) {
      rejected.push({ name, reason: 'unknown' })
      continue
    }
    if (!available.has(name)) {
      rejected.push({
        name,
        reason: tool.execution === false ? 'not-executable' : 'not-allowed',
      })
      continue
    }
    selected.push(name)
  }

  /*
    依赖闭包（BFS）：`analyze_data` → `get_page_data`、`fill_form` → `list_page_forms` …
    依赖同样要过上面那道可用性闸 —— 补齐一个当前容器拿不到的工具没有意义。
  */
  const addedByDependency: string[] = []
  const queue = [...selected]
  while (queue.length > 0) {
    const name = queue.shift() as string
    for (const dependency of findTool(name)?.dependencies ?? []) {
      if (handled.has(dependency)) continue
      handled.add(dependency)

      const depTool = findTool(dependency)
      if (!depTool) {
        rejected.push({ name: dependency, reason: 'unknown' })
        continue
      }
      if (!available.has(dependency)) {
        rejected.push({
          name: dependency,
          reason: depTool.execution === false ? 'not-executable' : 'not-allowed',
        })
        continue
      }
      addedByDependency.push(dependency)
      queue.push(dependency)
    }
  }

  /*
    多任务与批量操作智能补齐：
    当用户或 Router 发起了数据写入或表单意图时，若当前权限允许（available），
    自动补齐 `manage_tasks`（任务清单管理）与 `call_write_api`（直接写接口能力），
    确保执行阶段能够顺利开展多任务管理与批量提交，杜绝工具缺失导致的退缩推脱。
  */
  const hasWriteOrFormIntent = selected.some((name) =>
    ['open_form', 'fill_form', 'submit_form', 'call_write_api', 'run_page_command'].includes(name),
  )
  if (hasWriteOrFormIntent) {
    if (available.has('manage_tasks') && !handled.has('manage_tasks')) {
      handled.add('manage_tasks')
      addedByDependency.push('manage_tasks')
    }
    if (available.has('call_write_api') && !handled.has('call_write_api')) {
      handled.add('call_write_api')
      addedByDependency.push('call_write_api')
    }
  }

  const wanted = new Set([...selected, ...addedByDependency])
  return {
    // 按注册表顺序输出：同一份选择在每轮里逐字节一致（前缀缓存友好）
    tools: executable.filter((tool) => wanted.has(tool.name)),
    selected,
    addedByDependency,
    rejected,
  }
}

export * from './data-tools'
export * from './page-tools'
export * from './select-tools'
