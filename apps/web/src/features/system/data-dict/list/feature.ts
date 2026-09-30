import type { DictType } from '../data-dict-types'
import { defineFeature } from '#/lib/features'
import type { FeatureSpec } from '#/lib/features'

/**
 * 数据字典**分类列表**页的特性声明（`/$appId/system/data-dict`）。
 *
 * ## 这一页暴露什么
 *
 * - **数据源 `dict-types`**：表格里那一屏分类（根分类 67 的直接子分类）及其子层级 ——
 *   用户问「有哪些分类 / 渠道包分类存不存在 / 某个分类下有什么」时，AI 直接读页面数据，
 *   不必再从 632 条接口清单里翻出 `GET /data_dict/type/tree` 再拉一遍全量树；
 * - **`reload`**：写操作后重新取数（保留列表状态），供刷新使用。
 *
 * ## 为什么没有 `commands`
 *
 * 这一页的写入口（新建分类 / 新增子分类 / 删除分类 / 编辑）**都在 `DictTypeTable` 组件内部**，
 * 弹窗状态（`createParentId` / `deleteTarget` / 是否打开）也归它持有 —— 页面拿不到这些句柄，
 * 硬造一条指令只会变成"AI 说删了、其实什么都没发生"。
 *
 * 补齐它的正确做法（见 [features-architecture.md](../../../../../.agents/docs/features-architecture.md) §7）：
 * 把弹窗状态提到页面，或让表格暴露一个命令句柄（`onRequestCreate` / `onRequestDelete(id)` 这类回调），
 * 再在 `commands` 里接上。**在那之前不声明指令**，比声明一条假的诚实。
 */

export interface DictTypeListFeatureOptions {
  /** 根分类（67）的直接子分类 —— 就是表格上那一屏 */
  types: readonly DictType[]
  /** 根分类的名字（面包屑与信息卡上用的那个） */
  rootName?: string
  loading: boolean
  /** 重新取数（保留当前列表状态） */
  reload: () => Promise<unknown> | unknown
}

export function createDictTypeListFeature(
  options: DictTypeListFeatureOptions,
): FeatureSpec {
  return defineFeature({
    title: '数据字典分类列表',
    description:
      '树表浏览根分类的直接子分类；可展开子分类、本地搜索（名称 / 局部码 / 完整编码）、新建与删除分类；点分类名下钻到分类详情。',
    entities: ['数据字典', '分类', '分类编码', '键值类型'],
    endpoints: [
      {
        method: 'GET',
        path: '/data_dict/type/tree',
        purpose: '一次拉全量分类树（本页在本地收窄到根分类的直接子分类）',
      },
      {
        method: 'POST',
        path: '/data_dict/type',
        purpose: '新建分类（工具条「新增分类」挂在根分类下，行内菜单挂在被点的那一级下）',
      },
      {
        method: 'PUT',
        path: '/data_dict/type',
        purpose: '更新分类（在分类详情页提交）',
      },
      {
        method: 'DELETE',
        path: '/data_dict/type/{id}',
        purpose: '删除分类（有子分类 / 有字典项时前端先拦，通过后仍要输入分类名确认）',
      },
    ],
    dataSources: [
      {
        id: 'dict-types',
        title: '分类列表（根分类的直接子分类）',
        description:
          '这一页表格里的分类：根分类的直接子分类，`children` 里是它们的子分类',
        shape:
          '每行：id / name / code / type（键值类型 1=string 2=number）/ status（1 启用 2 禁用）/ sort / remark / children[]',
        state: () => ({
          rootName: options.rootName,
          count: options.types.length,
          loading: options.loading,
          note: '表格里的关键词搜索与展开状态是组件内状态，不进这里 —— 这里给的是**完整**的直接子分类清单',
        }),
        read: () =>
          options.types.map((item) => ({
            id: item.id,
            name: item.name,
            code: item.code,
            type: item.type,
            status: item.status,
            sort: item.sort,
            remark: item.remark,
            children: (item.children ?? []).map((child) => ({
              id: child.id,
              name: child.name,
              code: child.code,
              status: child.status,
            })),
          })),
      },
    ],
    reload: options.reload,
  })
}
