import { Button, Input, LayerCard, Switch } from '@cloudflare/kumo'
import type { TFunction } from 'i18next'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAiFormFields, type AiFormField } from '#/features/ai/core'
import { toDisplayText } from '#/lib/to-text'
import { MENU_STATUS, MENU_VISIBLE } from './feature-options'
import { FeatureApiKeysField } from './feature-api-keys-field'

/** 表单提交值（`menu_type` 与 `parent_id` 由调用方决定，不在这里出现）。 */
export interface FeatureFormValues {
  menu_name: string
  /**
   * **路由地址（相对 appId）**：目录（1）与菜单（2）用它指定「打开这个菜单落到哪个前端路由」。
   * 操作（3）是按钮级权限点，没有落点，不传。
   */
  path?: string
  /** 权限标识：功能（2）与权限（3）必填，功能组（1）不带该字段。 */
  permission?: string
  /** 绑定的接口 value 列表（功能与权限可绑，功能组不带）。 */
  api_keys?: string[]
  icon?: string
  sort: number
  /** 1 启用 / 2 禁用（与 `v1.SysMenuCreateReq.status` 的枚举一致）。 */
  status: typeof MENU_STATUS.enabled | typeof MENU_STATUS.disabled
  /** 1 显示 / 2 隐藏（与 `v1.SysMenuCreateReq.visible` 的枚举一致）。权限（3）没有该概念，不传。 */
  visible?: typeof MENU_VISIBLE.visible | typeof MENU_VISIBLE.hidden
}

/** 校验失败时命中的字段与文案。 */
export type FeatureFormFieldError = {
  field: 'menu_name' | 'permission' | 'path'
  message: string
}

/**
 * 表单校验（**表单自身与详情页浮条共用**）。
 *
 * 详情页的保存走底部浮条，**不经过 `<form>` 的 submit**，所以校验必须抽出来给两条路径都调用 ——
 * 否则「把名称清空 / 只填 1 个字 → 点浮条保存」会绕过前端校验直接发请求，只能等后端报错。
 */
export function validateFeatureForm(
  values: Pick<FeatureFormValues, 'menu_name' | 'permission' | 'path'>,
  t: TFunction,
  variant: 'group' | 'feature' | 'button',
): FeatureFormFieldError | null {
  const name = (values.menu_name ?? '').trim()
  // 后端要求 menu_name 长度 2–50，先在前端拦一道，避免无谓的请求往返
  if (name.length < 2 || name.length > 50) {
    return {
      field: 'menu_name',
      message: t('form.nameLength', '名称长度需在 2–50 个字符之间'),
    }
  }

  // 目录与菜单必须给出路由落点（侧边栏按它跳转）；操作是按钮级权限点，没有落点
  if (variant !== 'button') {
    const path = (values.path ?? '').trim()
    if (!path) {
      return { field: 'path', message: t('form.pathRequired', '请填写路由地址') }
    }
    if (!path.startsWith('/')) {
      return {
        field: 'path',
        message: t('form.pathInvalid', '路由地址需以 / 开头，如 /system/menus'),
      }
    }
  }

  // 功能与权限必须有权限标识（后端会返回「权限标识[Permission]不能为空」），功能组不需要
  if (variant !== 'group' && !(values.permission ?? '').trim()) {
    return { field: 'permission', message: t('form.permissionRequired', '请填写权限标识') }
  }

  return null
}

