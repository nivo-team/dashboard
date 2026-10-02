# Admin AI Agent Prompt 优化与架构建议

> **落地状态（本仓库）**：本文的 P0–P3⑪ 已落地，仅剩「按真实数据继续压缩」与两项刻意留待后续的优化。
> 代码见 `apps/web/src/lib/ai/{runtime.ts,tools/**}`、`packages/ai-prompt/src/**`、`apps/ai/src/**`；
> 现状说明见 [`.agents/docs/ai-server-layer.md`](../.agents/docs/ai-server-layer.md) §1.4 与
> [`ai-architecture.md`](../.agents/docs/ai-architecture.md)（坑 #19 记录了"模型把工具调用写成文本"的兜底）。
>
> | 本文条目 | 状态 |
> |---|---|
> | P0① `select_tools` 与越界规则冲突 | ✅ 已修：只有 打招呼 / 道谢 / 纯翻译 直接回答，不再把「常识问答」列为可直接回答 |
> | P0② 区分 unsupported / permission_denied | ✅ 已落地：提示词三态表述 + Runtime 回 `dropped: { name, reason }` |
> | P0③ 当前运行模式进 Runtime Context | ✅ 已落地：`runtime-context` 层（模式 / 语言），两个阶段都带 |
> | P1④ 拆分 Router Prompt / Executor Prompt | ✅ 已落地：`scope-core` / `domain` 只发 Router，`executor-role` 只发执行阶段；安全边界 `guard` 两阶段都带 |
> | P1⑤ Tool Registry 统一 Catalog + Schema | ✅ 本来已是单一真值（`AI_TOOLS` + `catalogDescription` / `dependencies`） |
> | P1⑥ Runtime 自动展开工具依赖 | ✅ 已落地（`resolveTools` 的依赖闭包） |
> | P2⑦ `select_tools` 增加 `intent` | ✅ 已落地（11 值 enum；只进日志，不参与业务判断） |
> | P2⑧ Runtime 校验未知工具 | ✅ 已落地（`rejected` → `dropped`，并区分 unsupported / permission_denied） |
> | P2⑨ 页面上下文分层 | ✅ 已落地：每轮只带页面摘要，接口 / 字段 / 表单明细改由 `get_page_context` 按需获取 |
> | P3⑩⑪ 分阶段 token / 工具加载日志 | ✅ 已落地（`AiTurnMetrics` + `console.info('[ai:turn]')`） |
> | P3⑫ 按真实数据继续压缩 Prompt | ⏳ 待办：需要线上 `[ai:turn]` 数据后决定切分点 |
> | 未做 | 参数级 `inputSchema` 的 description / example 精简；按 `intent` 的画像化加载（本文 §7 / §16 的 Context Profile） |
>
> **顺带修的两个「阻塞用户使用」的问题**（不在本文范围，但同一轮发现）：
> ① 模型把工具调用**写成正文**（DeepSeek 的 `<||DSML|| …>`）时整轮静默失败 ——
> Runtime 现在会缓冲 Router 文本并强制 `tool_choice: 'required'` 重试一次；
> ② Worker 的 CORS `allowHeaders` 少放行 `user-agent` / `accept`，Safari 预检直接失败 ——
> 已在 `apps/ai/src/index.ts` 补齐（排查方法见 `apps/ai/README.md` 的「浏览器接入的两个坑」）。

## 1. 目标

当前 Admin AI Agent 已经从“所有工具完整 Schema 每轮全部注入”优化为：

```text
用户请求
   ↓
Router / select_tools
   ↓
选择需要的工具
   ↓
Runtime 加载完整 Tool Schema
   ↓
Executor 执行
```

这已经是正确的方向。

下一步重点不是继续单纯压缩 Prompt，而是进一步拆分 **Router Context** 与 **Executor Context**，让不同阶段只携带完成当前任务所需要的信息。

---

# 2. 当前版本已经解决的问题

