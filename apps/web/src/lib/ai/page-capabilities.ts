import { useEffect } from 'react'
import { useAuthStore } from '#/lib/auth'
import { registerAiPageContext, clearAiPageContext } from './page-context-registry'

/* -------------------------------------------------------------------------- */
/*                            页面能力 JSON 规格声明                             */
/* -------------------------------------------------------------------------- */

/**
 * 字段级规格定义
 */
export interface CapabilityFormField {
  name: string
  label: string
  type?: 'text' | 'number' | 'switch' | 'select' | 'tags' | string
  required?: boolean
  description?: string
  options?: Array<{ value: string; label: string }>
}

export interface CapabilityFormSubmission {
  /** 提交目标接口（如 POST /user） */
  endpoint: {
    method: string
    path: string
  }
  /** 提交动作按钮文案，如「创建用户」「保存修改」 */
  submitLabel?: string
  /** 是否强制要求人工确认询问卡片（默认 true） */
  requireApproval?: boolean
  /** 弹出确认卡片时的提示说明文案 */
  approvalReason?: string
}

/**
 * 表单级能力声明
 */
export interface CapabilityForm {
  id: string
  title: string
  action: 'create' | 'edit'
  description?: string
  /** 权限标识（如 'user:edit' / 'user:create'）。将来根据当前用户权限过滤给 AI 的表单 */
  permission?: string
  /** 表单提交行为与审批策略规格声明 */
  submission?: CapabilityFormSubmission
  fields?: CapabilityFormField[]
}

/**
 * 页面动作区与批量操作声明（导出、批量删除、导入等）
 */
export interface CapabilityAction {
  id: string
  title: string
  type:
    | 'create'
    | 'edit'
    | 'delete'
    | 'batch-delete'
    | 'export'
    | 'import'
    | 'refresh'
    | 'custom'
  description?: string
  /** 权限标识（如 'user:delete' / 'user:export'） */
  permission?: string
  endpoint?: {
    method: string
    path: string
  }
}

/**
 * 接口级能力声明
 */
export interface CapabilityEndpoint {
  method: string
  path: string
  purpose?: string
  /** 权限标识 */
  permission?: string
}

/**
 * 统一页面能力规格声明（标准 JSON 结构）
 */
export interface PageCapabilitiesSpec {
  /** 页面唯一路由标识或模板，如 '/$appId/users/user/' */
  routeId: string
  /** 页面中文业务名称，如「用户管理」 */
  title: string
  /** 页面定位与核心能力总览 */
  description: string
  /** 业务领域与核心实体名词 */
  entities?: string[]
  /** 页面支持的查询与接口清单 */
  endpoints?: CapabilityEndpoint[]
  /** 页面可操作的表单清单（含字段规格与权限点） */
  forms?: CapabilityForm[]
  /** 页面可触发的交互动作（含批量删除、导出等） */
  actions?: CapabilityAction[]
}

export type FilteredPageCapabilities = PageCapabilitiesSpec

/* -------------------------------------------------------------------------- */
/*                                通用构造与过滤函数                             */
/* -------------------------------------------------------------------------- */

/**
 * 声明页面能力规格（强类型校验与纯 JSON 结构返回）
 */
export function definePageCapabilities(
  spec: PageCapabilitiesSpec,
): PageCapabilitiesSpec {
  return spec
}

/**
 * 权限过滤中心（集中过滤点，遵循铁律 4）：
 *
 * 任何给模型的页面能力（表单、接口、动作）都必须统一流经本函数。
 * 当用户不具备某项权限时（如无 'user:edit' 权限），
 * 对应的表单与动作将被就地裁剪，模型完全不可见该能力，杜绝越权猜测。
 */
export function filterPageCapabilities(
  spec: PageCapabilitiesSpec,
  authContext?: {
    role?: string
    permissions?: readonly string[]
  },
): FilteredPageCapabilities {
  // 超级管理员放行全量
  if (authContext?.role === 'admin' || authContext?.role === 'superadmin') {
    return spec
  }

  const permissions = authContext?.permissions
  // 未配置具体权限表时，默认放行未声明 permission 的公开能力
  const hasPerm = (perm?: string) => {
    if (!perm) return true
    if (!permissions) return true
    return permissions.includes(perm)
  }

  return {
    ...spec,
    endpoints: (spec.endpoints ?? []).filter((e) => hasPerm(e.permission)),
    forms: (spec.forms ?? []).filter((f) => hasPerm(f.permission)),
    actions: (spec.actions ?? []).filter((a) => hasPerm(a.permission)),
  }
}

/* -------------------------------------------------------------------------- */
/*                                全局存储与解析器                             */
/* -------------------------------------------------------------------------- */

const capabilityRegistry = new Map<string, PageCapabilitiesSpec>()

/**
 * 注册页面能力规格到全局表
 */
export function registerPageCapabilities(
  routeId: string,
  spec: PageCapabilitiesSpec,
): void {
  capabilityRegistry.set(routeId, spec)
}

export function clearPageCapabilities(routeId: string): void {
  capabilityRegistry.delete(routeId)
}

/**
 * 获取当前页面经权限过滤后的最终可用能力
 */
export function resolveActivePageCapabilities(
  routeId: string | null,
): FilteredPageCapabilities | undefined {
  if (!routeId) return undefined
  const rawSpec = capabilityRegistry.get(routeId)
  if (!rawSpec) return undefined

  const user = useAuthStore.getState().user
  return filterPageCapabilities(rawSpec, {
    role: user?.role,
    // 预留对接未来用户权限清单
    permissions: undefined,
  })
}

/**
 * 页面端 Hook：向系统与 AI 全局声明当前页面的全套能力。
 * 内部自动将过滤后的能力同步给底层 AI 上下文注册表（AiPageContext）。
 */
export function usePageCapabilities(spec: PageCapabilitiesSpec): void {
  useEffect(() => {
    registerPageCapabilities(spec.routeId, spec)

    // 同步到现有的 page-context-registry，供提示词与 get_page_context 消费
    registerAiPageContext(spec.routeId, {
      description: spec.description,
      entities: spec.entities,
      endpoints: spec.endpoints,
      forms: spec.forms,
    })

    return () => {
      clearPageCapabilities(spec.routeId)
      clearAiPageContext(spec.routeId)
    }
  })
}
