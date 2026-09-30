import { useCallback } from 'react'
import { useTimezone } from '#/lib/format'

/**
 * 秒级 / 毫秒级时间戳统一格式化（随全局时区设置变化）。
 *
 * 用户模块的列表与详情都从原始时间戳自行格式化，不依赖接口提供展示字段。
 */
export function useFormatTimestamp() {
  const { formatDateTime } = useTimezone()

  return useCallback(
    (timestamp?: number) => {
      if (!timestamp) return '-'
      const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp
      return formatDateTime(ms)
    },
    [formatDateTime],
  )
}
