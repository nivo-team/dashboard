#!/usr/bin/env node
/**
 * 发布构建：把**构建环境里的 `DESKTOP_URL`** 编进二进制。
 *
 * 为什么要有这个脚本（而不是把 `go build` 直接写进 package.json）：
 *   - 地址只认环境变量，缺了要**明确报错**，不能安静地产出一个连不上任何地方的包；
 *   - `-ldflags "-X …"` 里的变量名与包路径写在这里一处，改包名不用满仓库找；
 *   - Windows 下 `package.json` 里写不了 `${VAR:?}` 这种 shell 展开，脚本哪儿都能跑。
 *
 * 用法：
 *   DESKTOP_URL=https://admin.example.com pnpm desktop:build
 *   本地开发想验证发布路径：DESKTOP_URL=http://localhost:3000 pnpm desktop:build
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 发布版固定地址的落点：internal/shell 包的 DefaultURL 变量。 */
const LDVAR = 'github.com/nivo-team/dashboard/apps/desktop/internal/shell.DefaultURL'

const url = (process.env.DESKTOP_URL ?? '').trim()

if (!url) {
  console.error(
    [
      '[desktop:build] 缺少 DESKTOP_URL —— 发布构建不预置地址，必须显式给一个：',
      '',
      '  DESKTOP_URL=https://admin.example.com pnpm desktop:build',
      '',
      '（CI 里把它配成变量/secret 即可；本地想打 dev 版用 `pnpm desktop`，不用这个脚本。）',
    ].join('\n'),
  )
  process.exit(1)
}

if (!/^https?:\/\//.test(url)) {
  console.error(`[desktop:build] DESKTOP_URL 必须是 http/https 地址，收到：${url}`)
  process.exit(1)
}

if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
  console.warn(`[desktop:build] ⚠️ 正在把本机地址打进发布产物：${url}`)
}

const result = spawnSync(
  'go',
  ['build', '-tags', 'release', '-ldflags', `-X ${LDVAR}=${url}`, '-o', 'dist/nivo-desktop', '.'],
  { cwd: appDir, stdio: 'inherit' },
)

if (result.error) {
  console.error(`[desktop:build] 起不来 go：${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
