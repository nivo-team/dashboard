import type { AiPermissionMode } from '#/features/ai/core'
import type { AiCapabilityGrant } from '#/features/ai/core/capabilities'

/**
 * 权限草稿「改没改过」的判定 —— 决定面板里那颗「保存」按钮是否可点。
 *
 * 抽出来的唯一理由：这里的比较有一条容易写错的规则 —— **能力按集合比，不按顺序比**。
 * `custom` 档的勾选顺序跟着点击走，按顺序比会在用户什么都没改的情况下报「有未保存的更改」，
 * 而按集合比才是用户眼里的「一样」。
 */
export interface PermissionDraft {
  permission: AiPermissionMode
  capabilities: readonly AiCapabilityGrant[]
}

export function isPermissionDraftDirty(draft: PermissionDraft, saved: PermissionDraft): boolean {
  return (
    draft.permission !== saved.permission ||
    draft.capabilities.length !== saved.capabilities.length ||
    draft.capabilities.some((grant) => !saved.capabilities.includes(grant))
  )
}
