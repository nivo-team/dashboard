import { useEffect } from 'react'

/**
 * **页面级 AI 上下文**：让每个页面告诉 AI「我是干什么的、我用了哪些接口」。
 *
 * ## 为什么要有它
 *
 * 全局接口清单有 600+ 条、**且不含参数**。模型去里面按关键词搜「用户」，再自己猜
 * 参数名与位置 —— 猜错的概率极高。真实踩过两次：
 *
 * - 用 `query: { uid: 10001 }` 调 `GET /user/info`（该接口要 `id`，且是 query 参数）；
 * - 在路径参数上写 query（`/api/sys/user/{uid}` 的 `uid` 在 URL 里）。
 *
 * 所以知识该由**页面**提供：这个页面在做什么、它实际用了哪几个接口。参数明细不必
 * 页面作者手写 —— `endpoint-specs` 会从 openapi 自动补上（手写迟早会写错）。
 *
 * ## 怎么用
 *
 * 在页面组件里调用一次，键用**本页的路由模板**（与 `AiPageContext.routePath` 对齐）：
 *
 * ```tsx
 * useAiPageContext({
 *   description: '表格示例：分页浏览、按账号与状态筛选',
 *   endpoints: [
 *     { method: 'GET', path: '/example/table', purpose: '分页查询用户' },
 *     { method: 'GET', path: '/user/info', purpose: '按 ID 查单个用户' },
 *   ],
 * })
 * ```
 */

export interface AiPageEndpointRef {
  method: string
  /** **写 openapi 里的原始路径**（带不带 `/api` 都能查到，前缀在查询侧归一化） */
  path: string
  /** 这个接口在本页面里用来做什么 —— 比接口自己的 summary 更贴近当前场景 */
  purpose?: string
}

export interface AiPageFormFieldSpec {
  name: string
  label: string
  /** 渲染成哪种控件：本模板内置 `text | number | switch | select | tags`，页面可自行扩展 */
  type?: string
  description?: string
  required?: boolean
  options?: Array<{ value: string; label: string }>
}

export interface AiPageFormSpec {
  /** 表单标识 */
  id: string
  /** 表单名称，如「新建用户」 */
  title: string
  /** 触发此表单的操作类型 */
  action: 'create' | 'edit'
  /** 说明用途 */
  description?: string
  /** 支持填写的字段定义（让 AI 在表单打开前即可得知字段名称与结构） */
  fields?: AiPageFormFieldSpec[]
}

export interface AiPageContextSpec {
  /** 这个页面是干什么的（一句话，给模型看） */
  description: string
  /** 本页用到的接口 */
  endpoints?: AiPageEndpointRef[]
  /** 页面上的关键实体 / 术语，帮模型把用户的话对上这个页面的概念 */
  entities?: string[]
  /** 当前页面可操作的表单定义清单 */
  forms?: AiPageFormSpec[]
}

/**
 * 注册表放在模块级 Map（不进 React state）—— 与表单桥同一个理由：
 * 它描述的是「此刻页面上有什么」，不是渲染数据，进 state 只会多出无意义的渲染。
 */
const registry = new Map<string, AiPageContextSpec>()

export function registerAiPageContext(id: string, spec: AiPageContextSpec): void {
  registry.set(id, spec)
}

export function clearAiPageContext(id: string): void {
  registry.delete(id)
}

/** 按路由模板取页面上下文（`routePath` 来自 `AiPageContext`）。 */
export function resolveAiPageContext(routePath: string | null): AiPageContextSpec | undefined {
  if (!routePath) return undefined
  return registry.get(routePath)
}

/** 当前已注册的所有页面（调试与工具兜底用）。 */
export function listAiPageContexts(): Array<[string, AiPageContextSpec]> {
  return [...registry.entries()]
}

/**
 * 页面声明自己的 AI 上下文。
 *
 * 同步 effect **故意不写依赖数组**：`spec` 通常是字面量、每次渲染都是新对象引用，
 * 写依赖等于每帧重注册（无害但没意义）；而不写依赖也避免了闭包捕获旧值的坑 ——
 * 与 `#/features/ai/core/form-bridge` 的 `useAiFormFields` 是同一条约定。
 */
export function useAiPageContext(id: string | null, spec: AiPageContextSpec): void {
  useEffect(() => {
    if (!id) return
    registerAiPageContext(id, spec)
    return () => clearAiPageContext(id)
  })
}
