#!/usr/bin/env node

/**
 * 从 `openapi.json` 生成**接口参数索引**（`src/endpoint-specs.gen.ts`）。
 *
 * 为什么需要它：后端 `GET /api` 返回的接口清单只有 `label / method / path`，
 * **没有参数信息**，于是 AI 只能猜参数 —— 真实踩过：它用 `query: { uid }` 去调
 * 一个要 `id` 的接口，或者在路径参数上写 query。
 *
 * 而 `openapi.json` 里有权威的参数定义（名字 / 位置 / 是否必填）。但它几百 KB，
 * 不能进 bundle —— 所以在这里**压成只含必要字段的索引**。
 * 调用方通过子路径 `@admin/api-client/endpoint-specs` **动态 import**，主 chunk 不受影响。
 *
 * 用法：pnpm -C packages/api-client gen:endpoint-specs
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 用脚本自身位置定位包目录：从仓库根或任意 cwd 调用结果都一致
const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')

const SOURCE = resolve(pkgDir, 'openapi.json')
const TARGET = resolve(pkgDir, 'src/endpoint-specs.gen.ts')

/** 说明文字截断：给模型看的一句话就够，整段描述会把索引撑大好几倍 */
const trim = (text, max = 80) => {
  if (typeof text !== 'string') return undefined
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return undefined
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

const spec = JSON.parse(readFileSync(SOURCE, 'utf8'))
const specs = {}
const METHODS = ['get', 'post', 'put', 'patch', 'delete']

for (const [routePath, operations] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(operations ?? {})) {
    if (!METHODS.includes(method) || !op || typeof op !== 'object') continue

    const params = []
    for (const p of op.parameters ?? []) {
      if (!p?.name || !p?.in) continue
      const description = trim(p.description)
      params.push({
        name: p.name,
        in: p.in,
        required: Boolean(p.required),
        ...(description ? { description } : {}),
      })
    }

    // requestBody 的必填字段也提出来：写接口最常错的就是这里
    const schema = op.requestBody?.content?.['application/json']?.schema
    for (const name of Array.isArray(schema?.required) ? schema.required : []) {
      params.push({ name, in: 'body', required: true })
    }

    const summary = trim(op.summary ?? op.description)
    specs[`${method.toUpperCase()} ${routePath}`] = {
      ...(summary ? { summary } : {}),
      ...(params.length ? { params } : {}),
    }
  }
}

const header = `/**
 * 接口参数索引 —— 由 \`scripts/gen-endpoint-specs.js\` 从 \`openapi.json\` 生成，**不要手改**。
 *
 * 后端 \`GET /api\` 的清单只有 label / method / path，没有参数；这里补上权威的
 * 「参数名 / 位置（path | query | body）/ 是否必填」，让 AI 不必猜。
 *
 * 键是 \`"METHOD /path"\`；只含 get / post / put / patch / delete。
 */
export interface EndpointParam {
  name: string
  in: 'path' | 'query' | 'body' | 'header' | 'cookie'
  required: boolean
  description?: string
}

export interface EndpointSpec {
  summary?: string
  params?: EndpointParam[]
}

export const ENDPOINT_SPECS: Record<string, EndpointSpec> = ${JSON.stringify(specs, null, 2)}
`

writeFileSync(TARGET, header)
console.log(`✅ 生成 ${Object.keys(specs).length} 条接口参数索引`)
console.log(
  `   ${TARGET.replace(`${pkgDir}/`, '')}  ${(statSync(TARGET).size / 1024).toFixed(1)} KB`,
)
