/**
 * 业务错误：HTTP 200 但响应体 `code !== 0`。
 *
 * 由 `src/api/index.ts` 的响应拦截器统一抛出，便于：
 * - 调用方按失败处理（mutation 不会误关弹窗 / 误刷新）；
 * - React Query 侧据此**不做重试**（见 `query-client.ts` 的 retry 判定），
 *   业务错误重试多少次结果都一样，只会重复弹提示。
 */
export class ApiError extends Error {
  /** 后端业务码（非 0）。 */
  readonly code: number
  /** 原始响应体，便于排查（`extractApiErrorMessage` 也依赖它的 `message`）。 */
  readonly data?: unknown

  constructor(message: string, options: { code: number; data?: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code
    this.data = options.data
  }
}

/** 判定是否为业务错误（拦截器抛出）。 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * 从 ofetch / 后端响应里尽可能取到可读的错误信息。
 *
 * 后端统一返回 `{ code, message, result }`；ofetch 抛出的错误对象通常同时带：
 * - `data`：解析后的响应体（业务 message 在这里）；
 * - `message`：HTTP 层面的错误描述（如 `422 Unprocessable Entity`）。
 *
 * 因此优先取业务 message，其次取 HTTP message，都没有时才回落到调用方给的兜底文案
 * （兜底文案应当是已本地化的 i18n 文本）。
 */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: { message?: string } } | null)?.data
  if (data?.message) return data.message

  const message = (error as { message?: string } | null)?.message
  return message || fallback
}
