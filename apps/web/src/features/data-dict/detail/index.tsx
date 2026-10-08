import { Button, Empty, LayerCard, Loader, Switch, useKumoToastManager } from '@cloudflare/kumo'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { putDataDictTypeMutation } from '#/api'
import { PageHeader } from '#/components/page-header'
import { UnsavedChangesBar } from '#/components/unsaved-changes-bar'
import { extractApiErrorMessage } from '#/lib/api-error'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { DictItemTable } from '../dict-item-table'
import { DictTypeForm, validateDictTypeForm } from '../dict-type-form'
import { useAiFormSubmit } from '#/features/ai/core'
import { useFeature } from '#/features/ai/page'
import { createDictTypeDetailFeature } from './feature'
import { DictTypeInfoCard } from '../dict-type-info-card'
import { DictTypeTable } from '../dict-type-table'
import { useDictTypeBreadcrumbTrail } from '../data-dict-breadcrumb'
import {
  DICT_ROOT_TYPE_ID,
  DICT_STATUS,
  DICT_VALUE_TYPE,
  findDictTypePath,
  toDictStatus,
  toDictValueType,
} from '../data-dict-options'
import type { DictBinaryFlag } from '../data-dict-options'
import type { DictTypeFormValues } from '../data-dict-types'
import { useDictTypeTree, useInvalidateDictTypeTree } from '../use-dict-type-tree'

/**
 * 分类详情（/$appId/system/data-dict/$typeId）。
 *
 * 一个分类页同时承载**它自身的基本信息**、**它的子分类**与**它自己的字典项**（左列自上而下三段），
 * 因此从分类列表点进来后不需要再跳一次就能改分类、看项。
 *
 * 编辑态与 features 详情页同一套做法：
 * - 基本信息是**内嵌表单**（不是弹窗），字段与新建弹窗共用 `DictTypeForm`；
 * - 表单不出保存按钮，由底部「未保存更改」浮条（`UnsavedChangesBar`）承担保存 / 重置；
 * - 页头动作只放**启用开关**（受控 `status`，随表单一起提交）；
 * - 「重置」靠递增 `resetSeq` 改变表单 `key` 重建初值。
 *
 * **删除与新增子分类都不在这里**：它们是分类树的维护动作，入口统一留在分类列表
 * （行内菜单的「删除分类」/「新增子分类」），避免详情页再出现同类高危或重复入口。
 */
/** AI 表单桥的 id：`DictTypeForm` 注册字段读写、本页注册提交，两半靠它拼成一条记录。 */
const DICT_TYPE_AI_FORM_ID = 'dict-type-detail'

/** 表单草稿的规范化：用于「未保存更改」比较（忽略首尾空白）。 */
function normalizeDraft(values?: Partial<DictTypeFormValues> | null): string {
  return JSON.stringify({
    name: (values?.name ?? '').trim(),
    code: (values?.code ?? '').trim(),
    type: values?.type ?? DICT_VALUE_TYPE.string,
    status: values?.status ?? DICT_STATUS.enabled,
    sort: values?.sort ?? 0,
    remark: (values?.remark ?? '').trim(),
  })
}

/**
 * 分类详情页。`typeId` 由薄路由传入（`beforeLoad` 里的根分类重定向也留在那边）。
 */
