import { Badge } from '@cloudflare/kumo'
import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { CopyableValue } from '#/components/copyable-value'
import { useSchemaColumns } from '#/components/data-table'
import type { ColumnRenderer, SchemaColumnSpec } from '#/components/data-table'
import { displayDictCode } from '#/lib/dict-key'
import { toDisplayText } from '#/lib/to-text'
import { DictItemText } from '#/lib/dict-messages'
import { DICT_ITEM_SCHEMA, DICT_TYPE_SCHEMA } from './data-dict-types'
import type { DictItem, DictType } from './data-dict-types'
import { dictIsDefaultKey, dictStatusKey, dictValueTypeKey, toEpochMs } from './data-dict-options'

/**
 * 数据字典的列编排与枚举渲染（分类树表与字典项表共用本文件，避免两处重复维护）。
 *
 * 约定：一列只呈现一项数据；列 id 与后端字段名一致；文案取 `dataDict:columns.<字段名>`。
 *
 * 两张表都用 `useSchemaColumns`，但 schema 来自模块自己声明的 `DICT_TYPE_SCHEMA` /
 * `DICT_ITEM_SCHEMA`（不是生成产物）—— 原因见 `data-dict-types.ts`。
 */

/** 数据列统一最小宽度。 */
export const DICT_MIN_COLUMN_WIDTH = 'min-w-[120px]'
/** 名称列放宽，容纳分类名 / 字典项名。 */
export const DICT_NAME_COLUMN_WIDTH = 'min-w-[200px]'
/** 完整编码列放宽，形如 `common.channel`。 */
export const DICT_CODE_COLUMN_WIDTH = 'min-w-[180px]'

/** 分类树的默认隐藏列：**默认为空** —— 默认展示全部字段，由用户在「显示选项」里按需收起。 */
export const DICT_TYPE_DEFAULT_HIDDEN_COLUMNS: readonly string[] = []

/** 分类树的列编排（顺序即白名单）。 */
export const DICT_TYPE_COLUMN_SPECS: SchemaColumnSpec<DictType>[] = [
  // 约定：ID 永远排在第一列（便于与后端数据对照）
  { field: 'id', render: 'number' },
  {
    field: 'name',
    render: 'typeName',
    meta: { headerClassName: DICT_NAME_COLUMN_WIDTH },
  },
  { field: 'code', render: 'code' },
  { field: 'p_code', render: 'copyCode', meta: { headerClassName: DICT_CODE_COLUMN_WIDTH } },
  { field: 'type', render: 'valueType' },
  { field: 'sort', render: 'number' },
  { field: 'status', render: 'status' },
  { field: 'id_path', render: 'code' },
  { field: 'remark' },
  { field: 'created_at', render: 'datetime' },
]

/**
 * 字典项的默认隐藏列：**默认为空** —— 默认展示全部字段，由用户在「显示选项」里按需收起。
 *
 * （`code` 仍在列白名单里：同一分类下所有项的 `code` 相同、信息量低，
 *   需要时用户可以自己收起；要恢复「默认收起」就把 `'code'` 加回这里。）
 */
export const DICT_ITEM_DEFAULT_HIDDEN_COLUMNS: readonly string[] = []

/** 字典项的列编排（顺序即白名单）。 */
export const DICT_ITEM_COLUMN_SPECS: SchemaColumnSpec<DictItem>[] = [
  // 约定：ID 永远排在第一列
  { field: 'id', render: 'number' },
  {
    field: 'label',
    render: 'itemLabel',
    meta: { headerClassName: DICT_NAME_COLUMN_WIDTH },
  },
  { field: 'value', render: 'copyValue' },
  { field: 'is_default', render: 'isDefault' },
  { field: 'code', render: 'copyCode', meta: { headerClassName: DICT_CODE_COLUMN_WIDTH } },
  { field: 'sort', render: 'number' },
  { field: 'status', render: 'status' },
  { field: 'update_by_user', path: 'update_by_user.nick_name', render: 'updater' },
  { field: 'remark' },
  { field: 'created_at', render: 'datetime' },
  { field: 'updated_at', render: 'datetime' },
]

/** 枚举值无法识别时的兜底展示：保留原始值，避免静默丢数据。 */
export function RawEnumValue({ value, empty }: { value: unknown; empty: string }) {
  const text = value === null || value === undefined || value === '' ? empty : toDisplayText(value)
  return <span className="text-sm text-kumo-subtle">{text}</span>
}

/** 分类的键值类型徽章（string / number）—— 分类树与右侧信息条共用。 */
export function dictValueTypeBadge(value: unknown, t: TFunction, empty = '-'): ReactNode {
  const key = dictValueTypeKey(value)
  if (!key) return <RawEnumValue value={value} empty={empty} />
  return <Badge variant={key === 'number' ? 'info' : 'secondary'}>{t(`valueType.${key}`)}</Badge>
}

/** 状态徽章（启用 / 禁用）—— 分类树与字典项表共用。 */
export function dictStatusBadge(value: unknown, t: TFunction, empty = '-'): ReactNode {
  const key = dictStatusKey(value)
  if (!key) return <RawEnumValue value={value} empty={empty} />
  return (
    <Badge variant={key === 'enabled' ? 'success' : 'secondary'} appearance="dot">
      {t(`status.${key}`)}
    </Badge>
  )
}

