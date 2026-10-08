import type { PromptFacts } from '@admin/ai-prompt'
import { SUPPORTED_LOCALES, type LocaleKey } from '#/lib/locale'
import { ALL_SHELL_NAV_TARGETS } from '#/lib/navigation'
import { formatPageSummary, getPageContext, resolveNavLabel } from './page-context'
import { useAiSessionStore } from './session-store'
import { collectNavigation } from './tools/page-tools'
import { getLatestSessionTasks } from './tools/task-tools'
import type { AiMode, AiSurface } from './types'

/**
 * **事实采集器** —— 这一层只回答「此刻有什么」，不写任何规则。
 *
 * ## 边界（改动前先想清楚这一条）
 *
 * | 归属 | 内容 | 为什么 |
 * |---|---|---|
 * | **中间层**（`packages/ai-prompt` + `apps/ai`） | **规则**：身份 / 范围闸 / 能力 / 工作方式 / 回答方式 | 前端拆不出提示词；改规则 = 重新部署 |
 * | **本文件（web）** | **事实**：页面上下文、导航清单、任务清单、输出语言、模式、容器 | 只有浏览器知道；而且**能热更新**（改页面描述不用动核心层） |
 * | **`lib/ai/tools/**`（web）** | 工具定义与执行 | 需要 React state / router / 表单桥 |
 *
 * 所以：**页面功能描述、字段名、接口描述这些"给 AI 补充上下文"的东西继续留在 web**
 * （页面自己声明、改完即生效）；核心层不必为它们改动。
 *
 * ## 为什么用 `PromptFacts` 这个共享类型而不是本地声明一份
 *
 * 字段名写错时服务端 `normalizeFacts` 会**静默落默认值** —— 提示词变弱但没有任何报错，
 * 是最难查的一类故障。所以契约必须来自同一个类型定义（`@admin/ai-prompt` 只导类型，
 * 运行时规则仍然只在服务端）。
 */

/** 语言键 → 该语言的**自名**（「日本語」而不是「日语」）：模型的语种知识在自名上最可靠。 */
export function resolveOutputLanguageName(locale: LocaleKey): string {
  return SUPPORTED_LOCALES.find((item) => item.key === locale)?.nativeName ?? '简体中文'
}

export interface CollectPromptFactsOptions {
  mode: AiMode
  surface: AiSurface
  /** 已解析过的输出语言自名（`auto` 已在调用方解析成具体语言） */
  outputLanguageName: string
  /**
   * Router 阶段的**工具目录文本**（`buildToolCatalogText(可用工具)`）。
   *
   * 由调用方（`chat.ts`）生成，因为「当前权限下有哪些工具」的过滤也在那边 ——
   * 这里只负责把它带进事实快照，不重复算一份。
   */
  toolCatalogText?: string
}

/**
 * 采集本轮事实快照 —— **每轮都要重新采**（页面可能已导航、任务可能已推进、语言可能已切换）。
 *
 * 与各来源的关系（都是既有的"唯一出口"，这里只是取用，不另写一份）：
 * - 页面摘要 → `getPageContext()` + `formatPageSummary()`（完整明细由 `get_page_context` 工具按需取）；
 * - 业务导航 → `collectNavigation()`（与 `list_navigation` 同一个过滤点）；
 * - 外壳页面名 → `ALL_SHELL_NAV_TARGETS` + `resolveNavLabel`；
 * - 任务清单 → `getLatestSessionTasks()`（与提示词的任务层同源）。
 */
export function collectPromptFacts({
  mode,
  surface,
  outputLanguageName,
  toolCatalogText,
}: CollectPromptFactsOptions): PromptFacts {
  const context = getPageContext()
  const appId = context.appId ?? null

  return {
    mode,
    surface,
    appName: context.appName ?? '管理后台',
    appId,
    outputLanguageName,
    /*
      只上报页面**摘要**（应用 / 页面 / 路径 / 路由模板）：完整明细（接口 / 字段 / 表单）
      由 `get_page_context` 工具在执行阶段按需获取 —— 每轮都带几 KB 明细不值当。
    */
    pageSummaryText: formatPageSummary(context),
    toolCatalogText: toolCatalogText ?? '',
    navEntries: collectNavigation(appId).map((entry) => ({
      name: entry.name,
      path: entry.path,
      group: entry.group,
    })),
    shellNavNames: ALL_SHELL_NAV_TARGETS.map((item) => resolveNavLabel(item.labelKey, item.label)),
    activeTasks: getLatestSessionTasks(useAiSessionStore.getState().messages),
  }
}
