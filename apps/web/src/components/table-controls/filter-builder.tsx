import { Button, Input, Select } from '@cloudflare/kumo'
import { PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { QueryFilterField } from '#/api/query-params.gen'
import type { ResolveFilterFieldOptions } from './types'

/** 单条筛选条件（受控值，id 用于行内稳定 key） */
export interface FilterCondition {
  id: string
  /** 真实的 query 参数名（对应 QueryFilterField.param），区间字段取其下限参数 */
  field: string
  /** 取值；区间字段时为下限 */
  value: string
  /** 区间字段的上限值 */
  valueTo?: string
}

/** 条件展示文案所需的标签（随语言变化） */
export interface FilterConditionLabels {
  /** boolean 字段的「是」 */
  yes: string
  /** boolean 字段的「否」 */
  no: string
}

/**
 * 把一条筛选条件格式化为 chip 展示文本，例如
 * 「昵称 abc」「注册时间 2026-01-01 ~ 2026-06-30」。
 * 后端是扁平具名参数、没有操作符概念，因此不插入“等于/包含”之类的词。
 */
export function describeFilterCondition(
  condition: FilterCondition,
  field: QueryFilterField | undefined,
  labels: FilterConditionLabels,
  /**
   * 枚举字段的 value → 显示文案（可选）。
   *
   * 传入后 chip 显示「账号类型 普通用户」而不是「账号类型 normal」；
   * 页面通常用 `useDictOptionEntries()` 构造（见 .agents/docs/dict-options.md）。
   */
  optionLabelOf?: (field: QueryFilterField, value: string) => string | undefined,
): string {
  const name = field?.label ?? condition.field
  if (!field) return `${name} ${condition.value}`.trim()

  if (field.control === 'number-range') {
    const from = condition.value.trim()
    const to = (condition.valueTo ?? '').trim()
    if (from && to) return `${name} ${from} ~ ${to}`
    return `${name} ${from || to}`
  }

  if (field.control === 'boolean') {
    return `${name} ${condition.value === 'true' ? labels.yes : labels.no}`
  }

  return `${name} ${optionLabelOf?.(field, condition.value) ?? condition.value}`.trim()
}

export interface FilterBuilderProps {
  /** 可筛选字段目录（由 openapi 生成的 query 参数目录） */
  fields: QueryFilterField[]
  value: FilterCondition[]
  onChange: (next: FilterCondition[]) => void
  /** 点击「应用」或按下 Enter */
  onApply?: () => void
  /** 点击「全部清除」（仅清空草稿，由调用方决定是否重新查询） */
  onClear?: () => void
  /** 点击右上角关闭 */
  onClose?: () => void
  /**
   * 需要聚焦的条件 id（由 chips 点击「编辑」传入）：
   * 打开浮层后聚焦该行并高亮，便于在大批条件中快速定位。
   */
  focusConditionId?: string
  /**
   * 枚举字段的候选项来源（可选，运行时解析）。
   *
   * 返回 `undefined` 的字段退回自带的静态 `options`（openapi enum 提取的那份）。
   * 页面传入基于字典的实现，候选项与文案即可跟随后端字典（含多语言），
   * 不必等 `pnpm api` 重新生成字段目录 —— 见 .agents/docs/dict-options.md。
   */
  resolveFieldOptions?: ResolveFilterFieldOptions
}

/**
 * 通用筛选条件构建器。
 *
 * 设计说明：后端是扁平的具名 query 参数，每个参数语义固定
 * （例如昵称只有“包含”、等级区间由 xxx_min/xxx_max 两个参数表达），
 * 因此不提供自由操作符选择，而是按参数类型直接渲染对应值控件：
 * enum → 下拉、boolean → 是/否、integer → 数字、array → 逗号分隔多值、
 * min/max 对 → 区间双输入。
 *
 * 每个真实 query 参数在同一份条件中只允许出现一次：
 * 字段下拉直接过滤掉已被其它行占用的参数（区间字段会占用它的 _min 与 _max），
 * 全部用尽时禁用「添加筛选器」。
 */
export function FilterBuilder({
  fields,
  value,
  onChange,
  onApply,
  onClear,
  onClose,
  focusConditionId,
  resolveFieldOptions,
}: FilterBuilderProps) {
  const { t } = useTranslation()
  const idSeed = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  // 从 chip 进入时，把焦点落到该条件的「字段（key）选择器」上，而不是整行
  useEffect(() => {
    if (!focusConditionId) return
    const row = listRef.current?.querySelector(
      `[data-condition-id="${focusConditionId}"]`,
    )
    row?.querySelector<HTMLElement>('[data-kumo-part="trigger"]')?.focus()
  }, [focusConditionId])

  /**
   * 已被占用的真实 query 参数名。
   * 区间字段会同时占用它的 _min 与 _max 两个真实参数。
   */
  const usedParams = new Set<string>()
  for (const condition of value) {
    const field = fields.find((item) => item.param === condition.field)
    if (field) {
      usedParams.add(field.param)
      if (field.paramTo) usedParams.add(field.paramTo)
    } else {
      // 目录中已不存在（例如接口参数调整后的历史条件）：退化为按原值占用
      usedParams.add(condition.field)
    }
  }

  /** 字段是否仍可选：其真实参数（含区间上限）都未被占用；currentField 保留自身以便回显 */
  const isFieldAvailable = (field: QueryFilterField, currentField: string) => {
    if (field.param === currentField) return true
    if (usedParams.has(field.param)) return false
    return !(field.paramTo && usedParams.has(field.paramTo))
  }

  const selectableFields = (currentField: string) =>
    fields.filter((field) => isFieldAvailable(field, currentField))

  /**
   * 字段下拉的 items（value → label）。
   * Kumo Select 依赖 items 推导选中项文本；只给 Select.Option children 时，
   * 触发器会退化为显示 value（即 query 参数名）。
   */
  const selectableItems = (currentField: string) =>
    Object.fromEntries(
      selectableFields(currentField).map((field) => [field.param, field.label]),
    )

  const firstAvailableField = () => fields.find((field) => isFieldAvailable(field, ''))

  /** 区间字段占用两个参数，故不能用行数判断是否还能添加 */
  const canAdd = Boolean(firstAvailableField())

  const createCondition = (field: string): FilterCondition => ({
    id: `filter-${idSeed.current++}`,
    field,
    value: '',
  })

  const fieldOf = (param: string) => fields.find((item) => item.param === param)

  const patch = (id: string, next: Partial<FilterCondition>) => {
    onChange(value.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }

  const remove = (id: string) => {
    onChange(value.filter((item) => item.id !== id))
  }

  const add = () => {
    // 只添加真实 query 参数尚未被占用的字段，保证每个参数只出现一次
    const next = firstAvailableField()
    if (!next) return
    onChange([...value, createCondition(next.param)])
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onApply?.()
    }
  }

  /** 按字段类型渲染值控件 */
  const renderValueControl = (condition: FilterCondition, field?: QueryFilterField) => {
    if (!field) return null

    const ariaLabel = field.label

    switch (field.control) {
      case 'enum': {
        // 候选优先取运行时解析结果（如后端字典），否则退回字段自带的静态 options
        const enumOptions =
          resolveFieldOptions?.(field) ??
          (field.options ?? []).map((option) => ({ value: option, label: option }))

        return (
          <Select
            aria-label={ariaLabel}
            // w-full + shrink 用于覆盖 Kumo Select trigger 自带的 w-max / shrink-0
            className="min-w-0 w-full shrink"
            items={Object.fromEntries(
              enumOptions.map((option) => [option.value, option.label]),
            )}
            value={condition.value || undefined}
            onValueChange={(next) => patch(condition.id, { value: String(next ?? '') })}
          />
        )
      }

      case 'boolean':
        return (
          <Select
            aria-label={ariaLabel}
            className="min-w-0 w-full shrink"
            items={{
              true: t('table.filterBuilder.yes', '是'),
              false: t('table.filterBuilder.no', '否'),
            }}
            value={condition.value || undefined}
            onValueChange={(next) => patch(condition.id, { value: String(next ?? '') })}
          />
        )

      case 'number-range':
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {/* 区间作为 grid item 已撑满，内部两个输入框再各占一半 */}
            <Input
              type="number"
              className="min-w-0 w-full"
              aria-label={`${ariaLabel} ${t('table.filterBuilder.rangeFrom', '下限')}`}
              placeholder={t('table.filterBuilder.rangeFrom', '下限')}
              value={condition.value}
              onChange={(event) => patch(condition.id, { value: event.target.value })}
              onKeyDown={handleKeyDown}
            />
            <span className="shrink-0 text-kumo-subtle">~</span>
            <Input
              type="number"
              className="min-w-0 w-full"
              aria-label={`${ariaLabel} ${t('table.filterBuilder.rangeTo', '上限')}`}
              placeholder={t('table.filterBuilder.rangeTo', '上限')}
              value={condition.valueTo ?? ''}
              onChange={(event) => patch(condition.id, { valueTo: event.target.value })}
              onKeyDown={handleKeyDown}
            />
          </div>
        )

      case 'array':
        return (
          <Input
            className="min-w-0 w-full"
            aria-label={ariaLabel}
            placeholder={t('table.filterBuilder.arrayPlaceholder', '多个值用逗号分隔')}
            value={condition.value}
            onChange={(event) => patch(condition.id, { value: event.target.value })}
            onKeyDown={handleKeyDown}
          />
        )

      case 'number':
        return (
          <Input
            type="number"
            className="min-w-0 w-full"
            aria-label={ariaLabel}
            value={condition.value}
            onChange={(event) => patch(condition.id, { value: event.target.value })}
            onKeyDown={handleKeyDown}
          />
        )

      default:
        return (
          <Input
            className="min-w-0 w-full"
            aria-label={ariaLabel}
            value={condition.value}
            onChange={(event) => patch(condition.id, { value: event.target.value })}
            onKeyDown={handleKeyDown}
          />
        )
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h2 className="m-0 text-base leading-6 font-medium">
          {t('table.filterBuilder.title', '筛选器')}
        </h2>
        {onClose ? (
          <Button
            variant="ghost"
            shape="square"
            icon={<XIcon size={14} />}
            aria-label={t('table.filterBuilder.close', '关闭')}
            onClick={onClose}
          />
        ) : null}
      </div>

      {/* 条件行区域：由 flex-1 + min-h-0 承担剩余空间，超出浮层 max-h 时在此内部滚动，
          overscroll-contain 避免滚到边界后带动外层页面 */}
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain overflow-x-hidden px-0.5 py-1"
      >
        {value.length === 0 ? (
          <p className="py-1 text-xs text-kumo-subtle">
            {t('table.filterBuilder.empty', '暂无条件，可从下方添加筛选字段')}
          </p>
        ) : null}

        {value.map((condition) => {
          const field = fieldOf(condition.field)
          return (
            <div
              key={condition.id}
              data-condition-id={condition.id}
              className="flex items-center gap-1.5"
            >
              <Select
                aria-label={t('table.filterBuilder.field', '字段')}
                // 字段名是唯一固定宽度的一列（w-30 = 7.5rem = 120px），其余宽度全部让给值控件
                className="w-30 shrink-0"
                items={selectableItems(condition.field)}
                value={condition.field}
                onValueChange={(next) =>
                  patch(condition.id, {
                    field: String(next ?? ''),
                    value: '',
                    valueTo: '',
                  })
                }
              />

              {/*
                值控件宽度需要两层同时设定，缺一不可：
                1. Kumo Select 的 className 只作用于 trigger，其外层 <div class="grid gap-2">
                   是组件硬编码的 wrapper（无 className 入口）；
                2. trigger / input 自身还要 w-full（Select 的 trigger 自带 w-max shrink-0，
                   需用 w-full + shrink 覆盖，否则不会跟着 wrapper 增宽）。
                这里用 grid-cols-1 承载：grid item 默认 stretch，wrapper 无需子选择器即可撑满。
              */}
              <div className="grid min-w-0 flex-1 grid-cols-1 items-center">
                {renderValueControl(condition, field)}
              </div>

              <Button
                variant="ghost"
                shape="square"
                className="shrink-0"
                icon={<TrashIcon size={14} />}
                aria-label={t('table.filterBuilder.remove', {
                  defaultValue: '移除 {{field}} 筛选条件',
                  field: field?.label ?? condition.field,
                })}
                onClick={() => remove(condition.id)}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-between">
        <Button
          variant="ghost"
          size="xs"
          icon={<PlusIcon size={14} />}
          disabled={!canAdd}
          onClick={add}
        >
          {t('table.filterBuilder.add', '添加筛选器')}
        </Button>
        <div className="flex items-center gap-2">
          <p className="text-xs text-kumo-subtle">
            {t('table.filterBuilder.enterHint', '按 Enter 应用')}
          </p>
          <Button variant="ghost" size="xs" onClick={onClear}>
            {t('table.filterBuilder.clearAll', '全部清除')}
          </Button>
          <Button variant="primary" size="xs" onClick={onApply}>
            {t('table.filterBuilder.apply', '应用')}
          </Button>
        </div>
      </div>
    </div>
  )
}
