/**
 * 翻译执行体：把一批「键 → 中文」交给模型，拿回「键 → 译文」。
 *
 * ## 怎么调模型
 *
 * **程序化直调** —— 用 `fetch` 打 OpenAI 兼容的 `/chat/completions`，
 * 不经任何 agent / CLI。翻译是独立用途：**模型可以单独指定**，
 * 也可以直接**沿用 AI 开发流水线（agent）那套 provider**。
 *
 * ## 配置从哪来（三层回退，逐字段独立判定）
 *
 * | 优先级 | 来源 | 放什么 |
 * | --- | --- | --- |
 * | 1 | `I18N_*` 环境变量 | 翻译专属覆盖（CI Secret / Variable、本地临时改） |
 * | 2 | `i18n.config.json` 的 `provider` 段 | 可进 git 的非敏感默认（地址、模型名） |
 * | 3 | `DSH_GATEWAY_*` 环境变量 | **与 agent 共用**的那套（1、2 都没配时生效） |
 *
 * **逐字段回退**是重点：只覆盖想改的那一项即可 —— 例如只设
 * `I18N_GATEWAY_MODEL` 就能让翻译换模型，而地址与密钥继续共用 agent 的；
 * 反之只设 `I18N_GATEWAY_BASE_URL` 也能单独指向另一个网关。两者互不牵连。
 *
 * `i18n.config.json` 里能写这些（**密钥别写这里，它要进仓库**）：
 *
 * ```jsonc
 * {
 *   "provider": {
 *     "baseUrl": "https://gateway.ai.cloudflare.com/v1/<acct>/<gw>/openai",
 *     "model": "deepseek/deepseek-chat",
 *     "authMode": "provider-native",   // 留空按 baseUrl 推断
 *     "gatewayId": "",                 // 可选，cf-aig-gateway-id
 *     "timeoutMs": 120000
 *   }
 * }
 * ```
 *
 * 密钥**只走环境变量**（绝不进 git）：
 *
 * | 变量 | 用途 | 缺失时回退 |
 * | --- | --- | --- |
 * | `I18N_GATEWAY_KEY` | 主密钥（形态见下表） | `DSH_GATEWAY_KEY` |
 * | `I18N_PROVIDER_KEY` | 可选；provider-native 且**不用 BYOK** 时的厂商 key | —— |
 *
 * ## 三种鉴权形态
 *
 * 与 `apps/ai/src/model-config.ts` 同一套语义 —— 同一个 AI Gateway，别两处各说各话：
 *
 * | authMode | baseUrl 形态 | 密钥发到哪个头 |
 * | --- | --- | --- |
 * | `provider-native` | `gateway.ai.cloudflare.com/v1/<acct>/<gw>/<provider>` | `cf-aig-authorization` |
 * | `rest-api` | `api.cloudflare.com/client/v4/accounts/<acct>/ai/v1` | `Authorization` |
 * | `direct` | 厂商原生 / 自建网关（不经 CF 网关） | `Authorization` |
 *
 * `authMode` 留空时按 `baseUrl` 自动推断（见 `resolveAuthMode`），
 * 所以共用 agent 的地址时通常什么都不用配。
 *
 * ## 为什么不让 agent 自己改文件
 *
 * 翻译是「纯函数」任务：给一段中文、返回一段目标语言。让 agent 去改文件会
 * 带来范围蔓延、格式破坏、键增删等风险，而且每轮会话成本高得多。
 * 这里只让模型产出 JSON，写盘由 `translate.mjs` 全权负责。
 *
 * ## 无凭据时的行为
 *
 * 直接抛错 —— **绝不生成假译文**。把中文原样写进目标语言文件看起来「翻译成功」，
 * 实际上会让语言文件里混进中文，比缺翻译更糟（缺翻译至少还能回落）。
 */
import { loadConfig } from './config.mjs'

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_API = 'openai-completions'
const CHAT_COMPLETIONS_PATH = '/chat/completions'

/** 与 `apps/ai/src/model-config.ts` 的 `UpstreamAuthMode` 同名同义。 */
export const AUTH_MODES = ['provider-native', 'rest-api', 'direct']

