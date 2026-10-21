/**
 * 注册 PWA Service Worker。
 *
 * 仅在生产构建（`import.meta.env.PROD`）、浏览器支持 Service Worker 且处于安全上下文
 * （HTTPS 或 localhost）时才注册；开发模式不注册，避免 Service Worker 缓存干扰开发期的
 * HMR 热更新与最新源码调试。
 */
export function registerServiceWorker(): void {
  if (
    !import.meta.env.PROD ||
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !window.isSecureContext
  ) {
    return
  }

  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        // 注册失败仅打印警告，不抛错、不影响应用启动
        console.warn('[PWA] Service Worker 注册失败：', error)
      })
    },
    { once: true },
  )
}
