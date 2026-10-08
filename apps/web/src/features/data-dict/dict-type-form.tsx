import { Input, InputArea, Radio, Switch } from '@cloudflare/kumo'
import type { TFunction } from 'i18next'
import { useCallback, useEffect, useState } from 'react'
import { useAiFormFields } from '#/features/ai/core'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DICT_STATUS, DICT_VALUE_TYPE, toDictStatus, toDictValueType } from './data-dict-options'
import type { DictBinaryFlag } from './data-dict-options'
import type { DictType, DictTypeFormValues } from './data-dict-types'

/**
 * 分类（type）的表单本体 —— **弹窗与详情页共用**（与 features 的 `FeatureForm` 同一套写法）。
 *
 * 两种用法：
 * - **弹窗**（`DictTypeFormDialog`）：传 `formId`，把 `<form>` 交给 `LayerDialog.Actions.Primary`
 *   用 HTML `form` 属性提交，因此 `formId` 必须页面内唯一；
 * - **详情页内嵌**：不传 `formId`，`showStatusSwitch={false}` + 受控 `status`
 *   （「启用」开关放在页头，与 features 详情页一致），`onValuesChange` 上报草稿，
 *   保存交给底部 `UnsavedChangesBar` 浮条而不是表单内的按钮。
 *
 * 约定：
 * - 字段说明统一放 `labelTooltip`，不用 `description` 在输入框下方再占一行；
 * - 「上级分类」不在这里出现：由调用方按入口决定（新建子分类 = 该分类 id；顶级 = 根分类），
 *   弹窗只用 `parentName` 说明「将创建在谁下面」。
 */

/** 分类名称长度（后端 `v1.DataTypeCreateReq.name` 为 2–30）。 */
const NAME_MIN = 2
const NAME_MAX = 30

/** 校验失败时命中的字段与文案。 */
export type DictTypeFormFieldError = {
  field: 'name' | 'code'
  message: string
}

/**
 * 表单校验（**表单自身与详情页浮条共用**）。
 *
 * 详情页的保存走底部浮条，**不经过 `<form>` 的 submit**，所以校验必须抽出来给两条路径都调用 ——
 * 否则「把名称清空 / 只填 1 个字 → 点浮条保存」会绕过前端校验直接发请求，只能等后端报错。
 */
export function validateDictTypeForm(
  values: DictTypeFormValues,
  t: TFunction,
): DictTypeFormFieldError | null {
  const name = (values.name ?? '').trim()
  // 后端 name 校验 2–30 字符，先在前端拦一道，避免无谓的请求往返
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return {
      field: 'name',
      message: t('form.nameLength', '名称长度需在 {{min}}–{{max}} 个字符之间', {
        min: NAME_MIN,
        max: NAME_MAX,
      }),
    }
  }
  if (!(values.code ?? '').trim()) {
    return { field: 'code', message: t('form.codeRequired', '请填写分类编码') }
  }
  return null
}

export interface DictTypeFormProps {
  /** 表单 id：弹窗形态用它把 `LayerDialog.Actions.Primary` 关联到 Body 里的 form。 */
  formId?: string
  /**
   * 编辑场景的初始值；缺省即新建（调用方靠 `key` 重建初值）。
   *
   * 类型放宽到 `DictType | DictTypeFormValues`：调用方通常直接把接口返回的节点丢进来，
   * 而响应里的 `status` / `type` 是 `number`，组件内部会用 `toDictStatus` / `toDictValueType`
   * 归一化，不需要调用方先做类型转换。
   */
  initialValues?: Partial<DictTypeFormValues> | DictType
  /** 提交失败信息（就地显示在表单底部；详情页也把它交给浮条显示）。 */
  submitError?: string | null
  /** 是否渲染「启用」开关（详情页传 false：开关在页头，用受控 `status`）。 */
  showStatusSwitch?: boolean
  /** 受控状态（`showStatusSwitch={false}` 时由外部提供）。 */
  status?: DictBinaryFlag
  onStatusChange?: (next: DictBinaryFlag) => void
  /** 草稿上报：详情页据此判断「未保存更改」。 */
  onValuesChange?: (values: DictTypeFormValues) => void
  /**
   * AI 表单桥的 id：**传了才注册**（`useAiFormFields`）。
   *
   * 只有"这一页只有一张表单"的场景（分类详情）该传：新建分类的弹窗与它可能同时存在，
   * 两张表单注册同一个 id 会互相覆盖 —— 弹窗那份由它自己的调用方决定要不要接。
   */
  aiFormId?: string
  onSubmit: (values: DictTypeFormValues) => void
}

