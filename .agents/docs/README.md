# 给 AI 的文档：现状与规范

这个目录下的文档**是写给 coding agent 的**：它们描述**当前状态** —— 架构、模块现状、开发规范、
接入清单、踩过的坑。**会随代码过时，改相关代码时顺手改它**。

分工（三个地方别混）：

| 位置 | 内容 | 会过期吗 | 谁读 |
|---|---|---|---|
| [`AGENTS.md`](../../AGENTS.md) | **契约级硬约束** + 模块索引表 | 少变 | 自动加载进上下文 |
| **这里** `.agents/docs/` | **现状与规范**：模块现状、架构、接入清单、坑 | **会**，改码时同步 | coding agent |
| [`docs/`](../../docs/README.md) | **调研与设计记录**：选型对比、为什么这么选 | 相对稳定 | 人（也供 agent 追溯依据） |

> `AGENTS.md` 刻意保持精简（它每次会话都会被加载），所以各模块的细节都在这里。

## 通用架构

| 文档 | 什么时候读 |
|---|---|
| [ai-architecture.md](./ai-architecture.md) | **改任何 AI 代码 / 提示词之前**：分层、一轮消息的数据流、**系统提示词七层与范围闸**、权限与模式、上下文预算、扩展点、踩过的坑 |
| [routing-architecture.md](./routing-architecture.md) | 加页面、改布局：路由分层拓扑、模块目录化、外壳持久化、面包屑注册 |
| [ui-and-styling.md](./ui-and-styling.md) | 改样式 / 用 Kumo 组件：令牌与主题、悬浮预览接法、RTL 处理 |
| [store.md](./store.md) | 加 store、改作用域：三类状态的存储键、per-app 分区、迁移与踩坑 |
| [auth-and-i18n.md](./auth-and-i18n.md) | 改登录 / 加文案：双阶段认证、拦截器注入、登出的三个坑、i18n 加载 |
| [api-client.md](./api-client.md) | 改接口调用 / 生成产物：生成链路、响应拦截、Query 缓存分区 |
| [table-query-and-crud.md](./table-query-and-crud.md) | 表格 URL 参数与 CRUD：nuqs 状态管理、编译期严格 Query 类型函数、Mock 增删改查闭环 |
| [form-architecture.md](./form-architecture.md) | 表单架构与人机协同：单表单组件、URL 驱动状态、弹窗/分屏/独立路由三态自适应、AI 表单桥闭环 |

## 业务模块

| 文档 | 什么时候读 |
|---|---|
| [features-module.md](./features-module.md) | 改功能菜单树（`menu_type` 分流、临时 id 清单） |
| [data-dict-module.md](./data-dict-module.md) | 改字典分类（树表、双数据源、待确认项结论） |
| [dict-i18n.md](./dict-i18n.md) | 给枚举值补多语言（`messages/dict/*` 的目录与回落链） |
| [dict-options.md](./dict-options.md) | 用字典驱动下拉 / 筛选（值域来源、`new.` 适配层） |
| [lang-module.md](./lang-module.md) | 改后端语言包页（单组模式、语言码两套） |
| [detail-preview.md](./detail-preview.md) | 列表点行看详情（三种打开方式、Provider 布局、接入清单） |
| [dashboard-module.md](./dashboard-module.md) | 加仪表盘卡片（栅格几何、注册表、编辑模式契约） |

## 设计与蓝图

| 文档 | 什么时候读 |
|---|---|
| [ai-integration.md](./ai-integration.md) | AI 接入的设计蓝图：数据模型、工具协议、权限矩阵、后续扩展 |
