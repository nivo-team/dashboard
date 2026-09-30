import type { PageCapabilitiesSpec } from '#/lib/ai/page-capabilities'
import type { AiPageContextSpec } from '#/lib/ai/page-context-registry'
import type { FeatureSpec } from './types'

/**
 * 一份声明 → 既有登记的**转换器**。
 *
 * 迁移期刻意保留这层：`get_page_context`、表单工具（要读 `submission.requireApproval`）、
 * 权限过滤都还在读老的 `page-context-registry` / `page-capabilities`，
 * 让它们从**同一份 feature 声明**派生，比"页面里再手写一遍"安全得多。
 *
 * 等这些消费方都改读 `#/lib/features` 之后，这两个函数连同老注册表一起删 —— 到那时
 * 页面侧一行都不用动（这正是把转换放在框架层、而不是页面里的原因）。
 */

/** 页面上下文：`get_page_context` 与 `open_form` 用它认识这一页。 */
export function toAiPageContextSpec(spec: FeatureSpec): AiPageContextSpec {
  return {
    description: spec.description,
    ...(spec.entities?.length ? { entities: [...spec.entities] } : {}),
    ...(spec.endpoints?.length ? { endpoints: [...spec.endpoints] } : {}),
    ...(spec.forms?.length
      ? {
          forms: spec.forms.map((form) => ({
            id: form.id,
            title: form.title,
            action: form.action,
            ...(form.description ? { description: form.description } : {}),
            ...(form.fields?.length ? { fields: [...form.fields] } : {}),
          })),
        }
      : {}),
  }
}

/**
 * 页面能力：`get_page_context` 的 `actions` / `searchParams`、
 * 以及表单工具读的审批元数据（`forms[].submission`）都在这里。
 *
 * 指令 → `actions` 的映射不是"再说一遍"：`actionType` 缺省 `custom`，
 * 语义归类（创建 / 删除 / 批量删除 / 导出）由指令自己声明。
 */
export function toPageCapabilitiesSpec(
  spec: FeatureSpec,
  routeId: string,
): PageCapabilitiesSpec {
  return {
    routeId,
    title: spec.title,
    description: spec.description,
    ...(spec.entities?.length ? { entities: [...spec.entities] } : {}),
    ...(spec.endpoints?.length ? { endpoints: [...spec.endpoints] } : {}),
    ...(spec.forms?.length ? { forms: [...spec.forms] } : {}),
    ...(spec.searchParams ? { searchParams: spec.searchParams } : {}),
    ...(spec.commands?.length
      ? {
          actions: spec.commands.map((command) => ({
            id: command.id,
            title: command.title,
            type: command.actionType ?? 'custom',
            ...(command.description ? { description: command.description } : {}),
            ...(command.permission ? { permission: command.permission } : {}),
          })),
        }
      : {}),
  }
}
