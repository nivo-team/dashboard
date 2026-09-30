import { Badge, Button, Input, LayerDialog, Select } from '@cloudflare/kumo'
import {
  ExportIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsCard } from '#/components/settings-card'
import {
  AI_PROVIDER_DEFAULTS,
  AI_PROVIDER_KINDS,
  resolveProviderBaseUrl,
  useAiConfigStore,
  type AiOpenAiFormat,
  type AiProviderConfig,
  type AiProviderKind,
} from '#/lib/store'
import { AiProviderExportDialog } from './ai-provider-export-dialog'
import { AiProviderImportDialog } from './ai-provider-import-dialog'

/**
 * 设置 → AI 的「模型服务」卡片：**厂商**配置（类型 / 名称 / 接口地址 / API Key）。
 *
 * 厂商与模型分两张表、两个卡片（理由见 `#/lib/store/ai-store`）：一个厂商下通常挂多个模型，
 * 而 Base URL 与 Key 属于厂商。
 *
 * 两条安全约定：
 * - API Key 用 `type="password"` 输入，**任何时候都不回显明文**（编辑时也只有一个空框等着覆盖）；
 * - 风险提示只放在「添加厂商」那一行旁边的说明里 + Key 字段的 `labelTooltip`，
 *   不要塞进输入框下方的 `description`（仓库约定，见 `#/components/settings-card`）。
 */
