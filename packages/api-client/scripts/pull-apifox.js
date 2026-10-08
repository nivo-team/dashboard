#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_PROJECT_ID = ''
const projectId = process.env.APIFOX_PROJECT_ID || process.argv[2] || DEFAULT_PROJECT_ID
const outputPath = resolve(process.cwd(), process.argv[3] || 'openapi.json')

console.log(`[Apifox] 准备拉取项目 ${projectId} 的 OpenAPI 规范...`)

// 检查是否存在 apifox 命令
const checkCli = spawnSync('which', ['apifox'], { encoding: 'utf8' })
if (checkCli.status !== 0) {
  console.error('[Apifox] 未在环境中检测到 apifox CLI。')
  console.error('请确保已安装 Apifox CLI 并配置 PATH，或通过官方安装方式：')
  console.error('  https://apifox.com/help/developer/cli/')
  process.exit(1)
}

try {
  const args = ['export', '--project', projectId, '--format', 'openapi', '--output', outputPath]

  // 如果传递了 APIFOX_ACCESS_TOKEN 环境变量，则自动附带
  if (process.env.APIFOX_ACCESS_TOKEN) {
    args.push('--access-token', process.env.APIFOX_ACCESS_TOKEN)
  }

  // 如果传递了分支环境变量
  if (process.env.APIFOX_BRANCH) {
    args.push('--branch', process.env.APIFOX_BRANCH)
  }

  execFileSync('apifox', args, {
    stdio: 'inherit',
    encoding: 'utf8',
  })

  if (existsSync(outputPath)) {
    console.log(`[Apifox] 导出成功！文件已保存至: ${outputPath}`)
  } else {
    throw new Error(`导出文件未找到: ${outputPath}`)
  }
} catch (error) {
  console.error('[Apifox] 导出 OpenAPI 失败:', error.message)
  process.exit(1)
}