/**
 * 占位符识别：**GitHub 不允许 Variable 为空值**（`Variable value cannot be empty`），
 * 所以预置仓库配置时只能填个占位符让，人再改。
 *
 * 把 `<FILL_ME>` 这类**整体被尖括号包裹**的值当作「未配置」—— 否则占位符会被
 * 当成真配置：轻则让翻译指向一个无效地址，重则悄悄跳过「回退到共用 DSH_*」这一步。
 * 只认整体包裹，所以 URL 里的 `<account_id>` 段（前面还有内容）不受影响。
 */
export function isPlaceholder(value) {
  return /^<.*>$/.test(String(value ?? '').trim())
}

/** 值是否「有内容且不是占位符」—— 回退判定的统一口径。 */
function isSet(value) {
  const raw = String(value ?? '').trim()
  return Boolean(raw) && !isPlaceholder(raw)
}

/** OpenAI 兼容的对话端点路径 —— 三种形态的 base 都能拼它。 */
export function resolveChatEndpoint(base) {
  const normalized = String(base ?? '').trim().replace(/\/+$/, '')
  if (!normalized) return ''
  // 从控制台复制的常常是完整端点，别拼成 `…/chat/completions/chat/completions`
  if (normalized.endsWith(CHAT_COMPLETIONS_PATH)) return normalized
  return `${normalized}${CHAT_COMPLETIONS_PATH}`
}

/**
 * 解析鉴权形态：显式配置优先，否则按 baseUrl 推断。
 *
 * @returns {{ mode: string, error?: string }} 显式值非法时返回 error（不静默回退）
 */
export function resolveAuthMode(explicit, baseUrl) {
  const raw = String(explicit ?? '').trim().toLowerCase()
  if (raw) {
    if (AUTH_MODES.includes(raw)) return { mode: raw }
    return {
      mode: '',
      error: `authMode 只能是 ${AUTH_MODES.join(' / ')}，收到 \`${explicit}\``,
    }
  }

  const url = String(baseUrl ?? '').toLowerCase()
  if (url.includes('gateway.ai.cloudflare.com')) return { mode: 'provider-native' }
  if (url.includes('api.cloudflare.com')) return { mode: 'rest-api' }
  return { mode: 'direct' }
}

/** 按鉴权形态组装请求头（**返回值含密钥本身，只用于出站，不要打印**）。 */
function buildAuthHeaders({ mode, key, providerKey, gatewayId }) {
  const headers = {}

  if (mode === 'provider-native') {
    /*
      provider-native：Cloudflare 令牌放 cf-aig-authorization。
      厂商 key 只在**不用 BYOK** 时才发 —— 网关在厂商授权头缺失时才注入存好的 key，
      你若继续发（哪怕是占位符），它会把你的值透传，反而导致厂商鉴权失败。
    */
    if (key) headers['cf-aig-authorization'] = `Bearer ${key}`
    if (providerKey) headers.Authorization = `Bearer ${providerKey}`
    if (gatewayId) headers['cf-aig-gateway-id'] = gatewayId
  } else if (mode === 'rest-api') {
    // rest-api：只用 Authorization，网关标识另走 cf-aig-gateway-id
    headers.Authorization = `Bearer ${key}`
    if (gatewayId) headers['cf-aig-gateway-id'] = gatewayId
  } else {
    // direct：直连厂商 / 自建网关，key 就是那一处的凭据
    headers.Authorization = `Bearer ${providerKey || key}`
  }

  return headers
}

/**
 * 三层回退取值：`I18N_*` 环境变量 > `i18n.config.json` > 共用的 `DSH_GATEWAY_*`。
 *
 * @returns {{ value: string, from: 'i18n'|'config'|'shared'|'' }} 空串表示三层都没有
 */
function pickField(env, { envName, configValue, sharedEnvName }) {
  const fromEnv = env?.[envName]
  if (isSet(fromEnv)) return { value: String(fromEnv).trim(), from: 'i18n' }
  if (isSet(configValue)) return { value: String(configValue).trim(), from: 'config' }
  const fromShared = sharedEnvName ? env?.[sharedEnvName] : undefined
  if (isSet(fromShared)) return { value: String(fromShared).trim(), from: 'shared' }
  return { value: '', from: '' }
}

/**
 * 密钥取值：**只认环境变量**（`i18n.config.json` 会进仓库，不该出现密钥）。
 * 同样逐字段回退到共用的 `DSH_GATEWAY_*`。
 */
function pickSecret(env, envName, sharedEnvName) {
  const fromEnv = env?.[envName]
  if (isSet(fromEnv)) return { value: String(fromEnv).trim(), from: 'i18n' }
  const fromShared = sharedEnvName ? env?.[sharedEnvName] : undefined
  if (isSet(fromShared)) return { value: String(fromShared).trim(), from: 'shared' }
  return { value: '', from: '' }
}

