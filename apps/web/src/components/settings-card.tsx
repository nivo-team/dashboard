import { LayerCard, Tooltip } from '@cloudflare/kumo'
import { InfoIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

/**
 * 设置页统一的卡片外壳（标题条 + 若干「设置行」）。
 *
 * 为什么不用 Kumo 的默认间距：`LayerCard` 三层的默认类里各带一处间距 ——
 * - 根：`p-4`
 * - `LayerCard.Primary`：`flex flex-col gap-2 p-4 pr-3`
 * - `LayerCard.Secondary`：`-my-2 … p-4`（负边距与根的 `p-4` 抵消，标题条才贴边）
 *
 * 设置页的卡片是**一行一个设置项**，行间要用 1px 分隔线（`divide-y`）而不是 8px 空隙，
 * 所以这里把三处默认值**一起**归零，缺一处就不平衡：
 * - 根 `p-0`：内边距下移到每一行（`SettingRow` 自带 `px-4 py-3.5`），分隔线才能通长；
 * - 主体 `gap-0 p-0`：否则分隔线与行之间仍多出 8px 空隙（就是「视觉不平衡」的来源）；
 * - 头部 `my-0`：`-my-2` 是配合根 `p-4` 的，根改成 `p-0` 后必须清掉，否则标题条上移 8px 出界。
 *
 * **新增设置卡片请直接用这个组件**，不要再手写 `LayerCard` + className 组合；
 * 需要新的一栏时，在 children 里放一个 `SettingRow`（左 label、右内容）即可。
 */
const HEADER_CLASSES = 'my-0'

const BODY_CLASSES = 'flex flex-col gap-0 divide-y divide-kumo-line p-0'

export function SettingsCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <LayerCard className="p-0">
      <LayerCard.Secondary className={HEADER_CLASSES}>{title}</LayerCard.Secondary>
      <LayerCard.Primary className={BODY_CLASSES}>{children}</LayerCard.Primary>
    </LayerCard>
  )
}

/**
 * 设置行：左侧 label（可带 info 提示），右侧是该设置的控件。
 *
 * **顶部对齐**（`items-start`）而不是垂直居中：label 从行的左上角开始，
 * 右侧内容（下拉、色板、预览）无论多高都从同一条上边缘起排。
 * RTL 下 flex 主轴翻转，label 自然落到右上角，无需任何 `rtl:` 变体或物理方向类。
 * 窄屏放不下时 `flex-wrap` 让控件换到下一行，而不是把 label 压到换行。
 *
 * 行间距交给 `SettingsCard` 主体上的 `divide-y`，这里自己只带内边距。
 */
export function SettingRow({
  label,
  hint,
  children,
}: {
  /**
   * 行标题。类型是 `ReactNode` 而不是 `string`：它直接渲染在 `<span>` 里，
   * 调用方偶尔需要在文字上挂东西（例如把悬浮预览的热区包在 label 上，
   * 见 设置 → AI 的「进行中光晕」），而不是塞进右侧的控件列里挡着控件。
   */
  label: ReactNode
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-sm text-kumo-default">
        {label}
        {hint ? (
          <Tooltip content={hint} delay={120}>
            {/*
              这里**不能**再写 <button>：Kumo 的 Tooltip 会把 children 包进它自己的
              trigger button，嵌套 button 是非法 DOM（React 会报 hydration 错误）。
              可访问名称由里面的 sr-only 文本提供，键盘可达性由 trigger 自己保证。
            */}
            <span className="flex text-kumo-subtle transition-colors hover:text-kumo-default">
              <InfoIcon size={14} />
              <span className="sr-only">{hint}</span>
            </span>
          </Tooltip>
        ) : null}
      </span>

      <div className="min-w-0">{children}</div>
    </div>
  )
}