/** 是否默认徽章（是 / 否）。 */
export function dictIsDefaultBadge(value: unknown, t: TFunction, empty = '-'): ReactNode {
  const key = dictIsDefaultKey(value)
  if (!key) return <RawEnumValue value={value} empty={empty} />
  return key === 'yes' ? (
    <Badge variant="success">{t('isDefault.yes')}</Badge>
  ) : (
    <span className="text-sm text-kumo-subtle">{t('isDefault.no')}</span>
  )
}

/** 时间列：后端是秒级数字且存在脏值，`toEpochMs` 容错解析后再交给全局时区格式化。 */
function renderDictTime(
  value: unknown,
  empty: string,
  formatDateTime: (input: number) => string,
): ReactNode {
  const ms = toEpochMs(value)
  return (
    <span className="text-xs text-kumo-subtle whitespace-nowrap">
      {ms === null ? empty : formatDateTime(ms)}
    </span>
  )
}

/** 可复制的机器串（键值 / 分类编码）：空值回落为占位符。 */
function renderCopyable(value: unknown, empty: string): ReactNode {
  const text = value === null || value === undefined || value === '' ? '' : toDisplayText(value)
  return text ? (
    <CopyableValue text={text} />
  ) : (
    <span className="text-sm text-kumo-subtle">{empty}</span>
  )
}

/**
 * 分类编码（分类的 `p_code`、字典项的 `code`）。
 *
 * 显示与复制都走**命名空间适配**：后端给的是新架构 code `new.user.status`，
 * 而前端业务一律用逻辑 code `user.status`（见 `#/lib/dict-key`）。
 * 字典项的 `value` 不走这里 —— 它是业务值，不是 code。
 */
function renderDictCode(value: unknown, empty: string): ReactNode {
  const text =
    value === null || value === undefined || value === ''
      ? ''
      : displayDictCode(toDisplayText(value))
  return text ? (
    <CopyableValue text={text} />
  ) : (
    <span className="text-sm text-kumo-subtle">{empty}</span>
  )
}

/**
 * 生成分类列的渲染器。
 *
 * @param options.onOpenType 点击分类名称时的行为（下钻到该分类）；缺省时渲染为纯文本
 */
function useDictTypeRenderers(options?: {
  onOpenType?: (node: DictType) => void
}): Record<string, ColumnRenderer<DictType>> {
  const onOpenType = options?.onOpenType

  return useMemo(
    () => ({
      typeName: ({ row, empty }) => {
        const label = row.name || row.code || empty
        return onOpenType ? (
          <button
            type="button"
            onClick={() => onOpenType(row)}
            className="max-w-64 truncate text-start font-medium text-kumo-default hover:underline"
          >
            {label}
          </button>
        ) : (
          <span className="font-medium text-kumo-default whitespace-nowrap">{label}</span>
        )
      },
      code: ({ value, empty }) => (
        <span className="font-mono text-sm text-kumo-default whitespace-nowrap">
          {value === null || value === undefined || value === '' ? empty : toDisplayText(value)}
        </span>
      ),
      copyCode: ({ value, empty }) => renderDictCode(value, empty),
      valueType: ({ value, t, empty }) => dictValueTypeBadge(value, t, empty),
      status: ({ value, t, empty }) => dictStatusBadge(value, t, empty),
      datetime: ({ value, empty, formatDateTime }) => renderDictTime(value, empty, formatDateTime),
    }),
    [onOpenType],
  )
}

/** 组装分类树的列。 */
export function useDictTypeColumns(options?: { onOpenType?: (node: DictType) => void }) {
  const renderers = useDictTypeRenderers(options)

  return useSchemaColumns<DictType>(DICT_TYPE_SCHEMA, {
    ns: 'dataDict',
    columns: DICT_TYPE_COLUMN_SPECS,
    baseMeta: { headerClassName: DICT_MIN_COLUMN_WIDTH },
    renderers,
  })
}

/** 组装字典项的列。 */
export function useDictItemColumns() {
  const renderers = useMemo<Record<string, ColumnRenderer<DictItem>>>(
    () => ({
      itemLabel: ({ row, empty }) => (
        <span className="font-medium text-kumo-default whitespace-nowrap">
          {/* 文案优先取字典文案库（src/messages/dict），未收录时回落后端 label，最后用空值占位 */}
          <DictItemText item={row} fallback={row.label || empty} />
        </span>
      ),
      copyValue: ({ value, empty }) => renderCopyable(value, empty),
      copyCode: ({ value, empty }) => renderDictCode(value, empty),
      isDefault: ({ value, t, empty }) => dictIsDefaultBadge(value, t, empty),
      status: ({ value, t, empty }) => dictStatusBadge(value, t, empty),
      updater: ({ row, empty }) => (
        <span className="text-sm text-kumo-default whitespace-nowrap">
          {row.update_by_user?.nick_name || row.update_by_user?.username || empty}
        </span>
      ),
      datetime: ({ value, empty, formatDateTime }) => renderDictTime(value, empty, formatDateTime),
    }),
    [],
  )

  return useSchemaColumns<DictItem>(DICT_ITEM_SCHEMA, {
    ns: 'dataDict',
    columns: DICT_ITEM_COLUMN_SPECS,
    baseMeta: { headerClassName: DICT_MIN_COLUMN_WIDTH },
    renderers,
  })
}
