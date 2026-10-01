import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    // 契约包（@admin/api-client）内也声明了 react-query 用于本地类型检查/生成，
    // dedupe 强制走本应用的同一份实例，避免出现两份 Query 库。
    dedupe: ['@tanstack/react-router', '@tanstack/react-query', 'react', 'react-dom'],
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
  ],
})

export default config
