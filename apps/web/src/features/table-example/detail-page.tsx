import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { UserItem } from '#/api'
import { useFeature } from '#/features/ai/page'
import { TableExampleDetailView } from './detail-view'
import { createTableExampleDetailFeature } from './detail-feature'

/**
 * 表格示例详情页（`/$appId/example/table/$id`）。
 *
 * 三件事：
 * 1. 渲染详情（`TableExampleDetailView`，与列表页的分屏预览**共用同一份实现**）；
 * 2. 把详情**已经加载好的那个记录**接进 AI 数据源（`onData` → 本页 state → 工厂）——
 *    面板模式的 AI 因此不用再查接口；
 * 3. 用 `useFeature` 声明这一页（描述 / 接口 / 数据源）—— 取代原先散在页面里的
 *    `useAiPageContext(Route.id, …)`，页面里不再出现路由字面量。
 *
 * 路由参数由薄路由文件传入，见 `.agents/docs/features-architecture.md`。
 */
export function TableExampleDetailPage({ appId, id }: { appId: string; id: string }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(false)

  useFeature(
    createTableExampleDetailFeature({
      user,
      loading,
      demoMode,
      id,
    }),
  )

  return (
    <TableExampleDetailView
      id={id}
      onBack={() => navigate({ to: '/$appId/example/table', params: { appId } })}
      onData={(nextUser, meta) => {
        setUser(nextUser)
        setLoading(meta.loading)
        setDemoMode(meta.demoMode)
      }}
    />
  )
}
