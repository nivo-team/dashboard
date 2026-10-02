import type { AiToolDefinition } from '../types'

/**
 * 权限申请与确认工具。
 *
 * 当用户刷新页面、重新打开会话或要求「继续任务」时，
 * 若会话权限尚未获得，AI 可以主动调用此工具弹出权限确认卡，
 * 用户点击「允许一次」或「本会话不再询问」后，后续操作即可顺畅连续执行。
 */
export const requestPermissionTool: AiToolDefinition = {
  name: 'request_permission',
  catalogDescription: '向用户申请操作权限',
  description:
    '向用户申请操作权限（表单 / 接口写）。继续会话前若尚无权限，先调用它弹授权卡，批准后本会话放行。',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['form', 'write_api'],
        description:
          '申请的权限类型：form（表单录入与提交）或 write_api（直接调用数据写接口）',
      },
      reason: {
        type: 'string',
        description:
          '向用户说明为什么需要该权限，例如「需要继续为您创建剩余的 2 位用户」',
      },
    },
    required: ['action', 'reason'],
    additionalProperties: false,
  },
  access: 'act',
  group: 'page',
  execute: async (input, ctx) => {
    const action = (input as { action?: string }).action || 'form'
    const reason = (input as { reason?: string }).reason || '执行自动化操作'
    const toolKey = action === 'form' ? 'submit_form' : 'call_write_api'

    const approved = await ctx.requestApproval({
      toolName: toolKey,
      input: { action, reason },
      reason,
    })

    if (!approved) {
      throw new Error('用户未授予该操作权限。')
    }

    return {
      ok: true,
      granted: true,
      action,
      note: '用户已授予权限，可继续执行后续任务。',
    }
  },
}
