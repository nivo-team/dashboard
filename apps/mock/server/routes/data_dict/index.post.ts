import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, nextId, nowSeconds, refreshDictDerived, toFlag } from '../../utils/db'
import { fail, ok } from '../../utils/response'

/** 新建字典项。 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '新建字典项',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              type_id: { type: 'integer', description: '所属分类 ID' },
              label: { type: 'string', description: '显示名' },
              value: { type: 'string', description: '键值' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              is_default: { type: 'integer', description: '1 是默认值 / 2 否' },
              sort: { type: 'integer' },
              remark: { type: 'string' },
            },
            required: ['type_id', 'label', 'value'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '新建的字典项',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DictItemResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          DictItemResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { $ref: '#/components/schemas/DictItem' },
            },
            required: ['code'],
          },
        },
      },
    },
  },
})

interface DictItemBody {
  type_id?: number
  label?: string
  value?: string
  status?: number
  is_default?: number
  sort?: number
  remark?: string
}

export default defineHandler(async (event) => {
  const body = ((await readBody<DictItemBody>(event).catch(() => undefined)) ?? {}) as DictItemBody

  const typeId = Number(body?.type_id)
  const type = db.dictTypes.find((t) => t.id === typeId)
  if (!type) return fail(400, '所属分类不存在')

  const label = body.label?.trim()
  if (!label) return fail(400, '请输入显示名')
  const value = String(body.value ?? '').trim()
  if (!value) return fail(400, '请输入键值')

  // 同一分类下键值不允许重复（与真实后端一致，也是前端会立刻撞上的校验）
  if (db.dictItems.some((item) => item.type_id === typeId && item.value === value)) {
    return fail(400, `键值「${value}」在该分类下已存在`)
  }

  const ts = nowSeconds()
  const row = {
    id: nextId('dictItem'),
    type_id: typeId,
    code: type.p_code,
    label,
    value,
    status: toFlag(body.status, 1),
    is_default: toFlag(body.is_default, 2),
    sort: Number(body.sort) || db.dictItems.length + 1,
    remark: body.remark?.trim() ?? '',
    update_by_user: { uid: 1, username: 'admin', nick_name: '超级管理员' },
    created_at: ts,
    updated_at: ts,
  }

  // 同分类内只允许一个默认项：新增默认项时把其它的降级
  if (row.is_default === 1) {
    for (const item of db.dictItems) {
      if (item.type_id === typeId) item.is_default = 2
    }
  }

  db.dictItems.push(row)
  refreshDictDerived()
  return ok(row)
})
