import type { QueryFilterField } from '#/api'
import { parseAsInteger, parseAsString } from 'nuqs'
import { defineFilterParsers } from '#/lib/list-query'
import {
  CATEGORIES,
  CHANNELS,
  CURRENCIES,
  ORDER_STATUS,
  PAY_METHODS,
  PAY_STATUS,
  REGIONS,
} from './data'

/**
 * 本页筛选参数在 URL 里的形状。
 *
 * 全部可选：筛选条件本来就是「用几个算几个」。声明成具体类型（而不是
 * `Record<string, unknown>`）是 `defineFilterParsers` 的要求 ——
 * 后者会让每个字段都退化成 `unknown`，解析器与字段类型对不上。
 */
export interface ComplexTableQueryParams {
  // 订单与客户
  id?: string
  customer_name?: string
  customer_code?: string
  contact_name?: string
  contact_phone?: string
  contact_email?: string
  region?: string
  // 商品
  category?: string
  product_name?: string
  sku?: string
  qty?: number
  // 金额
  unit_price_min?: number
  unit_price_max?: number
  amount_min?: number
  amount_max?: number
  discount_min?: number
  discount_max?: number
  tax_min?: number
  tax_max?: number
  total_min?: number
  total_max?: number
  currency?: string
  // 履约
  channel?: string
  status?: string
  pay_status?: string
  pay_method?: string
  owner?: string
  // 时间与备注
  order_time_min?: number
  order_time_max?: number
  delivery_time_min?: number
  delivery_time_max?: number
  remark?: string
}

/**
 * 复杂表格的**筛选字段目录**与 **URL 参数解析器** —— 25 个字段全部可筛选。
 *
 * 为什么要手写这份目录而不是像其它页那样用 `pnpm api` 生成的 `query-params.gen.ts`：
 * 这一页的数据是**前端本地构造**的（没有接口），生成产物里没有它的 query 参数。
 * 字段清单与 `columns.tsx` 的列、`data.ts` 的接口**同源** —— 改字段时三处一起改。
 *
 * 枚举字段的 `options` 直接引用 `data.ts` 导出的常量，避免两处各写一份候选值。
 */

/** 枚举字段的候选文案由 i18n 提供（`enum.<字段>.<值>`），这里只列值。 */
const toOptions = (values: readonly string[]) => [...values]

/** 全部 25 个可筛选字段（顺序与列一致）。 */
export const COMPLEX_TABLE_FILTER_FIELDS: QueryFilterField[] = [
  // ── 订单与客户（7）
  { name: 'id', label: '订单号', param: 'id', control: 'text' },
  { name: 'customer_name', label: '客户名称', param: 'customer_name', control: 'text' },
  { name: 'customer_code', label: '客户编号', param: 'customer_code', control: 'text' },
  { name: 'contact_name', label: '联系人', param: 'contact_name', control: 'text' },
  { name: 'contact_phone', label: '联系电话', param: 'contact_phone', control: 'text' },
  { name: 'contact_email', label: '联系邮箱', param: 'contact_email', control: 'text' },
  { name: 'region', label: '区域', param: 'region', control: 'enum', options: toOptions(REGIONS) },

  // ── 商品（4）
  {
    name: 'category',
    label: '商品分类',
    param: 'category',
    control: 'enum',
    options: toOptions(CATEGORIES),
  },
  { name: 'product_name', label: '商品名称', param: 'product_name', control: 'text' },
  { name: 'sku', label: 'SKU', param: 'sku', control: 'text' },
  { name: 'qty', label: '数量', param: 'qty', control: 'number' },

  // ── 金额（6）—— 用区间，单点值查询在真实场景里没什么意义
  {
    name: 'unit_price',
    label: '单价',
    control: 'number-range',
    param: 'unit_price_min',
    paramTo: 'unit_price_max',
  },
  {
    name: 'amount',
    label: '金额',
    control: 'number-range',
    param: 'amount_min',
    paramTo: 'amount_max',
  },
  {
    name: 'discount',
    label: '折扣（%）',
    control: 'number-range',
    param: 'discount_min',
    paramTo: 'discount_max',
  },
  { name: 'tax', label: '税额', control: 'number-range', param: 'tax_min', paramTo: 'tax_max' },
  {
    name: 'total',
    label: '合计',
    control: 'number-range',
    param: 'total_min',
    paramTo: 'total_max',
  },
  {
    name: 'currency',
    label: '币种',
    param: 'currency',
    control: 'enum',
    options: toOptions(CURRENCIES),
  },

  // ── 履约（5）
  {
    name: 'channel',
    label: '渠道',
    param: 'channel',
    control: 'enum',
    options: toOptions(CHANNELS),
  },
  {
    name: 'status',
    label: '订单状态',
    param: 'status',
    control: 'enum',
    options: toOptions(ORDER_STATUS),
  },
  {
    name: 'pay_status',
    label: '支付状态',
    param: 'pay_status',
    control: 'enum',
    options: toOptions(PAY_STATUS),
  },
  {
    name: 'pay_method',
    label: '支付方式',
    param: 'pay_method',
    control: 'enum',
    options: toOptions(PAY_METHODS),
  },
  { name: 'owner', label: '负责人', param: 'owner', control: 'text' },

  // ── 时间与备注（3）
  {
    name: 'order_time',
    label: '下单时间',
    control: 'number-range',
    param: 'order_time_min',
    paramTo: 'order_time_max',
  },
  {
    name: 'delivery_time',
    label: '交付时间',
    control: 'number-range',
    param: 'delivery_time_min',
    paramTo: 'delivery_time_max',
  },
  { name: 'remark', label: '备注', param: 'remark', control: 'text' },
]

/**
 * 每个筛选参数在 URL 里的解析器。
 *
 * 键必须与上面目录的 `param` / `paramTo` **逐一对应** ——
 * `defineFilterParsers` 会在编译期校验：多写或拼错的键会直接报类型错误。
 */
export const COMPLEX_TABLE_FILTER_PARSERS = defineFilterParsers<
  ComplexTableQueryParams
>()({
  // 订单与客户
  id: parseAsString,
  customer_name: parseAsString,
  customer_code: parseAsString,
  contact_name: parseAsString,
  contact_phone: parseAsString,
  contact_email: parseAsString,
  region: parseAsString,
  // 商品
  category: parseAsString,
  product_name: parseAsString,
  sku: parseAsString,
  qty: parseAsInteger,
  // 金额
  unit_price_min: parseAsInteger,
  unit_price_max: parseAsInteger,
  amount_min: parseAsInteger,
  amount_max: parseAsInteger,
  discount_min: parseAsInteger,
  discount_max: parseAsInteger,
  tax_min: parseAsInteger,
  tax_max: parseAsInteger,
  total_min: parseAsInteger,
  total_max: parseAsInteger,
  currency: parseAsString,
  // 履约
  channel: parseAsString,
  status: parseAsString,
  pay_status: parseAsString,
  pay_method: parseAsString,
  owner: parseAsString,
  // 时间与备注
  order_time_min: parseAsInteger,
  order_time_max: parseAsInteger,
  delivery_time_min: parseAsInteger,
  delivery_time_max: parseAsInteger,
  remark: parseAsString,
})
