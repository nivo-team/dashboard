# AI 模块（`src/features/ai`）

> **整个 AI 核心的单一目录**。改 AI 相关代码前先看这张地图，再读
> [`.agents/docs/ai-architecture.md`](../../../../../.agents/docs/ai-architecture.md)（分层 / 数据流 / 踩过的坑）
> 与 [`.agents/docs/ai-module-inventory.md`](../../../../../.agents/docs/ai-module-inventory.md)（清单：提示词层 / 工具全表 / 设置项）。

## 为什么聚成一个目录

搬迁前 AI 的东西散在四个地方 —— `lib/ai/**`（40 个文件）、`components/ai-*.tsx`（11 个）、
`lib/features/**`（页面声明框架）、`features/sphere/**`（全屏页），再加上
`components/markdown-*` 与 `lib/pretext`（只有 AI 回复在用）。想知道「AI 一共有什么」
得先记住这六处，新人（以及 agent）必然会漏。

现在**一个目录回答全部问题**，并且有一条强约束：**其内部实现不再被外部深层 import**
（除 `page/` 这个刻意的公开面），所以这个目录可以整体理解、整体演进。

## 目录地图

```
features/ai/
├─ index.ts          总出口（只再导出 core；见文件头的两条硬约定）
│
├─ core/             核心逻辑 —— 会话、运行时、工具、上下文、权限、审批
│  ├─ index.ts       核心 barrel（外部要「用 AI 能力」通常从这里进）
│  ├─ tools/         21 个工具的注册表与实现（AI_TOOLS 是唯一真值）
│  ├─ runtime.ts     唯一 import 'ai'（Vercel AI SDK）之处，两阶段 Router → Execution
│  ├─ chat.ts        「发一条消息」的驱动逻辑
│  ├─ session-*.ts   会话状态 / IndexedDB / 分组 / 授权 / 启动判定
│  ├─ approval-policy.ts  ★ 审批策略表（哪种动作在哪种模式下要问）
│  ├─ capabilities.ts     ★ 能力矩阵（四行 × 动作 = 可独立授权的格子）
│  ├─ page-catalog.ts     页面目录（每页 desc + 接口清单，供模糊检索）
│  ├─ *-bridge.ts    页面与 AI 之间的桥（表单 / 重载 / 搜索参数）
│  └─ prompt-facts.ts 事实采集（随请求上报给服务端拼提示词）
│
├─ components/       AI 的 11 个 UI 组件（面板 / 输入区 / 会话列表 / 权限配置 …）
│
├─ markdown/         助手回复的渲染：Markdown + 流式排版引擎（pretext）
│
├─ sphere/           全屏对话页（`/$appId/sphere`）
│
└─ page/             ★ **页面声明框架**：一页一份 `feature.ts` 向 AI 声明能力
                      这是唯一被业务页大量引用的子目录（见下）
```

## 两条边界（改之前先看）

### 1. 业务页只从 `#/features/ai/page` 导入

页面里的 `feature.ts` 与组件用：

```ts
import { defineFeature, useFeature } from '#/features/ai/page'
```

**不要**从 `#/features/ai`（根 barrel）导入 —— 那会把面板、会话 store 一起拖进页面 chunk。
`page/` 是**刻意保留的公开面**：它是「页面 → AI」的单向声明接口，被 28 个业务文件引用。

### 2. `core/runtime` 不从任何 barrel 导出

它 import 了 AI SDK 与 provider 包（几百 KB）。静态导出会让任何
`import '#/features/ai'` 的文件把它们拖进主 bundle —— `core/chat.ts` 用动态
`import('./runtime')` 在真正发送消息时才加载。这条约定从搬迁前的
`lib/ai/index.ts` 原样继承，**别在 barrel 里"顺手补全"**。

## 加东西该改哪里

| 要做什么 | 改哪 |
|---|---|
| 加 / 改一个 AI 工具 | `core/tools/<x>-tools.ts` + 在 `core/tools/index.ts` 的 `AI_TOOLS` 占位；挑一个能力格子（`capability`）与审批性质（走 `approval-policy`） |
| 加一种权限粒度 | `core/capabilities.ts` 的矩阵（**破坏性**：会改所有既有用户的勾选集） |
| 改「哪种动作要不要确认」 | `core/approval-policy.ts` 的表 —— **不要**在工具里写 `ctx.mode === 'ask'` |
| 改提示词 | `packages/ai-prompt/`（服务端；“规则在服务端、事实由客户端上报”）；前端只动 `core/prompt-facts.ts` |
| 加一页的 AI 能力 | 该页的 `feature.ts`（用 `#/features/ai/page`）+ 登记进 `core/page-catalog.ts` |
| 改面板 / 输入区 / 会话列表 UI | `components/` |
| 改全屏对话页 | `sphere/` + `routes/$appId_.sphere/**`（薄路由） |
| 改 Markdown / 流式渲染 | `markdown/` |

## 相关文档

- [ai-architecture.md](../../../../../.agents/docs/ai-architecture.md) —— 分层、数据流、扩展点、**踩过的坑**（改任何 AI 代码前必读）
- [ai-module-inventory.md](../../../../../.agents/docs/ai-module-inventory.md) —— 提示词 14 层、21 个工具全表、审批矩阵、设置项全表、文件地图
- [ai-server-layer.md](../../../../../.agents/docs/ai-server-layer.md) —— 服务端中间层（`apps/ai`）与提示词拼接
- [features-architecture.md](../../../../../.agents/docs/features-architecture.md) —— 页面特性（`feature.ts`）的写法
- [permissions-architecture.md](../../../../../.agents/docs/permissions-architecture.md) —— 权限体系（AI 权限是它的一层）
