import { findAiForm, listAiForms } from '../form-bridge'
import type { AiToolDefinition } from '../types'

/**
 * 「表单」类工具：列字段 → 填值 → （审批后）提交。
 *
 * 三者的权限等级不同，正好对应三种语义：
 * - `list_page_forms` / `fill_form` 是 `read` / `act`：看一眼、改改表单内容，不碰服务端；
 * - `submit_form` 是 `commit`：**执行前必须过审批**，用户点了才会真正发请求。
 *
 * 填表的边界收在「表单自己声明的字段」里：模型编出来的字段名一律拒绝（`ignored`），
 * 否则它可以把任意键写进业务 state。
 */

export const listPageFormsTool: AiToolDefinition = {
  name: 'list_page_forms',
  description:
    '列出用户当前页面上正在编辑的表单、字段定义与当前值。要帮用户填表之前先调用它 —— 否则你不知道有哪些字段、只能瞎猜字段名。',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  access: 'read',
  group: 'form',
  execute: async () => {
    const forms = listAiForms()
    return {
      total: forms.length,
      note:
        forms.length === 0
          ? '当前页面上没有可被 AI 操作的表单（用户可能不在编辑页，或该表单尚未接入表单桥）。'
          : undefined,
      forms: forms.map((form) => ({
        id: form.id,
        title: form.title ?? form.id,
        fillable: typeof form.setValues === 'function',
        submittable: typeof form.submit === 'function',
        fields: form.fields ?? [],
        values: form.getValues?.() ?? {},
      })),
    }
  },
}

export const fillFormTool: AiToolDefinition = {
  name: 'fill_form',
  description:
    '把若干字段值写进当前页面的表单（**只改表单内容，不会提交、不会发请求**）。询问模式下这一步会先请用户确认，自动模式下直接写入。写完请告诉用户检查一遍；需要落库时再用 submit_form。',
  inputSchema: {
    type: 'object',
    properties: {
      formId: { type: 'string', description: '表单 id，来自 list_page_forms' },
      values: {
        type: 'object',
        description: '要写入的字段，键必须是该表单的字段名（见 list_page_forms 的 fields）',
        additionalProperties: true,
      },
    },
    required: ['formId', 'values'],
    additionalProperties: false,
  },
  access: 'act',
  group: 'form',
  execute: async (input, ctx) => {
    const formId = typeof input.formId === 'string' ? input.formId.trim() : ''
    if (!formId) throw new Error('缺少表单 id')

    const values = input.values
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new Error('缺少要写入的字段（values 必须是对象）')
    }

    const form = findAiForm(formId)
    if (!form) {
      throw new Error(`当前页面上没有这个表单：${formId}。请先用 list_page_forms 确认。`)
    }
    if (!form.setValues) {
      throw new Error(`这个表单不支持被 AI 填写：${formId}`)
    }

    // 只放行表单声明过的字段：多出来的键进不了业务 state
    const allowed = new Set((form.fields ?? []).map((field) => field.name))
    const applied: Record<string, unknown> = {}
    const ignored: string[] = []
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      if (allowed.has(key)) applied[key] = value
      else ignored.push(key)
    }

    if (Object.keys(applied).length === 0) {
      throw new Error(
        `没有可写入的字段。这个表单的字段是：${[...allowed].join(', ') || '（无）'}`,
      )
    }

    /*
      `ask` 下先问一句：填表虽然只改页面状态、不发请求，但用户正盯着表单，
      AI 突然往里灌一串值会让人措手不及。`auto` 下直接填 —— 那正是这个模式的意义。
    */
    if (ctx.mode === 'ask') {
      const approved = await ctx.requestApproval({
        toolName: 'fill_form',
        input: { formId, title: form.title ?? formId, values: applied },
        reason: '这会把这些值写进表单（不会提交，也不会发请求）',
      })
      if (!approved) {
        throw new Error(
          '用户拒绝了这次填写，表单没有被改动。不要重试，改为向用户说明并询问下一步。',
        )
      }
    }

    form.setValues(applied)

    return {
      ok: true,
      applied,
      ignored,
      note: ignored.length
        ? `这些字段不在表单里，已忽略：${ignored.join(', ')}`
        : '已写入表单，尚未提交。',
    }
  },
}

export const submitFormTool: AiToolDefinition = {
  name: 'submit_form',
  description:
    '提交当前页面的表单，把改动写入服务端。**询问模式下系统会先请用户确认**（自动模式下表单校验通过就直接提交）；用户拒绝时不要重试同一个提交，改为向用户说明并询问下一步。',
  inputSchema: {
    type: 'object',
    properties: {
      formId: { type: 'string', description: '表单 id，来自 list_page_forms' },
    },
    required: ['formId'],
    additionalProperties: false,
  },
  access: 'commit',
  group: 'form',
  execute: async (input, ctx) => {
    const formId = typeof input.formId === 'string' ? input.formId.trim() : ''
    if (!formId) throw new Error('缺少表单 id')

    const form = findAiForm(formId)
    if (!form) {
      throw new Error(`当前页面上没有这个表单：${formId}。请先用 list_page_forms 确认。`)
    }
    if (!form.submit) {
      throw new Error(`这个表单不支持由 AI 提交：${formId}`)
    }
    /*
      先问「能不能提交」再问「要不要提交」：表单没变脏 / 校验不过时，
      让模型知道**为什么**不行（而不是先弹一个审批卡、用户点了才发现没改动）。
    */
    if (form.canSubmit && !form.canSubmit()) {
      throw new Error(
        '表单当前不满足提交条件（可能没有任何改动，或校验没有通过）。请先检查内容。',
      )
    }

    /*
      审批策略**只看模式**（权限那一维已经在挑工具集时生效了）：

      - `ask`：一律确认，并把「标题 + 当前表单值」一起展示 —— 用户要能看清这次提交什么；
      - `auto`：**不问**。上面那道 `canSubmit()` 已经把过关了（表单自己声明"校验通过、
        而且确实有改动"），那就是「信息足够」最可靠的可判定表达 —— 让模型自述"我信息够了"
        是不可信的。再弹一次确认，这个模式就等于没做。

      对照 `call_write_api`：通用写接口没有可预览的表单，两个模式都要确认。
    */
    if (ctx.mode === 'ask') {
      const approved = await ctx.requestApproval({
        toolName: 'submit_form',
        input: { formId, title: form.title ?? formId, values: form.getValues?.() ?? {} },
        reason: '这会提交表单并把改动写入服务端',
      })
      if (!approved) {
        throw new Error(
          '用户拒绝了这次提交，请求没有发出。不要重试，改为向用户说明并询问下一步。',
        )
      }
    }

    await form.submit()

    return { ok: true, formId, note: '表单已提交。' }
  },
}
