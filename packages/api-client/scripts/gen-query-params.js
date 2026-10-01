#!/usr/bin/env node

/**
 * 从 openapi.json 生成「可筛选 query 参数目录」（`src/query-params.gen.ts`）。
 *
 * 规则：
 * 1. 只取指定接口的 query 参数（默认 GET /user）；
 * 2. 排除 primary 参数（由搜索框 / 分页 / 排序 / 时间范围控件接管）；
 * 3. 形如 xxx_min / xxx_max 的参数对合并为一个「区间」字段；
 * 4. 展示文案取内置中文词典（openapi 描述仅作兜底）。
 *
 * 用法：pnpm -C packages/api-client gen:query-params
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 用脚本自身位置定位包目录：从仓库根或任意 cwd 调用结果都一致
const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')

/** 主查询参数：不进入筛选器字段目录 */
const PRIMARY_PARAMS = [
  'kw',
  'page',
  'page_size',
  'field',
  'order',
  'time_field',
  'range_time',
]

/**
 * 字段展示文案（中文词典）。
 * 之所以不直接采用 openapi 的 description：其中多为说明性长句，
 * 且部分参数（如 country_code）完全没有描述。
 */
const LABELS = {
  id: 'ID',
  nickname: '昵称',
  email: '邮箱',
  createtime: '注册时间',
  logintime: '最后登录',
}

const ENDPOINT_METHOD = 'get'
const ENDPOINT_PATH = '/user'
const OUTPUT_PATH = 'src/query-params.gen.ts'

/** 取展示文案：词典 → openapi 描述首个分句 → 参数名 */
function labelFor(name, param) {
  if (LABELS[name]) return LABELS[name]
  const description = param?.description ?? param?.schema?.description
  if (description) return description.split(/[，,；;（(]/)[0].trim()
  return name
}

/** 由 openapi schema 推导值控件类型 */
function controlFor(schema) {
  if (schema.type === 'boolean') return { control: 'boolean' }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    // openapi 中 region 等参数的候选值存在重复项，这里去重
    return { control: 'enum', options: [...new Set(schema.enum)] }
  }
  if (schema.type === 'array') {
    const itemType = ['integer', 'number'].includes(schema.items?.type)
      ? 'number'
      : 'string'
    return { control: 'array', itemType }
  }
  if (schema.type === 'integer' || schema.type === 'number') return { control: 'number' }
  return { control: 'text' }
}

const specPath = resolve(pkgDir, 'openapi.json')
const spec = JSON.parse(readFileSync(specPath, 'utf8'))

// 契约路径可能带服务前缀（本模板的 Mock 就把接口挂在 /api 下），按后缀匹配更稳
const matchedPath = Object.keys(spec.paths ?? {}).find(
  (path) => path === ENDPOINT_PATH || path.endsWith(ENDPOINT_PATH),
)
const operation = matchedPath ? spec.paths[matchedPath]?.[ENDPOINT_METHOD] : undefined

if (!operation) {
  console.error(`[gen-query-params] 未在 openapi.json 中找到 ${ENDPOINT_METHOD.toUpperCase()} ${ENDPOINT_PATH}`)
  process.exit(1)
}

const queryParams = (operation.parameters ?? []).filter((item) => item.in === 'query')
const byName = new Map(queryParams.map((item) => [item.name, item]))
const excluded = new Set(PRIMARY_PARAMS)
const consumed = new Set()
const fields = []

// 预扫描区间参数对（xxx_min + xxx_max）。
// 必须先整体配对再生成：openapi 中 _max 排在 _min 之前，
// 边遍历边配对会把 _max 误当成一个独立的单值字段（与实际需求重复）。
const rangePairs = new Map()
const rangeMembers = new Set()
for (const param of queryParams) {
  const match = /^(.*)_min$/.exec(param.name)
  if (!match) continue
  const maxName = `${match[1]}_max`
  if (!byName.has(maxName)) continue
  if (excluded.has(param.name) || excluded.has(maxName)) continue
  rangePairs.set(param.name, maxName)
  rangeMembers.add(param.name)
  rangeMembers.add(maxName)
}

for (const param of queryParams) {
  if (excluded.has(param.name) || consumed.has(param.name)) continue

  // 区间字段以 _min 为锚点生成，配对的 _max 在此一并消费
  const maxName = rangePairs.get(param.name)
  if (maxName) {
    const base = param.name.replace(/_min$/, '')
    consumed.add(param.name)
    consumed.add(maxName)
    fields.push({
      name: base,
      label: labelFor(base, param),
      control: 'number-range',
      param: param.name,
      paramTo: maxName,
    })
    continue
  }

  // 区间对中的 _max：已由对应的 _min 处理，跳过
  if (rangeMembers.has(param.name)) continue

  consumed.add(param.name)
  fields.push({
    name: param.name,
    label: labelFor(param.name, param),
    param: param.name,
    ...controlFor(param.schema ?? {}),
  })
}

const banner = `/**
 * 本文件由 scripts/gen-query-params.js 自动生成，请勿手动编辑。
 * 数据源：openapi.json 中 ${ENDPOINT_METHOD.toUpperCase()} ${ENDPOINT_PATH} 的 query 参数。
 * 重新生成：pnpm -C packages/api-client gen:query-params（或随 pnpm api 一并执行）
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
export const PRIMARY_QUERY_PARAMS = ${JSON.stringify(PRIMARY_PARAMS, null, 2)} as const

/** ${ENDPOINT_METHOD.toUpperCase()} ${ENDPOINT_PATH} 的可筛选字段目录 */
export const USER_FILTER_FIELDS: QueryFilterField[] = ${JSON.stringify(fields, null, 2)}
`

writeFileSync(resolve(pkgDir, OUTPUT_PATH), banner, 'utf8')

console.log(
  `[gen-query-params] ${ENDPOINT_METHOD.toUpperCase()} ${ENDPOINT_PATH}：query 参数 ${queryParams.length} 个 → 排除 primary ${PRIMARY_PARAMS.length} 个 → 生成可筛选字段 ${fields.length} 个`,
)
console.log(`[gen-query-params] 已写入 ${OUTPUT_PATH}`)
