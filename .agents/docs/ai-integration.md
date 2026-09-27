# AI 助手（Ask AI）接入设计

> 本文是「Ask AI 接入真实模型」这件事的**单一真值**：数据模型、工具协议、权限矩阵与后续扩展。
> 相关代码：`#/lib/store/ai-store`、`#/lib/ai/*`、`#/components/ai-panel`、`#/components/ai-composer`、`/settings/AI`。
> 面板骨架与两种显示方式见 AGENTS.md §9；本文只讲「接上模型之后」的部分。

## 0. 状态与范围

**MVP（已落地）**

- 设置 → AI：**厂商配置**（OpenAI / Anthropic / OpenAI 兼容）+ **模型配置** + 默认模型；
- **浏览器直连**厂商 API（Key 存在本机），流式对话 + 工具调用循环；
- **上下文注入**：当前 URL / 路由模板 / appId / 面包屑 / 页面标题；
- **只读工具**：读页面上下文、列导航、检索接口清单、调用 GET 接口、读字典选项；
- `ask`（只读）/ `auto`（多出「页面操作」）两模式的**权限分级**；
- **写操作 + 人工审批**：`call_write_api`（`access: 'commit'`）在执行前弹审批卡，
  用户点「允许一次 / 本会话不再询问 / 拒绝」才决定是否发请求；审批链路异常一律 fail-closed；
- **助手回复渲染 Markdown**（`#/components/markdown-content` → 懒加载的 `markdown-renderer`）：
  标题 / 列表 / 表格 / 代码块 / 链接。三条约定：把 AI 输出当**不可信内容**（`react-markdown`
  默认不渲染 raw HTML、链接一律 `target="_blank"` + `noopener`、图片 `referrerPolicy="no-referrer"`）；
  **流式期间退回纯文本**（省掉每个 token 解析一遍，也避免未闭合语法让渲染来回跳）；
  **必须懒加载**（这个渲染器 gzip 46 kB，静态引入会进主 bundle —— 实测主 bundle 只多了 0.09 kB）。

- **AI 进行中的页面级反馈**：视口四周向内发光的呼吸光晕（`#/components/ai-activity-glow`）。
  它就是一层 `fixed inset-0` + `inset box-shadow`，与设置页那张预览（`AiActivityGlowPreview`）
  **共用同一套 keyframes（`ai-glow-pulse`，只动 opacity）与同一组颜色**，只是**模糊半径按满视口
  放大了一档** —— 预览是 320px 缩略图，半径照抄到 1440px 上会细到看不见。
  **不要改成包住 `AppShell`**：包裹等于给 `Sidebar.Provider` 再套一层容器（sidebar 的 sticky、
  AI 面板的 fixed、详情分屏的 grid 都可能受影响），而且外壳高度随内容增长，光晕会跟着内容滚出视口。
  容器是 `pointer-events-none` —— 它盖在所有内容之上，绝不能吞点击。
  用户可在 **设置 → AI** 里关掉它（`aiActivityGlow`，落在 `admin.preferences:<appId>`、默认开）。
  历史上用过 `border-beam`，三档都试过不合适（`md` 像多一条边框、`pulse-outside` 的光晕长在
  元素外面而这个元素就是满视口、`pulse-inner` 与预览观感差得远），依赖已移除。

- **工具调用卡片默认隐藏**（`aiShowToolCalls`，默认 `false`，设置 → AI 可打开）：普通用户只关心
  回答内容，不关心中间调了哪个接口。关掉时 `AssistantPart` 对工具类 part 直接 `return null`。
  **两件事刻意不受它影响**：**审批卡**（写操作的确认是必须的交互，在 `AiConversation` 里独立渲染，
  不是可以隐藏的"输出"）与**「正在思考…」**（工具执行期间 `status` 仍是 `streaming`，
  所以看不到工具卡片也不会显得卡死）。

