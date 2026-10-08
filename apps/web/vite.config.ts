import { defineConfig, loadEnv, lazyPlugins } from 'vite-plus'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // 开发服务器监听所有网卡（0.0.0.0），而不是只监听 localhost —— 局域网内其它设备
    // （手机、同事机器、Tailscale 节点）可以直接打开 `http://<本机 IP>:3000`。
    // 端口仍在 package.json 的 `dev` 脚本里（3000），这里只管绑定地址。
    //
    // 与后端地址的关系：页面从哪个地址打开，浏览器就用**那个地址**去请求接口，
    // 所以局域网访问时 `VITE_API_BASE_URL` / `VITE_AI_SERVICE_BASE_URL` 也得指向
    // 同一台机器的局域网地址（见 `.env.example` 的「局域网访问」一节）。
    //
    // 用**主机名**（例如 Tailscale MagicDNS 名）访问时，还要把它加进
    // `server.allowedHosts` —— Vite 默认只放行 localhost 与 IP，其它 Host 头会被 403。
    server: {
      host: true,
    },
    resolve: {
      tsconfigPaths: true,
      // 契约包（@admin/api-client）内也声明了 react-query 用于本地类型检查/生成，
      // dedupe 强制走本应用的同一份实例，避免出现两份 Query 库。
      dedupe: ['@tanstack/react-router', '@tanstack/react-query', 'react', 'react-dom'],
    },
    plugins: lazyPlugins(() => [
      tailwindcss(),
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      viteReact(),
      {
        name: 'brand-html-transform',
        transformIndexHtml(html) {
          const brandName = env.VITE_APP_NAME || 'Nivo Admin'
          return html.replace(/<title>.*?<\/title>/, `<title>${brandName}</title>`)
        },
      },
    ]),
  }
})
