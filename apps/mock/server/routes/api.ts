import { defineHandler, defineRouteMeta } from 'nitro'
import { ok } from '../utils/response'

/**
 * 系统接口清单。
 *
 * 路径是 `GET /api` —— 是清单里的普通一员，没有特殊前缀。
 * 用途：功能管理里的「API Keys」字段靠它列出可选接口。
 * 这里返回**本 Mock 自己的**接口清单，而不是原公司后端那 468 个。
 */
const API_ITEMS = [
  { label: '账号登录', method: 'POST', path: '/login' },
  { label: '退出登录', method: 'POST', path: '/logout' },
  { label: '当前用户信息', method: 'GET', path: '/profile' },
  { label: '可选应用列表', method: 'GET', path: '/apps' },
  { label: '系统接口清单', method: 'GET', path: '/api' },
  { label: '用户列表', method: 'GET', path: '/user' },
  { label: '新建用户', method: 'POST', path: '/user' },
  { label: '更新用户', method: 'PUT', path: '/user' },
  // 删除类接口**必须在清单里**：清单就是 AI 的写操作白名单（call_write_api 按它校验
  // method + 路径模板），缺一条 AI 就完全删不了那个模块。页面能力里的 endpoints 与这里
  // 应当保持一致（见 .agents/docs/ai-architecture.md §8.1 的"清单即边界"）。
  { label: '删除用户', method: 'DELETE', path: '/user/{id}' },
  { label: '批量删除用户', method: 'POST', path: '/user/batch-delete' },
  { label: '功能树', method: 'GET', path: '/system/menu/tree' },
  { label: '新建功能', method: 'POST', path: '/system/menu' },
  { label: '更新功能', method: 'PUT', path: '/system/menu' },
  { label: '删除功能', method: 'DELETE', path: '/system/menu/{id}' },
  { label: '字典项列表', method: 'GET', path: '/data_dict' },
  { label: '新建字典项', method: 'POST', path: '/data_dict' },
  { label: '更新字典项', method: 'PUT', path: '/data_dict' },
  { label: '删除字典项', method: 'DELETE', path: '/data_dict/{id}' },
  { label: '字典选项', method: 'GET', path: '/data_dict/options' },
  { label: '字典分类树', method: 'GET', path: '/data_dict/type/tree' },
  { label: '新建字典分类', method: 'POST', path: '/data_dict/type' },
  { label: '更新字典分类', method: 'PUT', path: '/data_dict/type' },
  { label: '删除字典分类', method: 'DELETE', path: '/data_dict/type/{id}' },
]

defineRouteMeta({
  openAPI: {
    tags: ['系统'],
    description: '获取系统接口清单（供功能管理关联接口权限使用）',
    responses: {
      200: {
        description: '接口清单',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiListResult' },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          ApiItem: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '接口名称' },
              method: { type: 'string', description: 'HTTP 方法' },
              path: { type: 'string', description: '接口路径' },
              value: { type: 'string', description: '接口唯一标识（用作权限 key）' },
            },
            required: ['label', 'method', 'path', 'value'],
          },
          ApiListResult: {
            type: 'object',
            properties: {
              code: { type: 'integer', description: '0 表示成功' },
              message: { type: 'string' },
              result: { type: 'array', items: { $ref: '#/components/schemas/ApiItem' } },
            },
            required: ['code', 'result'],
          },
        },
      },
    },
  },
})

export default defineHandler(() =>
  ok(API_ITEMS.map((item) => ({ ...item, value: `${item.method}:${item.path}` }))),
)
