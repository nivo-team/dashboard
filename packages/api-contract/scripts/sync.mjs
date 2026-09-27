#!/usr/bin/env node
/**
 * 契约同步：把 `openapi.json` 从「当前配置的来源」重新拉取一遍。
 *
 * 这是整个模板「换后端」的唯一入口。来源支持四种：
 *
 * | source   | 含义                                   | 需要的配置            |
 * | -------- | -------------------------------------- | --------------------- |
 * | `mock`   | 从本地 Nitro Mock 反向生成的契约拉取   | `mock.url`            |
 * | `url`    | 从任意远端 OpenAPI 地址拉取            | `url`                 |
 * | `file`   | 用仓库内（或任意路径）已有的契约文件   | `file`                |
 * | `apifox` | 走 Apifox CLI 导出                     | `apifox.projectId`    |
 *
 * 环境变量可临时覆盖配置（CI 里常用）：
 *   API_SPEC_SOURCE / API_SPEC_URL / API_SPEC_FILE / APIFOX_PROJECT_ID
 *
 * 用法：node scripts/sync.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const configPath = resolve(pkgDir, 'contract.config.json')
const targetPath = resolve(pkgDir, 'openapi.json')
const apifoxScript = resolve(here, 'pull-apifox.js')

const config = JSON.parse(readFileSync(configPath, 'utf8'))

const source = process.env.API_SPEC_SOURCE || config.source
const excludePrefixes = config.filter?.excludePrefixes ?? []
const excludeExact = config.filter?.excludeExact ?? []

function fail(message) {
  console.error(`\n[contract] ${message}\n`)
  process.exit(1)
}

/** 按来源取出原始契约对象。 */
async function loadSpec() {
  if (source === 'mock' || source === 'url') {
    const url = process.env.API_SPEC_URL || (source === 'mock' ? config.mock?.url : config.url)
    if (!url) fail(`来源为 ${source} 但没有配置地址（contract.config.json 或 API_SPEC_URL）`)

    let res
    try {
      res = await fetch(url)
    } catch (error) {
      fail(
        `无法访问 ${url}：${error.message}\n` +
          (source === 'mock' ? '  提示：本地 Mock 是否已启动？先跑 `pnpm mock`。' : ''),
      )
    }
    if (!res.ok) fail(`拉取 ${url} 失败：HTTP ${res.status}`)
    return res.json()
  }

  if (source === 'file') {
    const file = process.env.API_SPEC_FILE || config.file
    if (!file) fail('来源为 file 但没有配置路径（contract.config.json 或 API_SPEC_FILE）')
    const abs = resolve(pkgDir, file)
    if (!existsSync(abs)) fail(`契约文件不存在：${abs}`)
    return JSON.parse(readFileSync(abs, 'utf8'))
  }

  if (source === 'apifox') {
    const projectId = process.env.APIFOX_PROJECT_ID || config.apifox?.projectId
    if (!projectId) fail('来源为 apifox 但没有配置 projectId')
    if (!existsSync(apifoxScript)) fail(`缺少 Apifox 拉取脚本：${apifoxScript}`)

    console.log(`[contract] 通过 Apifox CLI 拉取项目 ${projectId}…`)
    execFileSync(process.execPath, [apifoxScript, projectId, targetPath], { stdio: 'inherit' })
    return JSON.parse(readFileSync(targetPath, 'utf8'))
  }

  fail(`未知的 source：${source}（可选：mock / url / file / apifox）`)
}

/**
 * 排除服务框架自带的路由。
 *
 * 业务接口本身不带统一前缀（契约里就是 `/user`、`/login` 这种干净路径），
 * 所以这里用**排除**而不是白名单：只滤掉 Nitro 自己的 `/_nitro/*`、
 * `/openapi.json` 与内置的 API 文档页。
 */
function filterPaths(spec) {
  if (excludePrefixes.length === 0 && excludeExact.length === 0) return spec
  const kept = {}
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    // 精确排除用于 "/" 这类特殊路径：它没法当前缀用（所有路径都以它开头）
    if (excludeExact.includes(path)) continue
    if (excludePrefixes.some((prefix) => path.startsWith(prefix))) continue
    kept[path] = ops
  }
  return { ...spec, paths: kept }
}

const spec = filterPaths(await loadSpec())

const pathCount = Object.keys(spec.paths ?? {}).length
const schemaCount = Object.keys(spec.components?.schemas ?? {}).length
if (pathCount === 0) fail('同步结果里没有任何业务路径，请检查来源地址与 filter 配置')

writeFileSync(targetPath, `${JSON.stringify(spec, null, 2)}\n`)

console.log(
  `[contract] 已从「${source}」同步契约 → packages/api-contract/openapi.json\n` +
    `           路径 ${pathCount} 个，schema ${schemaCount} 个，OpenAPI ${spec.openapi}`,
)
