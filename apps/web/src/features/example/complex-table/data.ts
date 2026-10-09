/**
 * 「复杂表格」示例的本地数据。
 *
 * 这一页演示**宽表 + 全字段可筛选**：25 个字段、单层表头、每个字段都能作为搜索条件。
 * 数据在前端本地构造（不新增接口），所以筛选也在前端完成 —— 但**筛选链路与真实
 * 接口页完全一致**（`useTableQuery` + `FilterBuilder` + URL state），换接口时只需把
 * 「本地过滤」换成「把 queryParams 交给 query」这一步。
 */

/** 订单状态。 */
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'done' | 'cancelled'
/** 支付状态。 */
export type PayStatus = 'unpaid' | 'partial' | 'paid' | 'refunded'

/**
 * 一行订单 —— **25 个字段**，覆盖 text / number / enum / 时间四种形态。
 *
 * 字段清单与列编排、筛选目录**同源**（见 `columns.tsx` 的 `COLUMN_SPECS`），
 * 三处不会各写一份。
 */
export interface ComplexTableRow {
  // ── 订单与客户（7）
  id: string
  customer_name: string
  customer_code: string
  contact_name: string
  contact_phone: string
  contact_email: string
  region: string
  // ── 商品（4）
  category: string
  product_name: string
  sku: string
  qty: number
  // ── 金额（6）
  unit_price: number
  amount: number
  discount: number
  tax: number
  total: number
  currency: string
  // ── 履约（5）
  channel: string
  status: OrderStatus
  pay_status: PayStatus
  pay_method: string
  owner: string
  // ── 时间与备注（3）
  order_time: number
  delivery_time: number
  remark: string
}

/** 枚举候选（列渲染与筛选下拉共用一份）。 */
export const REGIONS = ['华东', '华南', '华北', '西南', '海外'] as const
export const CATEGORIES = ['软件', '服务', '硬件', '耗材'] as const
export const CHANNELS = ['线上', '渠道', '线下', '直销'] as const
export const CURRENCIES = ['CNY', 'USD', 'EUR'] as const
export const PAY_METHODS = ['对公转账', '信用卡', '账期', '预付款'] as const
export const ORDER_STATUS: readonly OrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'done',
  'cancelled',
]
export const PAY_STATUS: readonly PayStatus[] = ['unpaid', 'partial', 'paid', 'refunded']

const CUSTOMERS = [
  { name: '云曦科技', code: 'CUS-1001', region: '华东', owner: '陈曦' },
  { name: 'Northwind Traders', code: 'CUS-1002', region: '海外', owner: 'Amy Chen' },
  { name: '蓝海数字', code: 'CUS-1003', region: '华南', owner: '林蓝' },
  { name: 'Grupo Iberia', code: 'CUS-1004', region: '海外', owner: 'Diego R.' },
  { name: '北方智造', code: 'CUS-1005', region: '华北', owner: '赵北' },
  { name: 'Sara Al-Otaibi', code: 'CUS-1006', region: '海外', owner: 'Sara A.' },
  { name: '蓉城数据', code: 'CUS-1007', region: '西南', owner: '何蓉' },
  { name: '深港物联', code: 'CUS-1008', region: '华南', owner: '周港' },
]

const CONTACTS = [
  { name: '张伟', phone: '138-0000-1001', email: 'zhangwei@yunxi.example' },
  { name: '李娜', phone: '139-0000-1002', email: 'lina@northwind.example' },
  { name: '王强', phone: '137-0000-1003', email: 'wangqiang@bluesea.example' },
  { name: '刘洋', phone: '136-0000-1004', email: 'liuyang@iberia.example' },
  { name: '陈静', phone: '135-0000-1005', email: 'chenjing@bfzz.example' },
  { name: '孙磊', phone: '134-0000-1006', email: 'sunlei@rcdata.example' },
]

const PRODUCTS: Record<string, readonly string[]> = {
  软件: ['标准版授权', '企业版授权', '开发工具套件', '数据平台许可'],
  服务: ['实施顾问', '技术支持服务', '数据迁移服务', '私有化部署'],
  硬件: ['终端设备', '服务器机型', '网络设备', '配件包'],
  耗材: ['打印耗材', '线材包', '备件套装', '清洁套装'],
}

/**
 * 确定性生成 24 行 —— 不引入随机数，刷新后数据不变（便于人工核对筛选结果）。
 *
 * 之所以用生成而不是手写 24×25 个字面量：宽表的字段太多，手写时必然漏字段或写错类型，
 * 而生成式能保证每一行都满足 `ComplexTableRow` 的完整形状。
 */
function buildRows(): ComplexTableRow[] {
  const rows: ComplexTableRow[] = []
  const baseTime = 1_725_148_800 // 2024-09-01 00:00:00 (UTC+8)

  for (let i = 0; i < 24; i += 1) {
    const customer = CUSTOMERS[i % CUSTOMERS.length]
    const contact = CONTACTS[i % CONTACTS.length]
    const category = CATEGORIES[i % CATEGORIES.length]
    const products = PRODUCTS[category]
    const product = products[Math.floor(i / CATEGORIES.length) % products.length]

    const qty = ((i * 7) % 40) + 3
    const unitPrice = [45, 88, 128, 320, 640, 980][i % 6]
    const amount = qty * unitPrice
    const discount = [0, 5, 10, 15][i % 4]
    const taxable = amount * (1 - discount / 100)
    const tax = Math.round(taxable * 0.06)
    const total = Math.round(taxable) + tax

    rows.push({
      id: `SO-2024-${String(i + 1).padStart(4, '0')}`,
      customer_name: customer.name,
      customer_code: customer.code,
      contact_name: contact.name,
      contact_phone: contact.phone,
      contact_email: contact.email,
      region: customer.region,
      category,
      product_name: product,
      sku: `${category === '软件' ? 'SW' : category === '服务' ? 'SV' : category === '硬件' ? 'HW' : 'CS'}-${String(1000 + i * 13).slice(0, 4)}`,
      qty,
      unit_price: unitPrice,
      amount,
      discount,
      tax,
      total,
      currency: CURRENCIES[i % CURRENCIES.length],
      channel: CHANNELS[i % CHANNELS.length],
      status: ORDER_STATUS[i % ORDER_STATUS.length],
      pay_status: PAY_STATUS[i % PAY_STATUS.length],
      pay_method: PAY_METHODS[i % PAY_METHODS.length],
      owner: customer.owner,
      order_time: baseTime + i * 86_400,
      delivery_time: baseTime + (i + 30) * 86_400,
      remark: i % 5 === 0 ? '客户要求分批发货' : '',
    })
  }

  return rows
}

export const COMPLEX_TABLE_ROWS: ComplexTableRow[] = buildRows()

/** 稳定行 id（受控选中态与刷新后保持一致）。 */
export const COMPLEX_TABLE_ROW_ID = (row: ComplexTableRow) => row.id

/** 汇总：按当前筛选结果累计。 */
export function summarizeComplexTable(rows: readonly ComplexTableRow[]) {
  return rows.reduce(
    (acc, row) => ({
      orders: acc.orders + 1,
      qty: acc.qty + row.qty,
      total: acc.total + row.total,
    }),
    { orders: 0, qty: 0, total: 0 },
  )
}
