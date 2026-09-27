/** 极简 className 合并工具（等价于 clsx，避免额外依赖）。 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = []

  const walk = (value: ClassValue) => {
    if (!value) return
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value))
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    for (const [key, enabled] of Object.entries(value)) {
      if (enabled) out.push(key)
    }
  }

  inputs.forEach(walk)
  return out.join(' ')
}
