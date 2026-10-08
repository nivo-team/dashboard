import { defineHandler, defineRouteMeta } from 'nitro'
import { getQuery } from 'nitro/h3'
import { db, dictTypeWithDescendants } from '../../utils/db'
import { paginate, readNumber, readString } from '../../utils/query'
import { ok } from '../../utils/response'

/**
 * 字典项分页列表。
 *
 * ⚠️ 这里是对旧契约的**修正**：原 `openapi.json` 把本接口的响应错声明成
 * `v1.DataOptions`（`{ options, total }`，那是隔壁 `/data_dict/options` 的类型），
 * 导致前端只能靠 `as unknown as DictItemPage` 断言绕过。本 Mock 如实声明
 * `{ total, items }`，前端可以直接删掉那处断言。
 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '字典项分页列表',
    parameters: [
      {
        in: 'query',
        name: 'type_id',
        schema: { type: 'integer' },
        description: '所属分类 ID（含其子分类）',
      },
      {
        in: 'query',
        name: 'kw',
        schema: { type: 'string' },
        description: '关键词（显示名 / 键值）',
      },
      {
        in: 'query',
        name: 'status',
        schema: { type: 'integer' },
        description: '状态：1 启用 / 2 禁用',
      },
      { in: 'query', name: 'page', schema: { type: 'integer' } },
      { in: 'query', name: 'page_size', schema: { type: 'integer' } },
    ],
    responses: {
      200: {
        description: '字典项分页结果',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DictItemPageResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          DictItem: {
            type: 'object',
            description: '字典项',
            properties: {
              id: { type: 'integer', description: '字典项 ID' },
              type_id: { type: 'integer', description: '所属分类 ID' },
              code: { type: 'string', description: '所属分类的完整编码' },
              label: { type: 'string', description: '显示名' },
              value: { type: 'string', description: '键值' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              is_default: { type: 'integer', description: '1 是默认值 / 2 否' },
              sort: { type: 'integer', description: '排序' },
              remark: { type: 'string', description: '备注' },
              update_by_user: {
                type: 'object',
                description: '最后更新人',
                properties: {
                  uid: { type: 'integer' },
                  username: { type: 'string' },
                  nick_name: { type: 'string' },
                },
              },
              created_at: { type: 'integer', description: '创建时间（秒级时间戳）' },
              updated_at: { type: 'integer', description: '更新时间（秒级时间戳）' },
            },
            required: ['id', 'type_id', 'label', 'value'],
          },
          DictItemPageResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                properties: {
                  total: { type: 'integer', description: '总条数' },
                  items: { type: 'array', items: { $ref: '#/components/schemas/DictItem' } },
                },
                required: ['total', 'items'],
              },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler((event) => {
  const typeId = readNumber(event, 'type_id')
  const status = readNumber(event, 'status')
  const kw = readString(event, 'kw')?.toLowerCase()

  let rows = db.dictItems
  if (typeId !== undefined) {
    const scope = new Set(dictTypeWithDescendants(typeId))
    rows = rows.filter((item) => scope.has(item.type_id))
  }
  if (status !== undefined) rows = rows.filter((item) => item.status === status)
  if (kw) {
    rows = rows.filter(
      (item) => item.label.toLowerCase().includes(kw) || item.value.toLowerCase().includes(kw),
    )
  }

  return ok(paginate(rows, getQuery(event)))
})