interface FeatureFormProps {
  /**
   * 创建类型：
   * - `group` → 功能组（menu_type=1）；
   * - `feature` → 功能（menu_type=2）；
   * - `button` → 权限（menu_type=3，功能详情下的权限点）。
   */
  variant: 'group' | 'feature' | 'button'
  /**
   * 表单布局：
   * - `page`（默认）：自带 `LayerCard` 外壳与底部按钮，用于独立创建页；
   * - `dialog`：只渲染字段，提交按钮由 `LayerDialog.Actions` 通过 `form` 关联触发。
   */
  layout?: 'page' | 'dialog'
  /** `dialog` 布局下供 `LayerDialog.Actions.Primary` 用 `form` 属性关联的表单 id。 */
  formId?: string
  /** 编辑场景的初始值；缺省即创建。 */
  initialValues?: Partial<FeatureFormValues>
  /** 覆盖卡片标题（详情页复用同一表单时传「基本信息」）。 */
  heading?: ReactNode
  /** 覆盖提交按钮文案（详情页用「保存」）。 */
  submitLabel?: string
  /** 是否渲染底部提交 / 取消按钮（详情页把动作交给「未保存更改」浮条）。 */
  showActions?: boolean
  /** 是否渲染「启用」开关（详情页把它放到页头右侧，改用受控 `status`）。 */
  showStatusSwitch?: boolean
  /**
   * 只读形态：整片字段区套 `fieldset[disabled]`（无 `feature:edit` 时用）。
   *
   * 为什么不是逐字段挂 `disabled`：加字段时必漏，而漏掉的那个字段就是越权入口。
   * Kumo 的 Input / Textarea / Select / Switch 底层都是原生控件，
   * `fieldset` 的 disabled 会级联禁用它们，一处开关覆盖全表。
   */
  readOnly?: boolean
  /** 受控的启用状态；与 `onStatusChange` 搭配用于把开关移到表单之外。 */
  status?: FeatureFormValues['status']
  onStatusChange?: (status: FeatureFormValues['status']) => void
  /** 草稿值上报：任何字段变化都会回调，供外部判断「未保存更改」并在浮条里提交。 */
  onValuesChange?: (values: FeatureFormValues) => void
  /** 上级名称（用于说明「将创建在谁下面」）。 */
  parentName?: string
  /**
   * 接入 AI 表单桥（可选）：传了之后 AI 就能通过 `list_page_forms` / `fill_form` 读改这些字段。
   * **提交不在这里** —— 由页面侧用 `useAiFormSubmit` 注册，两半靠同一个 `id` 拼成一条记录。
   */
  aiForm?: { id: string; title: string }
  submitting?: boolean
  /** 提交失败的错误信息（后端校验失败等）。 */
  submitError?: string | null
  onSubmit: (values: FeatureFormValues) => void
  onCancel?: () => void
}

/**
 * 功能 / 功能组 / 权限的共用表单。
 *
 * 三种类型共用这一个表单与同一对接口（`POST` / `PUT /system/menu`），差异只在提交时的
 * `menu_type`、字段显隐（功能组不需要权限标识）与文案。`parent_id` 由调用方给出，
 * 表单里不出现「上级」选择器。
 */
