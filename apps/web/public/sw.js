/**
 * Nivo Admin Service Worker
 *
 * 缓存版本号常量：改版或调整缓存策略需要淘汰旧缓存时，请递增此版本号（例如改为 nivo-admin-v2）。
 */
const CACHE_NAME = 'nivo-admin-v1'

/** 导航请求在缓存中的固定壳键名 */
const SHELL_CACHE_KEY = 'index.html'

/** 需要走 Stale-While-Revalidate 策略的静态资源 destination 类型 */
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font'])

self.addEventListener('install', (event) => {
  // 安装完成后立即跳过等待，进入激活阶段
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  // 激活时清理非当前版本的旧缓存，并立即接管所有客户端页面
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/**
 * 判断同源请求是否属于静态资源
 * @param {Request} request
 * @param {URL} url
 */
function isStaticAsset(request, url) {
  return STATIC_DESTINATIONS.has(request.destination) || url.pathname.startsWith('/assets/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // 只处理 GET 请求
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 跨域请求（如 3001 Mock API / 3002 AI 服务）直接放行，不拦截
  if (url.origin !== self.location.origin) return

  // 导航请求（request.mode === 'navigate'）：Network-First
  // 网络成功时克隆响应并以固定 key `index.html` 存入缓存；网络失败时回退到缓存的 `index.html`（再没有则放行报错）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(SHELL_CACHE_KEY, copy))
              .catch(() => {})
          }
          return response
        })
        .catch(async (error) => {
          const cache = await caches.open(CACHE_NAME)
          const cached = await cache.match(SHELL_CACHE_KEY)
          if (cached) return cached
          throw error
        }),
    )
    return
  }

  // 静态资源（script/style/image/font 或 /assets/ 路径）：Stale-While-Revalidate
  // 有缓存时先返回缓存并在后台更新；无缓存时走网络并回填缓存
  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request)
        const networkPromise = fetch(request).then((response) => {
          if (response.ok) {
            cache.put(request, response.clone()).catch(() => {})
          }
          return response
        })

        if (cached) {
          networkPromise.catch(() => {})
          return cached
        }

        return networkPromise
      }),
    )
  }

  // 其它同源 GET 请求：直通网络，不缓存
})
