/**
 * 统一响应包装。
 *
 * 本模板沿用「HTTP 200 + 业务码」的约定：`code === 0` 表示成功，
 * 非 0 表示业务错误（前端 `src/api/index.ts` 的响应拦截器依赖这一点）。
 */
export function ok<T>(result: T, message = '') {
  return { code: 0, message, result }
}

export function fail(code: number, message: string) {
  return { code, message, result: null }
}

/** 未登录 / 凭据无效。 */
export const unauthorized = () => fail(401, '登录状态已失效，请重新登录')

/** 资源不存在。 */
export const notFound = (what = '资源') => fail(404, `${what}不存在`)
