import { useEffect, useRef } from 'react'

/**
 * 页面数据重载桥（Page Reload Bridge）。
 *
 * ## 为什么需要它
 *
 * `call_write_api` 是**通用写通道**，它不知道当前页面的列表数据放在哪里。
 * 表格示例页就是**直接调 SDK 把结果塞进 React state**（`fetchUsers`，不走 react-query），
 * 于是 AI 删掉一条之后，页面上那一行还在 —— 用户读到的就是"没删掉"，而 AI 却在回答里
 * 说删成功了（这是最糟的一种不一致：**数据对了，界面骗人**）。
 *
 * 桥让页面把自己的**重新取数**交给 AI 通道：
 *
 * 1. 列表页挂载时 `useAiPageReload(fetchUsers)` 登记自己的取数闭包；
 * 2. 写工具成功后调用 `reloadAiPageData()`，页面按**自己的语义**刷新 ——
 *    保留当前筛选 / 分页 / 排序（而不是 `location.reload()` 那种整页重来）；
 * 3. 没登记的页面（react-query 页面）不受影响：写工具同时会 `invalidateQueries()` 兜底。
 *
 * ## 约定（与 `search-params-bridge` 完全一致）
 *
 * - **只保留最近一次登记**：同一时刻只有一个"当前页面"，后登记的自然覆盖前者；
 * - **卸载即注销，并比对引用** —— 否则"旧页面卸载"会把"新页面刚登记的"顺手清掉；
 * - 登记用 `useRef` + 空依赖 effect：闭包每轮渲染更新（筛选变了要取新数据），
 *   但**注册只做一次**，不因为依赖变化引发重注册抖动。
 */
type PageReload = () => unknown

let currentReload: PageReload | null = null

export function registerPageReload(reload: PageReload): () => void {
  currentReload = reload
  return () => {
    if (currentReload === reload) currentReload = null
  }
}

/**
 * 让当前页面重新取数。
 *
 * 返回 `false` 表示这一页没有登记（调用方应回退到别的刷新手段）——
 * **不要**在这里自己 `location.reload()`：整页重来会丢掉对话上下文。
 */
export function reloadAiPageData(): boolean {
  if (!currentReload) return false
  try {
    void currentReload()
    return true
  } catch {
    return false
  }
}

/** 由页面调用：登记"重新取数"闭包（传 `null` 表示这一页没有需要重载的数据）。 */
export function useAiPageReload(reload: PageReload | null): void {
  const ref = useRef(reload)
  ref.current = reload

  useEffect(() => {
    if (!ref.current) return
    return registerPageReload(() => ref.current?.())
  }, [])
}
