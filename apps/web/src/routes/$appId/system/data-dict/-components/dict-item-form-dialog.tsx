import { Input, InputArea, LayerDialog, Radio, Switch } from '@cloudflare/kumo'
import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DICT_IS_DEFAULT,
  DICT_STATUS,
  toDictIsDefault,
  toDictStatus,
} from '../-data/data-dict-options'
import type { DictItem, DictItemFormValues } from '../-data/data-dict-types'

/**
 * 字典项（item）的新建 / 编辑弹窗。
 *
 * 与分类弹窗同一套写法（`LayerDialog.Actions.Primary` 用 HTML `form` 属性提交，
 * 字段说明放 `labelTooltip`，开关文案随状态）。
 *
 * 不出现「所属分类」选择器：字典项的 `type_id` 由当前页面决定（编辑时必须显式回传原值，
 * 否则后端可能把项挂到别处），弹窗只用 `typeName` 说明归属。
 *
 * 也不出现 `code`：后端按分类自动生成（实测同一分类下所有项的 `code` 完全相同），
 * Create / Update 请求体里都没有该字段。
 */

interface DictItemFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 所属分类 id（新建与编辑都必须带上）。 */
  typeId: number
  /** 所属分类名称（仅用于说明）。 */
  typeName?: string
  /**
   * 编辑场景的初始值；缺省即新建（弹窗关闭时不传，组件靠 `key` 重建初值）。
   * 类型放宽的理由同 `DictTypeFormDialog`：响应里的 `status` / `is_default` 是 `number`。
   */
  initialValues?: Partial<DictItemFormValues> | DictItem
  /** 表单 id（页面内唯一，供 Dialog Actions 关联提交）。 */
  formId: string
  title: string
  description?: string
  submitLabel: string
  submitting: boolean
  submitError?: string | null
  onSubmit: (values: DictItemFormValues) => void
}

/** 名称长度（后端 `v1.DataDictCreateReq.label` 为 2–30）。 */
const LABEL_MIN = 2
const LABEL_MAX = 30

export function DictItemFormDialog({
  open,
  onOpenChange,
  typeId,
  typeName,
  initialValues,
  formId,
  title,
  description,
  submitLabel,
  submitting,
  submitError,
  onSubmit,
}: DictItemFormDialogProps) {
  const { t } = useTranslation('dataDict')

  const [label, setLabel] = useState(initialValues?.label ?? '')
  const [value, setValue] = useState(initialValues?.value ?? '')
  const [isDefault, setIsDefault] = useState(toDictIsDefault(initialValues?.is_default))
  const [sortText, setSortText] = useState(String(initialValues?.sort ?? 0))
  const [status, setStatus] = useState(
    toDictStatus(initialValues?.status ?? DICT_STATUS.enabled),
  )
  const [remark, setRemark] = useState(initialValues?.remark ?? '')
  const [labelError, setLabelError] = useState<string | null>(null)
  const [valueError, setValueError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const trimmedLabel = label.trim()
      const trimmedValue = value.trim()

      // 后端 label 校验 2–30 字符，先在前端拦一道，避免无谓的请求往返
      if (trimmedLabel.length < LABEL_MIN || trimmedLabel.length > LABEL_MAX) {
        setLabelError(
          t('form.labelLength', '名称长度需在 {{min}}–{{max}} 个字符之间', {
            min: LABEL_MIN,
            max: LABEL_MAX,
          }),
        )
        return
      }
      if (!trimmedValue) {
        setValueError(t('form.valueRequired', '请填写键值'))
        return
      }

      setLabelError(null)
      setValueError(null)
      const sort = Number(sortText)

      onSubmit({
        id: initialValues?.id,
        type_id: typeId,
        label: trimmedLabel,
        value: trimmedValue,
        is_default: isDefault,
        status,
        sort: Number.isFinite(sort) ? sort : 0,
        remark: remark.trim() || undefined,
      })
    },
    [
      initialValues?.id,
      isDefault,
      label,
      onSubmit,
      remark,
      sortText,
      status,
      t,
      typeId,
      value,
    ],
  )

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{title}</LayerDialog.Title>
        {description ? (
          <LayerDialog.Description>{description}</LayerDialog.Description>
        ) : null}

        <LayerDialog.Body>
          <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
            {typeName ? (
              <p className="text-sm text-kumo-subtle">
                {t('form.typeHint', '所属分类：{{type}}', { type: typeName })}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label={t('form.label', '显示名')}
                labelTooltip={t('form.labelDescription', '2–30 个字符，业务下拉里展示的文本')}
                error={labelError ? { message: labelError, match: 'customError' } : undefined}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t('form.labelPlaceholder', '例如 google play')}
                autoFocus
              />

              <Input
                label={t('form.value', '键值')}
                labelTooltip={t('form.valueDescription', '业务侧实际存储与比较的值')}
                error={valueError ? { message: valueError, match: 'customError' } : undefined}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={t('form.valuePlaceholder', '例如 1')}
              />
            </div>

            {/*
              是否默认：旧后台是单选「是 / 否」（提交 1 / 2），实测同一分类下通常只有一条为 1，
              看着像单选语义，因此这里沿用单选而不是开关（开关的语义更像「允许多条默认」）。
            */}
            <Radio.Group<number>
              legend={t('form.isDefault', '是否默认')}
              orientation="horizontal"
              value={isDefault}
              onValueChange={(next) => setIsDefault(toDictIsDefault(next))}
            >
              <Radio.Item<number>
                value={DICT_IS_DEFAULT.yes}
                label={t('isDefault.yes', '是')}
              />
              <Radio.Item<number>
                value={DICT_IS_DEFAULT.no}
                label={t('isDefault.no', '否')}
              />
            </Radio.Group>

            <Input
              label={t('form.sort', '排序')}
              labelTooltip={t('form.sortDescription', '同分类内从小到大排列')}
              type="number"
              value={sortText}
              onChange={(event) => setSortText(event.target.value)}
            />

            <InputArea
              label={t('form.remark', '备注')}
              labelTooltip={t('form.remarkDescription', '可选，说明该键值的用途')}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder={t('form.optional', '可选')}
            />

            <Switch
              checked={status === DICT_STATUS.enabled}
              onCheckedChange={(checked) =>
                setStatus(checked ? DICT_STATUS.enabled : DICT_STATUS.disabled)
              }
              // 文案跟随当前状态：开=启用、关=禁用
              label={
                status === DICT_STATUS.enabled
                  ? t('form.statusEnabled', '启用')
                  : t('form.statusDisabled', '禁用')
              }
            />

            {submitError ? (
              <p className="text-sm text-kumo-danger" role="alert">
                {submitError}
              </p>
            ) : null}
          </form>
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('form.cancel', '取消')}>
          <LayerDialog.Actions.Primary form={formId} type="submit" loading={submitting}>
            {submitLabel}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
