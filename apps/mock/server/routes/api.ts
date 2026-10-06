import { defineHandler, defineRouteMeta } from 'nitro'
import { ok } from '../utils/response'

/**
 * 系统接口清单。
 *
 * 路径是 `GET /api` —— 是清单里的普通一员，没有特殊前缀。
 * 用途：菜单管理里的「API Keys」字段靠它列出可选接口。
 * 这里返回**本 Mock 自己的**接口清单，而不是原公司后端那 468 个。
 *
 * ⚠️ **本清单同时是 AI 写操作的白名单**（`call_write_api` 按它校验 method + 路径模板）。
 * 新增/删除接口时**必须同步这里**，否则页面上能操作的接口，AI 一调就被判「不在清单里」。
 */
const API_ITEMS = [
  { label: '账号登录', method: 'POST', path: '/login' },
  { label: '退出登录', method: 'POST', path: '/logout' },
  { label: '当前用户信息', method: 'GET', path: '/profile' },
  { label: '当前用户权限点', method: 'GET', path: '/permissions' },
  { label: '可选应用列表', method: 'GET', path: '/apps' },
  { label: '系统接口清单', method: 'GET', path: '/api' },
  { label: '表格示例列表', method: 'GET', path: '/user' },
  { label: '新建表格示例记录', method: 'POST', path: '/user' },
  { label: '更新表格示例记录', method: 'PUT', path: '/user' },
  // 删除类接口**必须在清单里**：清单就是 AI 的写操作白名单（call_write_api 按它校验
  // method + 路径模板），缺一条 AI 就完全删不了那个模块。页面能力里的 endpoints 与这里
  // 应当保持一致（见 .agents/docs/ai-architecture.md §8.1 的"清单即边界"）。
  { label: '删除表格示例记录', method: 'DELETE', path: '/user/{id}' },
  { label: '批量删除表格示例记录', method: 'POST', path: '/user/batch-delete' },
  // 工单：**刻意没有批量端点** —— 批量操作靠 AI 用 manage_tasks 编排 N 次单条调用。
  // 这几个接口在清单里，AI 才动得了它们（清单即写操作白名单）。
  { label: '工单列表', method: 'GET', path: '/ticket' },
  { label: '工单详情', method: 'GET', path: '/ticket/{id}' },
  { label: '新建工单', method: 'POST', path: '/ticket' },
  { label: '更新工单', method: 'PUT', path: '/ticket' },
  { label: '删除工单', method: 'DELETE', path: '/ticket/{id}' },
  { label: '变更工单状态', method: 'PATCH', path: '/ticket/{id}/status' },
  // 导航：按当前用户角色裁剪后的菜单树（只含目录与菜单，不含操作）
  { label: '导航菜单树', method: 'GET', path: '/menus/navigation' },
  { label: '菜单树', method: 'GET', path: '/system/menu/tree' },
  { label: '新建菜单', method: 'POST', path: '/system/menu' },
  { label: '更新菜单', method: 'PUT', path: '/system/menu' },
  { label: '删除菜单', method: 'DELETE', path: '/system/menu/{id}' },
  // 角色管理：菜单授权是独立的关联资源（`role_menus`），所以单独一对接口
  { label: '角色列表', method: 'GET', path: '/role' },
  { label: '角色详情', method: 'GET', path: '/role/{id}' },
  { label: '新建角色', method: 'POST', path: '/role' },
  { label: '更新角色', method: 'PUT', path: '/role' },
  { label: '删除角色', method: 'DELETE', path: '/role/{id}' },
  { label: '角色菜单授权', method: 'GET', path: '/role/menus' },
  { label: '更新角色菜单授权', method: 'PUT', path: '/role/menus' },
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
    description: '获取系统接口清单（供菜单管理关联接口权限使用）',
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
