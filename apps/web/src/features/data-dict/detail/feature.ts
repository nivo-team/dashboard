import type { DictType } from '../data-dict-types'
import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * 数据字典**分类详情**页的特性声明（`/$appId/system/data-dict/$typeId`）。
 *
 * ## 这一页暴露什么
 *
 * - **数据源 `dict-type`**：这一页正在维护的那个分类（名称 / 编码 / 键值类型 / 状态 / 排序 / 备注 /
 *   上级分类），外加**是否处于"未保存改动"状态** —— 用户问「这个分类是什么」「我刚改的存了吗」都答得出来；
 * - **数据源 `sub-types`**：它的子分类（本地树上的 `children`）；
 * - **表单桥**：分类基本信息是**内嵌可编辑表单**，字段读写由 `DictTypeForm` 注册、提交由本页注册
 *   （`useAiFormSubmit`）→ AI 可以 `fill_form` 填字段、`submit_form` 走审批卡保存。
 *
 * ## 两点刻意的取舍
 *
 * 1. **字典项列表不进数据源**：这一页的字典项由子组件 `DictItemTable` 自己取数（服务端分页 + 筛选），
 *    页面拿不到它那一屏 —— 与其给一份"看着像其实不是这一屏"的数据，不如先不给
 *    （要读字典项时 AI 走 `search_api` + `call_read_api`，参数 `type_id` 从本数据源里拿）。
 * 2. **没有 `commands`**：页面上与写相关的入口只有底部浮条的「保存 / 重置」，
 *    它们是**表单的一部分**，已经由表单桥（`fill_form` / `submit_form`）覆盖 ——
 *    再声明一条 `save-type` 指令只会变成同一件事的第二条通路。
 */

export interface DictTypeDetailFeatureOptions {
  /** 当前分类（还没加载出来时为 `null`） */
  type: DictType | null
  /** 上级分类名（面包屑上的父级；根分类的直接子分类没有父名） */
  parentName?: string
  /** 它的子分类（本地树上的 `children`） */
  subTypes: readonly DictType[]
  /** 有草稿且与初始值不同（底部「未保存更改」浮条的依据） */
  isDirty: boolean
  loading: boolean
  /** 重新取数（保留当前页面状态） */
  reload: () => unknown
}

export function createDictTypeDetailFeature(options: DictTypeDetailFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '数据字典分类详情',
    description:
      '一个分类页同时承载它自身的基本信息（内嵌可编辑表单 + 未保存更改浮条）、它的子分类与它自己的字典项（三段式）。',
    entities: ['数据字典', '分类', '分类编码', '键值类型', '字典项'],
    endpoints: [
      {
        method: 'GET',
        path: '/data_dict/type/tree',
        purpose: '分类树（本页从中定位当前分类、父级与子分类）',
      },
      {
        method: 'PUT',
        path: '/data_dict/type',
        purpose: '保存分类的基本信息（底部「未保存更改」浮条提交）',
      },
      {
        method: 'GET',
        path: '/data_dict',
        purpose: '按 type_id 分页查询本分类下的字典项（由子组件发起）',
      },
      {
        method: 'POST',
        path: '/data_dict',
        purpose: '新建字典项（由子组件发起）',
      },
      {
        method: 'PUT',
        path: '/data_dict',
        purpose: '更新字典项（由子组件发起）',
      },
      {
        method: 'DELETE',
        path: '/data_dict/{id}',
        purpose: '删除字典项（由子组件发起）',
      },
    ],
    dataSources: [
      {
        id: 'dict-type',
        title: '当前分类',
        description: '这一页正在维护的那个分类；`hasUnsavedChanges` 表示表单里有还没保存的改动',
        shape:
          'id / name / code / type（键值类型 1=string 2=number）/ status（1 启用 2 禁用）/ sort / remark / parentName / hasUnsavedChanges',
        state: () => ({
          loading: options.loading,
          hasUnsavedChanges: options.isDirty,
        }),
        read: () =>
          options.type
            ? {
                id: options.type.id,
                name: options.type.name,
                code: options.type.code,
                type: options.type.type,
                status: options.type.status,
                sort: options.type.sort,
                remark: options.type.remark,
                parentName: options.parentName ?? null,
                hasUnsavedChanges: options.isDirty,
              }
            : null,
      },
      {
        id: 'sub-types',
        title: '当前分类的子分类',
        description: '本地分类树上这一层的子分类（页面上「子分类」那段表格）',
        shape: '每行：id / name / code / status',
        read: () =>
          options.subTypes.map((item) => ({
            id: item.id,
            name: item.name,
            code: item.code,
            status: item.status,
          })),
      },
    ],
    reload: options.reload,
  })
}
