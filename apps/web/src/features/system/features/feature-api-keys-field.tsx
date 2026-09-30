import { Combobox } from '@cloudflare/kumo'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useApiKeyLabel, useApiItems } from './feature-apis'

/**
 * 绑定接口选择器（功能 / 权限表单共用）。
 *
 * 数据源是 `GET /api`（baseUrl 已含 `/api`，即 `/api/api`）：返回**系统全部 API 路由清单**，
 * 实测约 632 条 `{ method, path, value, label }`。`api_keys` 存的就是其中的 `value`（md5），
 * 例如 `30cd4f597a030a1b9bad8ca9e571f7ef` → `GET:/api/system/menu/tree`。
 *
 * 交互用 Kumo `Combobox`（Base UI 实现）的**多选 + 框内 chip** 形态，即
 * `multiple` + `Combobox.TriggerMultipleWithInput` + `Combobox.Chip`：
 * - 已选项以 chip 形式留在输入框内，可点 × 移除、可退格删除；
 * - 候选是浮层下拉，**不会推挤表单布局**；
 * - 支持方向键上下高亮、Enter 选择、Esc 关闭（键盘可达）；
 * - 输入关键词由组件内置过滤（对字符串项按 label 匹配），并用 `limit` 限制单次渲染条数。
 *
 * 因为 Combobox 的 value 需要是「可显示的字符串」，这里在 label 与 md5 之间做双向映射：
 * Combobox 侧一律用 label，提交给父组件时换回 md5。
 *
 * 候选列表**按 id（`value` / md5）过滤掉已选项**：已绑定的只以 chip 出现，下拉里不再重复出现；
 * 清单里查不到的历史值（接口已下线等）同样只出现在 chip 上，保证回显不丢。
 *
 * 清单的请求与缓存见 `./feature-apis.ts`（与详情页的 label 展示共享同一份缓存）。
 */

/** 单次最多渲染的候选条数（632 条不一次性进 DOM，关键词足够精确时都能命中）。 */
const MAX_VISIBLE = 50

interface FeatureApiKeysFieldProps {
  /** 已绑定的接口 value 列表（md5）。 */
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

export function FeatureApiKeysField({
  value,
  onChange,
  disabled = false,
}: FeatureApiKeysFieldProps) {
  const { t } = useTranslation('features')

  const { items: apiItems, isPending, isError } = useApiItems()
  /** md5 → label（清单外的历史值原样返回），见 `./feature-apis.ts` */
  const labelOf = useApiKeyLabel()

  /** label → md5，用于提交时换回 api_keys 的真实取值 */
  const hashByLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of apiItems) {
      const label = item.label ?? item.value
      if (label && item.value) map.set(label, item.value)
    }
    return map
  }, [apiItems])

  /**
   * 候选 = **未绑定**的接口（按 `value`（md5）过滤掉已选项）。
   *
   * 已选项只以 chip 形式留在输入框内，不再出现在下拉里，避免"选过了还混在候选里"。
   * chip 的渲染走受控 `value`（`TriggerMultipleWithInput` 的 chipsToRender 分支直接 map 受控值），
   * 因此候选里不含它们也不影响回显；清单外的历史值（孤儿）同理只出现在 chip 上。
   */
  const comboboxItems = useMemo(() => {
    const selectedIds = new Set(value)

    return apiItems
      .filter((item) => !item.value || !selectedIds.has(item.value))
      .map((item) => item.label ?? item.value ?? '')
      .filter((label) => label.length > 0)
  }, [apiItems, value])

  const selectedLabels = useMemo(() => value.map(labelOf), [labelOf, value])

  const handleValueChange = useCallback(
    (next: string[]) => {
      onChange(next.map((label) => hashByLabel.get(label) ?? label))
    },
    [hashByLabel, onChange],
  )

  return (
    <div className="sm:col-span-2">
      <Combobox
        multiple
        items={comboboxItems}
        value={selectedLabels}
        onValueChange={handleValueChange}
        limit={MAX_VISIBLE}
        disabled={disabled}
        label={t('form.apiKeys', '绑定接口')}
        labelTooltip={t(
          'form.apiKeysDescription',
          '输入关键词过滤系统接口，功能绑定列表接口，权限绑定具体的 action 接口',
        )}
        error={
          isError
            ? {
                message: t('form.apiKeysFailed', '接口清单加载失败，请稍后重试'),
                match: 'customError',
              }
            : undefined
        }
      >
        <Combobox.TriggerMultipleWithInput
          /**
           * 视觉上「整块 chips 容器」才是输入控件：
           * - 内部 input 去掉自身 outline / ring，不再出现"框里还有一个框"；
           * - 由容器的 `focus-within` 承担聚焦高亮（容器本身不会获得焦点，
           *   只写 `focus:` 是永远不触发的）。
           */
          className="[&_input]:outline-none [&_input]:ring-0 focus-within:ring-[1.5px] focus-within:ring-kumo-focus/50"
          placeholder={
            isPending
              ? t('form.apiKeysLoading', '正在加载接口清单…')
              : t('form.apiKeysPlaceholder', '搜索接口，例如 /api/guild')
          }
          value={selectedLabels}
          renderItem={(label: string) => (
            // chip 的移除按钮由 Kumo 内置（Chip 内部渲染 ChipRemove），
            // 其与选中值的关联依赖渲染顺序与受控 value 一致 —— 这里按 selectedLabels 顺序 map 即满足
            <Combobox.Chip
              key={label}
              removeLabel={t('form.apiKeysRemove', '移除 {{label}}', { label })}
            >
              {label}
            </Combobox.Chip>
          )}
        />
        <Combobox.Content>
          <Combobox.List>
            {(label: string) => (
              <Combobox.Item value={label}>
                <span className="truncate font-mono text-xs">{label}</span>
              </Combobox.Item>
            )}
          </Combobox.List>
          <Combobox.Empty>
            {t('form.apiKeysNoMatch', '没有可绑定的接口了')}
          </Combobox.Empty>
        </Combobox.Content>
      </Combobox>
    </div>
  )
}