export function FeatureForm({
  variant,
  layout = 'page',
  formId,
  initialValues,
  heading,
  submitLabel,
  showActions = true,
  showStatusSwitch = true,
  readOnly = false,
  status: controlledStatus,
  onStatusChange,
  onValuesChange,
  parentName,
  aiForm,
  submitting = false,
  submitError,
  onSubmit,
  onCancel,
}: FeatureFormProps) {
  const { t } = useTranslation('menus')

  const [name, setName] = useState(initialValues?.menu_name ?? '')
  const [path, setPath] = useState(initialValues?.path ?? '')
  const [permission, setPermission] = useState(initialValues?.permission ?? '')
  const [apiKeys, setApiKeys] = useState<string[]>(initialValues?.api_keys ?? [])
  const [icon, setIcon] = useState(initialValues?.icon ?? '')
  const [sortText, setSortText] = useState(String(initialValues?.sort ?? 0))
  const [innerStatus, setInnerStatus] = useState<FeatureFormValues['status']>(
    initialValues?.status ?? MENU_STATUS.enabled,
  )
  /** 启用状态可受控（详情页把开关移到页头），未受控时用内部 state */
  const status = controlledStatus ?? innerStatus
  const setStatus = useCallback(
    (next: FeatureFormValues['status']) => {
      if (onStatusChange) onStatusChange(next)
      else setInnerStatus(next)
    },
    [onStatusChange],
  )
  const [visible, setVisible] = useState<FeatureFormValues['visible']>(
    initialValues?.visible ?? MENU_VISIBLE.visible,
  )
  const [nameError, setNameError] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)

  const isGroup = variant === 'group'
  const isButton = variant === 'button'

  /**
   * AI 表单桥（字段与读写那一半；提交那一半在页面侧）。
   *
   * 字段集**随 `variant` 收敛**，与界面的显隐规则保持一致 —— 否则 AI 会看到「功能组」上
   * 根本不存在的「权限标识」，填了也没人读。`getValues` / `setValues` 走 ref，
   * 所以这里每次渲染新建闭包不会让注册表拿到过期的 state。
   */
  const aiFields: AiFormField[] = [
    {
      name: 'menu_name',
      label: t('form.name', '名称'),
      type: 'text',
      description: t('form.nameLength', '名称长度需在 2–50 个字符之间'),
    },
    ...(isGroup
      ? []
      : [
          {
            name: 'permission',
            label: t('form.permission', '权限标识'),
            type: 'text',
            description: t('form.permissionDescription', '后端鉴权用的唯一标识'),
          },
          {
            name: 'api_keys',
            label: t('form.apiKeys', '绑定接口'),
            type: 'tags',
            description: t('form.apiKeysDescription', '接口清单里的 value（md5）'),
          },
        ]),
    // 目录与菜单才有路由落点（操作没有页面可跳）
    ...(isButton
      ? []
      : [
          {
            name: 'path',
            label: t('form.path', '路由地址'),
            type: 'text',
            description: t('form.pathDescription', '相对应用的路由'),
          },
        ]),
    {
      name: 'icon',
      label: t('form.icon', '图标'),
      type: 'text',
      description: t('form.iconDescription', '图标名称'),
    },
    {
      name: 'sort',
      label: t('form.sort', '排序'),
      type: 'number',
      description: t('form.sortDescription', '数字越小越靠前'),
    },
    {
      name: 'status',
      label: t('form.statusField', '状态'),
      type: 'select',
      options: [
        { value: String(MENU_STATUS.enabled), label: t('form.statusEnabled', '启用') },
        { value: String(MENU_STATUS.disabled), label: t('form.statusDisabled', '禁用') },
      ],
    },
    ...(isButton
      ? []
      : [
          {
            name: 'visible',
            label: t('form.visibleField', '显示'),
            type: 'select',
            options: [
              { value: String(MENU_VISIBLE.visible), label: t('form.visibleShown', '显示') },
              { value: String(MENU_VISIBLE.hidden), label: t('form.visibleHidden', '隐藏') },
            ],
          },
        ]),
  ] as AiFormField[]

  useAiFormFields(
    aiForm
      ? {
          id: aiForm.id,
          title: aiForm.title,
          fields: aiFields,
          getValues: () => ({
            menu_name: name,
            ...(isGroup ? {} : { permission, api_keys: apiKeys }),
            icon,
            sort: Number(sortText) || 0,
            status,
            ...(isButton ? {} : { visible }),
          }),
          setValues: (patch) => {
            if (typeof patch.menu_name === 'string') setName(patch.menu_name)
            if (typeof patch.permission === 'string') setPermission(patch.permission)
            if (Array.isArray(patch.api_keys)) setApiKeys(patch.api_keys.map(String))
            if (typeof patch.icon === 'string') setIcon(patch.icon)
            if (patch.sort !== undefined) setSortText(toDisplayText(patch.sort))
            if (patch.status !== undefined) {
              setStatus(
                Number(patch.status) === MENU_STATUS.disabled
                  ? MENU_STATUS.disabled
                  : MENU_STATUS.enabled,
              )
            }
            if (patch.visible !== undefined) {
              setVisible(
                Number(patch.visible) === MENU_VISIBLE.hidden
                  ? MENU_VISIBLE.hidden
                  : MENU_VISIBLE.visible,
              )
            }
          },
        }
      : null,
  )

  /** 标题与提交按钮按类型取文案（表单字段完全一致）。 */
  /** 标题与提交按钮的默认文案（按类型取），调用方可用 `heading` / `submitLabel` 覆盖。 */
  const defaultHeading = isGroup
    ? t('form.createGroupTitle', '添加功能组')
    : isButton
      ? t('form.createButtonTitle', '添加权限')
      : t('form.createFeatureTitle', '添加功能')

  const defaultSubmitLabel = isGroup
    ? t('form.submitGroup', '创建功能组')
    : isButton
      ? t('form.submitButton', '创建权限')
      : t('form.submitFeature', '创建功能')

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const invalid = validateFeatureForm(
        { menu_name: name, permission: isGroup ? undefined : permission, path },
        t,
        variant,
      )
      // 错误就地显示在对应字段下方（浮条路径则把同一条文案显示在浮条上）
      setNameError(invalid?.field === 'menu_name' ? invalid.message : null)
      setPermissionError(invalid?.field === 'permission' ? invalid.message : null)
      setPathError(invalid?.field === 'path' ? invalid.message : null)
      if (invalid) return

      const sort = Number(sortText)

      onSubmit({
        menu_name: name.trim(),
        // 目录与菜单才有路由落点；操作是按钮级权限点，不带
        path: isButton ? undefined : path.trim() || undefined,
        permission: isGroup ? undefined : permission.trim(),
        api_keys: isGroup ? undefined : apiKeys,
        icon: icon.trim() || undefined,
        sort: Number.isFinite(sort) ? sort : 0,
        status,
        // 权限是功能下的权限点，没有「是否显示」的概念，后端也不需要该字段
        visible: isButton ? undefined : visible,
      })
    },
    [
      apiKeys,
      icon,
      isButton,
      isGroup,
      name,
      onSubmit,
      path,
      permission,
      sortText,
      status,
      t,
      variant,
      visible,
    ],
  )

  // 把当前草稿值上报给外部：详情页据此判断「未保存更改」，并在浮条上提交
  useEffect(() => {
    onValuesChange?.({
      menu_name: name,
      path: isButton ? undefined : path,
      permission: isGroup ? undefined : permission,
      api_keys: isGroup ? undefined : apiKeys,
      icon,
      sort: Number(sortText) || 0,
      status,
      visible: isButton ? undefined : visible,
    })
  }, [
    apiKeys,
    icon,
    isButton,
    isGroup,
    name,
    onValuesChange,
    path,
    permission,
    sortText,
    status,
    visible,
  ])

  const body = (
    // `contents` = display:contents：fieldset 不产生盒子，原有的 flex 布局不受影响
    <fieldset disabled={readOnly} className="contents">
      <>
        {parentName !== undefined ? (
          <p className="text-sm text-kumo-subtle">
            {t('form.parentHint', '将创建在：{{parent}}', {
              parent: parentName || t('detail.rootFeature', '根层级'),
            })}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/*
          统一用 Kumo `Input` 自带的 Field 外壳（label / description / error 直接传给 Input）：
          裸 `Input` 套在外层 `Field` 里的写法没有把自己的 label 关联到控件上，
          开发环境会报 "Input must have an accessible name"。
        */}
          <Input
            label={t('form.name', '名称')}
            labelTooltip={t('form.nameDescription', '2–50 个字符，用于展示的标识')}
            error={nameError ? { message: nameError, match: 'customError' } : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('form.namePlaceholder', '请输入名称')}
            autoFocus
          />

          {/*
          路由地址：**目录与菜单必填的落点**（操作是按钮级权限点，没有页面可跳）。
          侧边栏最终就是按它拼 `/${appId}${path}` 跳转的，所以这里必须能配 ——
          之前这个字段只在 mock 与契约里存在，表单里根本没有入口。
        */}
          {!isButton ? (
            <Input
              label={t('form.path', '路由地址')}
              labelTooltip={t(
                'form.pathDescription',
                '相对应用的路由，如 /system/menus；目录填它的落地路由',
              )}
              error={pathError ? { message: pathError, match: 'customError' } : undefined}
              value={path}
              onChange={(event) => {
                setPath(event.target.value)
                if (pathError) setPathError(null)
              }}
              placeholder={t('form.pathPlaceholder', '/system/menus')}
            />
          ) : null}

          {/* 权限标识：功能与权限必填，功能组不需要 */}
          {!isGroup ? (
            <Input
              label={t('form.permission', '权限标识')}
              labelTooltip={t('form.permissionDescription', '接口权限编码，例如 n:menus:list')}
              error={
                permissionError ? { message: permissionError, match: 'customError' } : undefined
              }
              value={permission}
              onChange={(event) => setPermission(event.target.value)}
              placeholder={t('form.permissionPlaceholder', 'n:menus:list')}
            />
          ) : null}

          <Input
            label={t('form.icon', '图标')}
            labelTooltip={t('form.iconDescription', '图标名称，例如 ListDashes')}
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            placeholder={t('form.iconPlaceholder', '可选')}
          />

          <Input
            label={t('form.sort', '排序')}
            labelTooltip={t('form.sortDescription', '同级内从小到大排列')}
            type="number"
            value={sortText}
            onChange={(event) => setSortText(event.target.value)}
          />

          {/* 绑定接口：功能绑列表接口、权限绑具体 action 接口；功能组不需要 */}
          {!isGroup ? (
            <FeatureApiKeysField value={apiKeys} onChange={setApiKeys} disabled={submitting} />
          ) : null}
        </div>

        {/* 开关区：权限两者都不出现；「启用」可被外部接管（showStatusSwitch=false 时放到页头） */}
        {!isButton ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {showStatusSwitch ? (
              <Switch
                checked={status === MENU_STATUS.enabled}
                onCheckedChange={(checked) =>
                  setStatus(checked ? MENU_STATUS.enabled : MENU_STATUS.disabled)
                }
                // 文案跟随当前状态：开=启用、关=禁用
                label={
                  status === MENU_STATUS.enabled
                    ? t('form.statusEnabled', '启用')
                    : t('form.statusDisabled', '禁用')
                }
              />
            ) : null}
            {/* 是否显示：权限（menu_type=3）没有该概念，不展示也不提交 */}
            <Switch
              checked={visible === MENU_VISIBLE.visible}
              onCheckedChange={(checked) =>
                setVisible(checked ? MENU_VISIBLE.visible : MENU_VISIBLE.hidden)
              }
              // 文案跟随当前状态：显示 / 隐藏
              label={
                visible === MENU_VISIBLE.visible
                  ? t('form.visibleShown', '显示')
                  : t('form.visibleHidden', '隐藏')
              }
            />
          </div>
        ) : null}
      </>
    </fieldset>
  )

  const errorBlock = submitError ? (
    <p className="text-sm text-kumo-danger" role="alert">
      {submitError}
    </p>
  ) : null

  // 弹窗布局：只出字段，提交/取消交给 LayerDialog.Actions
  if (layout === 'dialog') {
    return (
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {body}
        {errorBlock}
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <LayerCard className="p-0">
        <LayerCard.Secondary>{heading ?? defaultHeading}</LayerCard.Secondary>
        <LayerCard.Primary className="flex flex-col gap-4 p-4">{body}</LayerCard.Primary>
      </LayerCard>

      {errorBlock}

      {showActions && !readOnly ? (
        <div className="flex items-center gap-2">
          <Button variant="primary" type="submit" loading={submitting}>
            {submitLabel ?? defaultSubmitLabel}
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
