import { defineHandler, defineRouteMeta } from 'nitro'
import { dictTypeTree } from '../../../utils/db'
import { ok } from '../../../utils/response'

/**
 * 字典分类树。
 *
 * ⚠️ 同样是对旧契约的修正：原 `openapi.json` 把本接口的响应错声明成
 * `v1.DataOptions`（`{ options, total }`），实际返回的是整棵分类树的顶层数组。
 * 前端为此手写了 `DICT_TYPE_SCHEMA` 并绕开生成类型，接上本 Mock 后可以删掉。
 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '获取字典分类树（顶层节点数组）',
    responses: {
      200: {
        description: '分类树',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DictTypeTreeResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          DictTypeNode: {
            type: 'object',
            description: '字典分类（可嵌套）',
            properties: {
              id: { type: 'integer', description: '分类 ID' },
              parent_id: { type: 'integer', description: '上级分类 ID，顶级为 0' },
              name: { type: 'string', description: '分类名称' },
              code: { type: 'string', description: '局部编码' },
              p_code: { type: 'string', description: '从根到自身的完整编码，如 user.status' },
              id_path: { type: 'string', description: '祖先 id 链（不含自身），如 /0/1/' },
              status: { type: 'integer', description: '1 启用 / 2 禁用' },
              type: { type: 'integer', description: '键值类型：1 字符串 / 2 数字' },
              sort: { type: 'integer', description: '排序' },
              remark: { type: 'string', description: '备注' },
              created_at: { type: 'integer', description: '创建时间（秒级时间戳）' },
              updated_at: { type: 'integer', description: '更新时间（秒级时间戳）' },
              children: {
                type: 'array',
                description: '子分类',
                items: { $ref: '#/components/schemas/DictTypeNode' },
              },
            },
            required: ['id', 'name', 'code'],
          },
          DictTypeTreeResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { type: 'array', items: { $ref: '#/components/schemas/DictTypeNode' } },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler(() => ok(dictTypeTree(0)))
