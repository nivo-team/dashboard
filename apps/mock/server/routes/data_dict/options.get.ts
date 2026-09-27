import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../../utils/db'
import { ok } from '../../utils/response'

/**
 * 字典选项（全站下拉 / 枚举的取值来源）。
 *
 * 返回结构是 `{ [分类完整编码]: 选项数组 }`，一次给全量。
 *
 * ⚠️ 与旧后端的差异：这里的 key **不带 `new.` 临时命名空间**（例如直接是
 * `user.status`）。前端 `src/lib/dict-key.ts` 里标注的「正式版」形态就是
 * `DICT_NAMESPACE = ''`，配合本接口即可去掉那层适配。
 */
defineRouteMeta({
  openAPI: {
    tags: ['数据字典'],
    description: '获取全量字典选项（按分类编码分组）',
    responses: {
      200: {
        description: '字典选项映射',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DictOptionsResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          DictOption: {
            type: 'object',
            description: '单个选项',
            properties: {
              label: { type: 'string', description: '显示文本' },
              value: { type: 'string', description: '选项值' },
              disabled: { type: 'boolean', description: '是否禁用（不可选）' },
              other: {
                type: 'object',
                description: '扩展信息',
                properties: {
                  is_default: { type: 'boolean', description: '是否默认项' },
                  remark: { type: 'string', description: '备注' },
                },
              },
            },
            required: ['label', 'value'],
          },
          DictOptionsResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: {
                type: 'object',
                description: '分类完整编码 → 选项数组',
                additionalProperties: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/DictOption' },
                },
              },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler(() => {
  const byTypeId = new Map(db.dictTypes.map((t) => [t.id, t]))
  const result: Record<string, unknown[]> = {}

  for (const item of db.dictItems) {
    const type = byTypeId.get(item.type_id)
    // 只暴露「两段式」编码的分类：单段的是分组节点，本身不承载选项
    const code = type?.p_code
    if (!code || !code.includes('.')) continue

    result[code] ??= []
    result[code].push({
      label: item.label,
      value: item.value,
      disabled: item.status !== 1,
      other: { is_default: item.is_default === 1, remark: item.remark },
    })
  }

  return ok(result)
})
