import type { PromptFacts, PromptNavEntry, PromptTask } from '@admin/ai-prompt'

/**
 * 把 HTTP 来的**不可信**请求体规范化成 `PromptFacts`。
 *
 * 与前端 store 的 `normalizeXxx` 同一条约定：**不信任输入**（可能来自旧版本前端、手写 curl、
 * 或另一个标签页的中间状态）。字段缺失 / 类型不对就落回安全默认值，**绝不把 `undefined`
 * 灌进提示词** —— 提示词里出现 `undefined` 比少一句话糟得多。
 *
 * 注意这里只做**形状**校验，不做业务校验（例如 appId 是否真实存在）：提示词服务是无状态的，
 * 它只负责把调用方给的事实套进规则；事实的真伪由调用方（前端）负责。
 */

export const PROMPT_MODES = ['ask', 'auto'] as const
export const PROMPT_SURFACES = ['panel', 'sphere'] as const

export const DEFAULT_OUTPUT_LANGUAGE_NAME = '简体中文'

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asNavEntries(value: unknown): PromptNavEntry[] {
  if (!Array.isArray(value)) return []
  const entries: PromptNavEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as { name?: unknown; path?: unknown; group?: unknown }
    if (typeof raw.name !== 'string') continue
    entries.push({
      name: raw.name,
      path: typeof raw.path === 'string' ? raw.path : '',
      group: typeof raw.group === 'string' ? raw.group : null,
    })
  }
  return entries
}

const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const

function asTasks(value: unknown): PromptTask[] | null {
  if (!Array.isArray(value)) return null
  const tasks: PromptTask[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as { id?: unknown; title?: unknown; status?: unknown }
    if (typeof raw.id !== 'string' || typeof raw.title !== 'string') continue
    const status = TASK_STATUSES.find((known) => known === raw.status) ?? 'pending'
    tasks.push({ id: raw.id, title: raw.title, status })
  }
  return tasks
}

export function normalizeFacts(raw: unknown): PromptFacts {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const mode = PROMPT_MODES.find((known) => known === body.mode) ?? 'ask'
  const surface = PROMPT_SURFACES.find((known) => known === body.surface) ?? 'panel'

  return {
    mode,
    surface,
    appName: asString(body.appName),
    /*
      appId 有「三态」语义，必须逐态区分，不能一律用 `typeof === 'string'`：
      - 字符串 → 在某个应用里；
      - `null` → 明确表示「不在任何应用里」（外壳页面），范围闸会走外壳分支；
      - 缺失 / 其它类型 → 同样按「不在应用里」处理（安全默认）。
    */
    appId: typeof body.appId === 'string' && body.appId ? body.appId : null,
    outputLanguageName: asString(
      body.outputLanguageName,
      DEFAULT_OUTPUT_LANGUAGE_NAME,
    ),
    pageContextText: asString(body.pageContextText),
    navEntries: asNavEntries(body.navEntries),
    shellNavNames: asStringArray(body.shellNavNames),
    activeTasks: asTasks(body.activeTasks),
  }
}
