import type { AiPermissionMode, AiToolDefinition } from '../types'
import {
  callReadApiTool,
  callWriteApiTool,
  listDictOptionsTool,
  searchApiTool,
} from './data-tools'
import { getPageContextTool, listNavigationTool, navigateToTool } from './page-tools'
import { fillFormTool, listPageFormsTool, submitFormTool } from './form-tools'

/**
 * 工具注册表 —— 「AI 能做什么」的**唯一真值**。
 *
 * 加一个工具 = 写一个 `AiToolDefinition`（名字 / 描述 / JSON Schema / access / execute）
 * 然后加到这个数组里，**不要**在运行时或 UI 里再维护一份名单：
 * 权限过滤、给模型的定义、执行时的查找都从这里来。
 */
export const AI_TOOLS: readonly AiToolDefinition[] = [
  getPageContextTool,
  listNavigationTool,
  searchApiTool,
  callReadApiTool,
  listDictOptionsTool,
  callWriteApiTool,
  navigateToTool,
  listPageFormsTool,
  fillFormTool,
  submitFormTool,
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
export function getAllowedTools(
  permission: AiPermissionMode,
  customTools: readonly string[] = [],
  options: { hasForms?: boolean } = {},
): AiToolDefinition[] {
  const allowed = new Set(resolveAllowedToolNames(permission, customTools))
  return AI_TOOLS.filter((tool) => {
    if (!allowed.has(tool.name)) return false
    /*
      页面上**一张表单都没有**时，表单组那三个工具（列出 / 填写 / 提交）纯属占位 ——
      而它们的定义（描述 + JSON Schema）是**每一轮都要发**的固定开销。
      权限档已经把范围说清楚了，这里只是再省掉一组明知用不上的定义。

      传 `undefined` 表示"不知道"，那就照旧全给（宁多勿缺）。
    */
    if (options.hasForms === false && tool.group === 'form') return false
    return true
  })
}

/** 按名字找工具（执行前的最后一道校验：模型给的名字可能根本不存在）。 */
export function findTool(name: string): AiToolDefinition | undefined {
  return AI_TOOLS.find((tool) => tool.name === name)
}

export * from './data-tools'
export * from './page-tools'
