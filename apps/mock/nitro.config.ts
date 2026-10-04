import { defineConfig } from 'nitro'

/**
 * Mock API（Nitro v3）。
 *
 * 这里同时是**接口实现**和**契约源头**：每个路由用 `defineRouteMeta` 声明
 * OpenAPI 元数据，Nitro 在构建时静态提取，生成 `/openapi.json`。
 * 前端项目从这个契约生成 SDK，因此接口改动只需改这一处。
 */
export default defineConfig({
  // v3 默认不扫描任何目录，必须显式指定服务端源码目录
  serverDir: './server',

  // 开发服务器监听所有网卡（0.0.0.0）而不是只监听 localhost，局域网内其它设备
  // 用 `http://<本机 IP>:3001` 就能连上（见 apps/web/.env.example 的「局域网访问」）。
  // 绑定地址与端口都放这里（`pnpm dev` 是裸的 `nitro dev`），
  // 命令行 `nitro dev --host/--port` 仍可临时覆盖。
  devServer: {
    hostname: '0.0.0.0',
    port: 3001,
  },

  experimental: {
    openAPI: true,
  },

  openAPI: {
    meta: {
      title: 'Nivo Admin Mock API',
      description:
        '开源后台模板自带的 Mock API。契约与实现同源，由各个路由的 defineRouteMeta 反向生成。',
      version: '1.0.0',
    },
    // 默认是 /_openapi.json（下划线前缀是 Nitro 内部约定），这里改成不带下划线的直观路径
    route: '/openapi.json',
    // 关键：OpenAPI 生成默认**只在 dev 模式**启用，生产构建里不会带上这个端点。
    // 设成 runtime 后，部署出去的服务也能拿到契约（前端换后端时正是从这里同步）。
    production: 'runtime',
  },
})