export function AiProviderCard() {
  const { t } = useTranslation()
  const providers = useAiConfigStore((state) => state.providers)
  const removeProvider = useAiConfigStore((state) => state.removeProvider)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AiProviderConfig | null>(null)
  /** 每次打开弹窗都换一个 key，强制重建表单 —— 避免「编辑 A 之后新增，框里还留着 A 的值」 */
  const [formSeq, setFormSeq] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<AiProviderConfig | null>(null)
  const [exportingProvider, setExportingProvider] = useState<AiProviderConfig | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setFormSeq((seq) => seq + 1)
    setDialogOpen(true)
  }

  const openEdit = (provider: AiProviderConfig) => {
    setEditing(provider)
    setFormSeq((seq) => seq + 1)
    setDialogOpen(true)
  }

  return (
    <SettingsCard title={t('profile.settings.aiProviders', '模型服务')}>
      {providers.length === 0 ? (
        <p className="px-4 py-6 text-sm text-kumo-subtle">
          {t('profile.settings.aiProviderEmpty', '还没有配置厂商，添加一个即可开始使用。')}
        </p>
      ) : (
        providers.map((provider) => (
          <div
            key={provider.id}
            className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 py-3.5"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-kumo-default">{provider.name}</span>
                <Badge>
                  {t(
                    `profile.settings.aiProviderKinds.${provider.kind}`,
                    AI_PROVIDER_DEFAULTS[provider.kind].name,
                  )}
                </Badge>
                {provider.kind === 'openai' ? (
                  <Badge variant="secondary">
                    {t(
                      `profile.settings.aiOpenAiFormats.${provider.openAiFormat ?? 'compatible'}`,
                      provider.openAiFormat === 'official' ? '官方原生' : '通用兼容',
                    )}
                  </Badge>
                ) : null}
                {/* 只报「有没有 Key」，不显示 Key 本身 */}
                <Badge variant={provider.apiKey ? 'success' : 'warning'}>
                  {provider.apiKey
                    ? t('profile.settings.aiProviderKeySet', '已配置密钥')
                    : t('profile.settings.aiProviderKeyMissing', '缺少密钥')}
                </Badge>
              </span>
              <span className="truncate text-xs text-kumo-subtle">
                {resolveProviderBaseUrl(provider)}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                icon={<ExportIcon size={14} />}
                onClick={() => setExportingProvider(provider)}
              >
                {t('profile.settings.aiExportProvider', '导出')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<PencilSimpleIcon size={14} />}
                onClick={() => openEdit(provider)}
              >
                {t('actions.edit', '编辑')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<TrashIcon size={14} />}
                onClick={() => setPendingDelete(provider)}
              >
                {t('actions.delete', '删除')}
              </Button>
            </div>
          </div>
        ))
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<PlusIcon size={14} />}
            onClick={openCreate}
          >
            {t('profile.settings.aiAddProvider', '添加厂商')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<UploadSimpleIcon size={14} />}
            onClick={() => setImportOpen(true)}
          >
            {t('profile.settings.aiImportProvider', '导入配置')}
          </Button>
        </div>
        <p className="max-w-md text-xs text-kumo-subtle">
          {t(
            'profile.settings.aiApiKeyHint',
            '密钥只保存在这台设备的浏览器里，共用电脑请勿填写真实密钥。',
          )}
        </p>
      </div>

      <AiProviderExportDialog
        open={exportingProvider !== null}
        onOpenChange={(open) => {
          if (!open) setExportingProvider(null)
        }}
        provider={exportingProvider}
      />

      <AiProviderImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <AiProviderDialog
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
            {t('profile.settings.aiProviderDeleteTitle', '删除厂商')}
          </LayerDialog.Title>
          {/*
            `LayerDialog.Body` 是**必须**的（Kumo 校验 Title / Body / Actions 各一个，
            Description 才可选）—— 少了它会直接抛「LayerDialog.Alert requires exactly one
            direct LayerDialog.Title, LayerDialog.Body, and LayerDialog.Actions」。
          */}
          <LayerDialog.Body>
            <p className="text-sm text-kumo-subtle">
              {t(
                'profile.settings.aiProviderDeleteDesc',
                '删除后，挂在这个厂商下的模型配置也会一并删除。',
              )}
            </p>
          </LayerDialog.Body>
          <LayerDialog.Actions dismissLabel={t('actions.cancel', '取消')}>
            <LayerDialog.Actions.Primary
              variant="destructive"
              onClick={() => {
                if (pendingDelete) removeProvider(pendingDelete.id)
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

const PROVIDER_FORM_ID = 'ai-provider-form'

/**
 * 厂商的新增 / 编辑弹窗。
 *
 * 表单是**本地受控 state**（不是后端表单）：配置写入本地 store 是同步的，
 * 没有请求要等、也没有服务端校验要回显，因此不需要 loading / error 那套。
 */
function AiProviderDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: AiProviderConfig | null
}) {
  const { t } = useTranslation()
  const addProvider = useAiConfigStore((state) => state.addProvider)
  const updateProvider = useAiConfigStore((state) => state.updateProvider)

  const [kind, setKind] = useState<AiProviderKind>(target?.kind ?? 'openai')
  const [openAiFormat, setOpenAiFormat] = useState<AiOpenAiFormat>(
    target?.openAiFormat ?? 'compatible',
  )
  const [name, setName] = useState(target?.name ?? AI_PROVIDER_DEFAULTS.openai.name)
  const [baseUrl, setBaseUrl] = useState(target?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(target?.apiKey ?? '')

  /** 切类型时，如果名称还停在某个默认名上就跟着换 —— 用户自己改过的名字不动 */
  const handleKindChange = (next: AiProviderKind) => {
    setKind(next)
    const isDefaultName = Object.values(AI_PROVIDER_DEFAULTS).some(
      (item) => item.name === name,
    )
    if (isDefaultName) setName(AI_PROVIDER_DEFAULTS[next].name)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const payload = {
      kind,
      name: name.trim() || AI_PROVIDER_DEFAULTS[kind].name,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      openAiFormat: kind === 'openai' ? openAiFormat : undefined,
    }
    if (target) updateProvider(target.id, payload)
    else addProvider(payload)
    onOpenChange(false)
  }

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>
          {target
            ? t('profile.settings.aiEditProvider', '编辑厂商')
            : t('profile.settings.aiAddProvider', '添加厂商')}
        </LayerDialog.Title>

        <LayerDialog.Body>
          <form
            id={PROVIDER_FORM_ID}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <Select<AiProviderKind>
              aria-label={t('profile.settings.aiProviderKind', '协议规范')}
              label={t('profile.settings.aiProviderKind', '协议规范')}
              value={kind}
              onValueChange={(next) => {
                if (next) handleKindChange(next)
              }}
              items={AI_PROVIDER_KINDS.map((item) => ({
                value: item,
                label: t(
                  `profile.settings.aiProviderKinds.${item}`,
                  AI_PROVIDER_DEFAULTS[item].name,
                ),
              }))}
            />

            {kind === 'openai' ? (
              <Select<AiOpenAiFormat>
                aria-label={t('profile.settings.aiOpenAiFormat', '请求格式')}
                label={t('profile.settings.aiOpenAiFormat', '请求格式')}
                labelTooltip={t(
                  'profile.settings.aiOpenAiFormatHint',
                  '通用兼容格式适用于 DeepSeek、月之暗面、Ollama、SiliconFlow 等第三方厂商；官方原生适用于 OpenAI 官方 Responses 与 o 系列。',
                )}
                value={openAiFormat}
                onValueChange={(next) => {
                  if (next) setOpenAiFormat(next)
                }}
                items={[
                  {
                    value: 'compatible',
                    label: t(
                      'profile.settings.aiOpenAiFormats.compatible',
                      '通用兼容 (Chat Completions，支持 reasoning_content)',
                    ),
                  },
                  {
                    value: 'official',
                    label: t(
                      'profile.settings.aiOpenAiFormats.official',
                      '官方原生 (Responses / o-系列)',
                    ),
                  },
                ]}
              />
            ) : null}

            <Input
              label={t('profile.settings.aiProviderName', '名称')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />

            <Input
              label={t('profile.settings.aiProviderBaseUrl', '接口地址')}
              labelTooltip={t(
                'profile.settings.aiProviderBaseUrlHint',
                '留空则使用该服务类型的官方地址',
              )}
              value={baseUrl}
              placeholder={AI_PROVIDER_DEFAULTS[kind].baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />

            <Input
              type="password"
              label={t('profile.settings.aiApiKey', 'API Key')}
              labelTooltip={t(
                'profile.settings.aiApiKeyHint',
                '密钥只保存在这台设备的浏览器里，共用电脑请勿填写真实密钥。',
              )}
              value={apiKey}
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
            />
          </form>
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('actions.cancel', '取消')}>
          <LayerDialog.Actions.Primary form={PROVIDER_FORM_ID} type="submit">
            {t('unsavedChanges.save', '保存')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
