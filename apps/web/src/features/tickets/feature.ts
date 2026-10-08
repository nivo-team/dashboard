import type { TicketItem } from '#/api'
import { defineFeature } from '#/features/ai/page'
import type { FeatureSpec } from '#/features/ai/page'
import { TICKET_SORTABLE_FIELDS } from './columns'

/**
 * 工单管理页的特性声明（`/$appId/example/tickets`）。
 *
 * ## 这一页的特别之处：**后端没有批量接口**
 *
 * 它刻意只提供单条的增删改查（`PUT /ticket`、`DELETE /ticket/{id}`、
 * `PATCH /ticket/{id}/status`），没有 `/ticket/batch-delete` 这类批量端点。
 * 于是「把这一屏里所有待处理的工单都关闭」这类请求，正确做法是 AI 用
 * `manage_tasks` **一次编排 N 个步骤**、由客户端顺序执行 —— 而不是循环调用单条接口
 * （那样每一条都要一次模型往返，20 条就是 20 次）。
 *
 * 因此这里的指令设计也有意贴合这个场景：
 * - **不声明**「批量删除」这类批量指令（后端没有对应能力，声明了就是让 AI 以为有捷径）；
 * - 单条指令（删除 / 改状态）如实声明，AI 需要批量时自然会把它们编排进任务清单。
 *
 * 页面实现见 `./index.tsx`。
 */

export interface TicketsFeatureOptions {
  /** 当前页已加载的工单（就是表格里那一屏） */
  rows: readonly TicketItem[]
  total: number
  loading: boolean
  /** 当前查询状态（关键词 / 筛选 / 分页 / 排序），原样交给 AI 判断"这一屏是什么" */
  queryState: Record<string, unknown>
  /** 表格里勾选的工单 id */
  selectedIds: readonly number[]
  /** 删除单条工单 —— 页面自己的实现（接口 + toast + 刷新表格） */
  deleteOne: (id: number) => Promise<unknown>
  /** 变更单条工单状态 —— 页面自己的实现 */
  updateStatus: (id: number, status: number) => Promise<unknown>
  /** 打开新建表单（按用户的「表单打开方式」偏好分流：弹窗 / 分屏 / 独立页） */
  openCreateForm: (initialValues?: Partial<TicketItem>) => void
  /** 打开编辑表单 */
  openEditForm: (id: number, initialValues?: Partial<TicketItem>) => void
  /** 重新取数（保留当前筛选 / 分页 / 排序） */
  reload: () => Promise<unknown>
}

