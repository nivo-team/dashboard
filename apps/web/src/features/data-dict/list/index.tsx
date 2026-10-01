import { Trans, useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { DictTypeTable } from '../dict-type-table'
import { useFeature } from '#/lib/features'
import { createDictTypeListFeature } from './feature'
import { useDictListBreadcrumbTrail } from '../data-dict-breadcrumb'
import { DICT_ROOT_TYPE_ID } from '../data-dict-options'
import { useDictTypeTree } from '../use-dict-type-tree'

/**
 * 数据字典分类列表（/$appId/system/data-dict）。
 *
 * `GET /data_dict/type/tree` 是无参全量接口（一次返回所有分类，含历史数据），
 * 因此本模块在本地把范围收窄到**根分类 `DICT_ROOT_TYPE_ID`（架构升级期由后端指定）**：
 * 这一页只渲染根分类的**直接子分类**，点击分类名下钻到
 * `/$appId/system/data-dict/$typeId` 查看它的子分类与字典项。
 *
 * 根分类自身不出现在列表里，也不提供编辑 / 删除入口 —— 它是模块的边界，不是可维护的业务对象。
 * 层级返回交给顶栏面包屑（见 `data-dict-breadcrumb.ts`）。
 */
export function DataDictTypeListPage() {
  const { t } = useTranslation('dataDict')
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID

  const { nodes, root, isPending, isFetching, isError, error, refetch } = useDictTypeTree()

  // 把分类层级注册给顶栏面包屑（下钻后 `/$typeId` 才能显示成「公共定义 / 渠道包」）
  useDictListBreadcrumbTrail(nodes, appId, root)

  /*
    这一页对 AI 暴露的能力（原先什么都没接）：分类数据源 + 重新取数。
    声明见 ./feature.ts；**没有 commands** —— 新建 / 删除分类的弹窗状态在 DictTypeTable 内部，
    页面拿不到句柄，硬造指令会变成"AI 说删了、其实没发生"（补齐方式写在 feature.ts 的注释里）。
  */
  useFeature(
    createDictTypeListFeature({
      types: root?.children ?? [],
      ...(root?.name ? { rootName: root.name } : {}),
      loading: isPending || isFetching,
      reload: refetch,
    }),
  )

  const errorMsg = isError
    ? ((error as { message?: string } | null)?.message ??
      t('messages.fetchFailed', '获取分类树失败'))
    : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title', '数据字典')}
        description={t('description', '维护分类层级与字典项键值，供业务下拉与枚举使用')}
      />

      <DictTypeTable
        nodes={nodes}
        // 模块可见的最顶层就是根分类（67）的直接子项
        rootParentId={DICT_ROOT_TYPE_ID}
        rootParentName={root?.name}
        loading={isPending || isFetching}
        error={errorMsg}
        onRetry={() => {
          void refetch()
        }}
        // 函数形态：数字由组件按「过滤结果树的节点总数」计算（搜索 / 展开后与行数一致）
        quotaText={(total) => (
          <Trans
            i18nKey="quota"
            ns="dataDict"
            defaults="共 <b>{{total}}</b> 项"
            values={{ total }}
            components={{
              b: <b className="font-semibold text-kumo-default tabular-nums" />,
            }}
          />
        )}
      />
    </div>
  )
}
