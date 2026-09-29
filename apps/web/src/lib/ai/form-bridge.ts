import { useEffect, useRef } from 'react'

/**
 * 表单桥：把「当前页面上正在编辑的表单」注册给 AI，让它能**填表**（`act`）与**请求提交**（`commit`）。
 *
 * 为什么不用 DOM 驱动（像 browser-use 那样直接找 input 填值）：本仓库的表单全是**受控组件**，
 * 直接改 `input.value` 不会触发 React 的 onChange（要么值丢失、要么下次渲染被覆盖），
 * 得靠 native setter + 派发事件的技巧，动态字段、RTL、校验都会跟着出问题。
 * 注册表的做法把「AI 能改什么」变成**业务代码自己的声明**，类型安全、可审计。
 *
 * 注册拆成**两半**，因为这两件事天然属于不同的组件：
 * - **字段读写**在表单组件里（state 在它手上）→ `useAiFormFields`；
 * - **提交**在页面组件里（它知道怎么保存：校验、dirty、mutation）→ `useAiFormSubmit`。
 *
 * 两半用同一个 `id` 拼成一条注册记录；缺哪半，对应的工具就明确拒绝（而不是静默什么都不做）。
 */

export interface AiFormField {
  /** 字段键，与 `setValues` 的 patch 键一致 */
  name: string
  /** 给模型看的人类可读名（走 i18n，模型看得懂中文才能真正填对） */
  label: string
  type: 'text' | 'number' | 'switch' | 'select' | 'tags'
  description?: string
  /** `select` / `tags` 的候选值 */
  options?: Array<{ value: string; label: string }>
}

interface FormRegistration {
  id: string
  title?: string
  fields?: AiFormField[]
  getValues?: () => Record<string, unknown>
  setValues?: (patch: Record<string, unknown>) => void
  submit?: () => Promise<void> | void
  canSubmit?: () => boolean
}

type OptionalPart = 'title' | 'fields' | 'getValues' | 'setValues' | 'submit' | 'canSubmit'

/**
 * 注册表放在模块级：它描述的是「此刻页面上有什么表单」，不是渲染数据，
 * 因此不进 React state（进 state 会让每次注册都触发一轮无意义的渲染，还可能形成环）。
 */
const registry = new Map<string, FormRegistration>()

/**
 * 当前页面上可供 AI 操作的表单 —— **表单清单的唯一出口**。
 *
 * 与 `collectNavigation` 同理，这里是留给将来的**过滤点**：若某些表单不该被 AI
 * 读或填（只读页面上的表单、按权限收窄），条件加在这一处即可，工具与提示词不用改。
 *
 * 返回副本：调用方改不动注册表。
 */
export function listAiForms(): FormRegistration[] {
  return [...registry.values()]
}

export function findAiForm(id: string): FormRegistration | undefined {
  return registry.get(id)
}

function upsertAiForm(id: string, patch: Partial<FormRegistration>): void {
  const current = registry.get(id)
  registry.set(id, { ...current, ...patch, id })
}

/** 注销自己那一半；两半都注销后整条记录消失（页面离开就不该再出现在工具结果里）。 */
function clearAiFormPart(id: string, keys: OptionalPart[]): void {
  const current = registry.get(id)
  if (!current) return
  const next: FormRegistration = { ...current }
  // 这些键都是可选的（`id` 不在 `OptionalPart` 里），可以直接 delete
  for (const key of keys) {
    delete next[key]
  }
  const isEmpty =
    !next.title &&
    !next.fields &&
    !next.getValues &&
    !next.setValues &&
    !next.submit &&
    !next.canSubmit
  if (isEmpty) registry.delete(id)
  else registry.set(id, next)
}

export interface AiFormFieldsConfig {
  id: string
  title: string
  fields: AiFormField[]
  getValues: () => Record<string, unknown>
  setValues: (patch: Record<string, unknown>) => void
}

/**
 * 由**表单组件**调用：把字段定义与读写能力登记出去。
 *
 * 依赖只取 `config.id`，其余通过 ref 读最新值 —— 否则每次渲染（表单每敲一个字都渲染）
 * 都会重新注册一遍，白白制造注册/注销风暴。
 */
export function useAiFormFields(config: AiFormFieldsConfig | null): void {
  const ref = useRef(config)
  ref.current = config
  const id = config?.id ?? null

  /*
    同步 effect **故意不写依赖数组**：字段定义（含 i18n 文案）与读写闭包都要保持最新。
    写依赖会退化成「只在首次注册」的快照（切语言后字段名还是旧语言的）；
    而 upsert 只改模块级 Map、不触发 React 渲染，所以每次渲染同步一遍是安全的。
    注销交给下面那个按 `id` 的 effect。
  */
  useEffect(() => {
    if (!id) return
    upsertAiForm(id, {
      title: ref.current?.title,
      fields: ref.current?.fields,
      getValues: () => ref.current?.getValues() ?? {},
      setValues: (patch) => ref.current?.setValues(patch),
    })
  })

  useEffect(() => {
    if (!id) return
    return () => clearAiFormPart(id, ['title', 'fields', 'getValues', 'setValues'])
  }, [id])
}

export interface AiFormSubmitConfig {
  id: string
  /** 真正触发保存（页面自己的保存链路：校验 + mutation + 提示） */
  submit: () => Promise<void> | void
  /** 不满足提交条件时（未变脏 / 校验不过）返回 false，工具会如实拒绝 */
  canSubmit?: () => boolean
}

/** 由**页面组件**调用：把「提交」登记出去。 */
export function useAiFormSubmit(config: AiFormSubmitConfig | null): void {
  const ref = useRef(config)
  ref.current = config
  const id = config?.id ?? null

  // 与 `useAiFormFields` 同一套理由：同步不写依赖、注销按 id
  useEffect(() => {
    if (!id) return
    upsertAiForm(id, {
      submit: () => ref.current?.submit(),
      canSubmit: () => ref.current?.canSubmit?.() ?? true,
    })
  })

  useEffect(() => {
    if (!id) return
    return () => clearAiFormPart(id, ['submit', 'canSubmit'])
  }, [id])
}

/* -------------------------------------------------------------------------- */
/*                                表单唤起控制器                                */
/* -------------------------------------------------------------------------- */

export interface FormOpenOptions {
  action: 'create' | 'edit'
  id?: string | number
  initialValues?: Record<string, unknown>
}

type FormOpener = (options: FormOpenOptions) => void | Promise<void>
let currentFormOpener: FormOpener | null = null

export function registerFormOpener(opener: FormOpener): () => void {
  currentFormOpener = opener
  return () => {
    if (currentFormOpener === opener) currentFormOpener = null
  }
}

export function openPageForm(options: FormOpenOptions): boolean {
  if (currentFormOpener) {
    currentFormOpener(options)
    return true
  }
  return false
}

/** 检查当前页面是否具备表单能力（表单已挂载，或注册了表单唤起器） */
export function hasPageFormCapability(): boolean {
  return listAiForms().length > 0 || currentFormOpener !== null
}

/** 由页面组件调用：注册当前页面打开表单的回调（供 AI open_form 工具调用） */
export function useAiFormOpener(opener: FormOpener | null): void {
  const ref = useRef(opener)
  ref.current = opener

  useEffect(() => {
    if (!ref.current) return
    return registerFormOpener((opts) => ref.current?.(opts))
  }, [])
}
