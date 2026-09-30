import { createFileRoute } from '@tanstack/react-router'
import { UserListPage } from '#/features/users/user/list'

/**
 * 用户列表路由（`/$appId/users/user`）—— **薄适配层**。
 *
 * 页面本体、列编排、AI 特性声明（可用指令 / 数据源 / 权限）全在
 * `src/features/users/user/list/`：这一层只负责"路径 → 组件"。
 *
 * 约定见 `.agents/docs/features-architecture.md`：路由文件不写业务，
 * 业务模块一律放 `src/features/**`（一个业务一个文件夹，扁平）。
 */
export const Route = createFileRoute('/$appId/users/user/')({
  component: UserListPage,
})
