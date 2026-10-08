import { defineHandler, defineRouteMeta } from 'nitro'
import { readBody } from 'nitro/h3'
import { db, newDictTypeRow, nextId, refreshDictDerived, toFlag } from '../../../utils/db'
import { fail, ok } from '../../../utils/response'

/** 新建字典分类。 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '新建字典分类',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '分类名称' },
              code: { type: 'string', description: '局部编码，如 channel' },
              type: { type: 'integer', description: '键值类型：1 字符串 / 2 数字' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              parent_id: { type: 'integer', description: '上级分类 ID，顶级为 0' },
              sort: { type: 'integer' },
              remark: { type: 'string' },
            },
            required: ['name', 'code'],
          },
        },
      },
    },
    responses: {
      200: {
        description: '新建的分类',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DictTypeNodeResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          DictTypeNodeResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { $ref: '#/components/schemas/DictTypeNode' },
            },
            required: ['code'],
          },
        },
      },
    },
  },
})

interface DictTypeBody {
  name?: string
  code?: string
  type?: number
  status?: number
  parent_id?: number
  sort?: number
  remark?: string
}

export default defineHandler(async (event) => {
  const body = ((await readBody<DictTypeBody>(event).catch(() => undefined)) ?? {}) as DictTypeBody

  const name = body?.name?.trim()
  if (!name) return fail(400, '请输入分类名称')

  // code 只允许小写字母、数字与连字符：它会拼进 `user.status` 这样的字典路径
  const code = String(body.code ?? '').trim()
  if (!code) return fail(400, '请输入分类编码')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(code)) {
    return fail(400, '分类编码只能包含小写字母、数字与连字符')
  }

  const parentId = Number(body.parent_id) || 0
  if (parentId !== 0 && !db.dictTypes.some((t) => t.id === parentId)) {
    return fail(400, '上级分类不存在')
  }
  if (db.dictTypes.some((t) => t.parent_id === parentId && t.code === code)) {
    return fail(400, `同级下已存在编码「${code}」`)
  }

  const row = newDictTypeRow({
    id: nextId('dictType'),
    parent_id: parentId,
    name,
    code,
    status: toFlag(body.status, 1),
    type: toFlag(body.type, 1),
    sort: Number(body.sort) || 0,
    remark: body.remark?.trim() ?? '',
  })

  db.dictTypes.push(row)
  refreshDictDerived()
  return ok({ ...row, children: [] })
})
