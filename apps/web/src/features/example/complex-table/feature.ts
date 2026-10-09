import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * 「复杂表格」示例页的特性声明（`/$appId/example/complex-table`）。
 *
 * 这一页的数据是**前端本地构造**的（不新增接口），所以没有 `endpoints`，也不该有
 * `forms` —— 指令只对应用户在页面上真实能点的按钮（清空选择）。
 *
 * 与 `features/example/table/feature.ts` 同一套工厂模式：`read` / `run` 必须闭包
 * 页面此刻的 state（当前行、选中项），工厂每轮渲染重新生成一份。
 */

export interface ComplexTableFeatureOptions {
  /** 当前展示的行（已应用关键词过滤） */
  rows: readonly {
    id: string
    customer_name: string
    category: string
    product_name: string
    channel: string
    status: string
    qty: number
    total: number
  }[]
  /** 关键词（本地过滤） */
  keyword: string
  /** 表格勾选的行 id */
  selectedIds: readonly string[]
  /** 清空行选择 */
  clearSelection: () => void
}

export function createComplexTableFeature(
  options: ComplexTableFeatureOptions,
): FeatureSpec {
  return defineFeature({
    title: '复杂表格',
    description:
      '宽表示例：25 个字段、单层表头、全字段可筛选；数据为前端本地构造。',
    entities: ['订单', '客户', '商品', '金额', '筛选'],
    permissions: ['example:read'],
    /*
      本地数据页没有接口与表单：如实声明为空，不要凭空造接口/表单让模型以为存在。
    */
    endpoints: [],
    forms: [],
    searchParams: {
      description:
        '主搜索框（kw）跨所有字段模糊匹配；另有 25 个字段级筛选条件（FilterBuilder），' +
        '全部落在 URL 上，可分享、可刷新复现。数据为前端本地构造，筛选亦在前端完成。',
      keywordParam: 'kw',
    },
    commands: [
      {
        id: 'clear-row-selection',
        title: '清空行选择',
        description: '取消当前表格里所有已勾选的行',
        kind: 'navigate',
        permission: 'example:read',
        actionType: 'custom',
        run: () => {
          options.clearSelection()
          return { cleared: true }
        },
      },
    ],
    dataSources: [
      {
        id: 'rows',
        title: '复杂表格（当前展示）',
        description: '这一页此刻展示的订单行，已应用关键词过滤',
        shape:
          '每行 25 个字段：订单与客户（id / customer_name / customer_code / contact_* / region）、' +
          '商品（category / product_name / sku / qty）、金额（unit_price / amount / discount / tax / total / currency）、' +
          '履约（channel / status / pay_status / pay_method / owner）、时间与备注（order_time / delivery_time / remark）。',
        fields: [
          { name: 'id', label: '订单号', type: 'string' },
          { name: 'customer_name', label: '客户名称', type: 'string' },
          { name: 'product_name', label: '商品名称', type: 'string' },
          { name: 'channel', label: '渠道', type: 'string' },
          {
            name: 'status',
            label: '订单状态',
            type: 'enum',
            options: [
              { value: 'pending', label: '待处理' },
              { value: 'processing', label: '处理中' },
              { value: 'shipped', label: '已发货' },
              { value: 'done', label: '已完成' },
              { value: 'cancelled', label: '已取消' },
            ],
          },
          { name: 'qty', label: '数量', type: 'number' },
          { name: 'total', label: '合计', type: 'number', description: '单位：元' },
        ],
        state: () => ({
          keyword: options.keyword,
          selectedIds: options.selectedIds,
          loaded: options.rows.length,
        }),
        read: () => options.rows,
      },
    ],
  })
}