export function createTicketsFeature(options: TicketsFeatureOptions): FeatureSpec {
  return defineFeature({
    title: '工单管理',
    description:
      '分页浏览工单，支持关键词搜索、状态/优先级/分类筛选与排序，以及新建、编辑、单条删除、变更状态。**后端只提供单条接口，没有批量端点** —— 批量操作需要按条编排。',
    entities: ['工单', '状态', '优先级', '负责人', '分类'],
    permissions: ['ticket:read', 'ticket:create', 'ticket:edit', 'ticket:update', 'ticket:delete'],
    endpoints: [
      {
        method: 'GET',
        path: '/ticket',
        permission: 'ticket:read',
        purpose: '分页查询工单；支持 kw、status / priority / category 筛选与排序',
      },
      { method: 'POST', path: '/ticket', permission: 'ticket:create', purpose: '新建工单' },
      {
        method: 'PUT',
        path: '/ticket',
        permission: 'ticket:update',
        purpose: '更新单条工单（body 带 id）',
      },
      {
        method: 'DELETE',
        path: '/ticket/{id}',
        permission: 'ticket:delete',
        purpose: '删除单条工单（**没有批量接口**）',
      },
      {
        method: 'PATCH',
        path: '/ticket/{id}/status',
        permission: 'ticket:update',
        purpose: '变更单条工单状态（body { status }）',
      },
    ],
    forms: [
      {
        id: 'ticket-form-create',
        title: '新建工单',
        action: 'create',
        permission: 'ticket:create',
        fillPermission: 'ticket:fill',
        submitPermission: 'ticket:submit',
        description:
          '录入工单的标题、描述、优先级、负责人与分类。用户要求新建或批量生成工单时，基于此字段规范构造数据并通过 POST /ticket 提交入库。',
        fields: [
          {
            name: 'title',
            label: '标题',
            type: 'text',
            required: true,
            description: '必填，工单标题',
          },
          { name: 'description', label: '描述', type: 'text', description: '选填，问题描述' },
          {
            name: 'priority',
            label: '优先级',
            type: 'select',
            description: '选填：1 低 / 2 中 / 3 高 / 4 紧急，默认 2',
            options: [
              { value: '1', label: '低' },
              { value: '2', label: '中' },
              { value: '3', label: '高' },
              { value: '4', label: '紧急' },
            ],
          },
          { name: 'assignee', label: '负责人', type: 'text', description: '选填，默认「未分配」' },
          {
            name: 'category',
            label: '分类',
            type: 'text',
            description: '选填，如「缺陷」「需求」',
          },
        ],
        submission: {
          endpoint: { method: 'POST', path: '/ticket' },
          submitLabel: '创建工单',
          // 不写 requireApproval：提交在 auto 下免问（判定见 features/ai/core/approval-policy.ts）
          approvalReason: '将填写好的工单提交至服务端入库',
        },
      },
      {
        id: 'ticket-form-edit',
        title: '编辑工单',
        action: 'edit',
        permission: 'ticket:edit',
        fillPermission: 'ticket:fill',
        submitPermission: 'ticket:submit',
        description:
          '修改指定工单的标题、描述、优先级、负责人与分类；实际挂载的表单 id 形如 ticket-form-edit-<工单id>，以 list_page_forms 为准',
        fields: [
          {
            name: 'title',
            label: '标题',
            type: 'text',
            required: true,
            description: '必填，工单标题',
          },
          { name: 'description', label: '描述', type: 'text', description: '选填，问题描述' },
          {
            name: 'priority',
            label: '优先级',
            type: 'select',
            options: [
              { value: '1', label: '低' },
              { value: '2', label: '中' },
              { value: '3', label: '高' },
              { value: '4', label: '紧急' },
            ],
          },
          { name: 'assignee', label: '负责人', type: 'text' },
          { name: 'category', label: '分类', type: 'text' },
        ],
        submission: {
          endpoint: { method: 'PUT', path: '/ticket' },
          submitLabel: '保存修改',
          // 不写 requireApproval：提交在 auto 下免问（判定见 features/ai/core/approval-policy.ts）
          approvalReason: '将修改后的工单提交至服务端保存',
        },
      },
    ],
    searchParams: {
      description: '支持关键词模糊搜索、状态 / 优先级 / 分类精确筛选、服务端排序与分页',
      keywordParam: 'kw',
      paginationParams: ['page', 'page_size'],
      sortableFields: TICKET_SORTABLE_FIELDS,
      filterFields: [
        { param: 'id', label: '工单 ID', type: 'number' },
        {
          param: 'status',
          label: '状态',
          type: 'enum',
          options: ['1', '2', '3', '4'],
        },
        { param: 'priority', label: '优先级', type: 'enum', options: ['1', '2', '3', '4'] },
        { param: 'category', label: '分类', type: 'text' },
        { param: 'assignee', label: '负责人', type: 'text' },
      ],
    },

    /**
     * AI 能在这一页做的事 —— **刻意只有单条指令**。
     *
     * 没有「批量删除 / 批量改状态」：后端根本没有这些端点。少声明一条批量指令，
     * AI 就不会以为有捷径 —— 它会改用 `manage_tasks` 把 N 次单条调用编排成一份计划，
     * 这正是这个模块要演示的能力。
     */
    commands: [
      {
        id: 'create-ticket',
        title: '打开新建工单表单',
        description: '用户要求新建 / 添加工单时用它；表单按用户的「表单打开方式」偏好出现',
        kind: 'navigate',
        permission: 'ticket:create',
        actionType: 'create',
        run: () => {
          options.openCreateForm()
          return { opened: 'create' }
        },
      },
      {
        id: 'edit-ticket',
        title: '打开编辑工单表单',
        description: '用户要求修改某条工单时用它；id 从 get_page_data 的列表里取，不要凭印象编',
        kind: 'navigate',
        permission: 'ticket:edit',
        actionType: 'edit',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'number', description: '要编辑的工单 id' } },
          required: ['id'],
          additionalProperties: false,
        },
        run: (input) => {
          const id = Number(input.id)
          if (!Number.isFinite(id)) throw new Error('需要工单 id（数字）')
          options.openEditForm(id)
          return { opened: 'edit', id }
        },
      },
      {
        id: 'delete-ticket',
        title: '删除单条工单',
        description:
          '删除单条工单（不可撤销）。**本页没有批量删除接口** —— 要删多条时不要循环调用本指令，改用 manage_tasks 把 N 次删除编排成一份计划，由客户端顺序执行。id 必须来自 get_page_data。',
        kind: 'write',
        approval: 'always',
        destructive: true,
        permission: 'ticket:delete',
        actionType: 'delete',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'number', description: '要删除的工单 id' } },
          required: ['id'],
          additionalProperties: false,
        },
        run: (input) => {
          const id = Number(input.id)
          if (!Number.isFinite(id)) throw new Error('需要工单 id（数字）')
          return options.deleteOne(id)
        },
      },
      {
        id: 'set-ticket-status',
        title: '变更工单状态',
        description:
          '把某条工单改成指定状态（1 待处理 / 2 处理中 / 3 已完成 / 4 已关闭）。**要批量改状态时**不要循环调用本指令，改用 manage_tasks 编排 N 个步骤，每步的 action.tool 用 run_page_command、input 传 { command: "set-ticket-status", input: { id, status } }。',
        kind: 'write',
        approval: 'always',
        permission: 'ticket:update',
        actionType: 'edit',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: '工单 id' },
            status: {
              type: 'number',
              description: '目标状态：1 待处理 / 2 处理中 / 3 已完成 / 4 已关闭',
            },
          },
          required: ['id', 'status'],
          additionalProperties: false,
        },
        run: (input) => {
          const id = Number(input.id)
          const status = Number(input.status)
          if (!Number.isFinite(id)) throw new Error('需要工单 id（数字）')
          if (![1, 2, 3, 4].includes(status)) throw new Error('状态必须是 1 / 2 / 3 / 4')
          return options.updateStatus(id, status)
        },
      },
    ],

    dataSources: [
      {
        id: 'tickets',
        title: '工单（当前页）',
        description: '工单页此刻显示的这一屏，已应用当前关键词与筛选条件',
        shape:
          '每行：id / title / description / status / priority / assignee / category / created_at / updated_at。state 里是关键词、筛选条件、分页、排序与表格选中项。',
        fields: [
          { name: 'id', label: '工单 id', type: 'number' },
          { name: 'title', label: '标题', type: 'string' },
          { name: 'description', label: '描述', type: 'string', description: '可能较长' },
          {
            name: 'status',
            label: '状态',
            type: 'enum',
            options: [
              { value: 1, label: '待处理' },
              { value: 2, label: '处理中' },
              { value: 3, label: '已完成' },
              { value: 4, label: '已关闭' },
            ],
          },
          {
            name: 'priority',
            label: '优先级',
            type: 'enum',
            options: [
              { value: 1, label: '低' },
              { value: 2, label: '中' },
              { value: 3, label: '高' },
              { value: 4, label: '紧急' },
            ],
          },
          { name: 'assignee', label: '负责人', type: 'string' },
          { name: 'category', label: '分类', type: 'string' },
          { name: 'created_at', label: '创建时间', type: 'datetime', description: '秒级时间戳' },
          { name: 'updated_at', label: '更新时间', type: 'datetime', description: '秒级时间戳' },
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
          loaded: options.rows.length,
          selectedIds: options.selectedIds,
          loading: options.loading,
        }),
        read: () =>
          options.rows.map((ticket) => ({
            id: ticket.id,
            title: ticket.title,
            description: ticket.description,
            status: ticket.status,
            priority: ticket.priority,
            assignee: ticket.assignee,
            category: ticket.category,
            created_at: ticket.created_at,
            updated_at: ticket.updated_at,
          })),
      },
    ],

    reload: options.reload,
    openForm: ({ action, id, initialValues }) => {
      const values = initialValues as Partial<TicketItem> | undefined
      if (action === 'edit' && id !== undefined) {
        options.openEditForm(Number(id), values)
        return
      }
      options.openCreateForm(values)
    },
  })
}
