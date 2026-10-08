import { defineHandler } from 'nitro'
import { getRequestHeader, setResponseHeaders, setResponseStatus } from 'nitro/h3'

/**
 * 跨域支持。
 *
 * 前端 dev server 在 3000、Mock 在 3001，属于跨源请求；而登录等接口带
 * `Content-Type: application/json` 与 `Authorization` 头，浏览器会**先发 OPTIONS 预检** ——
 * 没有这里的响应头，请求在预检阶段就被拦掉（表现为 `net::ERR_FAILED`），
 * 根本走不到业务路由。
 *
 * `Allow-Origin` 回显请求来源而不是写死 `*`：这样将来若改成带 cookie 的
 * 凭据模式也不用再改；同时按规范带上 `Vary: Origin` 以免被缓存串味。
 */
export default defineHandler((event) => {
  const origin = getRequestHeader(event, 'origin')

  setResponseHeaders(event, {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    // 预检里出现的自定义头必须在这里列全，否则同样会被判为不允许
    'access-control-allow-headers': 'authorization,content-type,x-app-id,x-requested-with',
    'access-control-expose-headers': 'x-request-id',
    // 响应头只接受字符串（值本身仍是 86400 秒，语义不变）
    'access-control-max-age': '86400',
    vary: 'Origin',
  })

  // 预检请求直接结束，不进入业务路由（也就不会要求它带 body 或校验鉴权）
  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
