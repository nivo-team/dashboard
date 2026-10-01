import type { UserItem } from '#/api'
import { USER_FILTER_FIELDS } from '#/api'
import { defineFeature } from '#/lib/features'
import type { FeatureSpec } from '#/lib/features'

/**
 * 用户列表页的特性声明（`/$appId/users/user`）—— **这一页对 AI 暴露的全部能力都在这一个文件里**。
 *
 * 它取代了迁移前散在页面里的四处登记：`usePageCapabilities`（能力）、`useAiFormOpener`
 * （AI 唤起表单）、`useAiPageReload`（写后刷新），以及"什么都没有"的指令与数据源。
 *
 * 为什么是**工厂函数**而不是一个常量对象：指令的 `run` 与数据源的 `read` 必须闭包
 * **页面此刻的 state 与处理函数**（当前这一屏用户、当前筛选、页面的删除实现）。
 * 页面每轮渲染调一次 `createUserListFeature({...})`，`useFeature` 会把最新的一份登记进去 ——
 * 于是 AI 读到的永远是用户正看着的那一屏，而不是首帧快照。
 *
 * 页面实现见 `./index.tsx`，架构约定见 `.agents/docs/features-architecture.md`。
 */

/** 可排序列：列 id 与后端 field 参数一致，页面与 AI 声明**共用这一份**（别写两遍）。 */
export const USER_SORTABLE_FIELDS = ['nickname', 'id', 'createtime', 'logintime'] as const

export interface UserListFeatureOptions {
  /** 当前页已加载的用户（就是表格里那一屏） */
  users: readonly UserItem[]
  total: number
  loading: boolean
  /** 接口不可用时的演示兜底数据正在生效 */
  demoMode: boolean
  /** 当前查询状态（关键词 / 筛选 / 分页 / 排序），原样交给 AI 判断"这一屏是什么" */
  queryState: Record<string, unknown>
  /** 表格里勾选的用户 id */
  selectedIds: readonly number[]
  /** 删除单个用户 —— 页面自己的实现（接口 + toast + 刷新表格） */
  deleteOne: (id: number) => Promise<unknown>
  /** 批量删除 —— 同上 */
  deleteMany: (ids: number[]) => Promise<unknown>
  /** 打开新建表单（按用户的「表单打开方式」偏好分流：弹窗 / 分屏 / 独立页） */
  openCreateForm: (initialValues?: Partial<UserItem>) => void
  /** 打开编辑表单 */
  openEditForm: (id: number, initialValues?: Partial<UserItem>) => void
  /** 打开某个用户的详情（页面内的分屏 / 抽屉 / 跳转，随用户的「详情打开方式」偏好） */
  openDetail: (id: number) => void
  /** 重新取数（保留当前筛选 / 分页 / 排序） */
  reload: () => Promise<unknown>
}

