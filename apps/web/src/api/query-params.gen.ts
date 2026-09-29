/**
 * 本文件由 scripts/gen-query-params.js 自动生成，请勿手动编辑。
 * 数据源：openapi.json 中 GET /user 的 query 参数。
 * 重新生成：pnpm gen:query-params（或随 pnpm api 一并执行）
 */

/** 值控件类型：按参数类型自动渲染，无需操作符选择 */
export type QueryFilterControl =
  | 'text'
  | 'number'
  | 'number-range'
  | 'boolean'
  | 'enum'
  | 'array'

export interface QueryFilterField {
  /** 字段标识（区间字段为参数名前缀，如 country_code） */
  name: string
  /** 展示文案（当前为中文词典，非中文语言下暂不翻译） */
  label: string
  /** 值控件类型 */
  control: QueryFilterControl
  /** 对应的 query 参数名 */
  param: string
  /** 区间字段的上限参数名（仅 number-range） */
  paramTo?: string
  /** enum 候选值（仅 enum） */
  options?: string[]
  /** 数组元素类型（仅 array） */
  itemType?: 'string' | 'number'
}

/** 被排除的主查询参数：由搜索框 / 分页 / 排序 / 时间范围控件接管 */
export const PRIMARY_QUERY_PARAMS = [
  "kw",
  "page",
  "page_size",
  "field",
  "order",
  "time_field",
  "range_time"
] as const

/** GET /user 的可筛选字段目录 */
export const USER_FILTER_FIELDS: QueryFilterField[] = [
  {
    "name": "id",
    "label": "ID",
    "param": "id",
    "control": "number"
  },
  {
    "name": "nickname",
    "label": "昵称",
    "param": "nickname",
    "control": "text"
  },
  {
    "name": "email",
    "label": "邮箱",
    "param": "email",
    "control": "text"
  },
  {
    "name": "createtime",
    "label": "注册时间",
    "control": "number-range",
    "param": "createtime_min",
    "paramTo": "createtime_max"
  },
  {
    "name": "logintime",
    "label": "最后登录",
    "control": "number-range",
    "param": "logintime_min",
    "paramTo": "logintime_max"
  }
]
