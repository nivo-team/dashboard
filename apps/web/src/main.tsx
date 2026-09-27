import './api'
import './lib/i18n'
// 应用「自定义主题」：把偏好里的强调色 / 中性色写到根元素令牌上
import './lib/apply-appearance-theme'
import { RouterProvider } from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'
import { AppQueryClientProvider } from './components/app-query-client-provider'
import { getRouter } from './router'

// 统一从 router.tsx 创建实例，保证默认配置只有一处。
const router = getRouter()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    // AppQueryClientProvider 放在 RouterProvider 外层：
    // 路由切换不会重建缓存实例；缓存按 app 作用域分区（见 #/lib/query-client），
    // 切换应用时换成对应的 QueryClient，切回来仍命中该应用自己的缓存。
    <AppQueryClientProvider>
      <RouterProvider router={router} />
    </AppQueryClientProvider>,
  )
}