- **助手头像**（`bot-avatars`，设置 → AI 选形状、默认 `clover`）：助手消息左侧一枚
  （正在生成的那条 `state="working"`、其余 `default`）与「正在思考…」那一行。三条约定：
  **`theme` 由我们传**（包的 `auto` 读 `data-theme`/class，本项目是 `data-mode`，会读错）、
  默认 `interactive={false}`、设置页的网格里**只有选中的头像在动**（18 个 canvas 同时跑
  动画是白烧 CPU）。形状值列表在 `#/lib/store` 自己维护，拼写由使用处的类型检查保证。
  体积 51.6 kB（gzip 22 kB），被 AppShell 与设置页共享。

- **输出方式**（`aiOutputMode`，默认 `wait`）：`wait` 下正在生成的那条消息整条不渲染
  （数据照常累积、结束时一次性出现），`stream` 才边生成边显示。同时修掉了「正在思考…」
  与流式正文并排显示的 bug —— 它的条件从 `status === 'streaming'` 改成「这一轮还没有
  **可见**输出」。

- **滚动**（`aiAutoScroll`，默认开）：回答时自动贴底；手动往上翻会**临时暂停**（滚回底部恢复）
  —— 设置项管「默认跟不跟」，暂停是运行时状态、管「此刻让不让」。没贴底时滚动区下缘**居中**
  浮出「回到底部」按钮（贴底时不出现）；按钮层 `pointer-events-none`，否则会拦住消息里的链接。

- **新对话的空态**：放大的头像（96px，与会话里同一个形状）+ 按时段变的问候
  （`greetings.*` + `greetingPrompt`）。时段按**用户选的时区**判断（不是本机时区，
  与后台其它「现在几点」保持一致），`Intl` 用 `hourCycle: 'h23'` 避开午夜返回 `"24"`。

- **表单桥** `useAiFormBridge`：业务表单注册字段与提交函数，AI 才能「填表」（本期按约定不做）；
- 工具结果的可视化卡片（表格 / 图表）、thinking 态的细分动效
  （规格见 [ai-stack-research.md](./ai-stack-research.md) §3.3，来源是 Beautiful UI 的 `ThinkingState`）。

> **唯一还没被证实的前提：厂商直连的浏览器 CORS**。调研时本机无法实测 —— `api.openai.com` 不可达、
> `api.anthropic.com` 的 403 出自风控层（早于 CORS 处理）。使用者已在真实环境里跑通了整条链路，
> 但没有回传 CORS 这一项是否通过；若不通过，兜底是自建一层薄代理（只补 CORS 头、不落 Key），
> 请求层已做成可替换的 adapter，改一处即可。

## 1. 分层架构

```
┌─ L5 UI ────────── ai-panel（消息流 / 工具调用卡 / 审批卡）
│                   ai-composer（输入区 + 显示方式 + 模式切换）
├─ L4 工具层 ────── #/lib/ai/tools/*：注册表 + JSON Schema + access + execute
│                   ctx = { navigate, queryClient, client, getPageContext, requestApproval }
├─ L3 上下文层 ──── #/lib/ai/page-context：当前 URL / 路由 / appId / 面包屑 / 页面标题
├─ L2 运行时层 ──── #/lib/ai/runtime：agent loop（流式 + 工具调用）+ provider adapter
└─ L1 配置层 ────── admin.ai store：providers[] / models[] / activeModelId
```

每层只依赖它下面的层：工具不认识 OpenAI，运行时不认识 Kumo，UI 不认识 JSON Schema。

## 2. 数据模型

### 2.1 厂商与模型（L1，存本机）

```ts
type AiProviderKind = 'openai' | 'anthropic' | 'compatible'

interface AiProviderConfig {
  id: string          // 本机生成的 uuid
  kind: AiProviderKind
  name: string        // 显示名（默认取 kind 的中文名，可改）
  baseUrl: string     // 留空 → 用该 kind 的官方默认地址
  apiKey: string      // 明文存 admin.ai（见 §5 安全）
}

interface AiModelConfig {
  id: string
  providerId: string  // → AiProviderConfig.id
  modelId: string     // 传给厂商 API 的模型名，如 gpt-5-mini / claude-sonnet-4-5
  displayName: string
  supportsTools: boolean   // 关掉后该模型收不到工具，纯对话
}
```

**存储键 `admin.ai`，全局一份、不按应用隔离**：Key 是使用者级别的资产，在 console 配好、切到 analytics 不该重配（与 `admin.shell-ui` 同类，而不是 `admin.preferences:<appId>`）。跨标签页同步沿用 `enableCrossTabSync`。

