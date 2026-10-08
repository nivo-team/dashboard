import { needsApproval } from '../approval-policy'
import { findAiForm, listAiForms, openPageForm } from '../form-bridge'
import { resolveActivePageCapabilities } from '../page-capabilities'
import { hasSessionGrant } from '../session-permissions'
import { DATA_READ_GRANT } from '../session-permissions'
import { useAiSessionStore } from '../session-store'
import type { AiToolDefinition } from '../types'

/**
 * 「表单」类工具：唤起表单 → 列字段 → 填值 → （审批后）提交。
 *
 * 权限等级：
 * - `open_form` / `list_page_forms` / `fill_form` 是 `act` / `read`：打开表单、看一眼、改改表单内容，不碰服务端；
 * - `submit_form` 是 `commit`：**执行前必须过审批**，用户点了才会真正发请求。
 *
 * 填表的边界收在「表单自己声明的字段」里：模型编出来的字段名一律拒绝（`ignored`），
 * 否则它可以把任意键写进业务 state。
 */

export const openFormTool: AiToolDefinition = {
  name: 'open_form',
  catalogDescription: '打开新增或编辑表单',
  description:
    '在当前页面打开新增或编辑表单，可用 values 预填；表单必须先打开才能填 / 提交，字段名取自 list_page_forms，不得猜测。',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'edit'],
        description: '操作类型：create（新建）或 edit（编辑）',
      },
      id: {
        type: 'string',
        description: '要编辑的对象 ID（仅 action=edit 时提供）',
      },
      values: {
        type: 'object',
        description:
          '可选：要在打开表单时直接写入/预填的字段键值对，例如 {"nickname": "张伟", "email": "zhangwei@example.com"}',
        additionalProperties: true,
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
  capability: 'form:update',
  execute: async (input, ctx) => {
    const rawAction = (input as { action?: string }).action
    const action = rawAction === 'edit' ? 'edit' : 'create'
    const rawId = (input as { id?: string }).id
    const id = rawId ? String(rawId).trim() : undefined
    const rawValues = (input as { values?: Record<string, unknown> }).values
    const values =
      rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)
        ? rawValues
        : undefined

    // 权限前置询问：在表单打开前先向用户申请权限。
    // 得到用户同意后，再打开弹窗/分屏并填入数据，彻底避免弹窗遮罩覆盖会话导致无法点击卡片的问题
    const activeSessionId = useAiSessionStore.getState().activeSessionId
    const isGranted =
      hasSessionGrant('open_form', activeSessionId) ||
      hasSessionGrant('group:form', activeSessionId)

    // 未获会话授权时：询问模式一定问；带了 `values`（AI 已经替你填好）也先问一句。
    // 自动模式且不带值（只是把空表单摆出来）直接开 —— 那不算"替用户做决定"。
    if (!isGranted && (needsApproval('fill', { mode: ctx.mode }) || values)) {
      const pageCtx = ctx.getPageContext()
      const capabilities = resolveActivePageCapabilities(pageCtx.routePath)
      const formSpec = capabilities?.forms?.find(
        (f) => f.action === action || f.id.includes(action),
      )
      const formTitle = formSpec?.title || (action === 'create' ? '新建数据' : '编辑数据')

      const approved = await ctx.requestApproval({
        toolName: 'open_form',
        input: {
          action: formTitle,
          ...(id ? { id } : {}),
          ...(values ? { values } : {}),
        },
        reason: `准备在页面上打开「${formTitle}」${values ? '并自动填入数据' : ''}`,
      })
      if (!approved) {
        throw new Error('用户取消了操作，表单未打开。')
      }
    }

    // 尝试调用当前页面注册的唤起器（得到授权后，在界面上弹出表单并填充初始数据）
    const opened = openPageForm({ action, id, initialValues: values })
    if (opened) {
      return {
        ok: true,
        action,
        id,
        values,
        note: values
          ? `已在当前页面唤起${action === 'create' ? '新建' : '编辑'}表单并自动填入初始数据。请向用户核对内容，确认后可调用 submit_form 提交。`
          : `已在当前页面唤起${action === 'create' ? '新建' : '编辑'}表单。请继续调用 list_page_forms 获取表单字段，并用 fill_form 填写数据。`,
      }
    }

    // 3. 兜底方案：通过 URL 导航驱动唤起
    const pageCtx = ctx.getPageContext()
    // 注意：`AiPageContext` 上叫 `pathname`（不是 `path`）—— 写错会让这里永远为空、
    // 整个「URL 兜底唤起表单」的分支静默失效。
    const path = pageCtx.pathname || ''
    if (path) {
      const qs =
        action === 'create' ? 'form=create' : `form=edit&formId=${encodeURIComponent(id || '')}`
      const target = path.includes('?') ? `${path}&${qs}` : `${path}?${qs}`
      ctx.navigate(target)
      return {
        ok: true,
        action,
        id,
        note: `已通过 URL 打开${action === 'create' ? '新建' : '编辑'}表单。`,
      }
    }

    throw new Error('当前页面不支持唤起表单，请先确认所在页面。')
  },
}