原先的请求会把所有完整工具定义都放进上下文，即使用户只发送：

```text
hi
```

模型仍然需要接收：

- 完整 System Prompt
- 当前页面上下文
- 全部 Tool Schema
- 用户消息

当前版本已经变成：

```text
System Prompt
+ 当前页面摘要
+ Tool Catalog
+ select_tools Schema
+ User
```

其中 Tool Catalog 只有：

```text
get_page_context：获取当前页面与接口信息
get_page_data：获取当前页面已加载的数据
...
analyze_data：统计当前页面已加载的数据
```

而完整工具参数定义不再默认注入，只在工具被选中后加载。

这是本次优化最重要的改进。

---

# 3. 必须修正的问题

## 3.1 `select_tools` 中的“常识回答”与业务边界冲突

当前规则中明确规定：

> 通识与百科、新闻时事、历史地理、常识问答

属于越界内容。

但 `select_tools` 的描述又写：

> 本轮不需要任何业务工具时传空数组（例如打招呼、道谢、只需用常识回答的问题）。

这两个规则互相矛盾。

### 建议

删除“只需用常识回答的问题”。

改成：

```text
本轮不需要任何业务工具时传空数组，例如：
- 打招呼
- 道谢
- 纯翻译
```

不要把“常识问答”作为可直接回答的情况。

---

# 4. 区分“能力不存在”和“权限不足”

当前规则：

> 用户要求的事如果没有对应工具，说明当前权限没开。

这个判断过于绝对。

实际应该区分：

```text
能力不存在
≠
能力存在但权限不足
```

例如系统根本没有“导出 Excel”能力时，不能告诉用户：

> 你的权限没开，请前往设置开启。

### 建议

改成：

```text
用户要求的事情如果当前没有对应工具：

- 如果该能力属于系统已有能力，但当前权限或工具配置未开放，说明当前权限未开启；
- 如果系统本身没有这项能力，如实说明当前不支持；
- 不要因为缺少工具而猜测系统存在某项能力。
```

更推荐在 Runtime 层使用明确的状态，而不是依靠模型猜测：

```text
unsupported
permission_denied
confirmation_required
```

这样模型只需要根据状态进行回答。

---

# 5. 当前运行模式必须进入 Runtime Context

Prompt 中多次使用：

```text
询问模式
自动模式
```

例如：

> 跳转在「询问」模式下要先经用户同意。

但当前页面摘要只有：

```text
应用
页面
路径
路由模板
```

没有告诉模型当前到底是什么模式。

### 建议

Runtime Context 至少增加：

```text
# 当前运行态
- 模式：询问
```

必要时还可以加入：

```text
- 语言：zh-CN
```

如果以后存在其它运行态，也可以统一放入：

```ts
type RuntimeContext = {
  mode: "ask" | "auto"
  locale: string
}
```

---

# 6. Router 与 Executor 必须使用不同 Prompt

这是整个架构中最值得继续优化的一点。

不能因为增加了 `select_tools`，第二阶段又把完整的第一阶段 System Prompt 原样发送一次。

否则：

```text
第一次请求
System Prompt
+
Tool Catalog
+
select_tools
```

然后：

```text
第二次请求
同一份 System Prompt
+
完整工具 Schema
```

虽然减少了 Tool Schema，但 System Prompt 仍然被重复携带。

---

# 7. 推荐的 Agent Context Architecture

最终建议采用：

```text
                    ┌──────────────────────┐
                    │      User Request    │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │        Router        │
                    │                      │
                    │  ① 判断业务范围       │
                    │  ② 判断意图           │
                    │  ③ 选择工具           │
                    └──────────┬───────────┘
                               ↓
                     selected tools
                               ↓
                    ┌──────────────────────┐
                    │      Runtime         │
                    │                      │
                    │  展开工具依赖          │
                    │  校验工具             │
                    │  注入 Runtime Context │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │       Executor       │
                    │                      │
                    │  执行工具             │
                    │  处理业务规则          │
                    │  完成用户请求          │
                    └──────────────────────┘
```