/**
 * 读取 provider 配置（三层回退，逐字段独立）。
 *
 * @param {Record<string,string|undefined>} env
 * @param {object} i18nConfig `i18n.config.json` 的内容
 */
export function readProviderConfig(env = process.env, i18nConfig = loadConfig()) {
  const section = i18nConfig?.provider ?? {}

  const baseUrl = pickField(env, {
    envName: 'I18N_GATEWAY_BASE_URL',
    configValue: section.baseUrl,
    sharedEnvName: 'DSH_GATEWAY_BASE_URL',
  })
  const model = pickField(env, {
    envName: 'I18N_GATEWAY_MODEL',
    configValue: section.model,
    sharedEnvName: 'DSH_GATEWAY_MODEL',
  })
  const api = pickField(env, {
    envName: 'I18N_GATEWAY_API',
    configValue: section.api,
    sharedEnvName: 'DSH_GATEWAY_API',
  })
  const gatewayId = pickField(env, {
    envName: 'I18N_GATEWAY_ID',
    configValue: section.gatewayId,
  })
  // authMode 不回退到 DSH —— 那套没有这个概念，共用地址时按 baseUrl 推断更准
  const authModeRaw = pickField(env, {
    envName: 'I18N_GATEWAY_AUTH_MODE',
    configValue: section.authMode,
  })
  const timeoutField = pickField(env, {
    envName: 'I18N_TRANSLATE_TIMEOUT_MS',
    configValue: section.timeoutMs,
  })

  const key = pickSecret(env, 'I18N_GATEWAY_KEY', 'DSH_GATEWAY_KEY')
  const providerKey = pickSecret(env, 'I18N_PROVIDER_KEY')

  const { mode: authMode, error: authError } = resolveAuthMode(
    authModeRaw.value,
    baseUrl.value,
  )

  /*
    缺什么取决于鉴权形态：
    - rest-api / direct：没有密钥就打不出去；
    - provider-native：网关未开 Authenticated Gateway 时本就不需要令牌
      （BYOK 场景下厂商 key 也由网关注入），所以密钥可选。
  */
  const missing = []
  if (!baseUrl.value) {
    missing.push('baseUrl（I18N_GATEWAY_BASE_URL / i18n.config.json / DSH_GATEWAY_BASE_URL）')
  }
  if (!model.value) {
    missing.push('model（I18N_GATEWAY_MODEL / i18n.config.json / DSH_GATEWAY_MODEL）')
  }
  if (authMode !== 'provider-native' && !key.value && !providerKey.value) {
    missing.push('密钥（I18N_GATEWAY_KEY 或 DSH_GATEWAY_KEY）')
  }
  if (authError) missing.push(authError)

  // 占位符（<FILL_ME> 之类）与真值分开报 —— 否则人会以为「配置好了」
  const placeholders = []
  const note = (name, raw) => {
    if (isPlaceholder(raw)) placeholders.push(name)
  }
  note('I18N_GATEWAY_BASE_URL', env?.I18N_GATEWAY_BASE_URL)
  note('I18N_GATEWAY_MODEL', env?.I18N_GATEWAY_MODEL)
  note('I18N_GATEWAY_API', env?.I18N_GATEWAY_API)
  note('I18N_GATEWAY_ID', env?.I18N_GATEWAY_ID)
  note('I18N_GATEWAY_AUTH_MODE', env?.I18N_GATEWAY_AUTH_MODE)
  note('DSH_GATEWAY_BASE_URL', env?.DSH_GATEWAY_BASE_URL)
  note('DSH_GATEWAY_MODEL', env?.DSH_GATEWAY_MODEL)
  note('DSH_GATEWAY_API', env?.DSH_GATEWAY_API)

  return {
    baseUrl: baseUrl.value,
    key: key.value,
    providerKey: providerKey.value,
    model: model.value,
    gatewayId: gatewayId.value,
    authMode,
    api: (api.value || DEFAULT_API).toLowerCase(),
    timeoutMs: Number(timeoutField.value) || DEFAULT_TIMEOUT_MS,
    missing,
    /** 仍是占位符（`<FILL_ME>` 之类）的变量名 —— 只是提醒，不阻塞。 */
    placeholders,
    /** 每个字段最终来自哪一层（'i18n' / 'config' / 'shared'），供排查与报告。 */
    sources: {
      baseUrl: baseUrl.from,
      model: model.from,
      api: api.from,
      gatewayId: gatewayId.from,
      authMode: authModeRaw.from || 'inferred',
      key: key.from,
      providerKey: providerKey.from,
      timeoutMs: timeoutField.from,
    },
  }
}

