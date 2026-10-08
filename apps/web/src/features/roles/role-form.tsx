import { Button, Input, Switch } from '@cloudflare/kumo'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

/** 角色表单的值域：弹窗（新建）与详情页（编辑）**共用同一份**。 */
export interface RoleFormValues {
  name: string
  code: string
  description: string
  /** 1 启用 / 2 禁用 */
  status: number
  sort: number
}

export const ROLE_STATUS = { enabled: 1, disabled: 2 } as const

export const DEFAULT_ROLE_FORM_VALUES: RoleFormValues = {
  name: '',
  code: '',
  description: '',
  status: ROLE_STATUS.enabled,
  sort: 1,
}

export type RoleFormFieldError = { field: 'name' | 'code'; message: string }

/**
 * 表单校验：**导出**给两条提交路径共用。
 *
 * 详情页的浮条保存不经过 `<form>` 的 `submit`（见 skill `editable-detail` 坑 1），
 * 校验若只写在表单内部，浮条那条路径就会绕过它 —— 所以这里是唯一实现。
 */
export function validateRoleForm(values: RoleFormValues, t: TFunction): RoleFormFieldError | null {
  const name = values.name.trim()
  if (!name) {
    return { field: 'name', message: t('form.nameRequired', '请输入角色名称') }
  }
  if (name.length > 50) {
    return { field: 'name', message: t('form.nameTooLong', '名称不能超过 50 个字符') }
  }

  const code = values.code.trim()
  if (!code) {
    return { field: 'code', message: t('form.codeRequired', '请输入角色码') }
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(code)) {
    return {
      field: 'code',
      message: t(
        'form.codeInvalid',
        '角色码只允许小写字母开头，后接小写字母 / 数字 / 下划线 / 连字符',
      ),
    }
  }
  return null
}

export interface RoleFormProps {
  /** 弹窗形态传（`LayerDialog.Actions.Primary form={formId}` 关联提交）；详情页不传。 */
  formId?: string
  initialValues?: Partial<RoleFormValues>
  /** 详情页传 false：启用开关在页头（只能有一个真值来源）。 */
  showStatusSwitch?: boolean
  status?: RoleFormValues['status']
  onStatusChange?: (status: RoleFormValues['status']) => void
  /** 草稿上报：详情页据此判断「未保存更改」。 */
  onValuesChange?: (values: RoleFormValues) => void
  /** 只读形态：整片字段区套 `fieldset[disabled]`（无 `role:edit` 时）。 */
  readOnly?: boolean
  /** 内置角色的角色码不可改（它是账号 → 角色的关联键）。 */
  codeLocked?: boolean
  submitting?: boolean
  submitError?: string | null
  submitLabel?: string
  showActions?: boolean
  onSubmit: (values: RoleFormValues) => void
  onCancel?: () => void
}

/**
 * 角色表单（弹窗与详情页共用）。
 *
 * 与 `FeatureForm` 同构：字段、校验、只读开关只有一份，弹窗只留外壳，
 * 详情页内嵌它并把动作交给底部浮条。
 */
export function RoleForm({
  formId,
  initialValues,
  showStatusSwitch = true,
  status: controlledStatus,
  onStatusChange,
  onValuesChange,
  readOnly = false,
  codeLocked = false,
  submitting = false,
  submitError = null,
  submitLabel,
  showActions = true,
  onSubmit,
  onCancel,
}: RoleFormProps) {
  const { t } = useTranslation('roles')

  const [name, setName] = useState(initialValues?.name ?? '')
  const [code, setCode] = useState(initialValues?.code ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [innerStatus, setInnerStatus] = useState<number>(
    initialValues?.status ?? ROLE_STATUS.enabled,
  )
  const [sortText, setSortText] = useState(String(initialValues?.sort ?? 1))
  const [fieldError, setFieldError] = useState<RoleFormFieldError | null>(null)

  const status = controlledStatus ?? innerStatus
  const setStatus = useCallback(
    (next: number) => {
      setInnerStatus(next)
      onStatusChange?.(next)
    },
    [onStatusChange],
  )

  const buildValues = useCallback(
    (): RoleFormValues => ({
      name,
      code,
      description,
      status,
      sort: Number(sortText) || 0,
    }),
    [name, code, description, status, sortText],
  )

  // 草稿上报：任何字段变化都回调（依赖列全所有字段 + 回调本身）
  useEffect(() => {
    onValuesChange?.(buildValues())
  }, [buildValues, onValuesChange])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const values = buildValues()
    // 与详情页浮条共用同一个校验
    const invalid = validateRoleForm(values, t)
    if (invalid) {
      setFieldError(invalid)
      return
    }
    setFieldError(null)
    onSubmit(values)
  }

  const body = (
    <fieldset disabled={readOnly} className="contents">
      <>
        <Input
          label={t('form.name', '角色名称')}
          labelTooltip={t('form.nameDescription', '用于展示的名称，2–50 个字符')}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (fieldError?.field === 'name') setFieldError(null)
          }}
          error={fieldError?.field === 'name' ? fieldError.message : undefined}
          // 弹窗形态才抢焦点；详情页内嵌时不抢
          autoFocus={formId !== undefined}
        />

        <Input
          label={t('form.code', '角色码')}
          labelTooltip={
            codeLocked
              ? t('form.codeLocked', '内置角色的角色码不可修改')
              : t('form.codeDescription', '小写字母开头，登录账号按它关联角色')
          }
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
            if (fieldError?.field === 'code') setFieldError(null)
          }}
          error={fieldError?.field === 'code' ? fieldError.message : undefined}
        />

        <Input
          label={t('form.description', '描述')}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <Input
          label={t('form.sort', '排序')}
          labelTooltip={t('form.sortDescription', '同级内从小到大排列')}
          type="number"
          value={sortText}
          onChange={(event) => setSortText(event.target.value)}
        />

        {showStatusSwitch ? (
          <Switch
            checked={status === ROLE_STATUS.enabled}
            onCheckedChange={(checked) =>
              setStatus(checked ? ROLE_STATUS.enabled : ROLE_STATUS.disabled)
            }
            // 文案跟随当前状态：开=启用、关=禁用
            label={
              status === ROLE_STATUS.enabled
                ? t('form.statusEnabled', '启用')
                : t('form.statusDisabled', '禁用')
            }
          />
        ) : null}
      </>
    </fieldset>
  )

  const errorBlock = submitError ? (
    <p className="text-sm text-kumo-danger" role="alert">
      {submitError}
    </p>
  ) : null

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {body}
      {errorBlock}
      {showActions && !readOnly ? (
        <div className="flex items-center gap-2">
          <Button variant="primary" type="submit" loading={submitting}>
            {submitLabel ?? t('form.save', '保存')}
          </Button>
          {onCancel ? (
            <Button variant="secondary" type="button" onClick={onCancel} disabled={submitting}>
              {t('form.cancel', '取消')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
