import type { FeatureSpec } from './types'

/**
 * 声明一个页面的特性 —— 就是 `useFeature` 的入参类型入口。
 *
 * 它**不做任何变换**，只做两件"当场就该炸"的一致性校验（在模块加载时执行，
 * 写错了立刻可见，不必等到 AI 调用的那一刻）：
 *
 * 1. **指令 id 不能重复**：`findFeatureCommand` 只取首个匹配，重复的那个永远调不到 ——
 *    静默失效比报错难查得多；
 * 2. **数据源 id 不能重复**：`get_page_data` 按 id 返回，重复会让模型拿到两段同名数据。
 *
 * 放在 `defineFeature` 而不是 `useFeature` 里：声明是模块级常量，页面还没挂载就该报错。
 */
export function defineFeature(spec: FeatureSpec): FeatureSpec {
  const commandIds = new Set<string>()
  for (const command of spec.commands ?? []) {
    if (commandIds.has(command.id)) {
      throw new Error(`[feature] 「${spec.title}」的指令 id 重复：${command.id}`)
    }
    commandIds.add(command.id)
  }

  const dataSourceIds = new Set<string>()
  for (const source of spec.dataSources ?? []) {
    if (dataSourceIds.has(source.id)) {
      throw new Error(`[feature] 「${spec.title}」的数据源 id 重复：${source.id}`)
    }
    dataSourceIds.add(source.id)
  }

  return spec
}
