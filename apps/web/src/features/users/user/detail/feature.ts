import type { UserItem } from '#/api'
import { defineFeature } from '#/lib/features'
import type { FeatureSpec } from '#/lib/features'

/**
 * 用户详情页的特性声明（`/$appId/users/user/$id`）。
 *
 * **它是只读页**：页面上没有会改数据的按钮，所以这里**没有 `commands`** ——
 * 指令应当与页面上真实存在的入口一一对应，凭空造一条"AI 才能用"的指令，
 * 会让"AI 能做但我点不到"变成新的困惑来源。要编辑用户，去列表页（那里有 `edit-user`）。
 *
 * 数据源由 `UserDetailView` 通过 `onData` 回调交上来（页面持有，再喂给工厂）：
 * 于是面板模式的 AI 回答「这个用户什么时候注册的」时**不必再查接口**。
 */

export interface UserDetailFeatureOptions {
  /** 已经加载好的用户（`null` = 还没加载完 / 没查到） */
  user: UserItem | null
  loading: boolean
  /** 接口不可用时的演示兜底数据正在生效 */
  demoMode: boolean
  /** 当前路由上的用户 id（查不到时也告诉模型"在看哪一个"） */
  id: string
}

export function createUserDetailFeature(options: UserDetailFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '用户详情',
    description: '查看单个用户的资料（昵称、邮箱、注册时间等）。',
    entities: ['用户', '昵称', '邮箱', '注册时间', '最后登录'],
    endpoints: [
      {
        method: 'GET',
        path: '/user',
        purpose: '按关键词查一个用户（page_size=1）—— 本页就是这么取详情的',
      },
    ],
    dataSources: [
      {
        id: 'user',
        title: '当前查看的用户',
        description: '这一页正在展示的那个用户的资料',
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
