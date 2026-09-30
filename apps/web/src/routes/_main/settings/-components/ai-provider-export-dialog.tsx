import {
  Badge,
  Button,
  Input,
  LayerDialog,
  useKumoToastManager,
} from '@cloudflare/kumo'
import {
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyableValue } from '#/components/copyable-value'
import {
  useAiConfigStore,
  type AiModelConfig,
  type AiProviderConfig,
} from '#/lib/store'

export interface ExportedAiProviderPackage {
  version: 1
  type: 'ai-provider-package'
  exportedAt: string
  provider: {
    kind: AiProviderConfig['kind']
    name: string
    baseUrl: string
    apiKey: string
    openAiFormat?: AiProviderConfig['openAiFormat']
  }
  models: Array<{
    modelId: string
    displayName: string
    supportsTools: boolean
    reasoningLevels: AiModelConfig['reasoningLevels']
    reasoning: AiModelConfig['reasoning']
    supportsVision: boolean
  }>
}

/** 安全地将 UTF-8 字符串编码为 Base64 */
export function encodeUtf8Base64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** 安全地将 Base64 解码回 UTF-8 字符串 */
export function decodeUtf8Base64(base64: string): string {
  const binary = atob(base64.trim())
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

export interface AiProviderExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: AiProviderConfig | null
}

export function AiProviderExportDialog({
  open,
  onOpenChange,
  provider,
}: AiProviderExportDialogProps) {
  const { t } = useTranslation()
  const toast = useKumoToastManager()
  const allModels = useAiConfigStore((state) => state.models)

  const [inputName, setInputName] = useState('')
  const [copied, setCopied] = useState(false)

  const models = provider
    ? allModels.filter((m) => m.providerId === provider.id)
    : []

  useEffect(() => {
    if (open) {
      setInputName('')
      setCopied(false)
    }
  }, [open])

  if (!provider) return null

  const isConfirmed = inputName.trim() === provider.name.trim()

  const generateExportPackage = (): ExportedAiProviderPackage => ({
    version: 1,
    type: 'ai-provider-package',
    exportedAt: new Date().toISOString(),
    provider: {
      kind: provider.kind,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      openAiFormat: provider.openAiFormat,
    },
    models: models.map((m) => ({
      modelId: m.modelId,
      displayName: m.displayName,
      supportsTools: m.supportsTools,
      reasoningLevels: m.reasoningLevels,
      reasoning: m.reasoning,
      supportsVision: m.supportsVision,
    })),
  })

  const getBase64Package = (): string => {
    const pkg = generateExportPackage()
    return encodeUtf8Base64(JSON.stringify(pkg, null, 2))
  }

  const handleDownload = () => {
    if (!isConfirmed) return
    const base64Content = getBase64Package()
    const blob = new Blob([base64Content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const safeFileName = provider.name.replace(/[/\\?%*:|"<>]/g, '_')
    link.download = `ai-provider-${safeFileName}-${Date.now()}.txt`
    link.click()
    URL.revokeObjectURL(url)

    toast.add({
      title: t('profile.settings.aiExportDownloaded', '已下载配置文件'),
      variant: 'success',
    })
    onOpenChange(false)
  }

  const handleCopy = async () => {
    if (!isConfirmed) return
    const base64Content = getBase64Package()

    try {
      await navigator.clipboard.writeText(base64Content)
      setCopied(true)
      toast.add({
        title: t('profile.settings.aiExportCopied', '已复制 Base64 配置到剪贴板'),
        variant: 'success',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 剪贴板异常处理
    }
  }

  return (
    <LayerDialog open={open} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>
          {t('profile.settings.aiExportTitle', '导出厂商配置 - {{name}}', {
            name: provider.name,
          })}
        </LayerDialog.Title>

        <LayerDialog.Description>
          {t(
            'profile.settings.aiExportDesc',
            '导出的配置文件包含该厂商所有设置与已配置的模型，可在其他设备导入直接使用。',
          )}
        </LayerDialog.Description>

        <LayerDialog.Body>
          <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden">
            {/* 敏感密钥安全警告 */}
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <WarningCircleIcon
                size={16}
                className="mt-0.5 shrink-0 text-amber-500"
              />
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-kumo-default">
                  {t(
                    'profile.settings.aiExportSecurityWarning',
                    '安全提示：敏感密钥将被导出',
                  )}
                </span>
                <span className="text-kumo-subtle">
                  {t(
                    'profile.settings.aiExportSecurityDesc',
                    '导出的配置将包含完整的 API 密钥明文。任何获得该文件的人均可使用您的额度调用接口，请妥善保管并切勿公开发布。',
                  )}
                </span>
              </div>
            </div>

            {/* 包含的模型摘要 */}
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-kumo-subtle">
                {t(
                  'profile.settings.aiExportIncludedModels',
                  '将一同导出的模型',
                )}
                （{models.length}）：
              </span>
              <div className="flex flex-wrap gap-1.5">
                {models.length > 0 ? (
                  models.map((m) => (
                    <Badge key={m.id} variant="secondary">
                      {m.displayName || m.modelId}
                    </Badge>
                  ))
                ) : (
                  <span className="text-kumo-inactive">
                    {t(
                      'profile.settings.aiExportNoModels',
                      '（尚未配置关联模型）',
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* 输入服务商名称确认防误操作 */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-kumo-subtle">
                <span>
                  {t(
                    'profile.settings.aiExportConfirmPrompt',
                    '请输入服务商名称以确认导出：',
                  )}
                </span>
                <CopyableValue text={provider.name} />
              </div>
              <Input
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder={provider.name}
                autoFocus
              />
            </div>

            {/* 快速复制 Base64 配置 */}
            <div className="flex flex-col gap-1.5 border-t border-kumo-line pt-3">
              <span className="text-xs text-kumo-subtle">
                {t(
                  'profile.settings.aiExportCopyHint',
                  '也可直接复制 Base64 配置字符串：',
                )}
              </span>
              <Button
                variant="secondary"
                disabled={!isConfirmed}
                icon={copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                onClick={handleCopy}
              >
                {t('profile.settings.aiExportCopy', '复制 Base64 配置')}
              </Button>
            </div>
          </div>
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('actions.cancel', '取消')}>
          <LayerDialog.Actions.Primary
            disabled={!isConfirmed}
            onClick={handleDownload}
          >
            {t('profile.settings.aiExportDownload', '下载 Base64 配置文件')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
