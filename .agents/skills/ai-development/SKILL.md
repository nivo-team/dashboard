---
name: ai-development
description: 本仓库 AI 助手（Ask AI）的入口 —— 改提示词 / 工具 / 权限粒度 / 上下文预算 / 中间层（apps/ai Worker + packages/ai-prompt）/ AI 页面声明框架时加载它。涉及 src/features/ai、apps/ai、packages/ai-prompt 的任何改动都先读这里。
---

# AI 开发（ai-development）

**仓库里 AI 相关改动的单一入口。** AI 的代码、提示词、工具、权限、中间层全部收在这一个 skill 下，
**先看模块地图再动手**：

> `apps/web/src/features/ai/README.md` —— AI 核心（core / components / markdown / sphere / page）的文件地图。

那 242 KB 的细节在 `references/` 里，**不要一次全读**，按下面这张表取。

## 0. 先读哪份

| 你要做什么 | 读 |
| --- | --- |
| **改任何 AI 代码 / 提示词之前**（分层、一轮消息的数据流、系统提示词七层与范围闸、上下文预算、扩展点） | [references/ai-architecture.md](./references/ai-architecture.md) |
| 想知道「AI 现在到底有什么 / 在哪个文件」 | [references/ai-module-inventory.md](./references/ai-module-inventory.md) —— 清单式总览：提示词七层、16 个工具全表、审批矩阵、14 个设置项、**AI 文件全地图**、文档与代码不一致清单 |
| **改 AI 中间层 / 把规则搬到服务端**（`apps/ai` 与 `packages/ai-prompt` 的边界、接口契约、漂移门控、SSE、网关接入、鉴权与脱敏落点） | [references/ai-server-layer.md](./references/ai-server-layer.md) |
| 实现工具层的权限 / 脱敏 / 存在性查询 / 表达式分析 | [references/ai-tools-implementation-spec.md](./references/ai-tools-implementation-spec.md) —— 字段注解、脱敏规则、权限点命名等冻结契约 |
| AI 接入的设计蓝图（数据模型、工具协议、权限矩阵、后续扩展） | [references/ai-integration.md](./references/ai-integration.md) |
| 加 / 改页面级的 AI 声明（`feature.ts`、`defineFeature`、指令与数据源） | 不在本 skill —— 去 [business-development](../business-development/SKILL.md)，那是页面侧的事 |

## 1. 改 AI 之前必须先分清的两件事

1. **代码在哪一层**。前端 `src/features/ai/**`（跑在用户浏览器里、用用户身份）、
   中间层 `apps/ai`（Cloudflare Worker，提示词与模型调用）、提示词真值 `packages/ai-prompt`。
   **改错层是最常见的返工来源**，边界见 `references/ai-server-layer.md`。
2. **权限是谁的边界**。客户端那份 AI 权限**不是安全边界**（真边界在后端 RBAC）——
   它的作用是**收窄模型看得见的工具范围**。这个前提决定了「工具定义该多细」，
   详见 `references/ai-architecture.md` §3 与 `references/ai-integration.md` §4。

## 2. 三条硬约束

1. **给模型的内容都必须经过函数并留过滤点**（提示词、导航清单、表单清单、页面接口），
   过滤条件集中在一处 —— 否则「将来按权限收窄」的落点就被焊死了。
2. **提示词真值只有一处**（`packages/ai-prompt`），中间层与前端不能各留一份 ——
   有漂移门控在守这条线，见 `references/ai-server-layer.md` §4。
3. **工具名单只有一个真值**（`AI_TOOLS`），不要在渲染处或提示词里再抄一份。

## 3. 与其它 skill 的关系

| 主题 | 归谁 |
| --- | --- |
| 页面怎么把能力暴露给 AI（`feature.ts`、指令、数据源、表单桥） | **business-development** |
| AI 权限点怎么与页面 / 按钮权限共用一套命名 | **business-development** `references/permissions-architecture.md` |
| 流水线怎么自动改 AI 代码（触发、门控） | **platform-ops** |
| 提示词里引用的路由 / store / 样式底座 | **platform-development** |

## 4. 维护本 skill

- 提示词分层改了就同步 `ai-architecture.md` 的七层表与 `ai-module-inventory.md` 的清单 ——
  **这两份最容易过期**，它们自己都记着「文档与代码不一致清单」。
- 新增工具后要同时更新：`AI_TOOLS`（代码真值）、`ai-module-inventory.md`（清单）、
  `ai-architecture.md` §3.1（能力矩阵）。
- `AGENTS.md` 只保留指向本 skill 的一行。
