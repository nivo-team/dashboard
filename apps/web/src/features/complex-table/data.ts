/**
 * 「复杂表格」示例的本地数据。
 *
 * 这是一页以**展示表格能力**为目的的示例（分组表头 / 可展开行 / 列显隐 /
 * 行选择 / 汇总行），数据在前端本地构造即可 —— 不新增接口，避免为了演示
 * 能力而多养一支 mock 路由与一份契约。父行 = 订单，子行 = 订单明细。
 */

export type ComplexTableRow = {
  /** 行 id：父行是订单号，子行是「订单号-序号」 */
  id: string
  /** 名称：父行是客户名，子行是商品名 */
  name: string
  /** 分类（父行 = 渠道，子行 = 商品分类） */
  category: string
  /** 状态：active / pending / done */
  status: string
  /** 数量 */
  qty: number
  /** 单价（父行 = 客单均价，仅供参考） */
  unitPrice: number
  /** 金额 = qty × unitPrice */
  amount: number
  /** 子行（订单明细）；叶子行没有该字段 */
  children?: ComplexTableRow[]
}

/** 演示用的订单 / 明细数据。 */
export const COMPLEX_TABLE_ROWS: ComplexTableRow[] = [
  {
    id: 'SO-2024-0001',
    name: '云曦科技',
    category: '线上',
    status: 'active',
    qty: 12,
    unitPrice: 128,
    amount: 1536,
    children: [
      {
        id: 'SO-2024-0001-1',
        name: '标准版授权',
        category: '软件',
        status: 'done',
        qty: 10,
        unitPrice: 128,
        amount: 1280,
      },
      {
        id: 'SO-2024-0001-2',
        name: '技术支持服务',
        category: '服务',
        status: 'pending',
        qty: 2,
        unitPrice: 128,
        amount: 256,
      },
    ],
  },
  {
    id: 'SO-2024-0002',
    name: 'Northwind Traders',
    category: '渠道',
    status: 'pending',
    qty: 8,
    unitPrice: 320,
    amount: 2560,
    children: [
      {
        id: 'SO-2024-0002-1',
        name: '企业版授权',
        category: '软件',
        status: 'pending',
        qty: 5,
        unitPrice: 320,
        amount: 1600,
      },
      {
        id: 'SO-2024-0002-2',
        name: '实施顾问',
        category: '服务',
        status: 'active',
        qty: 3,
        unitPrice: 320,
        amount: 960,
      },
    ],
  },
  {
    id: 'SO-2024-0003',
    name: '田中 悠',
    category: '线上',
    status: 'done',
    qty: 3,
    unitPrice: 980,
    amount: 2940,
    children: [
      {
        id: 'SO-2024-0003-1',
        name: '数据迁移服务',
        category: '服务',
        status: 'done',
        qty: 1,
        unitPrice: 980,
        amount: 980,
      },
      {
        id: 'SO-2024-0003-2',
        name: '私有化部署',
        category: '服务',
        status: 'done',
        qty: 2,
        unitPrice: 980,
        amount: 1960,
      },
    ],
  },
  {
    id: 'SO-2024-0004',
    name: 'Sara Al-Otaibi',
    category: '线下',
    status: 'active',
    qty: 20,
    unitPrice: 45,
    amount: 900,
    children: [
      {
        id: 'SO-2024-0004-1',
        name: '终端设备',
        category: '硬件',
        status: 'active',
        qty: 15,
        unitPrice: 45,
        amount: 675,
      },
      {
        id: 'SO-2024-0004-2',
        name: '配件包',
        category: '硬件',
        status: 'active',
        qty: 5,
        unitPrice: 45,
        amount: 225,
      },
    ],
  },
]

/** 稳定访问器：过滤与行模型共用同一份（引用稳定，展开态在数据变化后不丢）。 */
export const COMPLEX_TABLE_SUB_ROWS = (row: ComplexTableRow) => row.children
export const COMPLEX_TABLE_ROW_ID = (row: ComplexTableRow) => row.id

/** 汇总：跨父行与子行累计数量与金额（父行金额已含子行，故对顶层行汇总即可）。 */
export function summarizeComplexTable(rows: readonly ComplexTableRow[]) {
  return rows.reduce(
    (acc, row) => ({
      orders: acc.orders + 1,
      qty: acc.qty + row.qty,
      amount: acc.amount + row.amount,
    }),
    { orders: 0, qty: 0, amount: 0 },
  )
}
