import { defineFeature } from '#/lib/features'

/**
 * 新建用户页的特性声明（`/$appId/users/user/new`）。
 *
 * 表单本体由 `UserFormView` 承载（它自己通过 `useAiFormFields` / `useAiFormSubmit`
 * 把字段与提交交给 AI 表单桥），这里只声明这一页的业务语义与它用到的接口。
 */
export const userCreateFeature = defineFeature({
  title: '新建用户',
  description: '独立录入新用户的基础档案资料（昵称、邮箱与头像）。',
  entities: ['用户', '昵称', '邮箱'],
  permissions: ['user:create'],
  forms: [
    {
      id: 'user-form-create',
      title: '新建用户',
      action: 'create',
      permission: 'user:create',
      description: '录入新用户的昵称、邮箱与头像',
      fields: [
        {
          name: 'nickname',
          label: '用户昵称',
          type: 'text',
          required: true,
          description: '必填，用户昵称',
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
      path: '/user',
      permission: 'user:create',
      purpose: '提交创建新用户',
    },
  ],
})