export const listPageFormsTool: AiToolDefinition = {
  name: 'list_page_forms',
  catalogDescription: '查看当前页面的表单与字段',
  description: '列出当前页面的表单、字段与当前值；填表前必须先调用它取字段名，不得猜测。',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  capability: 'form:read',
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
  catalogDescription: '填写表单字段',
  description:
    '把字段值写入当前表单，仅改内容、不提交。询问模式下会先请用户确认，自动模式直接写入。formId 与字段名取自 list_page_forms 且须在其白名单内；被拒绝后不要重试。',
  dependencies: ['list_page_forms'],
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
  capability: 'form:update',
  execute: async (input, ctx) => {
    /*
      读表单 = **读数据**：表单里可能有用户已经填过的内容。
      与 get_page_data / call_read_api 同一档（`read`），判定走同一处策略表。
    */
    if (needsApproval('read', { mode: ctx.mode })) {
      const approved = await ctx.requestApproval({
        toolName: DATA_READ_GRANT,
        input: { tool: 'list_page_forms' },
        reason: 'AI 想读取当前页面表单的字段与已填内容',
      })
      if (!approved) {
        throw new Error('用户拒绝让 AI 读取数据。不要重试，改为请用户自己查看。')
      }
    }

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
      throw new Error(`没有可写入的字段。这个表单的字段是：${[...allowed].join(', ') || '（无）'}`)
    }

    /*
      填表只改页面状态、不发请求，`auto` 下直接填 —— 那正是这个模式的意义。
      判定交给审批策略表（`fill` 那一行），工具不再自己读 `ctx.mode`。
    */
    if (needsApproval('fill', { mode: ctx.mode })) {
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
  catalogDescription: '提交当前表单',
  description:
    '提交当前表单，写入服务端。询问模式须用户确认，自动模式须满足 canSubmit()；被拒绝后不得重试。',
  inputSchema: {
    type: 'object',
    properties: {
      formId: { type: 'string', description: '表单 id，来自 list_page_forms' },
    },
    required: ['formId'],
    additionalProperties: false,
  },
  capability: 'form:submit',
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
      throw new Error('表单当前不满足提交条件（可能没有任何改动，或校验没有通过）。请先检查内容。')
    }

    /*
      从页面能力声明中检索该表单的提交规格与审批策略
    */
    const pageCtx = ctx.getPageContext()
    const capabilities = resolveActivePageCapabilities(pageCtx.routePath)
    const formSpec = capabilities?.forms?.find(
      (f) =>
        f.id === formId ||
        formId.startsWith(f.id) ||
        (formId.includes('create') && f.action === 'create') ||
        (formId.includes('edit') && f.action === 'edit'),
    )

    /*
      审批策略 —— **交给 `needsApproval('submit', ...)`**，不再自己判断模式。

      这里曾经写的是 `formSpec?.submission?.requireApproval ?? (ctx.mode === 'ask' || true)`：
      右侧恒为 true，于是**自动模式下提交也照样弹卡**（与工具描述、能力表格、输入区文案
      三处矛盾），而且三个业务表单里显式声明的 `requireApproval` 因为恒真成了死代码。
      收口到审批策略表之后，"哪种动作在哪种模式下要不要问"只有一处定义。

      `submission.requireApproval === true` 仍然是一个**显式的加强声明**：
      它让这张表单即使在 `auto` 下也要求确认（个别高危表单可以用它单独收紧）。
    */
    const requireApproval =
      formSpec?.submission?.requireApproval ?? needsApproval('submit', { mode: ctx.mode })

    if (requireApproval) {
      const approved = await ctx.requestApproval({
        toolName: 'submit_form',
        input: {
          formId,
          title: formSpec?.title || form.title || formId,
          action: formSpec?.action,
          endpoint: formSpec?.submission?.endpoint,
          values: form.getValues?.() ?? {},
        },
        reason:
          formSpec?.submission?.approvalReason ||
          `将「${formSpec?.title || form.title || formId}」的数据提交并写入服务端`,
      })
      if (!approved) {
        throw new Error('用户拒绝了这次提交，请求没有发出。不要重试，改为向用户说明并询问下一步。')
      }
    }

    await form.submit()

    return {
      ok: true,
      formId,
      endpoint: formSpec?.submission?.endpoint,
      note: '表单已成功提交入库。',
    }
  },
}
