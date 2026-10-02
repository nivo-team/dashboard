import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { buildSystemPrompt, PROMPT_LAYERS } from '@admin/ai-prompt'
import { normalizeFacts } from '../facts'

/**
 * 系统提示词接口 —— 不走对话链路、直接取提示词的调试出口。
 *
 * 设计要点：
 *
 * 1. **无状态**：不落库（提示词就写在 `@admin/ai-prompt` 的代码里），事实由请求体带上来。
 *    于是它天然可以横向扩容、可以随时重部署收窄规则，也不会积累一份需要治理的数据。
 * 2. **规则在服务端、事实由客户端上报**：导航清单 / 页面上下文 / 任务清单是客户端状态
 *    （导航 i18n、页面标题、表单注册表、URL 只有浏览器知道），只能上报；
 *    而「怎么用这些事实、边界在哪」全在服务端代码里 —— 这正是「前端拆不出提示词」的实现方式。
 * 3. **两个形态**：普通 JSON（一次性拿全文）与 SSE（分块下发）。SSE 不是为了好看 ——
 *    见下面 `/stream` 的注释与文档里的「SSE」一节。
 */

const LAYER_IDS = PROMPT_LAYERS.map((layer) => layer.id)

/** SSE 的分块粒度（字符）。取 1 KB 是为了兼顾「首字节快」与「帧数不爆炸」。 */
const STREAM_CHUNK_CHARS = 1024

export const systemPromptRoute = new Hono()

/** 层目录：给调试与文档用（前端 switch 时也靠它核对层序）。 */
systemPromptRoute.get('/layers', (c) =>
  c.json({
    layers: PROMPT_LAYERS.map((layer) => ({ id: layer.id, title: layer.title })),
  }),
)

/**
 * `POST /v1/system-prompt` —— 一次请求拿到完整提示词。
 *
 * 请求体：`PromptFacts` 的宽松版（缺失字段落回默认值，见 `../facts.ts`）。
 * 响应：`{ system, meta }`。`meta` 只含诊断信息（层序 / 字符数 / 生效的模式与容器），
 * **不含**任何事实回显 —— 避免把客户端上报的内容再吐回去。
 */
systemPromptRoute.post('/', async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', message: '请求体必须是 JSON' }, 400)
  }

  const facts = normalizeFacts(raw)
  const system = buildSystemPrompt(facts)

  return c.json({
    system,
    meta: {
      layers: LAYER_IDS,
      chars: system.length,
      mode: facts.mode,
      surface: facts.surface,
      hasAppScope: Boolean(facts.appId),
      taskCount: facts.activeTasks?.length ?? 0,
    },
  })
})

/**
 * `POST /v1/system-prompt/stream` —— 同样的内容，按块用 SSE 下发。
 *
 * ## 为什么 SSE 在这里有意义（以及它现在**不**解决什么）
 *
 * - **它真的解决**：提示词会随事实增长（模块清单最多 30 行、任务清单按会话长度增长）。
 *   一次 JSON 要等整个字符串拼完才吐第一个字节；SSE 能先把 `meta` 推给客户端，
 *   再分块推正文 —— 客户端可以边收边起首字，也可以提前知道这轮有几层。
 * - **它不解决**：模型输出的流式。模型的 token 流走 `/v1/chat/completions` **原样透传上游**，
 *   **不在这个 `/stream` 里重新分块** —— 提示词接口的 SSE 与模型流的 SSE 是两条不同的流，
 *   不要混为一谈（见文档「SSE」一节）。
 *
 * 实现上三个容易踩的点（都在下面体现）：
 * 1. **`writeSSE` 的 `data` 不能含裸换行** —— 提示词是多行文本，所以这里统一 `JSON.stringify`
 *    （换行会变成 `\n` 转义），客户端 `JSON.parse` 后再拼，不用自己处理分帧；
 * 2. **先发 `meta` 再发正文**：客户端可以据此显示进度，而不是"什么都没发生"；
 * 3. **客户端断开要能被感知**：`stream.onAbort` 里做清理。本提示词接口无副作用（不写库、不外调），
 *    所以这里只留钩子 —— 但将来若在流中途记账 / 外调，必须在这里收尾。
 */
systemPromptRoute.post('/stream', async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json', message: '请求体必须是 JSON' }, 400)
  }

  const facts = normalizeFacts(raw)
  const system = buildSystemPrompt(facts)

  return streamSSE(c, async (stream) => {
    let aborted = false
    stream.onAbort(() => {
      aborted = true
    })

    await stream.writeSSE({
      event: 'meta',
      data: JSON.stringify({
        layers: LAYER_IDS,
        chars: system.length,
        mode: facts.mode,
        surface: facts.surface,
      }),
    })

    for (let offset = 0; offset < system.length; offset += STREAM_CHUNK_CHARS) {
      if (aborted) return
      await stream.writeSSE({
        event: 'chunk',
        data: JSON.stringify({
          offset,
          text: system.slice(offset, offset + STREAM_CHUNK_CHARS),
        }),
      })
    }

    await stream.writeSSE({
      event: 'done',
      data: JSON.stringify({ chars: system.length }),
    })
  })
})
