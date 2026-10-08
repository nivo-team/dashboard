import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { createColumnHelper } from '@tanstack/react-table'
import type { ColumnDef, StockFeatures } from '@tanstack/react-table'
import { ArrayHoverCard } from '#/components/array-hover-card'
import { formatNumber, useTimezone } from '#/lib/format'

/**
 * 运行时 schema → 表格列的通用适配器。
 *
 * 数据源：`@hey-api/schemas` 生成的 `schemas.gen.ts`（OpenAPI components/schemas 的运行时 JSON Schema）。
 * 约定：一列只呈现一项数据；数组字段用悬浮卡片；嵌套对象字段用 `path` 展开取值。
 * 因此模块侧只需要写「列顺序 + 少量渲染覆盖」，文案统一走 `<namespace>:columns.<field>`（i18n）。
 */

/** 运行时 JSON Schema 中本适配器消费到的最小结构。 */
export interface RuntimeSchema {
  type?: string
  format?: string
  description?: string
  $ref?: string
  items?: RuntimeSchema
  properties?: Record<string, RuntimeSchema>
}

/** 内置渲染器：按 schema 类型 + 字段名自动推断。 */
export type SchemaRenderKind = 'text' | 'code' | 'number' | 'money' | 'time' | 'boolean' | 'array'

export interface ColumnRendererContext<TData> {
  /** 该单元格取值（已按 path 解析，可能是数组/对象/undefined）。 */
  value: unknown
  /** 整行数据。 */
  row: TData
  /** 列标题文案（i18n 后的结果），可直接用于悬浮卡片标题。 */
  label: string
  t: TFunction
  formatNumber: (value: number) => string
  /** 秒级/毫秒级时间戳统一格式化（随全局时区设置）。 */
  formatDateTime: (value: unknown) => string
  /** 空值占位文案。 */
  empty: string
  /** 数组字段的项渲染器（由列 spec 传入）。 */
  itemRender?: (value: unknown, index: number) => ReactNode
}

export type ColumnRenderer<TData> = (context: ColumnRendererContext<TData>) => ReactNode

export interface SchemaColumnSpec<TData> {
  /** schema 中的字段名：用于类型推断、默认列 id 与默认 i18n key。 */
  field: string
  /** 取值路径，支持 `a.b`（嵌套对象展开时使用）；缺省同 `field`。 */
  path?: string
  /** 列 id（缺省 = field，必须与后端排序字段名一致，保证排序参数正确）。 */
  id?: string
  /** i18n 文案 key 后缀（默认 = id，对应 `<ns>:columns.<key>`）。 */
  i18nKey?: string
  /** 渲染器名：内置 `SchemaRenderKind` 或 `options.renderers` 中注册的自定义名。 */
  render?: SchemaRenderKind | (string & {})
  /** 是否可排序（缺省由 `options.sortable` 白名单决定）。 */
  sortable?: boolean
  /**
   * 覆盖/追加列 meta（label / headerClassName / cellClassName / sticky…）。
   * `sticky` 表达**逻辑侧**：`'right'` 吸行尾（LTR 靠右、RTL 靠左）、`'left'` 吸行首，
   * 由 `DataTable` 按当前书写方向解析为物理方向后再交给 Kumo。
   */
  meta?: Record<string, unknown>
  /** 完全自定义单元格（优先级最高）。 */
  cell?: (row: TData) => ReactNode
  /** 数组字段的项渲染器（悬浮卡片内）。 */
  itemRender?: (value: unknown, index: number) => ReactNode
}

export interface UseSchemaColumnsOptions<TData> {
  /** i18n 命名空间（默认 common）。 */
  ns?: string
  /** 列编排：白名单 + 顺序（未列出的字段不会生成列）。 */
  columns: readonly (string | SchemaColumnSpec<TData>)[]
  /** 所有列共用的 meta（例如数据列统一最小宽度）。 */
  baseMeta?: Record<string, unknown>
  /** 可排序字段白名单。 */
  sortable?: readonly string[]
  /** 是/否/空 占位文案。 */
  labels?: { yes?: string; no?: string; empty?: string }
  /** 自定义渲染器：key 供 `spec.render` 引用。 */
  renderers?: Record<string, ColumnRenderer<TData>>
}

const TIME_FIELD_PATTERN = /(time|_at|date|_day)$/i
const MONEY_FIELD_PATTERN = /(price|amount|balance|money|fee|cost)/i

/** 取 schema 中字段的类型描述，推断内置渲染器。 */
function inferRenderKind(field: string, property?: RuntimeSchema): SchemaRenderKind {
  const type = property?.type

  if (type === 'array') return 'array'
  if (type === 'boolean') return 'boolean'

  if (type === 'integer' || type === 'number' || type === 'string') {
    if (TIME_FIELD_PATTERN.test(field)) return 'time'
    if (type !== 'string' && MONEY_FIELD_PATTERN.test(field)) return 'money'
    return type === 'string' ? 'text' : 'number'
  }

  return 'text'
}

/** 取字段描述的首个分句作为兜底文案（与 `scripts/gen-query-params.js` 的策略保持一致）。 */
function fallbackLabel(field: string, property?: RuntimeSchema): string {
  const description = property?.description?.trim()
  if (!description) return field
  const firstSentence = description.split(/[：:，,。;；]/)[0]?.trim()
  return firstSentence || field
}

