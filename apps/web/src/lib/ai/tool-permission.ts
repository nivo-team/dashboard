import { hasPermission } from '#/lib/permissions'
import type { AiToolDefinition } from './types'

/**
 * 一个工具是否通过了**后端权限点**这一关 —— 「给模型之前」的过滤谓词。
 *
 * 抽成独立纯函数有两个理由：
 *
 * 1. **职责不同**：它是**权限判定**，与 `getAllowedTools` 里另外三条规则
 *    （权限档 / 无表单剔除 / 容器剔除）不是一类事 —— 那三条讲"这个工具在此情此景有没有意义"，
 *    这条讲"这个人有没有资格"；
 * 2. **可离线验证**：`tools/index.ts` 那条依赖链会拖进 i18n 与 vite 的 `import.meta.glob`，
 *    在 node 里跑不起来；而这里只依赖 `hasPermission`（纯函数）。
 *
 * ## 两层权限的关系
 *
 * | | 来源 | 作用 |
 * |---|---|---|
 * | **后端权限点**（本函数的 `permissions`） | 后端 RBAC | 上限 —— 用户**真实拥有**的能力 |
 * | 用户偏好（`aiPermission` / `aiCapabilities`） | 本机偏好 | 在权限范围内**再收紧** |
 *
 * 两者取交集；真正的硬边界仍是**执行时**用用户身份调后端（见 `.agents/docs/ai-server-layer.md`）。
 */
export function isToolGranted(
  tool: AiToolDefinition,
  permissions: readonly string[],
): boolean {
  // 必须**全部**具备（AND）
  if (tool.requiredPermissions?.some((p) => !hasPermission(permissions, p))) {
    return false
  }
  // 至少具备**其一**（OR，支持 `*:action` 通配）
  if (
    tool.requiredPermissionsAny &&
    !tool.requiredPermissionsAny.some((p) => hasPermission(permissions, p))
  ) {
    return false
  }
  return true
}
