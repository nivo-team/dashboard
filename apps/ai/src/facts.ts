import type {
  PromptFacts,
  PromptNavEntry,
  PromptStage,
  PromptTask,
} from '@admin/ai-prompt'

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
export const PROMPT_STAGES = ['router', 'execution'] as const

export const DEFAULT_OUTPUT_LANGUAGE_NAME = '简体中文'

/**
 * 请求体里的阶段字段 → `PromptStage`。
 *
 * **默认 `execution`**：老前端（或手写 curl）不带这个字段时，行为与两阶段改造之前完全一致
 * —— 这是升级期的安全默认，不要改成 `router`（那会让一次普通请求只拿到 Router 层，
 * 模型看不到操作规约）。
 */
export function resolvePromptStage(value: unknown): PromptStage {
  return PROMPT_STAGES.find((known) => known === value) ?? 'execution'
}

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
    /*
      两阶段改造新增的两个事实字段：
      - `pageSummaryText`：页面摘要，Router 阶段代替完整页面上下文；
      - `toolCatalogText`：工具目录（前端按当前权限生成），Router 阶段拼进 system。
      两者缺失时对应层整段不出现（`build` 返回 null），不会留下空标题。
    */
    pageSummaryText: asString(body.pageSummaryText),
    toolCatalogText: asString(body.toolCatalogText),
    navEntries: asNavEntries(body.navEntries),
    shellNavNames: asStringArray(body.shellNavNames),
    activeTasks: asTasks(body.activeTasks),
  }
}
