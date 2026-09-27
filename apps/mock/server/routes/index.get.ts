import { defineHandler } from 'nitro'

/**
 * 服务状态页。
 *
 * 部署后直接打开根路径就能确认服务活着，并知道该把前端指向哪里。
 * 内容刻意保持静态 —— 不要在这里写死接口数量之类的数字，否则会随迭代过期。
 */
const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
undefined
<style>
  body { font: 14px/1.75 ui-sans-serif, system-ui, -apple-system, sans-serif;
         max-width: 680px; margin: 72px auto; padding: 0 24px; color: #18181b; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  p.lead { color: #52525b; margin: 0 0 28px; }
  code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  ul { padding-left: 20px; margin: 0; }
  li { margin: 6px 0; }
  a { color: #0b6f4b; }
  .muted { color: #71717a; font-size: 13px; margin-top: 28px; }
</style>
</head>
<body>
  <h1>Mock API 正在运行</h1>
  <p class="lead">开源后台模板自带的假数据服务，不读取也不修改任何真实数据。</p>
  <ul>
    <li>OpenAPI 契约：<a href="/openapi.json"><code>/openapi.json</code></a></li>
    <li>健康检查：<code>/health</code></li>
    <li>登录：<b>任意非空账号 + 任意非空密码</b></li>
    <li>数据为内存态 —— 写操作会立即生效，重启即回到初始数据</li>
  </ul>
  <p class="muted">前端指向本服务即可：<code>VITE_API_BASE_URL=http://localhost:3001</code></p>
</body>
</html>`

export default defineHandler(
  () =>
    new Response(PAGE, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
)
