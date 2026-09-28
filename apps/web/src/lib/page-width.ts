import type { PageWidthMode } from './store/preferences-store'

/**
 * 内容区宽度（`设置 → 外观 → 页面宽度`）的**唯一落点**。
 *
 * 这个偏好只做一件事：决定两个外壳（`MainLayout` 与 `AppShell`）内容区的 `<main>`
 * 要不要收窄。所以最大宽度这个「配置值」必须只有一份 —— 两个外壳都从这里取类名，
 * 免得哪天改上限时漏掉一个，出现「一个外壳限宽、另一个全宽」的错位。
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