/**
 * 给日志/报告用的可打印摘要 —— **不含任何密钥**，只有「发不发」的布尔标记。
 *
 * 为什么要它：地址填错（少 `/v1`、带 `/ai/run`、端点重复拼接）的表现只是一个
 * 难懂的 404；而「模型到底用的是独立的还是共用的」光看环境变量也容易糊涂。
 * 把解析结果直接摆出来，一眼能看出是什么、来自哪一层。
 */
export function describeProvider(config, { mask = true } = {}) {
  const endpoint = resolveChatEndpoint(config.baseUrl)
  const maskUrl = (url) =>
    mask ? String(url).replace(/[0-9a-f]{32}/gi, '<account_id>') : String(url)

  return {
    endpoint: maskUrl(endpoint) || '(未配置)',
    model: config.model || '(未配置)',
    authMode: config.authMode || '(未解析)',
    gatewayId: config.gatewayId || '(默认)',
    sendsGatewayKey: Boolean(config.key),
    sendsProviderKey: Boolean(config.providerKey),
    timeoutMs: config.timeoutMs,
    sources: config.sources,
  }
}

/** 语言码 → 给模型看的人类可读名字（提示词里用，比 `en-US` 好懂）。 */
export const LOCALE_NAMES = {
  'zh-CN': 'Simplified Chinese (简体中文)',
  'en-US': 'English (US)',
  'ja-JP': 'Japanese (日本語)',
  'ar-SA': 'Arabic (العربية, Saudi Arabia)',
  'hi-IN': 'Hindi (हिन्दी)',
  'es-ES': 'Spanish (Español)',
  'tr-TR': 'Turkish (Türkçe)',
}

/**
 * 组装提示词。
 *
 * 输入是「键 → 原文」的扁平 JSON（由 `diffModule` 过滤掉已翻译的键之后）
 * —— 只给模型**待翻译的增量**，给出的键与顺序就是期望返回的形状。
 *
 * @param {object} options
 * @param {string} options.sourceLocale
 * @param {string} options.targetLocale
 * @param {string} options.moduleName 给模型一点模块上下文（术语更一致）
 * @param {Record<string,string>} options.entries 键 → 源文
 * @param {Record<string,string>} options.glossary 术语表（可选）
 * @param {Record<string,string>} options.moduleDescriptions 模块 → 中文说明
 */
export function buildPrompt({
  sourceLocale,
  targetLocale,
  moduleName,
  entries,
  glossary = {},
  moduleDescriptions = {},
}) {
  const sourceName = LOCALE_NAMES[sourceLocale] ?? sourceLocale
  const targetName = LOCALE_NAMES[targetLocale] ?? targetLocale
  const description = moduleDescriptions[moduleName]

  const glossaryLines = Object.entries(glossary)
    .map(([term, translations]) => {
      const value = translations?.[targetLocale]
      return value ? `-「${term}」→「${value}」` : null
    })
    .filter(Boolean)

  return [
    `你是专业的软件界面本地化译者。把下面的 ${sourceName} 界面文案翻译成 ${targetName}。`,
    '',
    '严格规则：',
    '1. 只输出 JSON，不要任何解释、不要 markdown 代码块围栏。',
    '2. 输出的键必须与输入的键**完全一致**，不要增删键。',
    '3. 值必须是纯字符串；保留原文里的占位符（如 {{name}}、{{total}}）与 HTML 标签（如 <b></b>）原样不变。',
    '4. 这是**界面文案**，不是句子翻译：要短、要符合该语言产品界面的习惯用语。',
    '5. 不要翻译品牌名、产品名、代码、URL、快捷键（如 Ctrl K）。',
    '6. 不要添加句末标点（除非源文本来就有）。',
    '7. 面向阿拉伯语时使用标准现代阿拉伯语；面向日语时使用です・ます体。',
    '',
    description ? `本模块用途：${description}` : `本模块：${moduleName}`,
    glossaryLines.length ? `\n术语表（必须遵守）：\n${glossaryLines.join('\n')}` : '',
    '',
    `待翻译（JSON，键 → ${sourceName} 原文）：`,
    JSON.stringify(entries, null, 2),
    '',
    `只输出翻译后的 JSON 对象（键不变，值换成 ${targetName}）。`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/** 从模型回复里抠出 JSON（容忍 ```json 围栏与前后解释）。 */
export function parseJsonResponse(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) throw new Error('模型返回为空')

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : trimmed

  try {
    return JSON.parse(candidate)
  } catch {
    // 退一步：取第一个 { 到最后一个 } 之间
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1))
    }
    throw new Error(`模型返回不是合法 JSON：${candidate.slice(0, 200)}`)
  }
}

