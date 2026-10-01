/**
 * 翻译执行体：把一批「键 → 中文」交给模型，拿回「键 → 译文」。
 *
 * ## 凭据与端点
 *
 * 复用流水线已有的一套环境变量（见 `.github/ai/dsh-patch.yml` 末尾），
 * 不新增第二份凭据：
 *
 * | 变量 | 用途 |
 * | --- | --- |
 * | `DSH_GATEWAY_KEY` | 网关 API key（必需） |
 * | `DSH_GATEWAY_BASE_URL` | 端点（必需） |
 * | `DSH_GATEWAY_MODEL` | 模型 id（必需） |
 * | `DSH_GATEWAY_API` | 协议，目前支持 `openai-completions`（可选，默认它） |
 * | `I18N_TRANSLATE_TIMEOUT_MS` | 单次请求超时（可选，默认 120000） |
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

const DEFAULT_TIMEOUT_MS = 120_000

export function readProviderConfig(env = process.env) {
  const key = env.DSH_GATEWAY_KEY?.trim()
  const baseUrl = env.DSH_GATEWAY_BASE_URL?.trim()
  const model = env.DSH_GATEWAY_MODEL?.trim()
  const api = (env.DSH_GATEWAY_API?.trim() || 'openai-completions').toLowerCase()

  const missing = []
  if (!key) missing.push('DSH_GATEWAY_KEY')
  if (!baseUrl) missing.push('DSH_GATEWAY_BASE_URL')
  if (!model) missing.push('DSH_GATEWAY_MODEL')

  return {
    key,
    baseUrl,
    model,
    api,
    timeoutMs: Number(env.I18N_TRANSLATE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    missing,
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
    '待翻译（JSON）：',
    JSON.stringify(entries, null, 2),
    '',
    '只输出翻译后的 JSON 对象。',
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

/** 调一次 OpenAI 兼容的 chat completions。 */
async function callOpenAiCompatible(config, prompt) {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content:
              '你是软件界面本地化译者，只输出合法 JSON，不输出任何多余文字。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    }).catch((error) => {
      // fetch 自身的失败信息很含糊（只有 "fetch failed"），带上 cause 才可排查
      const cause = error?.cause?.message ?? error?.cause?.code ?? ''
      throw new Error(
        `请求网关失败：${error.message}${cause ? `（${cause}）` : ''}｜端点 ${url}`,
      )
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `网关返回 ${response.status} ${response.statusText}${body ? `：${body.slice(0, 300)}` : ''}`,
      )
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error(`网关响应里没有 message.content：${JSON.stringify(data).slice(0, 300)}`)
    }
    return content
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 翻译一批条目。返回「键 → 译文」。
 *
 * @returns {Promise<{ translations: Record<string,string>, model: string }>}
 */
export async function translateBatch(options, config = readProviderConfig()) {
  if (config.missing.length) {
    throw new Error(
      `缺少翻译所需的凭据/配置：${config.missing.join(', ')}。` +
        `\n提示：这几个变量与 AI 开发流水线共用（见 .github/ai/dsh-patch.yml 末尾）。` +
        `\n本脚本在缺凭据时**不会**生成占位译文。`,
    )
  }

  const supported = ['openai-completions', 'openai', 'openai-compatible']
  if (!supported.includes(config.api)) {
    throw new Error(
      `不支持的 DSH_GATEWAY_API=${config.api}；本脚本目前支持：${supported.join(', ')}`,
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
