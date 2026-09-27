import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { enableCrossTabSync } from './cross-tab-sync'

/**
 * AI 模型服务配置 store（厂商 + 模型 + 默认模型）。
 *
 * **全局一份、不按应用隔离**（与 `admin.shell-ui` 同类，而不是 `admin.preferences:<appId>`）：
 * 厂商地址与 API Key 是**使用者级别的资产** —— 在 console 里配好，切到 analytics 不该重新配一遍。
 *
 * **API Key 明文存在 localStorage**：这是「零后端依赖、浏览器直连厂商」换来的代价，
 * 见 `.agents/docs/ai-integration.md` §4。设置页必须显式提示风险并默认掩码显示，
 * 不要在任何日志 / toast / 错误信息里回显这个字段。
 *
 * 数据结构上**厂商与模型是两张表**：一个厂商通常挂多个模型（gpt-5 / gpt-5-mini），
 * 而 Base URL 与 Key 属于厂商 —— 合成一条记录会让同一个 Key 被抄 N 份，改一次要改 N 处。
 */

/** 厂商类型：前两种走官方协议，第三种留给自建网关 / One-API 这类兼容服务。 */
export type AiProviderKind = 'openai' | 'anthropic' | 'compatible'

export interface AiProviderConfig {
  id: string
  kind: AiProviderKind
  /** 显示名。新增时默认取该类型的名称，允许用户改成「公司网关」这类更直观的名字 */
  name: string
  /** 接口地址。**留空表示用该类型的官方默认地址**（见 `AI_PROVIDER_DEFAULTS`） */
  baseUrl: string
  apiKey: string
}

export interface AiModelConfig {
  id: string
  /** 指向 `AiProviderConfig.id`；厂商被删除时该模型一并删除 */
  providerId: string
  /** 传给厂商 API 的模型名，如 `gpt-5-mini` / `claude-sonnet-4-5` */
  modelId: string
  displayName: string
  /** 是否给这个模型发工具定义：小模型 / 纯推理模型不支持工具调用，关掉它退化成纯对话 */
  supportsTools: boolean
}

/** 各类型的默认接口地址与默认名称。 */
export const AI_PROVIDER_DEFAULTS: Record<
  AiProviderKind,
  { baseUrl: string; name: string }
> = {
  openai: { baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', name: 'Anthropic' },
  compatible: { baseUrl: '', name: 'OpenAI 兼容' },
}

/** 厂商类型的展示顺序（也用于设置页的下拉选项）。 */
export const AI_PROVIDER_KINDS: readonly AiProviderKind[] = [
  'openai',
  'anthropic',
  'compatible',
]

export function isAiProviderKind(value: unknown): value is AiProviderKind {
  return value === 'openai' || value === 'anthropic' || value === 'compatible'
}

interface AiConfigState {
  providers: AiProviderConfig[]
  models: AiModelConfig[]
  /** 当前使用的模型（`AiModelConfig.id`）；为 null 表示还没配好，面板因此只能提示去配置 */
  activeModelId: string | null
  addProvider: (provider: Omit<AiProviderConfig, 'id'>) => string
  updateProvider: (id: string, patch: Partial<Omit<AiProviderConfig, 'id'>>) => void
  removeProvider: (id: string) => void
  addModel: (model: Omit<AiModelConfig, 'id'>) => string
  updateModel: (id: string, patch: Partial<Omit<AiModelConfig, 'id'>>) => void
  removeModel: (id: string) => void
  setActiveModel: (id: string | null) => void
}

type PersistedAiConfig = Pick<
  AiConfigState,
  'providers' | 'models' | 'activeModelId'
>

export const AI_CONFIG_STORAGE_KEY = 'admin.ai'

/** 生成一个本地 id。用 `randomUUID`（现代浏览器与 Node 18+ 都有），不必为此引依赖。 */
function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 逐项校验存档里的一条厂商记录。
 *
 * 与偏好 store 同一条约定：**不信任存档**（可能来自旧版本、手改、或另一个标签页的中间状态），
 * 字段缺失 / 类型不对就丢掉这条，而不是把 `undefined` 灌进 UI。
 */
function normalizeProvider(value: unknown): AiProviderConfig | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<AiProviderConfig>
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (!isAiProviderKind(raw.kind)) return null
  return {
    id: raw.id,
    kind: raw.kind,
    name: typeof raw.name === 'string' && raw.name ? raw.name : AI_PROVIDER_DEFAULTS[raw.kind].name,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
  }
}