export function DataDictTypeDetailPage({ typeId }: { typeId: string }) {
  const { t } = useTranslation('dataDict')
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const navigate = useNavigate()

  const toast = useKumoToastManager()
  const invalidateTypeTree = useInvalidateDictTypeTree()
  const updateTypeMutation = useMutation(putDataDictTypeMutation())

  /** 页头「启用」开关（受控）与表单草稿 */
  const [status, setStatus] = useState<DictBinaryFlag>(DICT_STATUS.enabled)
  const [draft, setDraft] = useState<DictTypeFormValues | null>(null)
  /** 递增该值会重建表单，用于「重置」回初始值 */
  const [resetSeq, setResetSeq] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  const { nodes, root, isPending, isError, error, refetch } = useDictTypeTree()

  // 注意：`Number('')` 是 0 而不是 NaN，因此必须同时拒绝空串 —— 否则
  // `/$typeId` 解析出空参数时会以「分类 0」去拉字典项列表（缺 type_id = 全量）。
  const numericId = Number(typeId)
  const hasValidId = typeId.trim() !== '' && Number.isInteger(numericId) && numericId > 0

  const { node, ancestors } = hasValidId
    ? findDictTypePath(nodes, numericId)
    : { node: undefined, ancestors: [] }

  // 把分类层级注册给顶栏面包屑（祖先链由此还原成可点的层级链）
  useDictTypeBreadcrumbTrail(nodes, appId)

  const parent = ancestors[ancestors.length - 1]

  /** 表单初始值（也用于「未保存更改」比较） */
  const initialValues = useMemo<Partial<DictTypeFormValues>>(
    () =>
      node
        ? {
            id: node.id,
            name: node.name,
            code: node.code,
            type: toDictValueType(node.type),
            status: toDictStatus(node.status),
            parent_id: node.parent_id,
            sort: node.sort,
            remark: node.remark,
          }
        : {},
    [node],
  )

  /** 有草稿且与初始值不同 → 底部浮条出现 */
  const isDirty = draft !== null && normalizeDraft(draft) !== normalizeDraft(initialValues)

  /*
    AI 表单桥的**提交那一半**（字段读写由 `DictTypeForm` 用同一个 id 注册）。
    `submit` 直接复用底部浮条那条保存路径（同样的前端校验、同样的 toast 与刷新），
    并把「没保存成功」翻成异常 —— 否则模型会以为已经保存，而页面上其实是错误提示。
    `canSubmit` 复用 `isDirty`：没改动就直接拒绝，免得弹一张卡让用户点完发现什么都没变。
  */
  useAiFormSubmit({
    id: DICT_TYPE_AI_FORM_ID,
    submit: async () => {
      const ok = await handleSaveDraft()
      if (!ok) throw new Error('分类没有保存成功，请看页面上的错误提示。')
    },
    canSubmit: () => isDirty,
  })

  /*
    这一页对 AI 暴露的能力（原先什么都没接）：两个数据源 + 表单桥。
    声明见 ./feature.ts；指令刻意不声明 —— 页面上的写入口只有表单的保存 / 重置，
    已经被表单桥覆盖（见 feature.ts 的说明）。
  */
  useFeature(
    createDictTypeDetailFeature({
      type: node ?? null,
      ...(parent?.name ? { parentName: parent.name } : {}),
      subTypes: node?.children ?? [],
      isDirty,
      loading: isPending,
      reload: refetch,
    }),
  )

  // 切换分类（同路由不同 id）或后端数据刷新后，重置本地编辑态
  useEffect(() => {
    if (node) setStatus(toDictStatus(node.status))
    setDraft(null)
    setResetSeq(0)
    setFormError(null)
  }, [node?.id, node?.status])

  const handleValuesChange = useCallback((values: DictTypeFormValues) => {
    setDraft(values)
  }, [])

  const goList = useCallback(() => {
    navigate({ to: '/$appId/system/data-dict', params: { appId } })
  }, [appId, navigate])

  /**
   * 保存当前分类：显式回传原 `parent_id`，避免后端把它当成根层级移走。
   *
   * **返回是否成功**：页面浮条不看返回值（失败信息已经就地显示），但 AI 表单桥要看 ——
   * 否则模型会以为"提交成功了"，而用户看到的是一条错误提示。
   */
  const handleSubmit = useCallback(
    async (values: DictTypeFormValues): Promise<boolean> => {
      setFormError(null)
      if (values.id === undefined || values.id === null) {
        setFormError(t('form.failed', '操作失败，请稍后重试'))
        return false
      }

      try {
        await updateTypeMutation.mutateAsync({ body: { ...values, id: values.id } })
        await invalidateTypeTree()
        toast.add({
          title: t('form.successTypeUpdate', '分类更新成功'),
          variant: 'success',
        })
        // 保存成功后清空草稿，底部浮条随之收起
        setDraft(null)
        return true
      } catch (submitError) {
        setFormError(extractApiErrorMessage(submitError, t('form.failed', '操作失败，请稍后重试')))
        return false
      }
    },
    [invalidateTypeTree, t, toast, updateTypeMutation],
  )

  /** 浮条「保存」：先跑一遍与表单相同的校验，通过后再提交草稿（返回是否保存成功） */
  const handleSaveDraft = useCallback(async (): Promise<boolean> => {
    if (!draft) return false
    // 浮条保存不经过 <form> 的 submit，校验要在这里补一次（否则会绕过前端校验）
    const invalid = validateDictTypeForm(draft, t)
    if (invalid) {
      setFormError(invalid.message)
      return false
    }
    setFormError(null)
    return handleSubmit(draft)
  }, [draft, handleSubmit, t])

  /** 浮条「重置」：清空草稿、恢复页头开关，并重建表单回到初始值 */
  const handleResetDraft = useCallback(() => {
    setDraft(null)
    if (node) setStatus(toDictStatus(node.status))
    setResetSeq((seq) => seq + 1)
    setFormError(null)
  }, [node])

  if (!hasValidId) {
    return (
      <DataDictTypeErrorState
        message={t('detail.invalidId', 'ID 不合法')}
        retryLabel={t('detail.retry', '重试加载')}
        backLabel={t('detail.backToList', '返回分类列表')}
        onRetry={() => void refetch()}
        onBack={goList}
      />
    )
  }

  // 分类树还没到达时先出 loader，避免把「还没加载」误报成「未找到」；
  // 此时也**不要**渲染字典项表格（否则会以缺失的 type_id 拉全量列表）
  if (!node) {
    if (isPending) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader size="base" />
        </div>
      )
    }

    // 根分类缺失 = 后端换了根或数据未就绪（接口返回的历史顶层里没有 67）：
    // 明确报出来，而不是回落成「未找到」或展示整个历史树
    if (!root) {
      return (
        <DataDictTypeErrorState
          message={t('messages.rootMissing', {
            id: DICT_ROOT_TYPE_ID,
            defaultValue: '未找到字典根分类 {{id}}，请确认后端根分类配置',
          })}
          retryLabel={t('detail.retry', '重试加载')}
          backLabel={t('detail.backToList', '返回分类列表')}
          onRetry={() => void refetch()}
          onBack={goList}
        />
      )
    }

    return (
      <DataDictTypeErrorState
        message={
          (error as { message?: string } | null)?.message ?? t('detail.notFound', '未找到该分类')
        }
        retryLabel={t('detail.retry', '重试加载')}
        backLabel={t('detail.backToList', '返回分类列表')}
        onRetry={() => void refetch()}
        onBack={goList}
      />
    )
  }

  const treeError = isError
    ? ((error as { message?: string } | null)?.message ??
      t('messages.fetchFailed', '获取分类树失败'))
    : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={node.name}
        description={t('typeDescription', '该分类下的子分类与字典项')}
        actions={
          // 「启用」开关放到页头右侧，表单里不再渲染（受控 status，保存时随表单一起提交）
          <Switch
            checked={status === DICT_STATUS.enabled}
            onCheckedChange={(checked) =>
              setStatus(checked ? DICT_STATUS.enabled : DICT_STATUS.disabled)
            }
            label={
              status === DICT_STATUS.enabled
                ? t('form.statusEnabled', '启用')
                : t('form.statusDisabled', '禁用')
            }
          />
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/*
          左列：基本信息表单 + 子分类 + 字典项。
          移动端（单列）用 order 把只读信息卡片提到前面，因此这里是 order-2。
        */}
        <div className="order-2 flex flex-col gap-4 lg:order-1 lg:col-span-2">
          <LayerCard className="p-0">
            <LayerCard.Secondary>{t('detail.basicInfo', '基本信息')}</LayerCard.Secondary>
            <LayerCard.Primary className="p-4">
              <DictTypeForm
                // 切换分类 / 重置时重建表单，回到初始值
                key={`${node.id}-${resetSeq}`}
                initialValues={initialValues}
                // AI 表单桥：让 AI 能读改这张表单（提交要过审批，见上面的 useAiFormSubmit）
                aiFormId={DICT_TYPE_AI_FORM_ID}
                // 动作交给底部「未保存更改」浮条；启用开关在页头
                showStatusSwitch={false}
                status={status}
                onStatusChange={setStatus}
                onValuesChange={handleValuesChange}
                submitError={formError}
                onSubmit={(values) => {
                  void handleSubmit(values)
                }}
              />
            </LayerCard.Primary>
          </LayerCard>

          <DictTypeTable
            nodes={node.children ?? []}
            rootParentId={numericId}
            rootParentName={node.name}
            headerTitle={t('sections.childrenTypes', '子分类')}
            // 函数形态：数字由组件按「过滤结果树的节点总数」计算（搜索 / 展开后与行数一致）
            quotaText={(total) => (
              <Trans
                i18nKey="quota"
                ns="dataDict"
                defaults="共 <b>{{total}}</b> 项"
                values={{ total }}
                components={{
                  b: <b className="font-semibold text-kumo-default tabular-nums" />,
                }}
              />
            )}
            loading={isPending}
            error={treeError}
            onRetry={() => {
              void refetch()
            }}
          />

          <DictItemTable typeId={numericId} typeName={node.name} />
        </div>

        {/* 右列：分类只读元信息（sticky 必须配合 self-start，否则 grid item 被拉伸后吸顶失效） */}
        <aside className="order-1 flex flex-col gap-4 self-start lg:order-2 lg:sticky lg:top-20">
          <DictTypeInfoCard node={node} parentName={parent?.name} />
        </aside>
      </div>

      {/* 未保存更改浮条：表单变脏时从底部居中弹出（通用组件） */}
      <UnsavedChangesBar
        open={isDirty}
        saving={updateTypeMutation.isPending}
        errorMessage={formError}
        onReset={handleResetDraft}
        onSave={handleSaveDraft}
      />
    </div>
  )
}

/** 分类不存在 / ID 非法 / 请求失败时的兜底视图（与 features 的 `FeatureErrorState` 同构）。 */
function DataDictTypeErrorState({
  message,
  retryLabel,
  backLabel,
  onRetry,
  onBack,
}: {
  message: string
  retryLabel: string
  backLabel: string
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <LayerCard className="p-0">
      <LayerCard.Primary className="p-0">
        <Empty
          icon={<WarningCircleIcon size={44} className="text-kumo-inactive" />}
          title={message}
        />
        <div className="flex justify-center gap-2 pb-6">
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
          <Button variant="secondary" onClick={onBack}>
            {backLabel}
          </Button>
        </div>
      </LayerCard.Primary>
    </LayerCard>
  )
}