**为什么厂商与模型分开两张表**：一个厂商下通常挂多个模型（`gpt-5` / `gpt-5-mini`），而 Key 与 Base URL 属于厂商。合成一条记录会导致同一个 Key 被抄 N 份，改 Key 要改 N 处。

**删除厂商连带删除它的模型**，并清理 `activeModelId` —— 否则会留下指向不存在厂商的孤儿模型。

### 2.2 会话与消息（L2）

```ts
type AiMessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown; state: 'running' | 'done' | 'error'; output?: unknown; error?: string }

interface AiMessage {
  id: string
  role: 'user' | 'assistant'
  parts: AiMessagePart[]
}

interface AiSessionSummary {
  id: string
  appId: string
  title: string
  createdAt: number
  updatedAt: number
}
```

**会话持久化在 IndexedDB**（`#/lib/ai/session-db`，库名 `admin.ai`）、**按 app 分区**。
三个 store 的分工 —— **元数据与消息分开存是关键**：

| store | 内容 | 为什么分开 |
|---|---|---|
| `sessions` | 元数据（标题 / 时间戳 / appId） | 列表要按时间排序展示；消息若塞在一起，每次开面板都要把全部正文反序列化一遍 |
| `messages` | `{ sessionId, messages }` | 只有真正打开某个会话时才读 |
| `meta` | 每个 app 的 `activeSessionId` | 记住上次打开的是哪个会话 |

**为什么不用 localStorage**：一条会话带着工具调用的原始结果，几十上百 KB 很常见，
而 localStorage 有 5 MB 上限、且是**同步** API（流式期间每次落盘都卡主线程）。

**写盘只有三处时机**（都由 `chat.ts` 触发）：用户发送后**立刻**写（助手回复中途刷新，问题不丢）、
一轮结束 / 失败 / 中止后写、以及切换与删除会话时由 store 自己处理。
**流式期间每个 token 不写** —— IDB 虽然异步，但为一轮回复开几十上百次事务没有意义，
刷新丢的也只是半句话。

**读盘只在「首次进入」与「切 app」**（`loadHistory` 对同一个 app 会早退）：
面板关闭时 `AiPanel` 整体卸载、再打开是一次重挂载，没有这道判断就会用 IDB 里的旧版本
**覆盖掉流式回复已经吐出来的增量**。

**标题取第一条用户消息**（`deriveSessionTitle`：压平空白 + 截断 40 字），不额外调模型；
「点了新对话但没说话」**不建记录**，避免列表里堆一串空会话。

## 3. 工具协议（自研 MCP-like）

WebMCP 目前只在很新的 Chrome 里可用（且规范仍在演进），本项目要覆盖旧浏览器，因此**不复用它**；我们只借用 MCP 的**数据模型**（工具 = 名字 + 描述 + JSON Schema 输入），传输层不做（工具就是同一个页面里的函数，不需要跨进程协议）。

### 3.1 工具定义

```ts
interface AiToolDefinition<Input = unknown> {
  name: string                 // 给模型的唯一名字，蛇形
  description: string          // 给模型看的用途说明（决定它会不会用对）
  inputSchema: Record<string, unknown>   // JSON Schema，直接用，不引入 zod
  access: 'read' | 'act' | 'commit'
  group: 'page' | 'data' | 'form'   // 权限界面里的分组（工具自己声明）
  execute: (input: Input, ctx: AiToolContext) => Promise<unknown>
}
```

**不引入 zod**：AI SDK v5 的 `tool()` 接受 JSON Schema（`jsonSchema()`），而我们的工具输入本来就该是纯数据描述 —— 少一个依赖，也方便将来把 schema 直接展示给用户。

### 3.2 权限（能用到什么）与模式（要不要问）

这两个维度**正交**，别再揉在一起：

| 维度 | 取值 | 回答的问题 | 落点 |
|---|---|---|---|
| **权限** `aiPermission` | `full` / `readonly` / `custom` | **能不能用**这个工具 | `getAllowedTools(permission, customTools)` |
| **模式** `aiComposerMode` | `ask` / `auto` | 用起来**要不要问** | 各工具的 `execute` 读 `ctx.mode` |