export function DictTypeForm({
  aiFormId,
  formId,
  initialValues,
  submitError,
  showStatusSwitch = true,
  status: controlledStatus,
  onStatusChange,
  onValuesChange,
  onSubmit,
}: DictTypeFormProps) {
  const { t } = useTranslation('dataDict')

  const [name, setName] = useState(initialValues?.name ?? '')
  const [code, setCode] = useState(initialValues?.code ?? '')
  const [valueType, setValueType] = useState(
    toDictValueType(initialValues?.type ?? DICT_VALUE_TYPE.string),
  )
  const [sortText, setSortText] = useState(String(initialValues?.sort ?? 0))
  const [innerStatus, setInnerStatus] = useState(
    toDictStatus(initialValues?.status ?? DICT_STATUS.enabled),
  )
  const [remark, setRemark] = useState(initialValues?.remark ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)

  // 状态可以是受控的（详情页把开关放在页头）也可以是组件自带的（弹窗内）
  const status = controlledStatus ?? innerStatus
  const applyStatus = onStatusChange ?? setInnerStatus

  /** 当前草稿（提交与「未保存更改」比较共用同一份构造逻辑）。 */
  const buildValues = useCallback((): DictTypeFormValues => {
    const sort = Number(sortText)
    return {
      id: initialValues?.id,
      name: name.trim(),
      code: code.trim(),
      type: valueType,
      status,
      // 显式带上原上级：编辑时后端若收到缺失的 parent_id 会把分类当成根层级而移走
      parent_id: initialValues?.parent_id ?? 0,
      sort: Number.isFinite(sort) ? sort : 0,
      remark: remark.trim() || undefined,
    }
  }, [code, initialValues?.id, initialValues?.parent_id, name, remark, sortText, status, valueType])

  // 把草稿上报给外部：详情页据此判断「未保存更改」，并在浮条上提交
  useEffect(() => {
    onValuesChange?.(buildValues())
  }, [buildValues, onValuesChange])

  /*
    AI 表单桥的**字段读写那一半**（提交由页面用同一个 id 注册，见分类详情页）。
    传了 `aiFormId` 才注册：新建分类的弹窗与详情页的内嵌表单可能同时存在，
    两张表单注册同一个 id 会互相覆盖 —— 谁来注册由调用方决定。

    `fields` 用表单自己的 i18n 文案，`setValues` 逐字段写回本地 state
    （枚举先归一化；状态开关在详情页是受控的，优先走 `onStatusChange`）。
  */
  useAiFormFields(
    aiFormId
      ? {
          id: aiFormId,
          title: t('aiFormTitle', '分类信息（可编辑）'),
          fields: [
            {
              name: 'name',
              label: t('form.name', '名称'),
              type: 'text',
              required: true,
              description: t('form.nameDescription', '2–30 个字符，用于展示的分类名'),
            },
            {
              name: 'code',
              label: t('form.code', '分类编码'),
              type: 'text',
              required: true,
            },
            {
              name: 'type',
              label: t('form.valueType', '键值类型'),
              type: 'select',
              options: [
                { value: String(DICT_VALUE_TYPE.string), label: t('valueType.string', '字符串') },
                { value: String(DICT_VALUE_TYPE.number), label: t('valueType.number', '数字') },
              ],
            },
            {
              name: 'status',
              label: t('form.statusEnabled', '启用'),
              type: 'switch',
            },
            {
              name: 'sort',
              label: t('form.sort', '排序'),
              type: 'number',
            },
            {
              name: 'remark',
              label: t('form.remark', '备注'),
              type: 'text',
            },
          ],
          getValues: () => buildValues(),
          setValues: (patch) => {
            if (typeof patch.name === 'string') {
              setName(patch.name)
              if (nameError) setNameError(null)
            }
            if (typeof patch.code === 'string') {
              setCode(patch.code)
              if (codeError) setCodeError(null)
            }
            if (patch.type !== undefined) setValueType(toDictValueType(patch.type))
            if (patch.status !== undefined) {
              const next = toDictStatus(patch.status)
              if (onStatusChange) onStatusChange(next)
              else setInnerStatus(next)
            }
            if (patch.sort !== undefined) setSortText(String(patch.sort ?? 0))
            if (typeof patch.remark === 'string') setRemark(patch.remark)
          },
        }
      : null,
  )

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const values = buildValues()
      const invalid = validateDictTypeForm(values, t)
      // 错误就地显示在对应字段下方（浮条路径则把同一条文案显示在浮条上）
      setNameError(invalid?.field === 'name' ? invalid.message : null)
      setCodeError(invalid?.field === 'code' ? invalid.message : null)
      if (invalid) return

      onSubmit(values)
    },
    [buildValues, onSubmit, t],
  )

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={t('form.name', '名称')}
          labelTooltip={t('form.nameDescription', '2–30 个字符，用于展示的分类名')}
          error={nameError ? { message: nameError, match: 'customError' } : undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('form.namePlaceholder', '请输入名称')}
          // 弹窗形态（有 formId）自动聚焦首个字段；详情页内嵌时不抢焦点
          autoFocus={formId !== undefined}
        />

        <Input
          label={t('form.code', '分类编码')}
          labelTooltip={t('form.codeDescription', '业务侧获取选项时使用的 key，例如 channel')}
          error={codeError ? { message: codeError, match: 'customError' } : undefined}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t('form.codePlaceholder', 'channel')}
        />
      </div>

      {/*
        键值类型：后端必填（取值 1 / 2）。
        语义来自旧后台的同一字段（label「键值类型」、选项 string / number），见 data-dict-options.ts。
      */}
      <Radio.Group<number>
        legend={t('form.valueType', '键值类型')}
        orientation="horizontal"
        value={valueType}
        onValueChange={(next) => setValueType(toDictValueType(next))}
      >
        <Radio.Item<number>
          value={DICT_VALUE_TYPE.string}
          label={t('valueType.string', 'string')}
        />
        <Radio.Item<number>
          value={DICT_VALUE_TYPE.number}
          label={t('valueType.number', 'number')}
        />
      </Radio.Group>

      <Input
        label={t('form.sort', '排序')}
        labelTooltip={t('form.sortDescription', '同级内从小到大排列')}
        type="number"
        value={sortText}
        onChange={(event) => setSortText(event.target.value)}
      />

      <InputArea
        label={t('form.remark', '备注')}
        labelTooltip={t('form.remarkDescription', '可选，说明该分类的用途')}
        value={remark}
        onChange={(event) => setRemark(event.target.value)}
        placeholder={t('form.optional', '可选')}
      />

      {/* 详情页把「启用」开关放到页头（showStatusSwitch=false），弹窗里则就地渲染 */}
      {showStatusSwitch ? (
        <Switch
          checked={status === DICT_STATUS.enabled}
          onCheckedChange={(checked) =>
            applyStatus(checked ? DICT_STATUS.enabled : DICT_STATUS.disabled)
          }
          // 文案跟随当前状态：开=启用、关=禁用
          label={
            status === DICT_STATUS.enabled
              ? t('form.statusEnabled', '启用')
              : t('form.statusDisabled', '禁用')
          }
        />
      ) : null}

      {submitError ? (
        <p className="text-sm text-kumo-danger" role="alert">
          {submitError}
        </p>
      ) : null}
    </form>
  )
}
