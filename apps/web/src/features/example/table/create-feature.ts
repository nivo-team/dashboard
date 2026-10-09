import { defineFeature } from '#/features/ai/page'

/**
 * 新建记录页的特性声明（`/$appId/example/table/new`）。
 *
 * 表单本体由 `TableExampleFormView` 承载（它自己通过 `useAiFormFields` / `useAiFormSubmit`
 * 把字段与提交交给 AI 表单桥），这里只声明这一页的业务语义与它用到的接口。
 */
export const tableExampleCreateFeature = defineFeature({
  title: '新建记录',
  description: '独立录入新记录的基础档案资料（昵称、邮箱与头像）。',
  entities: ['记录', '昵称', '邮箱'],
  permissions: ['example:create'],
  forms: [
    {
      id: 'table-example-form-create',
      title: '新建记录',
      action: 'create',
      permission: 'example:create',
      description: '录入新记录的昵称、邮箱与头像',
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
      method: 'POST',
      path: '/example/table',
      permission: 'example:create',
      purpose: '提交创建新记录',
    },
  ],
})