export function createUserListFeature(options: UserListFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '用户列表',
    description:
      '分页浏览用户，支持关键词搜索、多字段精确/范围筛选、排序，以及新建、编辑、单个/批量删除；点击行可打开详情。',
    entities: ['用户', '昵称', '邮箱', '注册时间', '最后登录'],
    /*
      权限点按 `{模块}:{动作}` 细分（动作取 read / create / fill / submit / update / delete）：
      「查看」与「AI 填表 / 提交」「直连接口更新」是四件不同的事，各管各的 ——
      声明处按 §1.8 的口径给，判定仍只在 `hasPageCapabilityPermission` 一处。
    */
    permissions: [
      'user:read',
      'user:create',
      'user:edit',
      'user:fill',
      'user:submit',
      'user:update',
      'user:delete',
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/user',
        permission: 'user:read',
        purpose: '分页查询用户列表；支持 kw、多字段 filter 与排序',
      },
      { method: 'POST', path: '/user', permission: 'user:create', purpose: '新建用户' },
      { method: 'PUT', path: '/user', permission: 'user:update', purpose: '编辑更新用户' },
      {
        method: 'DELETE',
        path: '/user/{id}',
        permission: 'user:delete',
        purpose: '单项删除用户',
      },
      {
        method: 'POST',
        path: '/user/batch-delete',
        permission: 'user:delete',
        purpose: '批量删除用户',
      },
    ],
    forms: [
      {
        id: 'user-form-create',
        title: '新建用户',
        action: 'create',
        permission: 'user:create',
        // AI 填表只改页面状态、不落库 → `fill`；提交才落库、不可撤销 → `submit`（§1.8）。
        fillPermission: 'user:fill',
        submitPermission: 'user:submit',
        description: '录入新用户的昵称、邮箱与头像',
        submission: {
          endpoint: { method: 'POST', path: '/user' },
          submitLabel: '创建用户',
          requireApproval: true,
          approvalReason: '将填好的新用户档案提交至服务端入库',
        },
      },
      {
        id: 'user-form-edit',
        title: '编辑用户',
        action: 'edit',
        permission: 'user:edit',
        fillPermission: 'user:fill',
        submitPermission: 'user:submit',
        // 运行时挂载的表单 id 带目标用户后缀（`user-form-edit-10001`）：这里是**逻辑 id**，
        // 真要 fill_form / submit_form 时以 list_page_forms 返回的为准（工具在 id 不匹配时
        // 也会明确提示"请先 list_page_forms"）。
        description:
          '修改指定用户的资料信息；实际挂载的表单 id 形如 user-form-edit-<用户id>，以 list_page_forms 为准',
        submission: {
          endpoint: { method: 'PUT', path: '/user' },
          submitLabel: '保存修改',
          requireApproval: true,
          approvalReason: '将修改后的用户资料提交至服务端保存',
        },
      },
    ],
    searchParams: {
      description: '支持关键词模糊搜索、多字段精确/范围筛选、服务端排序与分页',
      keywordParam: 'kw',
      paginationParams: ['page', 'page_size'],
      sortableFields: USER_SORTABLE_FIELDS,
      filterFields: USER_FILTER_FIELDS,
    },

    /**
     * AI 能在这一页做的事。
     *
     * `navigate` 类（打开表单）直接执行：它只是把表单摆到用户面前，不替用户做任何决定；
     * `write` 类（删除）**一律先过确认卡**，且标为不可撤销 —— 真正的"删除"由页面自己的
     * 处理函数完成（接口 + toast + 刷新表格），不是让模型再发一次请求。
     */
    commands: [
      {
        id: 'create-user',
        title: '打开新建用户表单',
        description: '用户要求新建 / 添加用户时用它；表单按用户的「表单打开方式」偏好出现（弹窗 / 分屏 / 独立页）',
        kind: 'navigate',
        permission: 'user:create',
        actionType: 'create',
        run: () => {
          options.openCreateForm()
          return { opened: 'create' }
        },
      },
      {
        id: 'edit-user',
        title: '打开编辑用户表单',
        description: '用户要求修改某个用户时用它；id 从 get_page_data 的列表里取，不要凭印象编',
        kind: 'navigate',
        permission: 'user:edit',
        actionType: 'edit',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'number', description: '要编辑的用户 id' } },
          required: ['id'],
          additionalProperties: false,
        },
        run: (input) => {
          const id = Number(input.id)
          if (!Number.isFinite(id)) throw new Error('需要用户 id（数字）')
          options.openEditForm(id)
          return { opened: 'edit', id }
        },
      },
      {
        id: 'open-user-detail',
        title: '查看某个用户的详情',
        description:
          '在不离开列表的前提下打开某个用户的详情（分屏 / 抽屉 / 跳转，随用户的偏好）。用户问「某某的详细资料」时优先用它，而不是 navigate_to 跳走。',
        kind: 'navigate',
        permission: 'user:read',
        actionType: 'custom',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'number', description: '要查看的用户 id' } },
          required: ['id'],
          additionalProperties: false,
        },
        run: (input) => {
          const id = Number(input.id)
          if (!Number.isFinite(id)) throw new Error('需要用户 id（数字）')
          options.openDetail(id)
          return { opened: 'detail', id }
        },
      },
      {
        id: 'delete-user',
        title: '删除用户',
        description:
          '删除单个用户（不可撤销）。id 必须来自 get_page_data 的列表，不要凭印象编；批量删除用 batch-delete-users。',
        kind: 'write',
        approval: 'always',
        destructive: true,
        permission: 'user:delete',
        actionType: 'delete',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'number', description: '要删除的用户 id' } },
          required: ['id'],
          additionalProperties: false,
        },
        run: (input) => {
          const id = Number(input.id)
          if (!Number.isFinite(id)) throw new Error('需要用户 id（数字）')
          return options.deleteOne(id)
        },
      },
      {
        id: 'batch-delete-users',
        title: '批量删除用户',
        description:
          '一次删除多个用户（不可撤销）。ids 来自 get_page_data 的列表或表格选中项；不要循环调用单条删除。',
        kind: 'write',
        approval: 'always',
        destructive: true,
        permission: 'user:delete',
        actionType: 'batch-delete',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: { type: 'number' },
              description: '要删除的用户 id 列表',
            },
          },
          required: ['ids'],
          additionalProperties: false,
        },
        run: (input) => {
          const ids = Array.isArray(input.ids)
            ? input.ids.map(Number).filter((id) => Number.isFinite(id))
            : []
          if (ids.length === 0) throw new Error('需要至少一个用户 id')
          return options.deleteMany(ids)
        },
      },
    ],

    /**
     * 交给 AI 直接读的页面数据 —— **面板模式不必再调接口**。
     *
     * `state` 与数据同等重要：没有它，模型分不清"这一屏"是第 3 页还是搜索结果。
     * `read` 只做投影（只给表格真正展示的列），避免把整包原始对象塞进上下文。
     */
    dataSources: [
      {
        id: 'users',
        title: '用户列表（当前页）',
        description: '用户列表页此刻显示的这一屏用户，已应用当前关键词与筛选条件',
        shape:
          '每行：id / nickname / email / createtime / logintime。state 里是关键词、筛选条件、分页、排序与表格选中项。',
        /*
          字段注解（`read()` 返回的键**逐字对应**）：AI 写表达式、判断类型、以及决定
          哪些字段该脱敏都靠它。`email` 标 `sensitive` —— 模型知道"有这个字段"，
          但永远只看到 `a***@example.com` 这类掩码。
        */
        fields: [
          { name: 'id', label: '用户 id', type: 'number' },
          { name: 'nickname', label: '昵称', type: 'string' },
          {
            name: 'email',
            label: '邮箱',
            type: 'string',
            description: '可能为空',
            sensitive: true,
          },
          {
            name: 'createtime',
            label: '注册时间',
            type: 'datetime',
            description: '秒级时间戳',
          },
          {
            name: 'logintime',
            label: '最后登录时间',
            type: 'datetime',
            description: '秒级时间戳',
          },
        ],
        state: () => ({
          page: options.queryState.page,
          pageSize: options.queryState.page_size,
          keyword: options.queryState.kw,
          sorting:
            options.queryState.field && options.queryState.order
              ? { field: options.queryState.field, order: options.queryState.order }
              : undefined,
          filters: options.queryState.filters,
          total: options.total,
          loaded: options.users.length,
          selectedIds: options.selectedIds,
          loading: options.loading,
          demoMode: options.demoMode,
        }),
        read: () =>
          options.users.map((user) => ({
            id: user.id,
            nickname: user.nickname,
            email: user.email,
            createtime: user.createtime,
            logintime: user.logintime,
          })),
      },
    ],

    reload: options.reload,
    openForm: ({ action, id, initialValues }) => {
      const values = initialValues as Partial<UserItem> | undefined
      if (action === 'edit' && id !== undefined) {
        options.openEditForm(Number(id), values)
        return
      }
      options.openCreateForm(values)
    },
  })
}