function normalizeModel(value: unknown): AiModelConfig | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<AiModelConfig>
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.providerId !== 'string' || !raw.providerId) return null
  if (typeof raw.modelId !== 'string' || !raw.modelId) return null
  return {
    id: raw.id,
    providerId: raw.providerId,
    modelId: raw.modelId,
    displayName:
      typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : raw.modelId,
    supportsTools: raw.supportsTools !== false,
  }
}

export const useAiConfigStore = create<AiConfigState>()(
  persist(
    (set, get) => ({
      providers: [],
      models: [],
      activeModelId: null,

      addProvider: (provider) => {
        const id = createId()
        set((state) => ({ providers: [...state.providers, { ...provider, id }] }))
        return id
      },

      updateProvider: (id, patch) =>
        set((state) => ({
          providers: state.providers.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        })),

      /**
       * 删除厂商时**连带删除它的模型**，并清理指向它们的默认模型 ——
       * 否则会留下 `providerId` 指向不存在厂商的孤儿模型，模型下拉里会出现一条查不到 Key 的项。
       */
      removeProvider: (id) =>
        set((state) => {
          const models = state.models.filter((model) => model.providerId !== id)
          const stillExists = models.some((model) => model.id === state.activeModelId)
          return {
            providers: state.providers.filter((item) => item.id !== id),
            models,
            activeModelId: stillExists ? state.activeModelId : null,
          }
        }),

      addModel: (model) => {
        const id = createId()
        set((state) => {
          const models = [...state.models, { ...model, id }]
          return {
            models,
            // 第一个模型自动成为默认：配完就能直接用，不必再点一次「设为默认」
            activeModelId: state.activeModelId ?? id,
          }
        })
        return id
      },

      updateModel: (id, patch) =>
        set((state) => ({
          models: state.models.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        })),

      removeModel: (id) =>
        set((state) => ({
          models: state.models.filter((item) => item.id !== id),
          activeModelId: state.activeModelId === id ? null : state.activeModelId,
        })),

      setActiveModel: (id) => {
        // 只接受真实存在的模型 id：`null` 表示「还没选」，不属于错误
        if (id !== null && !get().models.some((model) => model.id === id)) return
        set({ activeModelId: id })
      },
    }),
    {
      name: AI_CONFIG_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedAiConfig => ({
        providers: state.providers,
        models: state.models,
        activeModelId: state.activeModelId,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedAiConfig>
        const providers = Array.isArray(saved.providers)
          ? saved.providers.map(normalizeProvider).filter((item): item is AiProviderConfig => item !== null)
          : current.providers
        const providerIds = new Set(providers.map((item) => item.id))
        const models = (
          Array.isArray(saved.models) ? saved.models.map(normalizeModel) : []
        ).filter(
          // 厂商已经不在了的模型一律丢掉（手改存档 / 旧版本残留）
          (item): item is AiModelConfig => item !== null && providerIds.has(item.providerId),
        )
        const activeModelId =
          typeof saved.activeModelId === 'string' &&
          models.some((model) => model.id === saved.activeModelId)
            ? saved.activeModelId
            : null
        return { ...current, providers, models, activeModelId }
      },
    },
  ),
)

// 多标签页同步：在另一个标签页里加了厂商 / 换了默认模型，这一页立即跟随
enableCrossTabSync(useAiConfigStore, { storageName: AI_CONFIG_STORAGE_KEY })

/** 非 React 上下文读取配置（运行时 / 工具层要用）。 */
export function getAiConfig() {
  return useAiConfigStore.getState()
}

/**
 * 取当前默认模型及其厂商。
 *
 * 返回 `null` 的两种情况都表示「还不能发起对话」，调用方据此时提示去设置页：
 * 没配模型、或默认模型指向的厂商已经不在了（正常情况下 `merge` 已拦掉后者）。
 */
export function getActiveModel(): {
  model: AiModelConfig
  provider: AiProviderConfig
} | null {
  const { models, providers, activeModelId } = getAiConfig()
  const model = models.find((item) => item.id === activeModelId)
  if (!model) return null
  const provider = providers.find((item) => item.id === model.providerId)
  if (!provider) return null
  return { model, provider }
}

/** 厂商实际使用的接口地址（留空回落官方默认）。 */
export function resolveProviderBaseUrl(provider: AiProviderConfig): string {
  return provider.baseUrl.trim() || AI_PROVIDER_DEFAULTS[provider.kind].baseUrl
}
