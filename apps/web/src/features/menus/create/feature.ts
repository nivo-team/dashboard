import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * **新建**页的特性声明（`/$appId/system/menus/new?pid=&type=`）。
 *
 * 三种类型（功能组 / 功能 / 权限点）共用同一个表单与同一个 `POST /system/menu`。
 * 这一页的"当前上下文"就是 URL 上的 `pid` 与 `type`：把它们交给 AI，
 * 它才知道"这次新建会挂在谁下面"（页面上那句「将创建在：X」说的也是这件事）。
 *
 * ⚠️ **表单桥还没接**：`FeatureForm` 在本页没有注册 `aiFormId`（详情页那份才是注册的），
 * 所以 AI 目前只能"告诉用户怎么填"，不能直接 `fill_form` —— 补齐它是下一步
 * （给 `FeatureForm` 传 `aiFormId`、在本页注册 `useAiFormSubmit`）。
 */

export interface NewFeaturePageOptions {
  /** 新节点的父 id（缺省 = 根节点） */
  pid?: number
  /** `group` = 功能组；`button` = 权限点；缺省 = 功能 */
  type?: 'group' | 'button'
}

export function createNewFeatureSpec(options: NewFeaturePageOptions): FeatureSpec {
  const menuType = options.type === 'group' ? 1 : options.type === 'button' ? 3 : 2

  return defineFeature({
    title: '新建功能 / 功能组 / 权限点',
    description:
      '录入一个新节点的名称、路由、权限标识等；提交后按 `pid` 原路返回（从哪来回哪去）。',
    entities: ['功能组', '功能', '权限点', '路由名称', '权限标识'],
    endpoints: [
      {
        method: 'POST',
        path: '/system/menu',
        purpose: '创建节点（`parent_id` 取 URL 上的 `pid`，缺省为根节点）',
      },
    ],
    forms: [
      {
        id: 'feature-form-create',
        title: '新建功能',
        action: 'create',
        description: '字段随类型收敛（权限点没有「显示」、功能组没有「权限标识」）',
        submission: {
          endpoint: { method: 'POST', path: '/system/menu' },
          submitLabel: '创建',
          // 不写 requireApproval：提交在 auto 下免问（判定见 features/ai/core/approval-policy.ts）
          approvalReason: '将在功能树里创建一个新节点',
        },
      },
    ],
    dataSources: [
      {
        id: 'create-context',
        title: '这次新建的上下文',
        description: 'URL 上带过来的父级与类型 —— 决定新节点挂在哪、以及是哪一类节点',
        shape: 'parentId / kind（group|feature|button）/ menuType（1|2|3）',
        read: () => ({
          parentId: options.pid ?? null,
          kind:
            options.type === 'group' ? 'group' : options.type === 'button' ? 'button' : 'feature',
          menuType,
        }),
      },
    ],
  })
}
