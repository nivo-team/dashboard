import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nowSeconds, refreshDictDerived, toFlag } from '../../utils/db'
import { fail, notFound, ok } from '../../utils/response'

/** 更新字典项。 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '更新字典项',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'integer', description: '字典项 ID' },
              type_id: { type: 'integer' },
              label: { type: 'string' },
              value: { type: 'string' },
              status: { type: 'integer' },
              is_default: { type: 'integer' },
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
        description: '更新后的字典项',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DictItemResult' },
          },
        },
      },
    },
  },
})

interface DictItemUpdateBody {
  id?: number
  type_id?: number
  label?: string
  value?: string
  status?: number
  is_default?: number
  sort?: number
  remark?: string
}

export default defineHandler(async (event) => {
  const body = ((await readBody<DictItemUpdateBody>(event).catch(() => undefined)) ??
    {}) as DictItemUpdateBody

  const row = db.dictItems.find((item) => item.id === Number(body?.id))
  if (!row) return notFound('字典项')

  if (body.type_id !== undefined) {
    const type = db.dictTypes.find((t) => t.id === Number(body.type_id))
    if (!type) return fail(400, '所属分类不存在')
    row.type_id = type.id
    row.code = type.p_code
  }

  if (body.label !== undefined) {
    const label = String(body.label).trim()
    if (!label) return fail(400, '请输入显示名')
    row.label = label
  }

  if (body.value !== undefined) {
    const value = String(body.value).trim()
    if (!value) return fail(400, '请输入键值')
    const dup = db.dictItems.some(
      (item) => item.id !== row.id && item.type_id === row.type_id && item.value === value,
    )
    if (dup) return fail(400, `键值「${value}」在该分类下已存在`)
    row.value = value
  }

  if (body.status !== undefined) row.status = toFlag(body.status, 1)
  if (body.sort !== undefined) row.sort = Number(body.sort) || 0
  if (body.remark !== undefined) row.remark = String(body.remark).trim()

  if (body.is_default !== undefined) {
    row.is_default = toFlag(body.is_default, 2)
    if (row.is_default === 1) {
      for (const item of db.dictItems) {
        if (item.type_id === row.type_id && item.id !== row.id) item.is_default = 2
      }
    }
  }

  row.updated_at = nowSeconds()
  refreshDictDerived()
  return ok(row)
})
