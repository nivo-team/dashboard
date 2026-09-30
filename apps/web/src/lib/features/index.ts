/**
 * 页面特性（Feature）框架出口。
 *
 * **页面侧只 import 这里**：`defineFeature` + `useFeature`。
 * 其余导出（注册表读取、数据源快照）是给 AI 工具层用的，页面不要直接调。
 *
 * 架构与迁移约定见 `.agents/docs/features-architecture.md`：
 * 一个业务一个文件夹、一个页面一份 `feature.ts`、路由文件只做薄适配。
 */
export { defineFeature } from './define'
export { useFeature } from './use-feature'
export {
  clearFeature,
  findFeatureCommand,
  listRegisteredFeatures,
  readFeatureData,
  registerFeature,
  resolveFeature,
  resolveFeatureCommands,
} from './registry'
export type { FeatureDataSnapshot } from './registry'
export type {
  FeatureCommandKind,
  FeatureCommandSpec,
  FeatureDataSourceSpec,
  FeatureSpec,
} from './types'