---

# 8. Router Prompt 应该只负责什么

Router 只需要理解以下内容：

## 8.1 身份

```text
你是 Admin 管理后台中的 AI Router。
```

## 8.2 业务范围

知道：

- 什么属于本系统
- 什么属于越界
- 哪些情况下需要拒绝
- 哪些情况下需要澄清

## 8.3 意图

至少可以区分：

```text
greeting
translation
navigation
page_query
page_analysis
form
write
api_query
complex
out_of_scope
ambiguous
```

## 8.4 Tool Catalog

只告诉 Router 每个工具的：

```text
名称 + 极短描述
```

例如：

```text
get_page_context：获取当前页面与接口信息
get_page_data：获取当前页面已加载的数据
list_navigation：查找后台页面路径
call_read_api：调用只读业务接口
navigate_to：跳转到后台页面
...
```

不要在 Router 阶段提供完整 JSON Schema。

---

# 9. Executor Prompt 应该负责什么

Executor 才需要加载：

- 完整工具定义
- 参数 Schema
- 工具调用规则
- 页面查询规则
- 导航规则
- 表单规则
- 写操作规则
- 权限规则
- 删除确认规则
- 数据分析规则
- 最终回答规则

例如：

```text
get_page_data
call_read_api
analyze_data
```

只有被选中的工具才进入 Executor Context。

---

# 10. Tool Dependency 不应该交给模型

例如：

```text
analyze_data
```

可能依赖：

```text
get_page_data
```

又例如：

```text
fill_form
```

可能依赖：

```text
list_page_forms
```

不建议让模型自己输出：

```json
{
  "tools": [
    "analyze_data",
    "get_page_data"
  ]
}
```

而应该让模型只选择它真正想使用的能力：

```json
{
  "tools": [
    "analyze_data"
  ]
}
```

Runtime 自动展开依赖：

```ts
const dependencies = {
  analyze_data: ["get_page_data"],
  fill_form: ["list_page_forms"],
}
```

执行：

```text
analyze_data
    ↓
自动加入 get_page_data
```

这样可以降低模型选择错误，并减少 Prompt 中需要描述的工具依赖逻辑。

---

# 11. `select_tools` 建议增加 intent

当前：

```json
{
  "tools": [
    "get_page_data"
  ]
}
```

建议改为：

```json
{
  "intent": "page_query",
  "tools": [
    "get_page_data"
  ]
}
```

例如：

### 页面查询

```json
{
  "intent": "page_query",
  "tools": ["get_page_data"]
}
```

### 页面跳转

```json
{
  "intent": "navigation",
  "tools": ["list_navigation", "navigate_to"]
}
```

### 表单操作

```json
{
  "intent": "form",
  "tools": ["list_page_forms", "open_form", "fill_form", "submit_form"]
}
```

### 综合分析

```json
{
  "intent": "page_analysis",
  "tools": ["get_page_data", "analyze_data"]
}
```

这样 Runtime 可以直接根据 intent 做进一步的确定性处理。

---

# 12. `select_tools` 的 Schema

当前 Schema：

```json
{
  "type": "object",
  "properties": {
    "tools": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": ["tools"],
  "additionalProperties": false
}
```

可以扩展为：

```json
{
  "type": "object",
  "properties": {
    "intent": {
      "type": "string",
      "description": "本轮请求的主要意图"
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "完成请求需要加载的工具名"
    }
  },
  "required": ["intent", "tools"],
  "additionalProperties": false
}
```

如果工具数量进一步增加，可以考虑给 `intent` 使用 `enum`。

---

# 13. `tool_choice` 不建议简单改成强制调用

当前：

```json
"tool_choice": "auto"
```

其实是合理的。

因为：

```text
hi
```

没有必要：

```text
hi
↓
select_tools([])
↓
第二次模型请求
↓
你好，请问有什么可以帮你？
```

