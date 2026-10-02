import type { RuntimeSchema } from '#/components/data-table'
import type { DictBinaryFlag } from './data-dict-options'

/**
 * 数据字典模块**自行声明**的响应类型与列 schema。
 *
 * ## 为什么不用生成产物（重要，别改回去）
 *
 * `openapi.json` 里这两个接口的 response schema 是**错的**：
 *
 * | 接口 | openapi 声明的 result | 实际返回 |
 * | --- | --- | --- |
 * | `GET /data_dict/type/tree` | `v1.DataOptions`（`{ options, total }`） | `DictTypeNode[]`（整棵分类树数组） |
 * | `GET /data_dict` | `v1.DataOptions`（`{ options, total }`） | `{ total, items: DictItem[] }` |
 *
 * 两个接口都被复制成了 `/data_dict/options`（业务下拉用的 `{ options, total }`）的类型，
 * 因此 `getDataDictTypeTree` / `getDataDict` 的响应类型不可信 —— 既不能当行类型，
 * 也不能交给 `useSchemaColumns` 推断列。
 *
 * 处理方式：**请求参数与请求体仍用生成类型**（`GetDataDictData` / `V1DataDictCreateReq` 等，
 * 那些是正确的），只在响应侧替换成本文件声明的类型，并手写一份等价的运行时 schema 供表格列使用。
 * ⏳ 删除条件：后端修正 Apifox 里这两个接口的响应定义、`pnpm api` 重新生成后，
 * 删掉本文件的类型与 schema，改用生成产物（列编排里 `path` 的写法无需改动）。
 */

/* -------------------------------------------------------------------------- */
/*                                  类型                                       */
/* -------------------------------------------------------------------------- */

/**
 * 分类（type）：可嵌套，构成分类树。
 *
 * 用 `type` 而非 `interface` 是有意的：`useSchemaColumns<TData extends Record<string, unknown>>`
 * 要求行类型可赋给 `Record<string, unknown>`，而**只有类型别名**会获得隐式索引签名，
 * `interface` 不会（这正是 features 的 `MenuNode` 作为 type 别名能通过的原因）。
 */
export type DictType = {
  id: number
  parent_id: number
  /** 祖先 id 链、**不含自身**（形如 `/0/38/`），与 features 的 `id_path` 语义一致。 */
  id_path?: string
  /** 从根到自身的完整 code 链（形如 `common.channel`）。 */
  p_code?: string
  /** 分类名称。 */
  name: string
  /** 局部码（形如 `channel`），同一父级下用于拼接 `p_code`。 */
  code: string
  /** 状态：1 启用 / 2 禁用。 */
  status: number
  /** 键值类型：1 string / 2 number（语义见 `data-dict-options.ts`）。 */
  type: number
  sort?: number
  remark?: string
  /** 秒级时间戳；实测存在脏值（如 `54353`），渲染必须走容错解析。 */
  created_at?: number | string
  updated_at?: number | string
  children?: DictType[]
}

/** 字典项内嵌的操作人（列表直接可展示，无需再查用户）。 */
export type DictItemUser = {
  uid?: number
  username?: string
  nick_name?: string
}

/** 字典项（item）：挂在分类下的键值对（用 `type` 的原因同 `DictType`）。 */
export type DictItem = {
  id: number
  /** 所属分类 id。 */
  type_id: number
  /**
   * 所属分类的完整 code —— 由后端按分类生成，同一分类下所有项**完全相同**。
   * 请求体（Create/Update）里没有该字段，前端不提交。
   */
  code?: string
  /** 展示名。 */
  label: string
  /** 键值。 */
  value: string
  /** 状态：1 启用 / 2 禁用。 */
  status: number
  /** 是否默认：1 是 / 2 否（旧后台是单选「是 / 否」，同分类内通常只有一条为 1）。 */
  is_default: number
  sort?: number
  remark?: string
  update_by_user?: DictItemUser
  created_at?: number | string
  updated_at?: number | string
  data_type?: unknown
}

/** `GET /data_dict` 的服务端分页返回体。 */
export type DictItemPage = {
  total: number
  items: DictItem[]
}

/* -------------------------------------------------------------------------- */
/*                            运行时 schema（列推断用）                         */
/* -------------------------------------------------------------------------- */

/**
 * 分类的运行时 schema（等价于真实响应结构）。
 *
 * 只有 `description` 与 `type` 会被 `useSchemaColumns` 消费：
 * - `type` 决定内置渲染器的推断（`integer` → number、`string` → text）；
 * - `description` 是 i18n 缺失时的兜底文案（首个分句）。
 *
 * 枚举（status / type）走模块自定义渲染器，不依赖这里。
 */
export const DICT_TYPE_SCHEMA: RuntimeSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', description: '分类 ID' },
    parent_id: { type: 'integer', description: '上级分类 ID' },
    id_path: { type: 'string', description: '祖先 id 链' },
    p_code: { type: 'string', description: '完整编码' },
    name: { type: 'string', description: '分类名称' },
    code: { type: 'string', description: '分类编码' },
    status: { type: 'integer', description: '状态' },
    type: { type: 'integer', description: '键值类型' },
    sort: { type: 'integer', description: '排序' },
    remark: { type: 'string', description: '备注' },
    created_at: { type: 'integer', description: '创建时间' },
    updated_at: { type: 'integer', description: '更新时间' },
  },
}

/** 字典项的运行时 schema（等价于真实响应结构）。 */
export const DICT_ITEM_SCHEMA: RuntimeSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', description: '字典项 ID' },
    type_id: { type: 'integer', description: '分类 ID' },
    code: { type: 'string', description: '分类编码' },
    label: { type: 'string', description: '显示名' },
    value: { type: 'string', description: '键值' },
    status: { type: 'integer', description: '状态' },
    is_default: { type: 'integer', description: '是否默认' },
    sort: { type: 'integer', description: '排序' },
    remark: { type: 'string', description: '备注' },
    // $ref 嵌套对象：schema 推断不出行数据路径，列编排里必须用 `path` 展开
    update_by_user: { type: 'object', description: '最后更新人' },
    created_at: { type: 'integer', description: '创建时间' },
    updated_at: { type: 'integer', description: '更新时间' },
    data_type: { type: 'object', description: '数据类型' },
  },
}

/* -------------------------------------------------------------------------- */
/*                              表单值（请求体雏形）                             */
/* -------------------------------------------------------------------------- */

/**
 * 分类表单值。
 *
 * `id` 用可选而不是拆成两个类型：表单组件一份代码同时服务新建与编辑，
 * 由调用方按 `id` 是否存在决定走 `POST` 还是 `PUT`
 * （后端的 `V1DataTypeCreateReq` 不允许 `id`、`V1DataTypeUpdateReq` 必填 `id`，
 * 两者结构其余部分一致，因此提交时按需收窄即可）。
 */
export type DictTypeFormValues = {
  id?: number
  name: string
  code: string
  /** 键值类型：1 string / 2 number。 */
  type: DictBinaryFlag
  /** 状态：1 启用 / 2 禁用。 */
  status: DictBinaryFlag
  /** 上级分类 id，顶级为 0。 */
  parent_id: number
  sort?: number
  remark?: string
}

/** 字典项表单值（`id` 语义同 `DictTypeFormValues`）。 */
export type DictItemFormValues = {
  id?: number
  type_id: number
  label: string
  value: string
  status: DictBinaryFlag
  is_default: DictBinaryFlag
  sort?: number
  remark?: string
}
