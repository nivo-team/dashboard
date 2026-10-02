import { defineFeature } from '#/lib/features'
import type { FeatureSpec } from '#/lib/features'

/**
 * 「复杂表格」示例页的特性声明（`/$appId/example/complex-table`）。
 *
 * 这一页的数据是**前端本地构造**的（不新增接口），所以没有 `endpoints`，也不该有
 * `forms` —— 指令只对应用户在页面上真实能点的按钮（展开全部 / 折叠全部 / 清空选择）。
 *
 * 与 `features/table-example/feature.ts` 同一套工厂模式：`read` / `run` 必须闭包
 * 页面此刻的 state（当前行、选中项、展开态），工厂每轮渲染重新生成一份。
 */

export interface ComplexTableFeatureOptions {
  /** 当前展示的行（已应用关键词过滤） */
  rows: readonly { id: string; name: string; category: string; status: string; qty: number; amount: number }[]
  /** 关键词（本地过滤） */
  keyword: string
  /** 表格勾选的行 id */
  selectedIds: readonly string[]
  /** 当前展开的行 id */
  expandedIds: readonly string[]
  /** 展开全部父行 */
  expandAll: () => void
  /** 折叠全部 */
  collapseAll: () => void
  /** 清空行选择 */
  clearSelection: () => void
}

export function createComplexTableFeature(
  options: ComplexTableFeatureOptions,
): FeatureSpec {
  return defineFeature({
    title: '复杂表格',
    description:
      '复杂表格能力示例：分组表头、可展开的父子行、列显隐、行选择与汇总行；数据为前端本地构造。',
    entities: ['订单', '订单明细', '分组表头', '汇总'],
    permissions: ['table-example:read'],
    /*
      本地数据页没有接口与表单：如实声明为空，不要凭空造接口/表单让模型以为存在。
    */
    endpoints: [],
    forms: [],
    searchParams: {
      description: '关键词为**前端本地过滤**（无接口参数），按名称 / 编号 / 分类匹配',
      keywordParam: 'kw',
    },
    commands: [
      {
        id: 'expand-all-rows',
        title: '展开全部行',
        description: '展开所有父行，显示订单明细（用户要求「展开全部 / 看明细」时用它）',
        kind: 'navigate',
        permission: 'table-example:read',
        actionType: 'custom',
        run: () => {
          options.expandAll()
          return { expanded: true }
        },
      },
      {
        id: 'collapse-all-rows',
        title: '折叠全部行',
        description: '收起所有已展开的父行，回到只显示顶层订单的状态',
        kind: 'navigate',
        permission: 'table-example:read',
        actionType: 'custom',
        run: () => {
          options.collapseAll()
          return { collapsed: true }
        },
      },
      {
        id: 'clear-row-selection',
        title: '清空行选择',
        description: '取消当前表格里所有已勾选的行',
        kind: 'navigate',
        permission: 'table-example:read',
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
        description: '这一页此刻展示的订单与明细行，已应用关键词过滤',
        shape:
          '每行：id / name / category / status / qty / amount，父行还带 children（明细）。state 里是关键词、展开项与选中项。',
        fields: [
          { name: 'id', label: '订单 / 明细号', type: 'string' },
          { name: 'name', label: '名称', type: 'string' },
          {
            name: 'status',
            label: '状态',
            type: 'enum',
            options: [
              { value: 'active', label: '进行中' },
              { value: 'pending', label: '待处理' },
              { value: 'done', label: '已完成' },
            ],
          },
          { name: 'qty', label: '数量', type: 'number' },
          { name: 'amount', label: '金额', type: 'number', description: '单位：元' },
        ],
        state: () => ({
          keyword: options.keyword,
          expandedIds: options.expandedIds,
          selectedIds: options.selectedIds,
          loaded: options.rows.length,
        }),
        read: () => options.rows,
      },
    ],
  })
}