这样反而增加一次模型调用。

更合理的是：

```text
纯问候 / 道谢 / 纯翻译
    ↓
直接回答

业务请求
    ↓
必须调用 select_tools
```

因此建议继续使用：

```json
"tool_choice": "auto"
```

同时修改 Prompt：

```text
业务请求涉及事实获取、页面操作或系统能力时，
必须先调用 select_tools。

纯问候、道谢、纯翻译等无需业务工具的请求可以直接回答。
```

这样 API 层和 Prompt 层是一致的。

---

# 14. 未知工具应该由 Runtime 校验

`select_tools` 当前：

```json
{
  "type": "string"
}
```

模型理论上可能返回：

```json
{
  "tools": [
    "get_page_data",
    "foo_bar"
  ]
}
```

不建议完全依赖 Prompt 防止这种情况。

Runtime 应该维护唯一 Tool Registry：

```ts
const toolRegistry = new Map([
  ["get_page_data", ...],
  ["call_read_api", ...],
  ["navigate_to", ...],
])
```

收到 Router 结果后：

```ts
const selectedTools = result.tools
  .filter(name => toolRegistry.has(name))
```

未知工具直接丢弃。

这样：

```text
Prompt = 提供语义约束
Runtime = 提供最终安全边界
```

---

# 15. 推荐的 Tool Registry 结构

可以将每个工具统一定义成：

```ts
type ToolDefinition = {
  name: string

  // Router 阶段使用
  catalogDescription: string

  // Executor 阶段使用
  description: string
  parameters: JSONSchema

  // Runtime 使用
  dependencies?: string[]
  permission?: string
  category?: string
}
```

例如：

```ts
const toolRegistry = {
  analyze_data: {
    name: "analyze_data",

    catalogDescription: "统计当前页面已加载的数据",

    description: "...完整执行规则...",

    parameters: {
      // 完整 Schema
    },

    dependencies: [
      "get_page_data"
    ],

    permission: "data.read",

    category: "analysis",
  }
}
```

这样 Tool Catalog 和完整 Tool Schema 来自同一份 Registry，不需要人工维护两套定义。

---

# 16. 推荐的 Prompt 分层

最终可以拆成四层。

## Layer 1：Router Core

始终使用：

```text
身份
业务范围
越界规则
安全规则
意图分类
Tool Catalog
```

---

## Layer 2：Runtime Context

根据当前请求动态注入：

```text
当前应用
当前页面
当前路径
当前模式
当前语言
当前其它运行态
```

例如：

```text
# 当前运行态

- 应用：Admin
- 应用 ID：nivo
- 页面：表格示例
- 路径：/nivo/example/user
- 路由模板：/$appId/example/user/
- 模式：询问
```

---

## Layer 3：Executor Policy

只有进入执行阶段才加载：

```text
导航规则
查询规则
表单规则
写入规则
删除规则
权限规则
确认规则
数据完整性规则
回答规则
```

---

## Layer 4：Selected Tools

只加载：

```text
Router 选出的工具
+
Runtime 自动展开的依赖
```

例如：

```text
analyze_data
↓
get_page_data
```

而不是加载所有 17 个 Tool。

---

# 17. 推荐的完整执行流程

最终 Agent 流程：

```text
用户输入
   ↓
判断是否简单请求
   │
   ├── greeting
   │      ↓
   │    直接回答
   │
   ├── translation
   │      ↓
   │    直接回答
   │
   └── business request
          ↓
       Router
          ↓
       intent + tools
          ↓
       Runtime
          ↓
       校验工具
          ↓
       展开依赖
          ↓
       加载完整 Tool Schema
          ↓
       Executor
          ↓
       执行工具
          ↓
       最终回答
```

---

# 18. 关键原则

整个架构建议遵循以下原则：

### 原则 1：模型负责语义，Runtime 负责确定性约束

模型适合：

```text
理解用户意图
选择能力
解释结果
```

