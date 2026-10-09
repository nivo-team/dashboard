/**
 * 「树形表格」示例的本地数据。
 *
 * 这一页只演示**层级**（父子行 / 展开折叠 / 搜索时自动展开），数据是商品分类树 ——
 * 刻意不做分组表头：分组与层级都要占第一列，混在一张表里两类能力互相牵制
 * （分组标题要横跨、缩进要落在第一列），分开后各自都能做到干净。
 *
 * 前端本地构造，不新增接口。
 */

export type TreeTableRow = {
  /** 节点 id：父行是分类码，子行是「分类码-序号」 */
  id: string
  /** 节点名 */
  name: string
  /** 负责人 */
  owner: string
  /** 状态：active / pending / done */
  status: string
  /** 该节点下的商品数（父行 = 各子行之和） */
  count: number
  /** 金额（父行 = 各子行之和） */
  amount: number
  /** 子节点；叶子节点没有该字段 */
  children?: TreeTableRow[]
}

/** 演示用的商品分类树（三层：大类 → 子类 → 单品）。 */
export const TREE_TABLE_ROWS: TreeTableRow[] = [
  {
    id: 'ELEC',
    name: '电子产品',
    owner: '云曦科技',
    status: 'active',
    count: 12,
    amount: 18600,
    children: [
      {
        id: 'ELEC-LAPTOP',
        name: '笔记本电脑',
        owner: '云曦科技',
        status: 'active',
        count: 5,
        amount: 12500,
        children: [
          { id: 'ELEC-LAPTOP-1', name: '轻薄本 X1', owner: '云曦科技', status: 'active', count: 3, amount: 7500 },
          { id: 'ELEC-LAPTOP-2', name: '工作站 P2', owner: '云曦科技', status: 'pending', count: 2, amount: 5000 },
        ],
      },
      {
        id: 'ELEC-PHONE',
        name: '手机',
        owner: '蓝海数字',
        status: 'pending',
        count: 7,
        amount: 6100,
        children: [
          { id: 'ELEC-PHONE-1', name: '旗舰机型', owner: '蓝海数字', status: 'pending', count: 4, amount: 4800 },
          { id: 'ELEC-PHONE-2', name: '入门机型', owner: '蓝海数字', status: 'active', count: 3, amount: 1300 },
        ],
      },
    ],
  },
  {
    id: 'SERV',
    name: '专业服务',
    owner: 'Northwind Traders',
    status: 'active',
    count: 8,
    amount: 24000,
    children: [
      { id: 'SERV-IMPL', name: '实施顾问', owner: 'Northwind Traders', status: 'active', count: 3, amount: 14400 },
      { id: 'SERV-MIGR', name: '数据迁移', owner: 'Northwind Traders', status: 'done', count: 5, amount: 9600 },
    ],
  },
  {
    id: 'HARD',
    name: '硬件外设',
    owner: 'Sara Al-Otaibi',
    status: 'done',
    count: 20,
    amount: 900,
  },
]

/** 稳定访问器：过滤、展开与行模型共用同一份（引用稳定，展开态在数据变化后不丢）。 */
export const TREE_TABLE_SUB_ROWS = (row: TreeTableRow) => row.children
export const TREE_TABLE_ROW_ID = (row: TreeTableRow) => row.id

/** 汇总：顶层节点的数量与金额合计（父行金额已含子行，故对顶层汇总即可）。 */
export function summarizeTreeTable(rows: readonly TreeTableRow[]) {
  return rows.reduce(
    (acc, row) => ({
      roots: acc.roots + 1,
      count: acc.count + row.count,
      amount: acc.amount + row.amount,
    }),
    { roots: 0, count: 0, amount: 0 },
  )
}
