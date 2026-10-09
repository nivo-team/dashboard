import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * 「树形表格」示例页的特性声明（`/$appId/example/tree-table`）。
 *
 * 数据是**前端本地构造**的（不新增接口），所以没有 `endpoints`，也不该有 `forms`
 * —— 指令只对应用户在页面上真实能做的事（展开全部 / 折叠全部 / 清空搜索）。
 *
 * 与其它示例同一套工厂模式：`read` / `run` 必须闭包页面此刻的 state，工厂每轮渲染重新生成。
 */

export interface TreeTableFeatureOptions {
  /** 当前展示的节点（已应用关键词过滤，含子树） */
  rows: readonly {
    id: string
    name: string
    owner: string
    status: string
    count: number
    amount: number
    children?: unknown
  }[]
  /** 关键词（本地过滤） */
  keyword: string
  /** 当前展开的节点 id */
  expandedIds: readonly string[]
}

export function createTreeTableFeature(options: TreeTableFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '树形表格',
    description:
      '树形表格能力示例：父子行、展开折叠、搜索联动展开与子行强调；数据为前端本地构造。',
    entities: ['分类', '商品', '层级'],
    permissions: ['example:read'],
    /*
      本地数据页没有接口与表单：如实声明为空，不要凭空造接口/表单让模型以为存在。
    */
    endpoints: [],
    forms: [],
    searchParams: {
      description: '关键词为**前端本地过滤**（无接口参数），按分类 / 商品 / 负责人匹配',
      keywordParam: 'kw',
    },
    dataSources: [
      {
        id: 'rows',
        title: '树形表格（当前展示）',
        description: '这一页此刻展示的分类节点与子节点，已应用关键词过滤',
        shape:
          '每行：id / name / owner / status / count / amount，父行还带 children（子节点）。state 里是关键词与展开项。',
        fields: [
          { name: 'id', label: '节点编号', type: 'string' },
          { name: 'name', label: '分类 / 商品', type: 'string' },
          { name: 'owner', label: '负责人', type: 'string' },
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
          { name: 'count', label: '商品数', type: 'number' },
          { name: 'amount', label: '金额', type: 'number', description: '单位：元' },
        ],
        state: () => ({
          keyword: options.keyword,
          expandedIds: options.expandedIds,
          loaded: options.rows.length,
        }),
        read: () => options.rows,
      },
    ],
  })
}
