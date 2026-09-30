import {
  Badge,
  Button,
  LayerDialog,
  Tabs,
  Textarea,
  useKumoToastManager,
} from '@cloudflare/kumo'
import {
  CheckCircleIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  isAiProviderKind,
  useAiConfigStore,
  type AiModelConfig,
  type AiOpenAiFormat,
  type AiProviderConfig,
  type AiProviderKind,
  type AiReasoningLevel,
} from '#/lib/store'
import {
  decodeUtf8Base64,
  type ExportedAiProviderPackage,
} from './ai-provider-export-dialog'

export interface AiProviderImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ParsedImportData {
  provider: {
    kind: AiProviderConfig['kind']
    name: string
    baseUrl: string
    apiKey: string
    openAiFormat?: AiOpenAiFormat
  }
  models: Array<{
    modelId: string
    displayName: string
    supportsTools: boolean
    reasoningLevels: AiReasoningLevel[]
    reasoning: AiReasoningLevel
    supportsVision: boolean
  }>
}

export function AiProviderImportDialog({
  open,
  onOpenChange,
}: AiProviderImportDialogProps) {
  const { t } = useTranslation()
  const toast = useKumoToastManager()
  const fileInputId = useId()

  const addProvider = useAiConfigStore((state) => state.addProvider)
  const addModel = useAiConfigStore((state) => state.addModel)
  const activeModelId = useAiConfigStore((state) => state.activeModelId)
  const setActiveModel = useAiConfigStore((state) => state.setActiveModel)
  const existingProviders = useAiConfigStore((state) => state.providers)

  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload')
  const [jsonText, setJsonText] = useState('')
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<ParsedImportData | null>(null)

  const resetState = () => {
    setJsonText('')
    setFileName('')
    setParseError(null)
    setParsedData(null)
    setActiveTab('upload')
  }

  const validateAndParse = (rawText: string, sourceFileName?: string) => {
    const trimmed = rawText.trim()
    if (!trimmed) {
      setParseError(null)
      setParsedData(null)
      return
    }

    try {
      let jsonString: string
      try {
        jsonString = decodeUtf8Base64(trimmed)
      } catch {
        // 若为未编码的原始 JSON，兼容支持
        if (trimmed.startsWith('{')) {
          jsonString = trimmed
        } else {
          throw new Error(
            t(
              'profile.settings.aiImportInvalidBase64',
              '无效的 Base64 配置内容，请检查',
            ),
          )
        }
      }

      const obj = JSON.parse(jsonString)
      if (!obj || typeof obj !== 'object') {
        throw new Error(
          t('profile.settings.aiImportInvalidFormat', '不是合法的模型厂商配置文件'),
        )
      }

      // 提取 provider 部分（兼容 ExportedAiProviderPackage 与普通 JSON 结构）
      const rawProvider = (obj.provider || obj) as Partial<AiProviderConfig>
      if (!rawProvider || typeof rawProvider !== 'object') {
        throw new Error(
          t('profile.settings.aiImportInvalidFormat', '缺少厂商配置信息'),
        )
      }

      const rawKind = (rawProvider as any).kind
      let kind: AiProviderKind
      if (rawKind === 'compatible' || rawKind === 'openai') {
        kind = 'openai'
      } else if (rawKind === 'anthropic') {
        kind = 'anthropic'
      } else {
        throw new Error('未知的协议规范 (kind)，仅支持 openai / anthropic')
      }

      const openAiFormat: AiOpenAiFormat =
        rawProvider.openAiFormat === 'official' ? 'official' : 'compatible'

      const name = String(rawProvider.name ?? '').trim()
      if (!name) {
        throw new Error('厂商名称不能为空')
      }

      const baseUrl = String(rawProvider.baseUrl ?? '').trim()
      const apiKey = String(rawProvider.apiKey ?? '').trim()

      // 提取 models 部分
      const rawModels = Array.isArray(obj.models) ? obj.models : []
      const models = rawModels
        .filter((m: any) => m && typeof m === 'object' && m.modelId)
        .map((m: any) => ({
          modelId: String(m.modelId).trim(),
          displayName: String(m.displayName || m.modelId).trim(),
          supportsTools: typeof m.supportsTools === 'boolean' ? m.supportsTools : true,
          reasoningLevels: Array.isArray(m.reasoningLevels)
            ? m.reasoningLevels
            : [],
          reasoning: m.reasoning ?? 'provider-default',
          supportsVision:
            typeof m.supportsVision === 'boolean' ? m.supportsVision : true,
        }))

      setParsedData({
        provider: {
          kind,
          name,
          baseUrl,
          apiKey,
          openAiFormat: kind === 'openai' ? openAiFormat : undefined,
        },
        models,
      })
      setParseError(null)
      if (sourceFileName) setFileName(sourceFileName)
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : t('profile.settings.aiImportInvalidJson', '无效的 JSON 格式，请检查内容'),
      )
      setParsedData(null)
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '')
      setJsonText(text)
      validateAndParse(text, file.name)
    }
    reader.readAsText(file)
  }

  const handleTextChange = (text: string) => {
    setJsonText(text)
    validateAndParse(text)
  }

  const handleConfirmImport = () => {
    if (!parsedData) return

    // 1. 如果已有同名厂商，自动追加后缀以区分
    let providerName = parsedData.provider.name
    const isDuplicate = existingProviders.some((p) => p.name === providerName)
    if (isDuplicate) {
      providerName = `${providerName} (${t('profile.settings.aiImportProvider', '导入')})`
    }

    // 2. 添加厂商
    const newProviderId = addProvider({
      kind: parsedData.provider.kind,
      name: providerName,
      baseUrl: parsedData.provider.baseUrl,
      apiKey: parsedData.provider.apiKey,
      openAiFormat: parsedData.provider.openAiFormat,
    })

    // 3. 关联添加所有模型
    let firstAddedModelId: string | null = null
    parsedData.models.forEach((m) => {
      const modelId = addModel({
        providerId: newProviderId,
        modelId: m.modelId,
        displayName: m.displayName,
        supportsTools: m.supportsTools,
        reasoningLevels: m.reasoningLevels,
        reasoning: m.reasoning,
        supportsVision: m.supportsVision,
      })
      if (!firstAddedModelId) firstAddedModelId = modelId
    })

    // 4. 若当前没有激活模型且导入了新模型，设为当前激活
    if (!activeModelId && firstAddedModelId) {
      setActiveModel(firstAddedModelId)
    }

    toast.add({
      title: t(
        'profile.settings.aiImportSuccess',
        '成功导入厂商「{{name}}」及 {{count}} 个模型',
        {
          name: providerName,
          count: parsedData.models.length,
        },
      ),
      variant: 'success',
    })

    onOpenChange(false)
    resetState()
  }

  return (
    <LayerDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetState()
        onOpenChange(next)
      }}
    >
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>
          {t('profile.settings.aiImportTitle', '导入厂商与模型配置')}
        </LayerDialog.Title>

        <LayerDialog.Description>
          {t(
            'profile.settings.aiImportDesc',
            '上传 Base64 配置文件或直接粘贴 Base64 文本，导入后直接可用。',
          )}
        </LayerDialog.Description>

        <LayerDialog.Body>
          <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden">
            <Tabs
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as 'upload' | 'paste')}
              tabs={[
                {
                  value: 'upload',
                  label: t('profile.settings.aiImportUploadTab', '上传文件'),
                },
                {
                  value: 'paste',
                  label: t('profile.settings.aiImportPasteTab', '粘贴文本'),
                },
              ]}
            />

            {activeTab === 'upload' ? (
              <div className="flex flex-col gap-2">
                <input
                  id={fileInputId}
                  type="file"
                  accept=".txt,.base64,text/plain"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <label
                  htmlFor={fileInputId}
                  className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-kumo-line bg-kumo-base p-4 text-center transition-colors hover:bg-kumo-tint"
                >
                  <UploadSimpleIcon size={24} className="text-kumo-subtle" />
                  <span className="mt-2 text-xs font-medium text-kumo-default">
                    {fileName ||
                      t(
                        'profile.settings.aiImportDropHint',
                        '点击上传或将 Base64 配置文件 (.txt) 拖拽至此处',
                      )}
                  </span>
                </label>
              </div>
            ) : (
              <div className="w-full min-w-0 max-w-full overflow-hidden">
                <Textarea
                  value={jsonText}
                  onValueChange={handleTextChange}
                  placeholder={t(
                    'profile.settings.aiImportPastePlaceholder',
                    '在此处粘贴 Base64 配置字符串...',
                  )}
                  autoResize={false}
                  rows={5}
                  style={{
                    maxWidth: '100%',
                    width: '100%',
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                  }}
                  className="w-full min-w-0 max-w-full break-all font-mono text-xs [overflow-wrap:anywhere] [word-break:break-all]"
                />
              </div>
            )}

            {/* 校验错误提示 */}
            {parseError ? (
              <div className="flex items-center gap-2 rounded-lg bg-kumo-danger-tint px-3 py-2 text-xs text-kumo-danger">
                <WarningCircleIcon size={16} className="shrink-0" />
                <span>{parseError}</span>
              </div>
            ) : null}

            {/* 解析成功预览 */}
            {parsedData ? (
              <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden rounded-xl border border-kumo-line bg-kumo-control p-3 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-kumo-success">
                  <CheckCircleIcon size={14} />
                  <span>
                    {t('profile.settings.aiImportPreview', '配置预览')}
                  </span>
                </div>

                <div className="mt-1 flex flex-col gap-1.5 text-kumo-default">
                  <div className="flex items-center gap-2">
                    <span className="text-kumo-subtle">服务商：</span>
                    <span className="font-semibold">
                      {parsedData.provider.name}
                    </span>
                    <Badge variant="secondary">
                      {parsedData.provider.kind}
                    </Badge>
                    <Badge
                      variant={
                        parsedData.provider.apiKey ? 'success' : 'warning'
                      }
                    >
                      {parsedData.provider.apiKey
                        ? '已携带密钥'
                        : '缺少密钥'}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-kumo-subtle">
                      包含模型（{parsedData.models.length}）：
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {parsedData.models.length > 0 ? (
                        parsedData.models.map((m, idx) => (
                          <Badge key={idx} variant="secondary">
                            {m.displayName || m.modelId}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-kumo-inactive">
                          （无关联模型）
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </LayerDialog.Body>

        <LayerDialog.Actions dismissLabel={t('actions.cancel', '取消')}>
          <LayerDialog.Actions.Primary
            disabled={!parsedData}
            onClick={handleConfirmImport}
          >
            {t('profile.settings.aiImportConfirm', '确认导入')}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog>
  )
}