/** 按 `a.b` 路径取值。 */
function getByPath(row: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, row)
}

/** 标量转文本；对象/数组不直接字符串化，避免出现 `[object Object]`。 */
function toText(value: unknown, empty: string): string {
  if (value === null || value === undefined || value === '') return empty
  if (typeof value === 'object') return empty
  return String(value)
}

function createDefaultRenderers<TData>(): Record<SchemaRenderKind, ColumnRenderer<TData>> {
  return {
    text: ({ value, empty }) => (
      <span className="text-sm text-kumo-default whitespace-nowrap">{toText(value, empty)}</span>
    ),
    code: ({ value, empty }) => (
      <span className="font-mono text-sm text-kumo-default whitespace-nowrap">
        {toText(value, empty)}
      </span>
    ),
    number: ({ value, empty, formatNumber: format }) => (
      <span className="font-mono text-sm text-kumo-default whitespace-nowrap">
        {value === null || value === undefined ? empty : format(Number(value))}
      </span>
    ),
    money: ({ value, empty, formatNumber: format }) => (
      <span className="font-mono text-sm text-kumo-default whitespace-nowrap">
        {value === null || value === undefined ? empty : format(Number(value))}
      </span>
    ),
    time: ({ value, empty, formatDateTime }) => (
      <span className="text-xs text-kumo-subtle whitespace-nowrap">
        {value ? formatDateTime(value) : empty}
      </span>
    ),
    boolean: ({ value, empty, t }) => {
      if (value === null || value === undefined) {
        return <span className="text-sm text-kumo-subtle">{empty}</span>
      }
      const isTruthy = value === true || value === 1
      return (
        <span
          className={
            isTruthy
              ? 'font-medium text-kumo-default whitespace-nowrap'
              : 'text-kumo-subtle whitespace-nowrap'
          }
        >
          {isTruthy ? t('cell.yes', '是') : t('cell.no', '否')}
        </span>
      )
    },
    array: ({ value, label, empty, itemRender }) => {
      const list = Array.isArray(value) ? value : []
      if (list.length === 0) {
        return <span className="text-sm text-kumo-subtle">{empty}</span>
      }
      return (
        <ArrayHoverCard
          title={label}
          items={list.map((item, index) =>
            itemRender ? itemRender(item, index) : <span key={index}>{toText(item, empty)}</span>,
          )}
        />
      )
    },
  }
}

/**
 * 依据运行时 schema 生成表格列定义。
 *
 * @example
 * ```tsx
 * const columns = useSchemaColumns<UserItem>(UserItemSchema, {
 *   ns: 'table-example',
 *   columns: ['nickname', 'id', 'email'],
 *   sortable: ['nickname', 'id'],
 *   baseMeta: { headerClassName: 'min-w-[120px]' },
 * })
 * ```
 */
export function useSchemaColumns<TData extends Record<string, unknown>>(
  schema: RuntimeSchema,
  options: UseSchemaColumnsOptions<TData>,
): ColumnDef<StockFeatures, TData>[] {
  const { t } = useTranslation(options.ns)
  const { formatDateTime } = useTimezone()

  const { columns: columnSpecs, baseMeta, sortable, labels, renderers } = options

  return useMemo(() => {
    const columnHelper = createColumnHelper<StockFeatures, TData>()
    const empty = labels?.empty ?? '-'
    const sortableSet = new Set(sortable ?? [])
    const defaults = createDefaultRenderers<TData>()
    const rendererMap = { ...defaults, ...(renderers ?? {}) } as Record<
      string,
      ColumnRenderer<TData> | undefined
    >

    const formatTimestamp = (value: unknown) => {
      const timestamp = Number(value)
      if (!Number.isFinite(timestamp) || timestamp <= 0) return empty
      const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp
      return formatDateTime(ms)
    }

    return columnSpecs.map((rawSpec) => {
      const spec: SchemaColumnSpec<TData> =
        typeof rawSpec === 'string' ? { field: rawSpec } : rawSpec

      const id = spec.id ?? spec.field
      const path = spec.path ?? spec.field
      const property = schema.properties?.[spec.field]
      const inferredKind = inferRenderKind(spec.field, property)
      const renderKind = spec.render ?? inferredKind
      const defaultKind: SchemaRenderKind =
        renderKind in defaults ? (renderKind as SchemaRenderKind) : inferredKind
      const renderer = rendererMap[renderKind] ?? defaults[defaultKind]

      const label = t(`columns.${spec.i18nKey ?? id}`, {
        defaultValue: fallbackLabel(spec.field, property),
      })

      return columnHelper.display({
        id,
        header: label,
        enableSorting: spec.sortable ?? sortableSet.has(id),
        // 列设置下拉依赖 meta.label 展示列名；spec.meta 可覆盖
        meta: {
          label: (spec.meta?.label as string | undefined) ?? label,
          ...baseMeta,
          ...spec.meta,
        },
        cell: ({ row }) => {
          if (spec.cell) return spec.cell(row.original)

          const value = getByPath(row.original, path)

          return renderer({
            value,
            row: row.original,
            label,
            t,
            formatNumber,
            formatDateTime: formatTimestamp,
            empty,
            itemRender: spec.itemRender,
          })
        },
      })
    })
  }, [schema, columnSpecs, baseMeta, sortable, labels, renderers, t, formatDateTime])
}
