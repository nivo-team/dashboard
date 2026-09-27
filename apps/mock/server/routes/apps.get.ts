import { defineHandler, defineRouteMeta } from 'nitro'
import { db } from '../utils/db'
import { ok } from '../utils/response'

/**
 * 可选应用列表。
 *
 * 这是**登录之后、进入某个应用之前**调用的中立接口：此时还不知道该用哪个
 * 应用的 `apiBaseUrl`，所以它必须由固定的 Mock 地址提供。
 *
 * 返回的每个应用都带上自己的 `apiBaseUrl`（全部指向本 Mock 服务），
 * 前端选定后把它交给 API 客户端即可 —— 切换应用不会切到任何外部后端。
 *
 * 注意：`icon` / `iconWeight` 属于前端呈现资源（Phosphor 组件无法走 JSON），
 * 因此不在这里返回，由前端按 `id` 映射图标。
 */
defineRouteMeta({
  openAPI: {
    tags: ['应用'],
    description: '获取可选应用列表（含各自的接口根地址）',
    responses: {
      200: {
        description: '应用列表',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AppListResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          AppItem: {
            type: 'object',
            description: '一个可选应用',
            properties: {
              id: { type: 'string', description: '应用标识，同时是路由前缀' },
              name: { type: 'string', description: '应用名称' },
              headline: { type: 'string', description: '副标题' },
              description: { type: 'string', description: '说明文案' },
              domain: { type: 'string', description: '展示用域名' },
              apiBaseUrl: { type: 'string', description: '该应用的接口根地址' },
              badge: { type: 'string', description: '角标文案' },
              category: { type: 'string', description: '所属分类' },
              themeGradient: { type: 'string', description: '卡片渐变色（Tailwind 类名）' },
            },
            required: ['id', 'name', 'apiBaseUrl'],
          },
          AppListResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { type: 'array', items: { $ref: '#/components/schemas/AppItem' } },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler(() => ok(db.apps))