**权限**默认 `readonly`（AI 默认只能看，要它动数据得用户自己去开）；`custom` 档按
`aiAllowedTools` 里勾选的工具名放行。**模式**下只有与"替用户做主"有关的动作才过审批：

| 工具 | ask | auto |
|---|---|---|
| `read` 类 | ✅ 直接 | ✅ 直接 |
| `navigate_to` | ✅ 直接 | ✅ 直接 |
| `fill_form` | ⚠️ 先请用户确认 | ✅ 直接写 |
| `submit_form` | ⚠️ 一律确认 | ✅ 表单 `canSubmit()` 通过就直接提交 |
| `call_write_api` | ⚠️ 确认 | ⚠️ **仍然确认** |

`call_write_api` 是唯一"两个模式都要确认"的：通用写接口**没有可预览的表单**，
自动执行等于让模型直接改库；而 `submit_form` 有表单兜底 —— `canSubmit()`
（校验通过 + 确实有改动）就是「信息足够」最可靠的可判定表达，比让模型自述可信得多。

`access` 现在**只描述风险等级**（权限界面按它解释、`readonly` 档按它过滤），
**不再决定可用性** —— 早先 `getToolsForMode` 那版里它确实兼任了权限，
结果 `ask` 成了一个连表都填不了的模式。

### 3.3 MVP 工具清单

| 工具 | access | 说明 |
|---|---|---|
| `get_page_context` | read | 当前 URL / 路由模板 / appId / 面包屑 / 页面标题 —— AI 问「我在哪」时用 |
| `list_navigation` | read | 全部导航项（业务 + 外壳），带名称与路径，供 AI 选目标 |
| `search_api` | read | 在 `GET /api` 的 632 条接口清单里按关键词检索 |
| `call_read_api` | read | 调用**清单内**的一个 GET 接口，带 query，返回 JSON（截断） |
| `list_dict_options` | read | 读字典选项（`1/2` → 「启用/禁用」），避免 AI 瞎猜枚举含义 |
| `call_write_api` | **commit** | 调用清单内的写接口（POST/PUT/PATCH/DELETE）；**执行前弹审批卡**，被拒则抛错、不发请求 |
| `navigate_to` | read | 导航到某个路径（归 `read`：它不改变任何东西，只读档也允许） |

`call_read_api` 的两条硬约束（这是「利用现实已有东西」的关键）：

1. **白名单**：只允许调用 `GET /api` 清单里存在的接口 —— 清单既是 AI 的检索源，也是安全边界，AI 无法构造任意路径去打后端；
2. **只读**：method 只能是 `GET`；写操作走 `call_write_api`（同样受白名单约束）并**强制审批**。

`call_write_api` 的额外约束：

1. **method 必须与清单完全一致**：`DELETE /api/user` 不能靠伪造 method 绕过（清单里没有这条就拒绝）；
2. **审批是执行前置**：`await ctx.requestApproval({ toolName, input, reason })`，UI 展示 method / path / body 原文，用户三选一；
3. **拒绝即抛错**：错误文案里带「不要重试同一个请求」，让模型如实向用户说明，而不是假装成功。

另外返回值要**截断**（列表接口动辄几百条），并在截断时明确告知模型「还有更多数据」，让它改用分页参数而不是把整个响应塞进上下文。

### 3.4 上下文注入

`PageContext` 每轮对话**重新采集**（用户可能已经导航了）：

```ts
interface AiPageContext {
  appId: string | null
  appName: string | null
  url: string            // 完整 URL（含 search / hash）—— 用户强调过这是最关键的资源
  pathname: string
  routeId: string | null // TanStack Router 的路由模板，如 /$appId/users/user/$uid
  breadcrumb: string[]   // 首页 / 用户运营 / 用户列表
  title: string | null   // 页面标题
}
```

注入方式：拼成一段 system 提示词（而不是让 AI 每轮先调一次工具）—— 「我在哪」是**每轮都要用**的信息，让它多花一次工具调用去取是浪费；`get_page_context` 工具保留给「AI 想确认导航之后的位置」的场景。

