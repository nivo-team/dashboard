import { hasPageCapabilityPermission } from '#/features/ai/core/page-capabilities'
import type { FeatureCommandSpec, FeatureDataSourceSpec, FeatureSpec } from './types'

/**
 * 页面特性注册表（模块级 Map，不进 React state）。
 *
 * 与 `form-bridge` / `page-context-registry` 同一条约定：它描述的是
 * **「此刻页面上有什么」**，不是渲染数据 —— 进 state 只会换来一堆无意义的渲染。
 *
 * 键是**路由模板**（`Route.id` / `router.state.matches.at(-1).routeId`），与
 * `AiPageContext.routePath` 同源：AI 侧永远用"我现在的 routePath"来查，
 * 页面侧永远由 `useFeature` 自动登记，两边都不会手写字符串。
 *
 * 为什么允许同时存在多项：分屏预览 / 抽屉会把**另一个页面的组件**也挂到当前路由上
 * （表格示例里打开表格示例详情）。各自登记各自的路由键，查询按当前路由命中 —— 于是
 * 「AI 读到的永远是用户真正在看的那个页面」。
 */
const registry = new Map<string, FeatureSpec>()

export function registerFeature(routeId: string, spec: FeatureSpec): void {
  registry.set(routeId, spec)
}

export function clearFeature(routeId: string): void {
  registry.delete(routeId)
}

/** 按路由模板取页面特性（AI 侧用 `getPageContext().routePath`）。 */
export function resolveFeature(routeId: string | null): FeatureSpec | undefined {
  if (!routeId) return undefined
  return registry.get(routeId)
}

/** 当前已登记的页面（调试用）。 */
export function listRegisteredFeatures(): Array<[string, FeatureSpec]> {
  return [...registry.entries()]
}

/**
 * 当前页**可用**的指令：已按权限过滤。
 *
 * 过滤只在这里做一次（与 `filterPageCapabilities` 共用 `hasPageCapabilityPermission`）——
 * 模型看不到它没有权限的指令，就不会去猜"为什么不行"。
 */
export function resolveFeatureCommands(routeId: string | null): FeatureCommandSpec[] {
  const spec = resolveFeature(routeId)
  if (!spec?.commands?.length) return []
  return spec.commands.filter((command) => hasPageCapabilityPermission(command.permission))
}

export function findFeatureCommand(
  routeId: string | null,
  commandId: string,
): FeatureCommandSpec | undefined {
  return resolveFeatureCommands(routeId).find((command) => command.id === commandId)
}

/** 一次数据源读取的结果（给 `get_page_data` 用）。 */
export interface FeatureDataSnapshot {
  id: string
  title: string
  description?: string
  shape?: string
  /** 页面此刻的状态（筛选 / 分页 / 选中…），让模型知道这屏数据"是哪些" */
  state?: Record<string, unknown>
  value: unknown
}

/**
 * 读当前页所有数据源。
 *
 * **只读**：`read()` 里不许发请求或改状态（约定写在 `FeatureDataSourceSpec` 上）。
 * 单个数据源抛错不拖垮整次读取：把错误就地记下来，其余数据照常给模型 ——
 * 否则一个页面的小毛病会让 AI 完全看不到数据。
 */
export function readFeatureData(routeId: string | null): FeatureDataSnapshot[] {
  const spec = resolveFeature(routeId)
  if (!spec?.dataSources?.length) return []

  return spec.dataSources.map((source: FeatureDataSourceSpec) => {
    const snapshot: FeatureDataSnapshot = {
      id: source.id,
      title: source.title,
      ...(source.description ? { description: source.description } : {}),
      ...(source.shape ? { shape: source.shape } : {}),
      value: null,
    }

    try {
      if (source.state) snapshot.state = source.state()
    } catch (error) {
      snapshot.state = { error: describeError(error) }
    }

    try {
      snapshot.value = source.read()
    } catch (error) {
      snapshot.value = { error: describeError(error) }
    }

    return snapshot
  })
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
