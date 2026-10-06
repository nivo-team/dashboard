import type { UserItem } from '#/api'
import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'

/**
 * 表格示例详情页的特性声明（`/$appId/example/table/$id`）。
 *
 * **它是只读页**：页面上没有会改数据的按钮，所以这里**没有 `commands`** ——
 * 指令应当与页面上真实存在的入口一一对应，凭空造一条"AI 才能用"的指令，
 * 会让"AI 能做但我点不到"变成新的困惑来源。要编辑记录，去列表页（那里有 `edit-record`）。
 *
 * 数据源由 `TableExampleDetailView` 通过 `onData` 回调交上来（页面持有，再喂给工厂）：
 * 于是面板模式的 AI 回答「这个记录什么时候注册的」时**不必再查接口**。
 */

export interface TableExampleDetailFeatureOptions {
  /** 已经加载好的记录（`null` = 还没加载完 / 没查到） */
  user: UserItem | null
  loading: boolean
  /** 接口不可用时的演示兜底数据正在生效 */
  demoMode: boolean
  /** 当前路由上的记录 id（查不到时也告诉模型"在看哪一个"） */
  id: string
}

export function createTableExampleDetailFeature(options: TableExampleDetailFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '表格示例详情',
    description: '查看单个记录的资料（昵称、邮箱、注册时间等）。',
    entities: ['记录', '昵称', '邮箱', '注册时间', '最后登录'],
    endpoints: [
      {
        method: 'GET',
        path: '/user',
        purpose: '按关键词查一个记录（page_size=1）—— 本页就是这么取详情的',
      },
    ],
    dataSources: [
      {
        id: 'record',
        title: '当前查看的记录',
        description: '这一页正在展示的那个记录的资料',
        shape: 'id / nickname / email / avatar_url / createtime / logintime',
        state: () => ({
          id: options.id,
          loading: options.loading,
          demoMode: options.demoMode,
          loaded: options.user !== null,
        }),
        read: () =>
          options.user
            ? {
                id: options.user.id,
                nickname: options.user.nickname,
                email: options.user.email,
                avatar_url: options.user.avatar_url,
                createtime: options.user.createtime,
                logintime: options.user.logintime,
              }
            : null,
      },
    ],
  })
}