/**
 * 调一次 OpenAI 兼容的 chat completions。
 *
 * `response_format: json_object` 是首选（要求模型直接吐 JSON）；但部分网关 / 模型
 * 不吃这个字段会直接 400，所以失败时**去掉它重试一次** —— 提示词本身已经要求
 * 「只输出 JSON」，加上 `parseJsonResponse` 的容错，去掉它通常也能拿到 JSON。
 */
async function callOpenAiCompatible(config, prompt) {
  const url = resolveChatEndpoint(config.baseUrl)
  const headers = {
    'Content-Type': 'application/json',
    ...buildAuthHeaders({
      mode: config.authMode,
      key: config.key,
      providerKey: config.providerKey,
      gatewayId: config.gatewayId,
    }),
  }

  const body = (withJsonFormat) => ({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: '你是软件界面本地化译者，只输出合法 JSON，不输出任何多余文字。',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    ...(withJsonFormat ? { response_format: { type: 'json_object' } } : {}),
  })

  const send = async (withJsonFormat) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(withJsonFormat)),
        signal: controller.signal,
      }).catch((error) => {
        // fetch 自身的失败信息很含糊（只有 "fetch failed"），带上 cause 才可排查
        const cause = error?.cause?.message ?? error?.cause?.code ?? ''
        throw new Error(
          `请求网关失败：${error.message}${cause ? `（${cause}）` : ''}｜端点 ${url}`,
        )
      })
    } finally {
      clearTimeout(timer)
    }
  }

  let response = await send(true)
  if (!response.ok && (response.status === 400 || response.status === 422)) {
    const detail = await response.text().catch(() => '')
    // 只有「明确是 response_format 引起的」才重试，别的 400 重试也是白搭
    if (/response_format|json_object|json mode/i.test(detail)) {
      response = await send(false)
    } else {
      throw new Error(
        `网关返回 ${response.status} ${response.statusText}${detail ? `：${detail.slice(0, 300)}` : ''}`,
      )
    }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `网关返回 ${response.status} ${response.statusText}${detail ? `：${detail.slice(0, 300)}` : ''}`,
    )
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(
      `网关响应里没有 message.content：${JSON.stringify(data).slice(0, 300)}`,
    )
  }
  return content
}

/**
 * 翻译一批条目。返回「键 → 译文」。
 *
 * 只接受**输入里出现过的键** —— 模型自造或漏掉的键都不会污染语言文件。
 *
 * @returns {Promise<{ translations: Record<string,string>, model: string }>}
 */
export async function translateBatch(options, config = readProviderConfig()) {
  if (config.missing.length) {
    throw new Error(
      `翻译所需配置不完整：${config.missing.join('；')}。` +
        `\n提示：可写 i18n.config.json 的 provider 段，或用 I18N_GATEWAY_* 变量，` +
        `不配则回退到与 agent 共用的 DSH_GATEWAY_*；密钥放 I18N_GATEWAY_KEY。` +
        `\n本脚本在缺配置时**不会**生成占位译文。`,
    )
  }

  const supported = ['openai-completions', 'openai', 'openai-compatible']
  if (!supported.includes(config.api)) {
    throw new Error(
      `不支持的 api=${config.api}；本脚本目前支持：${supported.join(', ')}`,
    )
  }

  const prompt = buildPrompt(options)
  const content = await callOpenAiCompatible(config, prompt)
  const parsed = parseJsonResponse(content)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模型返回的不是 JSON 对象')
  }

  // 只接受输入里出现过的键 —— 防止模型自造键污染语言文件
  const allowed = new Set(Object.keys(options.entries))
  const translations = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (!allowed.has(key)) continue
    if (typeof value !== 'string' || !value.trim()) continue
    translations[key] = value
  }

  return { translations, model: config.model }
}
