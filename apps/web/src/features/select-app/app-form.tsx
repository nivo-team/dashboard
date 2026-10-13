import { Button, Input, Switch } from '@cloudflare/kumo'
import type { TFunction } from 'i18next'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** 应用表单的值域：弹窗（新建）与整页（编辑）**共用同一份**。 */
export interface AppFormValues {
  /** 应用标识：路由前缀与存储作用域，创建后不可修改。 */
  id: string
  name: string
  headline: string
  description: string
  domain: string
  apiBaseUrl: string
  badge: string
  category: string
  themeGradient: string
  /** 1 启用 / 2 禁用 */
  status: number
  sort: number
}

export const APP_STATUS = { enabled: 1, disabled: 2 } as const

type AppFormFieldError = {
  field: 'id' | 'name' | 'apiBaseUrl'
  message: string
}

/** 表单校验：只在这一处的提交路径上跑，字段本身不重复实现。 */
function validateAppForm(
  values: AppFormValues,
  t: TFunction,
  { idLocked = false }: { idLocked?: boolean } = {},
): AppFormFieldError | null {
  const id = values.id.trim()
  if (!idLocked) {
    if (!id) {
      return { field: 'id', message: t('form.idRequired', '请输入应用标识') }
    }
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) {
      return {
        field: 'id',
        message: t(
          'form.idInvalid',
          '应用标识只允许小写字母开头，后接小写字母 / 数字 / 连字符，长度 2-32',
        ),
      }
    }
  }

  const name = values.name.trim()
  if (!name) {
    return { field: 'name', message: t('form.nameRequired', '请输入应用名称') }
  }
  if (name.length > 50) {
    return { field: 'name', message: t('form.nameTooLong', '名称不能超过 50 个字符') }
  }

  const apiBaseUrl = values.apiBaseUrl.trim()
  if (apiBaseUrl && !/^https?:\/\//i.test(apiBaseUrl)) {
    return {
      field: 'apiBaseUrl',
      message: t('form.apiBaseUrlInvalid', '接口根地址需以 http:// 或 https:// 开头'),
    }
  }

  return null
}

export interface AppFormProps {
  /** 弹窗形态传（`LayerDialog.Actions.Primary form={formId}` 关联提交）；整页不传。 */
  formId?: string
  initialValues?: Partial<AppFormValues>
  /** 编辑态：应用标识不可改（它是路由前缀与存储作用域的键）。 */
  idLocked?: boolean
  submitting?: boolean
  submitError?: string | null
  submitLabel?: string
  showActions?: boolean
  onSubmit: (values: AppFormValues) => void
  onCancel?: () => void
}

/**
 * 应用表单（新建弹窗 / 编辑整页共用）。
 *
 * 字段、校验、只读开关只有一份；外壳（弹窗底栏 vs 整页按钮）由调用方决定。
 */
export function AppForm({
  formId,
  initialValues,
  idLocked = false,
  submitting = false,
  submitError = null,
  submitLabel,
  showActions = true,
  onSubmit,
  onCancel,
}: AppFormProps) {
  const { t } = useTranslation('apps')

  const [id, setId] = useState(initialValues?.id ?? '')
  const [name, setName] = useState(initialValues?.name ?? '')
  const [headline, setHeadline] = useState(initialValues?.headline ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [domain, setDomain] = useState(initialValues?.domain ?? '')
  const [apiBaseUrl, setApiBaseUrl] = useState(initialValues?.apiBaseUrl ?? '')
  const [badge, setBadge] = useState(initialValues?.badge ?? '')
  const [category, setCategory] = useState(initialValues?.category ?? '')
  const [themeGradient, setThemeGradient] = useState(initialValues?.themeGradient ?? '')
  const [status, setStatus] = useState<number>(initialValues?.status ?? APP_STATUS.enabled)
  const [sortText, setSortText] = useState(String(initialValues?.sort ?? 1))
  const [fieldError, setFieldError] = useState<AppFormFieldError | null>(null)

  const buildValues = useCallback(
    (): AppFormValues => ({
      id,
      name,
      headline,
      description,
      domain,
      apiBaseUrl,
      badge,
      category,
      themeGradient,
      status,
      sort: Number(sortText) || 0,
    }),
    [
      id,
      name,
      headline,
      description,
      domain,
      apiBaseUrl,
      badge,
      category,
      themeGradient,
      status,
      sortText,
    ],
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const values = buildValues()
    const invalid = validateAppForm(values, t, { idLocked })
    if (invalid) {
      setFieldError(invalid)
      return
    }
    setFieldError(null)
    onSubmit(values)
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t('form.appId', '应用标识')}
        labelTooltip={
          idLocked
            ? t('form.appIdLocked', '应用标识是路由前缀与存储作用域的键，创建后不可修改')
            : t('form.appIdDescription', '小写字母开头，将作为路由前缀 /{appId}/… 与数据作用域')
        }
        value={id}
        disabled={idLocked}
        onChange={(event) => {
          setId(event.target.value)
          if (fieldError?.field === 'id') setFieldError(null)
        }}
        error={fieldError?.field === 'id' ? fieldError.message : undefined}
        autoFocus={formId !== undefined && !idLocked}
      />

      <Input
        label={t('form.name', '应用名称')}
        value={name}
        onChange={(event) => {
          setName(event.target.value)
          if (fieldError?.field === 'name') setFieldError(null)
        }}
        error={fieldError?.field === 'name' ? fieldError.message : undefined}
      />

      <Input
        label={t('form.headline', '副标题')}
        value={headline}
        onChange={(event) => setHeadline(event.target.value)}
      />

      <Input
        label={t('form.category', '分类')}
        value={category}
        onChange={(event) => setCategory(event.target.value)}
      />

      <Input
        label={t('form.badge', '角标')}
        value={badge}
        onChange={(event) => setBadge(event.target.value)}
      />

      <Input
        label={t('form.domain', '展示域名')}
        labelTooltip={t('form.domainDescription', '不带协议，仅用于展示')}
        value={domain}
        onChange={(event) => setDomain(event.target.value)}
      />

      <Input
        label={t('form.apiBaseUrl', '接口根地址')}
        labelTooltip={t('form.apiBaseUrlDescription', '该应用业务接口的基准地址，需带 http(s)://')}
        value={apiBaseUrl}
        onChange={(event) => {
          setApiBaseUrl(event.target.value)
          if (fieldError?.field === 'apiBaseUrl') setFieldError(null)
        }}
        error={fieldError?.field === 'apiBaseUrl' ? fieldError.message : undefined}
      />

      <Input
        label={t('form.themeGradient', '卡片渐变')}
        labelTooltip={t('form.themeGradientDescription', 'Tailwind 渐变色类名，可选')}
        value={themeGradient}
        onChange={(event) => setThemeGradient(event.target.value)}
      />

      <Input
        label={t('form.description', '说明')}
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

      <Switch
        checked={status === APP_STATUS.enabled}
        onCheckedChange={(checked) =>
          setStatus(checked ? APP_STATUS.enabled : APP_STATUS.disabled)
        }
        label={
          status === APP_STATUS.enabled
            ? t('form.statusEnabled', '启用')
            : t('form.statusDisabled', '禁用')
        }
      />

      {submitError ? (
        <p className="text-sm text-kumo-danger" role="alert">
          {submitError}
        </p>
      ) : null}

      {showActions ? (
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
