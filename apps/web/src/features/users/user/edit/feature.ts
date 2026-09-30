import { defineFeature } from '#/lib/features'

/**
 * 编辑用户页的特性声明（`/$appId/users/user/$id/edit`）。
 *
 * 与新建页同构（表单本体同样是 `UserFormView`），差别只在 `action: 'edit'` 与接口。
 */
export const userEditFeature = defineFeature({
  title: '编辑用户',
  description: '修改指定用户的基础资料档案信息（昵称、邮箱与头像）。',
  entities: ['用户', '昵称', '邮箱'],
  permissions: ['user:edit'],
  forms: [
    {
      id: 'user-form-edit',
      title: '编辑用户',
      action: 'edit',
      permission: 'user:edit',
      // 这里的 id 是**逻辑 id**；运行时挂载的表单 id 带目标用户后缀
      // （`user-form-edit-10001`）—— fill_form / submit_form 以 list_page_forms 为准。
      description:
        '修改指定用户的资料信息；实际挂载的表单 id 形如 user-form-edit-<用户id>，以 list_page_forms 为准',
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
      method: 'GET',
      path: '/user/{id}',
      purpose: '获取用户详情回显',
    },
    {
      method: 'PUT',
      path: '/user',
      permission: 'user:edit',
      purpose: '提交更新用户信息',
    },
  ],
})
