import { Button } from '@cloudflare/kumo'
import type { ComponentProps, ReactNode } from 'react'
import { usePermission } from '#/lib/permissions'
import type { PermissionRequirement } from '#/lib/permissions'

/**
 * 按钮级权限控制的统一组件。
 *
 * ## 为什么需要它
 *
 * 页面里到处写 `{canEdit ? <Button…/> : null}` 会让「无权限时整列不渲染」这种约定
 * 散落到每个调用点，判定口径（`useHasPermission` / `superAdmin` 短路 / 通配）
 * 也容易被各写一份。这里把它收敛成两个组件：
 *
 * - `<Can>` —— 声明式开关，权限不足时渲染 `fallback`（默认什么都不渲染）；
 * - `<PermissionButton>` —— 包一层 Kumo `Button`，权限不足时**直接不渲染**（默认）
 *   或渲染成 `disabled`。
 *
 * ## 它不管什么
 *
 * **前端隐藏只是显示层的收敛，不是安全边界**：接口权限一律假设后端有硬校验。
 * 详见 `.agents/skills/business-development/references/permissions-architecture.md`。
 *
 * ## 用法
 *
 * ```tsx
 * <Can permission="role:create">
 *   <Button>新建角色</Button>
 * </Can>
 *
 * <Can permission={{ any: ['app:create', 'app:edit'] }} fallback={<span>只读</span>}>
 *   …
 * </Can>
 *
 * <PermissionButton permission="app:delete" variant="danger" onClick={…}>
 *   删除
 * </PermissionButton>
 * ```
 */

/** 权限不足时的处理方式：`hide`（默认，不渲染）/ `disable`（渲染但禁用）。 */
export type DeniedBehavior = 'hide' | 'disable'

export interface CanProps {
  /** 权限要求：字符串、通配、数组或 `{ any, all, role, custom }` 对象。 */
  permission?: PermissionRequirement
  /** 权限不足时渲染的内容（默认不渲染任何东西）。 */
  fallback?: ReactNode
  /** 权限充足时渲染的内容。 */
  children: ReactNode
}

/**
 * 声明式权限门。`permission` 缺省或为空时**始终渲染**（视为公开内容）。
 */
export function Can({ permission, fallback = null, children }: CanProps) {
  const { hasPermission } = usePermission()
  return <>{hasPermission(permission) ? children : fallback}</>
}

type KumoButtonProps = ComponentProps<typeof Button>

export interface PermissionButtonProps extends KumoButtonProps {
  /** 权限要求；缺省时等价于普通 Button（始终渲染）。 */
  permission?: PermissionRequirement
  /** 权限不足时：`hide` 不渲染（默认），`disable` 渲染但禁用。 */
  denied?: DeniedBehavior
  /** 权限不足且 `denied="disable"` 时展示的提示（可选，作为 `title`）。 */
  deniedHint?: string
}

/**
 * 按钮级权限控制：把 `permission` 判定与「隐藏 / 禁用」收敛到一处。
 *
 * 注意 `disabled` 会被**叠加**而不是覆盖 —— 调用方自己的 `disabled` 仍然生效。
 */
export function PermissionButton({
  permission,
  denied = 'hide',
  deniedHint,
  disabled,
  children,
  ...buttonProps
}: PermissionButtonProps) {
  const { hasPermission } = usePermission()
  const allowed = hasPermission(permission)

  if (!allowed && denied === 'hide') return null

  return (
    <Button
      {...buttonProps}
      disabled={disabled || !allowed}
      title={!allowed ? deniedHint : undefined}
    >
      {children}
    </Button>
  )
}
