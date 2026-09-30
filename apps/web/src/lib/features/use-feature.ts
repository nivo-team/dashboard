import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAiFormOpener } from '#/lib/ai/form-bridge'
import { useAiPageReload } from '#/lib/ai/page-reload-bridge'
import {
  clearPageCapabilities,
  registerPageCapabilities,
} from '#/lib/ai/page-capabilities'
import {
  clearAiPageContext,
  registerAiPageContext,
} from '#/lib/ai/page-context-registry'
import { toAiPageContextSpec, toPageCapabilitiesSpec } from './convert'
import { clearFeature, registerFeature } from './registry'
import type { FeatureSpec } from './types'

/**
 * 页面声明自己的特性 —— **一页只调一次**，取代原先散落的四处注册：
 *
 * | 原来 | 现在 |
 * | --- | --- |
 * | `usePageCapabilities(spec)` | `useFeature(spec)` 里的 `description/endpoints/forms/searchParams` |
 * | `useAiFormOpener(fn)` | `useFeature({ openForm: fn })` |
 * | `useAiPageReload(fn)` | `useFeature({ reload: fn })` |
 * | （没有对应物） | `useFeature({ commands, dataSources })` —— AI 的可用指令与页面数据 |
 *
 * 注册键**从当前路由取**（`router.state.matches.at(-1).routeId`，与
 * `getPageContext().routePath` 同一个来源）：页面里不写路由字符串，
 * 也就不存在「路由改名后静默失配」这种坑。
 *
 * 每轮渲染都重新登记（effect 不写依赖数组，与 `useAiPageContext` / `useAiFormFields`
 * 同一条约定）：`commands[].run` 与 `dataSources[].read` 都闭包了页面 state，
 * 只登记一次会永远读到第一帧的旧值。卸载时清空三处登记。
 */
export function useFeature(spec: FeatureSpec): void {
  const routeId = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? null,
  })

  useEffect(() => {
    if (!routeId) return

    // ① 新契约：指令 + 数据源（AI 的 get_page_data / run_page_command 读它）
    registerFeature(routeId, spec)
    // ② 页面上下文：get_page_context / open_form 读它
    registerAiPageContext(routeId, toAiPageContextSpec(spec))
    // ③ 页面能力：get_page_context 的 actions / searchParams、表单审批元数据读它
    registerPageCapabilities(routeId, toPageCapabilitiesSpec(spec, routeId))

    return () => {
      clearFeature(routeId)
      clearAiPageContext(routeId)
      clearPageCapabilities(routeId)
    }
  })

  // 表单开启器与写后重载仍走各自的桥（它们有"只注册一次 + ref 取最新"的实现），
  // 页面侧只是把函数交出来，不再单独调那两个 hook
  useAiFormOpener(spec.openForm ?? null)
  useAiPageReload(spec.reload ?? null)
}