Runtime 适合：

```text
权限
工具是否存在
工具依赖
工具加载
参数校验
执行边界
```

---

### 原则 2：Router 不需要知道 Executor 的细节

Router 不需要知道：

```text
delete 如何确认
fill_form 如何填写
analyze_data pipeline 如何执行
```

它只需要知道：

```text
这个请求应该使用哪个能力。
```

---

### 原则 3：Executor 不需要重新携带完整 Router 规则

进入 Executor 后，不需要重复：

```text
什么是越界
什么是闲聊
什么是常识问答
```

这些已经在 Router 阶段完成。

Executor 只需要负责执行已经确定的业务请求。

---

### 原则 4：工具依赖由 Runtime 自动展开

不要让模型承担工具依赖图的维护。

---

### 原则 5：页面上下文也应该分层

不要每次都注入完整页面上下文。

推荐：

```text
Light Page Context
    ↓
应用 / 页面 / 路径 / 模式

Full Page Context
    ↓
通过 get_page_context 按需获取
```

这样同样可以降低 Token。

---

# 19. Token 优化后的目标结构

最终希望达到：

```text
Router：

System Core
+ Runtime Summary
+ Tool Catalog
+ select_tools Schema
+ User Message
```

而不是：

```text
System Core
+ Runtime Summary
+ 17 个完整 Tool Schema
+ User Message
```

Executor：

```text
Executor Core
+ Runtime Context
+ Selected Tools
+ User Message
```

例如用户输入：

```text
hi
```

理想情况：

```text
不加载任何业务 Tool
不进入 Executor
直接回答
```

用户输入：

```text
看看这个页面有多少用户
```

理想情况：

```text
Router
↓
{
  "intent": "page_query",
  "tools": ["get_page_data"]
}

Runtime
↓
加载 get_page_data

Executor
↓
执行并回答
```

用户输入：

```text
统计这个页面不同账号类型的数量
```

理想情况：

```text
Router
↓
{
  "intent": "page_analysis",
  "tools": ["analyze_data"]
}

Runtime
↓
自动展开：
analyze_data
+
get_page_data

Executor
↓
执行分析
↓
回答
```

---

# 20. 最终改造优先级

建议按照下面顺序实施：

```text
P0
① 修复 select_tools 与越界规则的冲突
② 区分 unsupported / permission_denied
③ 注入当前运行模式

P1
④ 拆分 Router Prompt / Executor Prompt
⑤ Tool Registry 统一管理 Catalog + Schema
⑥ Runtime 自动展开工具依赖

P2
⑦ select_tools 增加 intent
⑧ Runtime 校验未知工具
⑨ 页面上下文分层

P3
⑩ 统计 Router / Executor 各阶段 Token
⑪ 记录每次实际加载了哪些工具
⑫ 根据真实数据进一步压缩 Prompt
```

---

# 21. 最终推荐架构

可以把整个系统理解成：

```text
                    User
                     │
                     ▼
              ┌─────────────┐
              │    Router   │
              │             │
              │ Scope       │
              │ Intent      │
              │ Tool Select │
              └──────┬──────┘
                     │
             intent + tools
                     │
                     ▼
              ┌─────────────┐
              │   Runtime   │
              │             │
              │ Validate    │
              │ Permission  │
              │ Dependency  │
              │ Context     │
              └──────┬──────┘
                     │
              selected tools
                     │
                     ▼
              ┌─────────────┐
              │  Executor   │
              │             │
              │ Tool Call   │
              │ Business    │
              │ Response    │
              └─────────────┘
```

核心思想不是“把 Prompt 写得更短”，而是：

> **让每一个阶段只携带完成自己职责所需要的上下文。**

Router 负责“理解和选择”。

Runtime 负责“约束和组装”。

Executor 负责“执行和回答”。

这会比继续压缩现在这份大 System Prompt 更有效，也更适合后续继续增加工具和业务模块。
