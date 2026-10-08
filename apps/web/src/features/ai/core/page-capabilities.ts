import { useEffect } from 'react'
import { hasPermission } from '#/lib/permissions'
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
  /** 渲染成哪种控件：本模板内置 `text | number | switch | select | tags`，页面可自行扩展 */
  type?: string
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
  /**
   * **强制**要求人工确认（默认关，按 `approval-policy` 的模式判定走）。
   *
   * 语义在 2026-10 修正过一次：早先这里写着「默认 true」，而实现里写成
   * `?? (ctx.mode === 'ask' || true)`（恒真），于是**自动模式下提交表单也弹卡**，
   * 这张声明等于空操作。
   *
   * 现在：**不写** = 由审批策略表决定（`ask` 问、`auto` 免问，交 `canSubmit()` 把关）；
   * 显式写 `true` = 这张表单在**两个模式下都强制确认**（个别高危表单可用它单独收紧）。
   */
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
  /** 权限标识（如 'table-example:edit' / 'table-example:create'）。将来根据当前用户权限过滤给 AI 的表单 */
  permission?: string
  /** AI 填写这张表单需要的权限点（只改页面状态、不落库） */
  fillPermission?: string
  /** AI 提交这张表单需要的权限点（落库，不可撤销） */
  submitPermission?: string
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
  type: 'create' | 'edit' | 'delete' | 'batch-delete' | 'export' | 'import' | 'refresh' | 'custom'
  description?: string
  /** 权限标识（如 'table-example:delete' / 'table-example:export'） */
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

export interface CapabilitySearchParamField {
  param: string
  label: string
  /** 筛选控件形态：本模板内置 `text | number | number-range | boolean | enum | array` */
  type?: string
  description?: string
  options?: readonly string[]
  paramTo?: string
  /** 权限标识 */
  permission?: string
}

/**
 * 页面搜索、筛选、排序与分页参数规格声明
 */
export interface CapabilitySearchParams {
  /** 能力说明，如「支持按关键词模糊匹配、多字段精确/范围筛选、排序与分页」 */
  description?: string
  /** 主搜索词对应参数名，默认 'kw' */
  keywordParam?: string
  /** 分页参数名，默认 ['page', 'page_size'] */
  paginationParams?: readonly string[]
  /** 允许排序的字段名清单 */
  sortableFields?: readonly string[]
  /** 允许筛选的高级过滤字段清单 */
  filterFields?: readonly CapabilitySearchParamField[]
}

/**
 * 统一页面能力规格声明（标准 JSON 结构）
 */
export interface PageCapabilitiesSpec {
  /** 页面唯一路由标识或模板，如 '/$appId/example/table/' */
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
  /** 页面支持的搜索、筛选、排序与分页参数规格 */
  searchParams?: CapabilitySearchParams
}

export type FilteredPageCapabilities = PageCapabilitiesSpec

/* -------------------------------------------------------------------------- */
/*                                通用构造与过滤函数                             */
/* -------------------------------------------------------------------------- */

/**
 * 声明页面能力规格（强类型校验与纯 JSON 结构返回）
 */
export function definePageCapabilities(spec: PageCapabilitiesSpec): PageCapabilitiesSpec {
  return spec
}

/**
 * **权限判定的唯一实现**（页面能力 / 页面指令共用）。
 *
 * 约定：
 * - 未声明 `permission` 的能力是公开的；
 * - 其余一律交给 `hasPermission`（超管判定、通配、角色、`all`/`any` 都在那里）；
 * - `authContext` 不传时自动读权限 store，因此调用方**不需要**自己判断角色。
 *
 * 页面指令（`#/features/ai/page`）与页面能力走同一处判定，**不要各写一份**：
 * 两处判定一旦分叉，就会出现"能力列表里看不到、指令却能执行"这种越权缝。
 * （这里曾经硬编码 `role === 'admin'` 直接放行全量 —— 那既与 store 的判定分叉，
 * 又把业务管理员错当成超管，现已删除。）
 */
export function hasPageCapabilityPermission(
  permission?: string,
  authContext?: { role?: string; permissions?: readonly string[] },
): boolean {
  if (!permission) return true
  return hasPermission(permission, authContext)
}

/**
 * 权限过滤中心（集中过滤点，遵循铁律 4）：
 *
 * 任何给模型的页面能力（表单、接口、动作）都必须统一流经本函数。
 * 当用户不具备某项权限时（如无 'table-example:edit' 权限），
 * 对应的表单与动作将被就地裁剪，模型完全不可见该能力，杜绝越权猜测。
 */
export function filterPageCapabilities(
  spec: PageCapabilitiesSpec,
  authContext?: {
    role?: string
    permissions?: readonly string[]
  },
): FilteredPageCapabilities {
  // 判定**只有一处**（`hasPageCapabilityPermission` → `hasPermission`）：
  // 这里不再单独判角色，否则「能力列表」与「页面指令」两处判定会分叉。
  const hasPerm = (perm?: string) => hasPageCapabilityPermission(perm, authContext)

  return {
    ...spec,
    endpoints: (spec.endpoints ?? []).filter((e) => hasPerm(e.permission)),
    forms: (spec.forms ?? []).filter((f) => hasPerm(f.permission)),
    actions: (spec.actions ?? []).filter((a) => hasPerm(a.permission)),
    searchParams: spec.searchParams
      ? {
          ...spec.searchParams,
          filterFields: (spec.searchParams.filterFields ?? []).filter((f) => hasPerm(f.permission)),
        }
      : undefined,
  }
}

/* -------------------------------------------------------------------------- */
/*                                全局存储与解析器                             */
/* -------------------------------------------------------------------------- */

const capabilityRegistry = new Map<string, PageCapabilitiesSpec>()

/**
 * 注册页面能力规格到全局表
 */
export function registerPageCapabilities(routeId: string, spec: PageCapabilitiesSpec): void {
  capabilityRegistry.set(routeId, spec)
}

export function clearPageCapabilities(routeId: string): void {
  capabilityRegistry.delete(routeId)
}

/**
 * 获取当前页面经权限过滤后的最终可用能力。
 *
 * **不传 `authContext`**：权限上下文由 `hasPermission` 统一从权限 store 读取。
 * 这里曾经传 `{ role: authStore.user.role, permissions: undefined }` ——
 * 那等于把「角色名」和「权限点」拆成两个真值来源：权限点恒为空，
 * 超管靠 `filterPageCapabilities` 里一条硬编码 `role === 'admin'` 才侥幸放行，
 * 而 `Admin`（业务管理员）也顺手被当成了超管。两个问题一起删掉。
 */
export function resolveActivePageCapabilities(
  routeId: string | null,
): FilteredPageCapabilities | undefined {
  if (!routeId) return undefined
  const rawSpec = capabilityRegistry.get(routeId)
  if (!rawSpec) return undefined

  return filterPageCapabilities(rawSpec)
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
