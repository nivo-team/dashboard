import type { EndpointSpec } from '@admin/api-client/endpoint-specs'

/**
 * 查一个接口的**参数明细**（名字 / 位置 / 是否必填 / 说明）。
 *
 * ## 为什么需要它
 *
 * 后端 `GET /api` 返回的接口清单只有 `label / method / path`，**没有参数**。
 * 于是模型只能猜 —— 真实踩过：它用 `query: { uid }` 去调一个要 `id` 的接口，
 * 后端回「Id为必填字段」。
 *
 * 权威定义在 `openapi.json` 里，但那几百 KB 不能进 bundle，所以由
 * `scripts/gen-endpoint-specs.js` 压成一份精简索引，这里**按需懒加载**它
 * （首次调用时才下载，之后走模块缓存）。
 *
 * ## 路径前缀在这里归一化
 *
 * 同一份 openapi 里路径风格不统一：**450 条不带 `/api`、18 条带**
 * （`/user/info` 与 `/api/sys/user/{uid}` 并存）。模型很容易写错前缀，所以两种
 * 写法都查得到 —— 先按原样查，再试「去掉 `/api`」「加上 `/api`」两个变体。
 */

type SpecTable = Record<string, EndpointSpec>

let table: SpecTable | null = null
let loading: Promise<SpecTable> | null = null

/** 懒加载索引：只在第一次真的要查参数时下载，且并发调用共享同一次加载。 */
async function loadTable(): Promise<SpecTable> {
  if (table) return table
  loading ??= import('@admin/api-client/endpoint-specs').then((mod) => {
    table = mod.ENDPOINT_SPECS
    return table
  })
  return loading
}

/** 把一个路径的三种可能写法都列出来（原样 / 去 `/api` / 加 `/api`）。 */
function pathVariants(path: string): string[] {
  const variants = [path]
  if (path.startsWith('/api/')) variants.push(path.slice(4))
  else variants.push(`/api${path.startsWith('/') ? path : `/${path}`}`)
  return variants
}

export async function findEndpointSpec(
  method: string,
  path: string,
): Promise<EndpointSpec | undefined> {
  const specs = await loadTable()
  const upper = method.toUpperCase()
  for (const variant of pathVariants(path)) {
    const hit = specs[`${upper} ${variant}`]
    if (hit) return hit
  }
  return undefined
}

/**
 * 把参数明细压成一行给模型看的说明。
 *
 * 形如 `id（query，必填，用户 ID）` —— 位置与必填是最关键的两项：
 * 前者决定写在 URL 里还是 query 里，后者决定「不传会不会被拒」。
 */
export function describeEndpointParams(spec: EndpointSpec | undefined): string | undefined {
  if (!spec?.params?.length) return undefined
  return spec.params
    .map((param) => {
      const parts = [param.in, param.required ? '必填' : '可选']
      if (param.description) parts.push(param.description)
      return `${param.name}（${parts.join('，')}）`
    })
    .join('；')
}
