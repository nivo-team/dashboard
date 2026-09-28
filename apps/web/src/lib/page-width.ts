import type { AiPageWidthMode, PageWidthMode } from './store/preferences-store'

/**
 * 宽度约束的**唯一落点**，现在有两份宽度：
 *
 * 1. **内容区宽度**（`设置 → 外观 → 页面宽度`）—— 决定两个外壳（`MainLayout` 与 `AppShell`）
 *    内容区的 `<main>` 要不要收窄。最大宽度这个「配置值」必须只有一份，两个外壳都从这里
 *    取类名，免得哪天改上限时漏掉一个，出现「一个外壳限宽、另一个全宽」的错位。
 * 2. **全屏 AI 对话页的宽度**（`设置 → AI → 页面宽度`，见 `aiChatWidthClass`）——
 *    上限**刻意不是**上面那份（对话按行读，1440px 太宽），只借用「全宽 / 限宽居中」这个选择。
 *
 * 之所以是返回类名而不是像素值：Tailwind 按**字面量**扫描生成工具类，
 * `max-w-[${px}]` 这种拼出来的类名构建期根本不会被产出（`max-w-[1440px]` 必须在源码里
 * 以完整字符串出现）。
 */

/** 限宽档的内容区最大宽度类：`boxed` 用它把内容收在 1440px 内并居中。 */
export const PAGE_CONTENT_MAX_WIDTH_CLASS = 'max-w-[1440px]'

/**
 * 按档位给出内容区的宽度约束类：
 * - `boxed` → `mx-auto w-full max-w-[1440px]`（收窄 + 居中）；
 * - `full` → `w-full`（铺满；调用方把它当基础宽度类用，因此不要再另外写一个 `w-full`）。
 *
 * 调用点一律写成 `cn(基础类, pageContentWidthClass(mode))`。
 */
export function pageContentWidthClass(mode: PageWidthMode): string {
  return mode === 'boxed'
    ? `mx-auto w-full ${PAGE_CONTENT_MAX_WIDTH_CLASS}`
    : 'w-full'
}

/**
 * 全屏 AI 对话页（`/$appId/sphere`）的内容最大宽度类。
 *
 * **和页面的 1440px 不是一个值**：对话是长文本，行宽再宽就读不动了，所以收在 `max-w-4xl`。
 * 「跟随外观」跟的是「全宽 / 限宽居中」这个**选择**，上限仍旧用这一份 ——
 * 这正是「读到的设置和页面的限制不太一样」的由来，是刻意的。
 */
export const AI_CHAT_MAX_WIDTH_CLASS = 'max-w-4xl'

/**
 * 全屏 AI 对话页当前是否落在「限宽居中」档（`follow` 先按外观那一份解析）。
 *
 * 单独暴露是因为调用方还要用它决定**滚动条槽位**（见 `SphereChat` 的
 * `stableScrollbarGutter`）：只有内容居中的档位才需要给滚动条两边留固定槽位 ——
 * 铺满档位留了反而凭空多出两道空白。
 */
export function isAiChatBoxed(
  mode: AiPageWidthMode,
  followMode: PageWidthMode,
): boolean {
  return mode === 'follow' ? followMode === 'boxed' : mode === 'boxed'
}

/**
 * 全屏 AI 对话页的宽度约束类：`follow` 先解析成外观那一档，再按同一套规则给类名。
 * 约束的是**会话区的内容 + 输入区**（一个整体），滚动容器与头行、侧边栏不受影响。
 */
export function aiChatWidthClass(
  mode: AiPageWidthMode,
  followMode: PageWidthMode,
): string {
  return isAiChatBoxed(mode, followMode)
    ? `mx-auto w-full ${AI_CHAT_MAX_WIDTH_CLASS}`
    : 'w-full'
}
