import { defineRouteMeta } from 'nitro'

/**
 * 生成统一的响应包装 schema：`{ code, message, result }`。
 *
 * ⚠️ 这里刻意只**返回 schema 对象**，不调用 `defineRouteMeta`：
 * 后者是构建期宏，必须在路由文件里以字面量形式出现才能被静态提取。
 */
export function envelopeSchema(result: Record<string, unknown> = {}) {
  return {
    type: 'object',
    properties: {
      code: { type: 'integer', description: '0 表示成功，非 0 为业务错误' },
      message: { type: 'string', description: '错误提示（成功时为空串）' },
      result: result,
    },
    required: ['code', 'result'],
  }
}

/** 分页结果的外壳，配合具体行 schema 使用。 */
export function pageSchema(itemSchema: Record<string, unknown>) {
  return {
    type: 'object',
    properties: {
      total: { type: 'integer', description: '总条数' },
      items: { type: 'array', items: itemSchema },
    },
    required: ['total', 'items'],
  }
}
