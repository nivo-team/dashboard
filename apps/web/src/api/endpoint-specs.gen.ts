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
    "summary": "获取系统接口清单（供功能管理关联接口权限使用）"
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
    "summary": "账号密码登录（任意非空账号密码均可通过）",
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
  "GET /permissions": {
    "summary": "获取当前用户的权限点清单（细到按钮级），供前端在把 AI 工具交给模型前过滤",
    "params": [
      {
        "name": "role",
        "in": "query",
        "required": false,
        "description": "Mock 专用：模拟不同角色（super / editor / viewer），不传等价于 super"
      }
    ]
  },
  "GET /profile": {
    "summary": "获取当前登录用户信息"
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
