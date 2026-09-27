import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, refreshDictDerived, toFlag } from '../../../utils/db'
import { fail, notFound, ok } from '../../../utils/response'

/**
 * 更新字典分类。
 *
 * `code` 改动会影响整棵子树的 `p_code` 与分类下所有字典项的 `code`，
 * 因此写完统一调 `refreshDictDerived()` 重算派生字段。
 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '更新字典分类',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'integer', description: '分类 ID' },
              name: { type: 'string' },
              code: { type: 'string' },
              type: { type: 'integer' },
              status: { type: 'integer' },
              parent_id: { type: 'integer' },
              sort: { type: 'integer' },
              remark: { type: 'string' },
            },
            required: ['id'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '更新后的分类',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DictTypeNodeResult' },
          },
        },
      },
    },
  },
})

interface DictTypeUpdateBody {
  id?: number
  name?: string
  code?: string
  type?: number
  status?: number
  parent_id?: number
  sort?: number
  remark?: string
}

export default defineHandler(async (event) => {
  const body = await readBody<DictTypeUpdateBody>(event).catch(() => ({}) as DictTypeUpdateBody)

  const row = db.dictTypes.find((t) => t.id === Number(body?.id))
  if (!row) return notFound('字典分类')

  if (body.parent_id !== undefined) {
    const parentId = Number(body.parent_id) || 0
    if (parentId === row.id) return fail(400, '上级分类不能是自己')
    // 不允许挂到自己的后代下（否则分类树会成环）
    let cursor = db.dictTypes.find((t) => t.id === parentId)
    while (cursor) {
      if (cursor.id === row.id) return fail(400, '不能把分类移动到它自己的子分类下')
      cursor = db.dictTypes.find((t) => t.id === cursor!.parent_id)
    }
    if (parentId !== 0 && !db.dictTypes.some((t) => t.id === parentId)) {
      return fail(400, '上级分类不存在')
    }
    row.parent_id = parentId
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return fail(400, '请输入分类名称')
    row.name = name
  }

  if (body.code !== undefined) {
    const code = String(body.code).trim()
    if (!/^[a-z0-9][a-z0-9-]*$/.test(code)) {
      return fail(400, '分类编码只能包含小写字母、数字与连字符')
    }
    const dup = db.dictTypes.some(
      (t) => t.id !== row.id && t.parent_id === row.parent_id && t.code === code,
    )
    if (dup) return fail(400, `同级下已存在编码「${code}」`)
    row.code = code
  }

  if (body.type !== undefined) row.type = toFlag(body.type, 1)
  if (body.status !== undefined) row.status = toFlag(body.status, 1)
  if (body.sort !== undefined) row.sort = Number(body.sort) || 0
  if (body.remark !== undefined) row.remark = String(body.remark).trim()

  refreshDictDerived()
  return ok({ ...row, children: [] })
})
