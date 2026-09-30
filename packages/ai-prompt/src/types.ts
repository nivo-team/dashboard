/**
 * 提示词层的公共类型 —— **纯数据，零依赖**。
 *
 * 为什么要有这个包：系统提示词原先只存在于前端（`apps/web/src/lib/ai/prompt`），
 * 于是它既能被浏览器拆解，又只能在浏览器里拼。现在把它抽成**唯一真值**：
 * `apps/ai`（Hono on Cloudflare Workers）与前端共用同一份规则文本。
 *
 * 三条硬约定（与仓库铁律「名单只有一个真值」同源）：
 *
 * 1. **本包不许依赖任何运行时**：不许 import React / zustand / i18n / `window` / `fetch`。
 *    它只做「拿一份事实快照，产出一个字符串」这一件事 —— 于是同一份代码在 Worker、
 *    在浏览器、在 node 测试里都能跑。
 * 2. **规则在这里，事实在外面**：`scope` 的模块清单、`workflow` 的任务清单、
 *    L6 的页面上下文都是**客户端状态**（导航 i18n、页面标题、表单注册表、URL 只有浏览器知道），
 *    只能由调用方采集后作为 `PromptFacts` 传进来。本包不做任何环境探测。
 * 3. **提示词每轮重算**：`buildSystemPrompt` 是纯函数、不许缓存，事实变了结果就该变。
 */

/** 与输入面板的模式一一对应（见前端 `#/lib/store` 的 `AiComposerMode`）。 */
export type AiMode = 'ask' | 'auto'

/**
 * AI 此刻跑在**哪个容器**里 —— 面板（分屏 / 浮窗）还是全屏对话页。
 *
 * 它只影响「工作方式」层的策略（面板鼓励带路、全屏默认就地渲染），
 * **不影响范围闸**：业务 / 越界的判定在两个容器里完全一致。
 */
export type AiSurface = 'panel' | 'sphere'

/** 一条业务导航项（由调用方从导航清单投影而来，**不是**本包自己读导航）。 */
export interface PromptNavEntry {
  /** 当前语言下的页面名称 */
  name: string
  /** 绝对路径（仅用于判断分组归属，不进提示词正文） */
  path: string
  /** 所属分组（业务导航的父级名称）；顶层模块为 `null` */
  group: string | null
}

/** 会话任务清单里的一项（对齐前端 `#/lib/ai/tools/task-tools` 的 `TaskItem`）。 */
export interface PromptTask {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
}

/**
 * 各层的输入：**每轮只采一次**的上下文快照 + 本轮的模式、容器与输出语言。
 *
 * 所有字段都由调用方采集后传入 —— 这是「规则在服务端、事实由客户端上报」的落点。
 */
export interface PromptFacts {
  /** 当前模式（ask / auto）—— 只影响「用起来要不要问」，不影响范围判定 */
  mode: AiMode
  /** 当前容器（面板 / 全屏）—— 只影响工作方式层的策略 */
  surface: AiSurface
  /** 应用显示名（缺省时给一个中性说法，避免提示词里出现 `null`） */
  appName: string
  /** 当前应用 id；`null` 表示用户此刻不在任何应用里（外壳页面） */
  appId: string | null
  /**
   * AI 输出语言在**该语言里的自名**（「日本語」而不是「日语」）。
   *
   * 用自名是因为模型的语种知识在自名上最可靠，且不必要求它懂当前界面语言里的语种叫法。
   * 语言键 → 自名的解析留在调用方（前端已有 `SUPPORTED_LOCALES`），本包不做 locale 表。
   */
  outputLanguageName: string
  /** 已格式化的当前页面上下文文本（前端由 `formatPageContext` 产出） */
  pageContextText: string
  /** 业务导航的**扁平**清单（含分组信息），范围闸据此派生模块行 */
  navEntries: readonly PromptNavEntry[]
  /** 外壳页面名清单（应用选择 / 个人资料 / 外观 / AI 设置 / 关于） */
  shellNavNames: readonly string[]
  /** 会话里最后一份任务清单；`null` 表示没有 */
  activeTasks: readonly PromptTask[] | null
}

/** 一层提示词：`build` 返回 `null` 表示这一层这轮不参与（例如没有进行中的任务）。 */
export interface PromptLayer {
  /** 层的稳定标识，供文档 / 调试引用 */
  id: string
  /** 层的职责一句话（与 `.agents/docs/ai-architecture.md` 的表格一一对应） */
  title: string
  /**
   * 是否属于「本轮环境」（模式 / 容器 / 页面 / 任务）。
   *
   * **这一位决定它落在哪**：`false`（默认）进 system 前缀，`true` 落在对话**末尾**。
   * 原因是前缀缓存：`system` 在 messages 最前面，它里面任何一处变化都会让**后面的一切
   * （含整段对话历史）**失去前缀匹配。所以「每轮会变」的内容必须放在末尾 ——
   * 详见 `.agents/docs/ai-server-layer.md` §缓存对齐。
   */
  volatile?: boolean
  build: (facts: PromptFacts) => string | null
}