**URL 为什么必须给**：管理后台的路由本身就编码了「用户正在看什么」——`/$appId/system/features/483` 同时表达了应用、模块、以及当前实体 id。没有它，AI 只能靠猜或者反问，而它猜错的时候用户已经不在那个页面上了。

### 3.5 表单桥：让 AI 填表（而不是操作 DOM）

`#/lib/ai/form-bridge` 是一张**模块级注册表**：当前页面上正在编辑的表单把自己登记进来，
AI 通过三个工具操作它（`list_page_forms` / `fill_form` / `submit_form`）。

**为什么不 DOM 驱动**（像 browser-use 那样直接找 input 填值）：本仓库的表单全是**受控组件**，
直接改 `input.value` 不会触发 React 的 onChange（值丢失，或被下次渲染覆盖），得靠
native setter + 派发事件的技巧，动态字段、RTL、校验都会跟着出问题。注册表把
「AI 能改什么」变成**业务代码自己的声明**：类型安全、可审计。

**注册拆成两半**，因为这两件事天然属于不同的组件：

| 半边 | 谁注册 | 钩子 | 提供 |
|---|---|---|---|
| 字段读写 | 表单组件（state 在它手上） | `useAiFormFields` | `fields` / `getValues` / `setValues` |
| 提交 | 页面组件（它知道怎么保存） | `useAiFormSubmit` | `submit` / `canSubmit` |

两半靠**同一个 id** 拼成一条记录；缺哪半，对应工具就明确拒绝。参考实现：features 功能详情
（`feature-form.tsx` + `feature-detail.tsx`，id = `feature-detail`）。

四条硬约定：

1. **`fill_form` 只放行表单声明过的字段** —— 模型编出来的键进不了业务 state
   （会出现在返回值的 `ignored` 里）；
2. **字段集随 `variant` 收敛**（功能组没有「权限标识」、权限点没有「显示」）——
   否则 AI 会看到界面上根本不存在的字段；
3. **同步 effect 故意不写依赖数组**：写依赖会让注册退化成「首次渲染的快照」
   （切语言后字段名还是旧语言的）。upsert 只改模块级 Map、不触发渲染，因此每次渲染同步是安全的；
4. **`submit_form` 先问 `canSubmit` 再走审批** —— 表单没变脏 / 校验不过时直接拒绝，
   别弹一张让用户白点一次的审批卡。

## 4. 安全与风险

- **API Key 明文存在浏览器**（`admin.ai`）。这是「零后端依赖」换来的代价，必须在设置页显式提示（`aiApiKeyHint`），并且输入框默认掩码显示。共用电脑 / 生产环境请勿填写真实 Key。
- **请求从浏览器直连厂商**：需要厂商允许 CORS（Anthropic 需要 `anthropic-dangerous-direct-browser-access` 头；自建网关需自行放开）。因此请求层做成**可替换 adapter**：将来后端提供代理接口时，只换 adapter、配置与工具层不动。
- **工具白名单**是唯一防线之外的第二层：即使模型被提示词注入诱导，它能打的也只有 `GET /api` 清单里的 GET 接口。
- 会话与工具结果**不出本机**，除厂商 API 外不额外上报。

## 5. 复用清单（不要重新发明）

| 已有资产 | 在 AI 里的用途 |
|---|---|
| `#/lib/navigation` 的 `NAV_GROUPS` / `ALL_NAV_TARGETS` / `ALL_SHELL_NAV_TARGETS` | `list_navigation` 的数据源 |
| `GET /api` 接口清单（`getApiQueryOptions`） | `search_api` / `call_read_api` 的索引与白名单 |
| `client`（`#/api`，已注入 Bearer 与 `X-App-Id`） | 工具发请求直接复用，不另建实例 |
| `getQueryClient(scope).fetchQuery(...)` | 命令式取数（工具不是 React 组件） |
| `#/lib/dict-options` | `list_dict_options` |
| `#/lib/store/shell-ui-store` | 全局 store + persist + 跨标签同步的写法模板 |
| `#/components/settings-card` | 设置页两张新卡片的行布局 |
| `ai-composerMode`（ask / auto） | 权限分级已经在 store 里了 |
