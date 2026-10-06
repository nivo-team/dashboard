import { defineFeature } from '#/features/ai/page'

/**
 * 编辑记录页的特性声明（`/$appId/example/table/$id/edit`）。
 *
 * 与新建页同构（表单本体同样是 `TableExampleFormView`），差别只在 `action: 'edit'` 与接口。
 */
export const tableExampleEditFeature = defineFeature({
  title: '编辑记录',
  description: '修改指定记录的基础资料档案信息（昵称、邮箱与头像）。',
  entities: ['记录', '昵称', '邮箱'],
  permissions: ['table-example:edit'],
  forms: [
    {
      id: 'table-example-form-edit',
      title: '编辑记录',
      action: 'edit',
      permission: 'table-example:edit',
      // 这里的 id 是**逻辑 id**；运行时挂载的表单 id 带目标记录后缀
      // （`table-example-form-edit-10001`）—— fill_form / submit_form 以 list_page_forms 为准。
      description:
        '修改指定记录的资料信息；实际挂载的表单 id 形如 table-example-form-edit-<记录id>，以 list_page_forms 为准',
      fields: [
        {
          name: 'nickname',
          label: '昵称',
          type: 'text',
          required: true,
          description: '必填，记录昵称',
        },
        {
          name: 'email',
          label: '邮箱地址',
          type: 'text',
          description: '选填，邮箱地址',
        },
        {
          name: 'avatar_url',
          label: '头像 URL',
          type: 'text',
          description: '选填，头像图片链接',
        },
      ],
    },
  ],
  endpoints: [
    {
      method: 'GET',
      path: '/user/{id}',
      purpose: '获取表格示例详情回显',
    },
    {
      method: 'PUT',
      path: '/user',
      permission: 'table-example:edit',
      purpose: '提交更新记录信息',
    },
  ],
})
