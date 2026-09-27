import { Badge, Button, Input, LayerDialog, Select, Switch } from '@cloudflare/kumo'
import { PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsCard } from '#/components/settings-card'
import { useAiConfigStore, type AiModelConfig } from '#/lib/store'

/**
 * 设置 → AI 的「模型」卡片：**模型**配置（所属厂商 / 模型 ID / 显示名 / 是否支持工具调用）
 * 与默认模型的选择。
 *
 * 默认模型的选择做成行内按钮而不是下拉：它是「二选一」性质的状态（当前默认就那一个），
 * 用带「默认」徽章 + 其它行上的「设为默认」按钮，比再放一个 Select 更省一次交互。
 *
 * 「支持工具调用」必须可关：管理后台里常见的推理模型 / 小模型并不支持 function calling，
 * 关掉之后该模型退化成纯对话（运行时不会给它发工具定义）。
 */
export function AiModelCard() {
  const { t } = useTranslation()
  const providers = useAiConfigStore((state) => state.providers)
  const models = useAiConfigStore((state) => state.models)
  const activeModelId = useAiConfigStore((state) => state.activeModelId)
  const setActiveModel = useAiConfigStore((state) => state.setActiveModel)
  const removeModel = useAiConfigStore((state) => state.removeModel)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AiModelConfig | null>(null)
  const [formSeq, setFormSeq] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<AiModelConfig | null>(null)

  const providerName = (providerId: string) =>
    providers.find((item) => item.id === providerId)?.name ?? '—'

  const openCreate = () => {
    setEditing(null)
    setFormSeq((seq) => seq + 1)
    setDialogOpen(true)
  }

  const openEdit = (model: AiModelConfig) => {
    setEditing(model)
    setFormSeq((seq) => seq + 1)
    setDialogOpen(true)
  }

  const hasProviders = providers.length > 0

  return (
    <SettingsCard title={t('profile.settings.aiModels', '模型')}>
      {models.length === 0 ? (
        <p className="px-4 py-6 text-sm text-kumo-subtle">
          {t('profile.settings.aiModelEmpty', '还没有配置模型。')}
        </p>
      ) : (
        models.map((model) => {
          const isActive = model.id === activeModelId
          return (
            <div
              key={model.id}
              className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 py-3.5"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-kumo-default">
                    {model.displayName}
                  </span>
                  {isActive ? (
                    <Badge variant="success">
                      {t('profile.settings.aiDefaultModel', '默认')}
                    </Badge>
                  ) : null}
                  {model.supportsTools ? null : (
                    <Badge variant="warning">
                      {t('profile.settings.aiModelNoTools', '纯对话')}
                    </Badge>
                  )}
                </span>
                <span className="truncate text-xs text-kumo-subtle">
                  {providerName(model.providerId)} · {model.modelId}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {isActive ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveModel(model.id)}
                  >
                    {t('profile.settings.aiSetDefaultModel', '设为默认')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<PencilSimpleIcon size={14} />}
                  onClick={() => openEdit(model)}
                >
                  {t('actions.edit', '编辑')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<TrashIcon size={14} />}
                  onClick={() => setPendingDelete(model)}
                >
                  {t('actions.delete', '删除')}
                </Button>
              </div>
            </div>
          )
        })
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5">
        {/*
          没有厂商时禁用而不隐藏：按钮消失会让人以为「这里不能加模型」，
          禁用 + 旁边一句话说明该先做什么，比藏起来清楚。
        */}
        <Button
          variant="secondary"
          size="sm"
          icon={<PlusIcon size={14} />}
          disabled={!hasProviders}
          onClick={openCreate}
        >
          {t('profile.settings.aiAddModel', '添加模型')}
        </Button>
        <p className="max-w-md text-xs text-kumo-subtle">
          {hasProviders
            ? t(
                'profile.settings.aiModelsHint',
                '默认模型用于新的对话；关掉「支持工具调用」的模型只能纯聊天。',
              )
            : t(
                'profile.settings.aiModelsNoProviderHint',
                '请先在「模型服务」里添加一个厂商。',
              )}
        </p>
      </div>

      <AiModelDialog
        key={formSeq}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        target={editing}
      />

      <LayerDialog.Alert
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <LayerDialog.Content size="sm">
          <LayerDialog.Title>
            {t('profile.settings.aiModelDeleteTitle', '删除模型')}
          </LayerDialog.Title>
          {/* `LayerDialog.Body` 是必须的（Kumo 要求 Title / Body / Actions 各一个），见 ai-provider-card 的注释 */}
          <LayerDialog.Body>
            <p className="text-sm text-kumo-subtle">
              {t(
                'profile.settings.aiModelDeleteDesc',
                '删除后需要重新添加才能继续使用这个模型。',
              )}
            </p>
          </LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={t('actions.cancel', '取消')}>
            <LayerDialog.Actions.Primary
              variant="destructive"
              onClick={() => {
                if (pendingDelete) removeModel(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              {t('actions.delete', '删除')}
            </LayerDialog.Actions.Primary>
          </LayerDialog.Actions>
        </LayerDialog.Content>
      </LayerDialog.Alert>
    </SettingsCard>
  )
}

const MODEL_FORM_ID = 'ai-model-form'

/** 模型的新增 / 编辑弹窗（与厂商弹窗同一套形态：本地受控 state、`form` 关联提交）。 */
function AiModelDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: AiModelConfig | null
}) {
  const { t } = useTranslation()
  const providers = useAiConfigStore((state) => state.providers)
  const addModel = useAiConfigStore((state) => state.addModel)
  const updateModel = useAiConfigStore((state) => state.updateModel)

  const [providerId, setProviderId] = useState(
    target?.providerId ?? providers[0]?.id ?? '',
  )
  const [modelId, setModelId] = useState(target?.modelId ?? '')
  const [displayName, setDisplayName] = useState(target?.displayName ?? '')
  const [supportsTools, setSupportsTools] = useState(target?.supportsTools ?? true)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedModelId = modelId.trim()
    if (!providerId || !trimmedModelId) return
    const payload = {
      providerId,
      modelId: trimmedModelId,
      // 显示名留空就跟着模型 ID —— 少一个必填项，且默认值总是有意义的
      displayName: displayName.trim() || trimmedModelId,
      supportsTools,
    }
    if (target) updateModel(target.id, payload)
    else addModel(payload)
    onOpenChange(false)
  }

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>
          {target
            ? t('profile.settings.aiEditModel', '编辑模型')
            : t('profile.settings.aiAddModel', '添加模型')}
        </LayerDialog.Title>

        <LayerDialog.Body>
          <form
            id={MODEL_FORM_ID}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <Select<string>
              aria-label={t('profile.settings.aiModelProvider', '所属厂商')}
              label={t('profile.settings.aiModelProvider', '所属厂商')}
              value={providerId}
              onValueChange={(next) => {
                if (next) setProviderId(next)
              }}
              items={providers.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />

            <Input
              label={t('profile.settings.aiModelId', '模型 ID')}
              labelTooltip={t(
                'profile.settings.aiModelIdHint',
                '厂商文档里的模型名，例如 gpt-5-mini 或 claude-sonnet-4-5',
              )}
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
            />

            <Input
              label={t('profile.settings.aiModelName', '显示名')}
              labelTooltip={t(
                'profile.settings.aiModelNameHint',
                '留空则直接显示模型 ID',
              )}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />

            <Switch
              checked={supportsTools}
              onCheckedChange={setSupportsTools}
              label={t('profile.settings.aiModelSupportsTools', '支持工具调用')}
            />
          </form>
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('actions.cancel', '取消')}>
          <LayerDialog.Actions.Primary form={MODEL_FORM_ID} type="submit">
            {t('unsavedChanges.save', '保存')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
