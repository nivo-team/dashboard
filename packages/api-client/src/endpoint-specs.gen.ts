/**
 * 接口参数索引 —— 由 `scripts/gen-endpoint-specs.js` 从 `openapi.json` 生成，**不要手改**。
 *
 * 后端 `GET /api` 的清单只有 label / method / path，没有参数；这里补上权威的
 * 「参数名 / 位置（path | query | body）/ 是否必填」，让 AI 不必猜。
 *
 * 键是 `"METHOD /path"`；只含 get / post / put / patch / delete。
 */
export interface EndpointParam {
  name: string
  in: 'path' | 'query' | 'body' | 'header' | 'cookie'
  required: boolean
  description?: string
}

export interface EndpointSpec {
  summary?: string
  params?: EndpointParam[]
}

export const ENDPOINT_SPECS: Record<string, EndpointSpec> = {
  "GET /api": {
    "summary": "获取系统接口清单（供菜单管理关联接口权限使用）"
  },
  "GET /apps": {
    "summary": "获取可选应用列表（含各自的接口根地址）"
  },
  "DELETE /data_dict/{id}": {
    "summary": "删除字典项",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "字典项 ID"
      }
    ]
  },
  "GET /data_dict": {
    "summary": "字典项分页列表",
    "params": [
      {
        "name": "type_id",
        "in": "query",
        "required": false,
        "description": "所属分类 ID（含其子分类）"
      },
      {
        "name": "kw",
        "in": "query",
        "required": false,
        "description": "关键词（显示名 / 键值）"
      },
      {
        "name": "status",
        "in": "query",
        "required": false,
        "description": "状态：1 启用 / 2 禁用"
      },
      {
        "name": "page",
        "in": "query",
        "required": false
      },
      {
        "name": "page_size",
        "in": "query",
        "required": false
      }
    ]
  },
  "POST /data_dict": {
    "summary": "新建字典项",
    "params": [
      {
        "name": "type_id",
        "in": "body",
        "required": true
      },
      {
        "name": "label",
        "in": "body",
        "required": true
      },
      {
        "name": "value",
        "in": "body",
        "required": true
      }
    ]
  },
  "PUT /data_dict": {
    "summary": "更新字典项",
    "params": [
      {
        "name": "id",
        "in": "body",
        "required": true
      }
    ]
  },
  "GET /data_dict/options": {
    "summary": "获取全量字典选项（按分类编码分组）"
  },
  "DELETE /data_dict/type/{id}": {
    "summary": "删除字典分类（存在子分类或字典项时会被拒绝）",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "分类 ID"
      }
    ]
  },
  "POST /data_dict/type": {
    "summary": "新建字典分类",
    "params": [
      {
        "name": "name",
        "in": "body",
        "required": true
      },
      {
        "name": "code",
        "in": "body",
        "required": true
      }
    ]
  },
  "PUT /data_dict/type": {
    "summary": "更新字典分类",
    "params": [
      {
        "name": "id",
        "in": "body",
        "required": true
      }
    ]
  },
  "GET /data_dict/type/tree": {
    "summary": "获取字典分类树（顶层节点数组）"
  },
  "POST /login": {
    "summary": "账号密码登录（验证预设测试账号：super admin / admin / user）",
    "params": [
      {
        "name": "username",
        "in": "body",
        "required": true
      },
      {
        "name": "password",
        "in": "body",
        "required": true
      }
    ]
  },
  "POST /logout": {
    "summary": "退出登录"
  },
  "GET /menus/navigation": {
    "summary": "当前登录用户可见的导航菜单树（按角色菜单授权过滤，只含目录与菜单）"
  },
  "GET /permissions": {
    "summary": "获取当前用户的权限点清单（细到按钮级），供前端在把 AI 工具交给模型前过滤",
    "params": [
      {
        "name": "role",
        "in": "query",
        "required": false,
        "description": "Mock 专用：模拟不同角色（super / editor / viewer），不传优先根据登录 Token 判断"
      }
    ]
  },
  "GET /profile": {
    "summary": "获取当前登录用户信息"
  },
  "GET /role": {
    "summary": "角色分页列表，支持关键词与状态筛选",
    "params": [
      {
        "name": "page",
        "in": "query",
        "required": false,
        "description": "页码，从 1 开始"
      },
      {
        "name": "page_size",
        "in": "query",
        "required": false,
        "description": "每页条数"
      },
      {
        "name": "kw",
        "in": "query",
        "required": false,
        "description": "关键词（名称 / 角色码 / 描述模糊匹配）"
      },
      {
        "name": "status",
        "in": "query",
        "required": false,
        "description": "状态：1 启用 / 2 禁用"
      }
    ]
  },
  "POST /role": {
    "summary": "新建角色",
    "params": [
      {
        "name": "name",
        "in": "body",
        "required": true
      },
      {
        "name": "code",
        "in": "body",
        "required": true
      }
    ]
  },
  "PUT /role": {
    "summary": "更新角色（按 id 定位，只更新传入的字段）",
    "params": [
      {
        "name": "id",
        "in": "body",
        "required": true
      }
    ]
  },
  "DELETE /role/{id}": {
    "summary": "根据 ID 删除角色，同时清理该角色的菜单授权",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "角色 ID"
      }
    ]
  },
  "GET /role/{id}": {
    "summary": "根据 ID 查询角色详情",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "角色 ID"
      }
    ]
  },
  "GET /role/menus": {
    "summary": "查询角色已授权的菜单 ID 列表",
    "params": [
      {
        "name": "role_id",
        "in": "query",
        "required": true,
        "description": "角色 ID"
      }
    ]
  },
  "PUT /role/menus": {
    "summary": "替换角色的菜单授权（全量覆盖）",
    "params": [
      {
        "name": "role_id",
        "in": "body",
        "required": true
      },
      {
        "name": "menu_ids",
        "in": "body",
        "required": true
      }
    ]
  },
  "DELETE /system/menu/{id}": {
    "summary": "删除功能（其下级一并删除）",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "功能 ID"
      }
    ]
  },
  "POST /system/menu": {
    "summary": "新建功能 / 功能组 / 权限点"
  },
  "PUT /system/menu": {
    "summary": "更新功能 / 功能组 / 权限点"
  },
  "GET /system/menu/tree": {
    "summary": "获取功能菜单树（顶层节点数组，后代嵌在 children 中）",
    "params": [
      {
        "name": "menu_id",
        "in": "query",
        "required": false,
        "description": "以某个节点为根的子树；不传或传入未知 id 时返回整棵树"
      }
    ]
  },
  "DELETE /ticket/{id}": {
    "summary": "根据 ID 删除单个工单（不提供批量删除接口）",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "工单 ID"
      }
    ]
  },
  "GET /ticket/{id}": {
    "summary": "根据工单 ID 查询详情",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "工单 ID"
      }
    ]
  },
  "PATCH /ticket/{id}/status": {
    "summary": "变更单条工单的状态",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "工单 ID"
      },
      {
        "name": "status",
        "in": "body",
        "required": true
      }
    ]
  },
  "GET /ticket": {
    "summary": "工单分页列表，支持关键词、状态/优先级/分类筛选与服务端排序",
    "params": [
      {
        "name": "page",
        "in": "query",
        "required": false,
        "description": "页码，从 1 开始"
      },
      {
        "name": "page_size",
        "in": "query",
        "required": false,
        "description": "每页条数"
      },
      {
        "name": "kw",
        "in": "query",
        "required": false,
        "description": "关键词（标题 / 描述 / 负责人 / ID 模糊匹配）"
      },
      {
        "name": "status",
        "in": "query",
        "required": false,
        "description": "状态精确匹配：1 待处理 / 2 处理中 / 3 已完成 / 4 已关闭"
      },
      {
        "name": "priority",
        "in": "query",
        "required": false,
        "description": "优先级精确匹配：1 低 / 2 中 / 3 高 / 4 紧急"
      },
      {
        "name": "category",
        "in": "query",
        "required": false,
        "description": "分类精确匹配"
      },
      {
        "name": "assignee",
        "in": "query",
        "required": false,
        "description": "负责人模糊匹配"
      },
      {
        "name": "id",
        "in": "query",
        "required": false,
        "description": "工单 ID 精确匹配"
      },
      {
        "name": "created_at_min",
        "in": "query",
        "required": false,
        "description": "创建时间下限（秒级时间戳）"
      },
      {
        "name": "created_at_max",
        "in": "query",
        "required": false,
        "description": "创建时间上限（秒级时间戳）"
      },
      {
        "name": "field",
        "in": "query",
        "required": false,
        "description": "排序字段名"
      },
      {
        "name": "order",
        "in": "query",
        "required": false,
        "description": "排序方向"
      }
    ]
  },
  "POST /ticket": {
    "summary": "新建工单",
    "params": [
      {
        "name": "title",
        "in": "body",
        "required": true
      }
    ]
  },
  "PUT /ticket": {
    "summary": "更新单条工单（标题 / 描述 / 优先级 / 负责人 / 分类）",
    "params": [
      {
        "name": "id",
        "in": "body",
        "required": true
      }
    ]
  },
  "GET /user": {
    "summary": "用户分页列表，支持关键词、多字段精确/范围筛选与服务端排序",
    "params": [
      {
        "name": "page",
        "in": "query",
        "required": false,
        "description": "页码，从 1 开始"
      },
      {
        "name": "page_size",
        "in": "query",
        "required": false,
        "description": "每页条数"
      },
      {
        "name": "kw",
        "in": "query",
        "required": false,
        "description": "关键词（昵称 / 邮箱 / ID 模糊匹配）"
      },
      {
        "name": "field",
        "in": "query",
        "required": false,
        "description": "排序字段名"
      },
      {
        "name": "order",
        "in": "query",
        "required": false,
        "description": "排序方向"
      },
      {
        "name": "id",
        "in": "query",
        "required": false,
        "description": "用户 ID 精确匹配"
      },
      {
        "name": "nickname",
        "in": "query",
        "required": false,
        "description": "昵称模糊匹配"
      },
      {
        "name": "email",
        "in": "query",
        "required": false,
        "description": "邮箱模糊匹配"
      },
      {
        "name": "createtime_min",
        "in": "query",
        "required": false,
        "description": "注册时间下限（秒级时间戳）"
      },
      {
        "name": "createtime_max",
        "in": "query",
        "required": false,
        "description": "注册时间上限（秒级时间戳）"
      },
      {
        "name": "logintime_min",
        "in": "query",
        "required": false,
        "description": "最后登录时间下限（秒级时间戳）"
      },
      {
        "name": "logintime_max",
        "in": "query",
        "required": false,
        "description": "最后登录时间上限（秒级时间戳）"
      }
    ]
  },
  "POST /user": {
    "summary": "新建用户",
    "params": [
      {
        "name": "nickname",
        "in": "body",
        "required": true
      }
    ]
  },
  "PUT /user": {
    "summary": "更新用户信息",
    "params": [
      {
        "name": "id",
        "in": "body",
        "required": true
      }
    ]
  },
  "DELETE /user/{id}": {
    "summary": "根据 ID 删除单个用户",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "用户 ID"
      }
    ]
  },
  "GET /user/{id}": {
    "summary": "根据用户 ID 查询详情",
    "params": [
      {
        "name": "id",
        "in": "path",
        "required": true,
        "description": "用户 ID"
      }
    ]
  },
  "POST /user/batch-delete": {
    "summary": "批量删除用户",
    "params": [
      {
        "name": "ids",
        "in": "body",
        "required": true
      }
    ]
  }
}
