# AI 工具层实现规范

> **给 coding agent 的实现契约。** 设计与理由见
> [`../../docs/ai-permission-and-tools-redesign.md`](../../docs/ai-permission-and-tools-redesign.md) §4.6–§4.11；
> 中间层与工具现状见 [`ai-server-layer.md`](./ai-server-layer.md)。
>
> 本文**只写"怎么做"**：类型、接口、文件、验收标准。**第 1 节的类型与接口是冻结契约 —— 逐字照抄，不要改名、不要加字段。**

---

## 0. 背景（30 秒版）

AI 工具执行在**用户浏览器里**、用**用户自己的登录态**调后端。因此：

- **权限**：后端给一份权限点清单（`GET /permissions`，已实现），工具在**给模型之前**按它过滤一次；
  用户偏好（`aiPermission`）在权限内**再收紧** —— 两者取交集；
- **数据**：读数据类工具会**先把用户同意的门**（首次必问），并且返回前**脱敏**；
- **敏感值**：AI **永远拿不到原文**；需要"确认某个值在不在结果里"时，用 `check_result_match`
  在**本地内存**里问一个是非题；
- **统计**：AI **不碰数据**，只写**表达式**，客户端本地求值后把**结果**回给它。

---

## 1. 冻结契约（逐字照抄）

### 1.1 字段注解

落在 `apps/web/src/lib/features/types.ts` 的 `FeatureDataSourceSpec` 上（新增可选字段）：

```ts
/**
 * 数据源里**一个字段的注解** —— AI 写表达式、脱敏、正确计算都靠它。
 *
 * 缺了它，AI 只能从自由文本的 `shape` 里猜字段名 —— 猜错就会算出一个错数（比不给还糟）。
 */
export interface FeatureDataFieldSpec {
  /** 字段名，必须与 `read()` 返回的行里的键**完全一致** */
  name: string
  /** 给模型看的字段含义（一句话，别贴文档） */
  label: string
  /**
   * 值的类型。它决定**能做什么运算**：
   * - `number` → 可 sum / avg
   * - `datetime` → 可按区间筛
   * - `enum` → 值取自 `options`，模型不必猜数字含义
   * - `boolean` / `string` → 只能比较 / 计数
   */
  type: 'string' | 'number' | 'boolean' | 'datetime' | 'enum'
  /** 补充说明（可选）：单位、格式、口径 */
  description?: string
  /** `type === 'enum'` 时给候选值；其它类型忽略 */
  options?: readonly { value: string | number; label: string }[]
  /**
   * **敏感字段**：AI 读到它时一律脱敏（见 §1.2）。
   *
   * 它**仍然要出现在注解里** —— 模型需要知道"有这个字段、只是看不到值"，
   * 否则连"该用 `check_result_match` 查它"都想不到。
   */
  sensitive?: boolean
}
```

`FeatureDataSourceSpec` 新增：

```ts
  /**
   * 这个数据源有哪些字段（字段注解）。**未注解的字段 AI 不可用** —— 宁缺勿猜。
   */
  fields?: readonly FeatureDataFieldSpec[]
```

### 1.2 脱敏（一处出口）

新文件 `apps/web/src/lib/ai/content-redact.ts`：

```ts
/** 脱敏规则：保留首尾、中间打码。短值（≤ 4 位）整体打码。 */
export function maskValue(value: unknown): unknown

/**
 * 按字段注解脱敏一条记录：`sensitive: true` 的字段走 `maskValue`，其余原样。
 * 未声明的字段**原样保留**（它是页面自己要用的数据；AI 侧另有"未注解字段不可用"的约定）。
 */
export function redactRecord(
  record: Record<string, unknown>,
  fields: readonly { name: string; sensitive?: boolean }[],
): Record<string, unknown>

/** 批量（数组）版本；非数组输入原样返回。 */
export function redactRecords(value: unknown, fields: ...): unknown
```

**规则细节**（写死在实现里，不要在别处再写一套）：

| 值 | 脱敏后 |
|---|---|
| `13812341234` | `138****1234` |
| `a@example.com` | `a***@example.com`（本地部分只留首字符） |
| `110101199001011234` | `110101********1234` |
| 长度 ≤ 4 或非字符串 | `****` |

### 1.3 读数据授权（`DATA_READ_GRANT`）

在 `apps/web/src/lib/ai/session-permissions.ts` 里新增一个**会话授权键**（与现有 `NAVIGATION_GRANT` 同款）：

```ts
/**
 * 「允许 AI 读取业务数据」的**会话授权键**。
 *
 * 它与 `NAVIGATION_GRANT` 同一套机制（按 session 隔离、sessionStorage、刷新失效），
 * 但语义独立：**它不受 `aiComposerMode`（询问 / 自动）影响** ——
 * 那个开关管的是"要不要为替我做的决定打断我"，而"读我的数据"不是替你决定，是涉及你。
 * 所以**首次必问**，用户点过"本会话允许"后不再打扰。
 */
export const DATA_READ_GRANT = 'data:read'
```

**哪些工具受它管**（判据：这次调用会不会把业务数据带进对话）：

| 工具 | 受 `DATA_READ_GRANT` 管 |
|---|---|
| `get_page_context` / `list_navigation` / `manage_tasks` / `search_api` / `update_search_params` | ❌（只读元信息） |
| `get_page_data` | ✅ |
| `call_read_api` | ✅ |
| `list_page_forms` | ✅ |
| `check_result_match` | ✅（但它**不用会话授权**，见 §1.4） |

**审批请求形态**（复用现有 `AiApprovalRequest` 的 `action` 分支）：

```ts
await ctx.requestApproval({
  toolName: DATA_READ_GRANT,
  input: { tool: 'get_page_data', source: '表格示例（当前页）' },
  reason: 'AI 想读取当前页面的表格数据（敏感字段已脱敏）',
})
```

被拒 → **抛错**（不要静默返回空），文案："用户拒绝让 AI 读取数据。不要重试，改为请用户自己查看。"

### 1.4 新工具一：`check_result_match`（存在性查询）

新文件 `apps/web/src/lib/ai/tools/check-result-match-tool.ts`：

```ts
export const checkResultMatchTool: AiToolDefinition = {
  name: 'check_result_match',
  catalogDescription: '检查页面数据是否存在指定值',
  description: '检查**当前页面已加载的数据**里，某个字段是否存在满足条件的值。'
    + '**它只回答"存在 / 不存在"**，不返回数据本身 —— 用于在数据已脱敏的情况下，'
    + '确认用户提到的某个具体值（例如手机号）在不在结果里。'
    + '每次调用都需要用户同意；用户拒绝时不要重试。',
  inputSchema: {
    type: 'object',
    properties: {
      field: { type: 'string', description: '要检查的字段名，必须是 get_page_data 返回的字段注解里的 name' },
      value: { type: 'string', description: '要匹配的值（字符串形式，数字/日期也传字符串）' },
      mode: {
        type: 'string',
        enum: ['exact', 'prefix', 'contains', 'regex'],
        description: '匹配模式：exact 完全相等；prefix 前缀；contains 包含；regex 正则（谨慎使用）',
      },
      source: { type: 'string', description: '可选：只查某个数据源（按数据源 id），不传则查当前页面全部数据源' },
    },
    required: ['field', 'value', 'mode'],
    additionalProperties: false,
  },
  access: 'read',
  group: 'data',
  execute: async (input, ctx) => { /* 见下 */ },
}
```

**`execute` 的行为（逐条实现）**：

1. **每次必问**：调 `ctx.requestApproval({ toolName: 'check_result_match', input, reason })`；
   用户拒绝 → **抛错**（"用户拒绝了这次检查"）。
   ⚠️ **不要**走 `DATA_READ_GRANT`（它必须每次都问，才能让枚举被用户看见）。
2. **限流**：每会话最多 **20 次**（见 §1.6 的计数落点）。超限 → 抛错
   （"本次会话的存在性检查次数已用完（20 次）。不要继续试探；如需精确结果，请让用户自己查看页面。"）
3. **探测值来源校验**：`value` 必须是**本轮用户消息文本的子串**（`ctx.getUserMessageText()`，见 §1.7）。
   不是 → 抛错（"只能检查用户明确提到过的值。"）
4. **本地匹配**：先校验 **`field` 已注解** —— 该数据源的 `fields` 存在且非空时，`field` 不在其中
   → **抛错并列出可用字段名**（让模型能自我纠正）；`fields` 缺失/为空（页面还没迁移到注解）→ **放行降级**。
   *为什么必须校验*：字段名拼错时 `record[field]` 是 `undefined` → 匹配 false → 回 `{ exists: false }`，
   模型会把它当成「用户说的值不存在」—— 与「读失败被当成不存在」是同一类错误结论。
   然后：取**当前页面已加载的数据**（`resolveFeature(routeId)` 的 `dataSources`，
   用 `read()` 读；**绝不发请求**），按 `field` 取值、按 `mode` 匹配；
   `regex` 用 `new RegExp(value)`，构造失败 → 抛错。
5. **只返回布尔**：

```ts
return { exists: matched }
```

**绝不返回**：命中条数、行内容、字段值（多一个字段就多一条泄露通道）。

### 1.5 新工具二：`analyze_data`（表达式分析，**不 eval**）

新文件 `apps/web/src/lib/ai/tools/analyze-tool.ts`。

**它解决的问题**：模型要看统计结果，但**不该看数据**。所以它写**表达式**，客户端求值，只把**结果**给它。

**输入是一个 JSON 操作描述**（不是代码字符串 —— **永远不 `eval`/`new Function`**）：

```ts
inputSchema: {
  type: 'object',
  properties: {
    source: { type: 'string', description: '数据源 id，来自 get_page_data' },
    pipeline: {
      type: 'array',
      description: '按顺序执行的操作链，最多 8 步',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['filter', 'count', 'sum', 'avg', 'min', 'max', 'groupBy', 'sort', 'topN', 'distinct'] },
          field: { type: 'string', description: '目标字段（count 不需要）' },
          eq: {}, neq: {}, gt: {}, gte: {}, lt: {}, lte: {}, in: {}, contains: {},
          fn: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
          by: { type: 'string', description: 'groupBy 的分组字段' },
          order: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'number' },
        },
        required: ['op'],
      },
    },
  },
  required: ['source', 'pipeline'],
}
```

**执行规则**：

1. **字段必须已注解**：`field` / `by` 不在该数据源的 `fields` 里 → 抛错（列出可用字段）；
2. **类型约束**：`sum`/`avg` 只能用于 `type === 'number'`；`datetime` 的比较按时间戳；违反 → 抛错；
3. **有界**：`pipeline` 长度 ≤ 8；`topN` 的 `limit` ≤ 100；结果数组 ≤ 100 项；
4. **只读**：`read()` 是纯读，不触发请求；
5. **返回结果**（这是唯一会把数据带出去的地方 —— 结果本身应是小数据）：

```ts
return { ok: true, value: /* 标量或 ≤100 项的小数组 */ }
```

6. **敏感字段**：表达式**可以**对敏感字段做比较（如 `filter: { field: 'phone', contains: '138' }`）
   —— 这不泄露值；但结果里**不含**敏感字段原文（`groupBy`/`distinct` 到敏感字段 → 抛错）。

### 1.6 计数与限流落点

- **会话级计数**（`check_result_match` 的 20 次、`analyze_data` 的可选计数）落
  `apps/web/src/lib/ai/session-store.ts`（与 `pendingApproval` 同一层，随会话走）；
- 每次 `check_result_match` 调用后 +1；**切会话 / 新对话时归零**（`startNewSession` / `switchSession` 里清）。

### 1.7 工具上下文扩展（`AiToolContext`）

`apps/web/src/lib/ai/types.ts` 的 `AiToolContext` 新增**两个只读能力**：

```ts
  /** 本轮用户消息的原始文本 —— 用于校验"探测值必须来自用户"（§1.4 第 3 条） */
  getUserMessageText: () => string
  /** 递增并读取本会话的工具计数（§1.6）；key 如 'check_result_match' */
  bumpToolCounter: (key: string) => number
```

由 `apps/web/src/lib/ai/chat.ts` 的 `buildToolContext` 注入实现。

### 1.8 权限点细分（页面声明 + 工具）

**命名**：`{模块}:{动作}`，动作取 `read` / `create` / `fill` / `submit` / `update` / `delete`。

`apps/web/src/lib/ai/page-capabilities.ts` 的 `CapabilityForm` 新增两个可选字段
（⚠️ **勘误**：`CapabilityForm` 定义在 `lib/ai/page-capabilities.ts`，不在 `lib/features/types.ts`
—— `features/types.ts` 只是 `import type` 复用它的形状）：

```ts
  /** AI 填写这张表单需要的权限点（只改页面状态、不落库） */
  fillPermission?: string
  /** AI 提交这张表单需要的权限点（落库，不可撤销） */
  submitPermission?: string
```

**页面声明**（`features/table-example/list/feature.ts` 等）按下面的口径补：

| 动作 | 权限点 |
|---|---|
| 查看列表 / 详情 | `{模块}:read` |
| 新建 | `{模块}:create` |
| **AI 填写表单** | `{模块}:fill` |
| **提交表单** | `{模块}:submit` |
| **数据更新**（直连接口） | `{模块}:update` |
| 删除 / 批量删除 | `{模块}:delete` |

**工具的权限声明**（`AiToolDefinition.requiredPermissions` / `requiredPermissionsAny` 已存在）：

| 工具 | 声明 |
|---|---|
| `call_read_api` | `requiredPermissionsAny: ['*:read']`（已有） |
| `call_write_api` | `requiredPermissionsAny: ['*:create', '*:edit', '*:update', '*:delete', '*:write']`（**补 `*:update`**） |
| `fill_form` | 在 `execute` 里查**表单声明的 `fillPermission`**（工具层不写死权限点） |
| `submit_form` | 同上，查 `submitPermission` |

### 1.9 加一个工具：双层描述、依赖与阶段开关

> 两阶段按需加载（Router → Execution，见 [`ai-server-layer.md`](./ai-server-layer.md) §1.4）落地后，
> `AiToolDefinition` 新增下列字段。它们**只影响「什么时候把定义发给模型」**，不改工具行为。

| 字段 | 必填 | 作用 |
|---|---|---|
| `catalogDescription: string` | ✅ **必填** | Router 阶段工具目录的一行。**10~25 个中文字**，只说明「能干什么」 |
| `description: string` | ✅（原有） | Execution 阶段的完整说明，**已大幅精简**：只留 做什么 / 关键输入约束 / 调用前置条件 / 安全约束 |
| `dependencies?: readonly string[]` | 按需 | 被选中时 Runtime **自动补齐**的其它工具名（模型不必记住工具间依赖） |
| `catalog?: boolean` | 否（默认 `true`） | 是否进 Router 的 Tool Catalog |
| `execution?: boolean` | 否（默认 `true`） | 是否允许进 Execution 阶段 |

**双层描述的分工**（不要写重、不要写串）：

| 阶段 | 模型看到的 | 来源 | 体量 |
|---|---|---|---|
| Router | 一行 `- name：catalogDescription` | `buildToolCatalogText(allowedTools)`（只含**当前权限下可用**的工具） | 每工具一句话 |
| Execution | 完整定义（`description` + `inputSchema`） | `activeTools` 选中的工具（含依赖补齐） | 单工具 2~3.5k 字符 |

`catalogDescription` **不要**写：调用规则、权限、其它工具、业务流程，也不要复述 system prompt ——
那些属于执行阶段的 `description` 与各层提示词。

**`dependencies` 现状**（仅三处）：`analyze_data → ['get_page_data']`、
`check_result_match → ['get_page_data']`、`fill_form → ['list_page_forms']`。

**加一个工具的步骤**：

1. 写实现：`catalogDescription` 必填、`description` 精简、需要前置工具就写 `dependencies`；
2. 注册进 `AI_TOOLS`（`lib/ai/tools/index.ts`）—— **唯一真值**，不要另立名单；
3. 权限点按 §1.8 声明（`requiredPermissions` / `requiredPermissionsAny`，或 `execute` 里查页面声明）；
4. 不需要出现在 Router 目录的标 `catalog: false`；只该在 Router 存在的标 `execution: false`。
5. `select_tools` 是**虚拟工具**，**不加入 `AI_TOOLS`**，也不出现在权限清单里
   （它的 `execute` 在 `runtime.ts` 的本轮闭包中）。

**`select_tools` 的输入 schema**（定义在 `lib/ai/tools/select-tools.ts`）：`intent` 与 `tools`
**都必填**。`tools` 是要加载的工具名数组；`intent` 是这一轮请求的主要意图，**只进日志**
（`AiTurnMetrics.intent`），Runtime **不据它做业务判断**：

```ts
inputSchema: {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['greeting', 'translation', 'navigation', 'page_query', 'page_analysis',
        'form', 'write', 'api_query', 'complex', 'out_of_scope', 'ambiguous'],
    },
    tools: { type: 'array', items: { type: 'string' } },
  },
  required: ['intent', 'tools'],
  additionalProperties: false,
}
```

描述里只写「打招呼 / 道谢 / 纯翻译」这三类直接回答、**不要**调用本工具（原先那句与
「通识与百科、常识问答属于越界」自相矛盾，已删除）；其余请求一律先用本工具选工具。

**关键约束一条没删**（都还在 `description` / 提示词层里）：不猜接口路径、不猜字段名、
写操作必须确认、删除不可撤销、被拒不重试、`truncated` 不得下结论、`check_result_match` 的
`value` 必须来自用户。被删掉的是**与其它工具的比较、容器策略、`@` 引用编排** —— 那些由提示词层承载。

**尚未做**：`inputSchema` 里参数的 `description` / `example` **还没精简**（留待拿到真实 token 数据后再压）。

---

## 2. 任务与写入范围（互不重叠）

| # | 任务 | 写入范围（**只许动这些**） |
|---|---|---|
| **T1** | 字段注解 + 脱敏 + 读数据授权 + 权限点细分（一条链） | `lib/features/types.ts`、`lib/ai/page-capabilities.ts`、`lib/ai/content-redact.ts`(新)、`lib/ai/tools/feature-tools.ts`、`lib/ai/session-permissions.ts`、`lib/ai/tools/data-tools.ts`(只加 `*:update`)、`features/table-example/list/feature.ts`、`features/data-dict/list/feature.ts` |
| **T2** | `check_result_match`（新工具，独占新文件） | `lib/ai/tools/check-result-match-tool.ts`(新) |
| **T3** | `analyze_data`（新工具，独占新文件） | `lib/ai/tools/analyze-tool.ts`(新) |
| **T4** | 统一注册 + 上下文扩展 + 计数器（**Lead 做**） | `lib/ai/tools/index.ts`、`lib/ai/types.ts`、`lib/ai/chat.ts`、`lib/ai/session-store.ts` |

**T2/T3 只写自己的新文件**：不要改 `tools/index.ts`（注册统一由 Lead 在 T4 做），
否则两个人会同时改同一个数组。

---

## 3. 硬约束（仓库铁律，违反即返工）

1. **用户可见文案 7 语言齐**（`zh-CN`/`en-US`/`ja-JP`/`ar-SA`/`hi-IN`/`es-ES`/`tr-TR`）——
   只改中文等于没改。工具的内部错误文案**发给模型**、不进 UI，可以只写中文；**任何进 UI 的文案必须 7 语言**。
2. **不要跑** `typecheck` / `build` / `dev`（仓库约定：只有使用者点名 verify 时才跑）。正确性靠**阅读类型与调用方**保证。
3. **不要新建平行的名单**：字段注解、权限点、工具清单一律复用既有出口
   （`AI_TOOLS` / `resolveFeature` / `hasPageCapabilityPermission`）。
   （`select_tools` 是虚拟工具，**不进** `AI_TOOLS`，见 §1.9。）
4. **不引入新依赖**。
5. **只改自己任务范围内的文件**；需要改别人的文件 → 在交付说明里提出，不要直接动手。
6. **不要 `eval` / `new Function`**（表达式必须是纯数据结构）。
7. 敏感值**永远不进返回值** —— 只回布尔或聚合结果。

---

## 4. 验收标准（Lead 会逐条核）

**T1**

- [ ] `FeatureDataSourceSpec.fields` 与 `FeatureDataFieldSpec` 与 §1.1 **逐字一致**
- [ ] `redactRecord` / `redactRecords` / `maskValue` 行为符合 §1.2 的表格
- [ ] `get_page_data` 在返回前按 `fields` 脱敏（`sensitive: true` 的字段）
- [ ] `get_page_data` / `call_read_api` / `list_page_forms` 在**首次**读数据前 `requestApproval`（走 `DATA_READ_GRANT`），拒绝时抛错
- [ ] `DATA_READ_GRANT` 已按会话授权生效（第二次不再问）
- [ ] 两个 `feature.ts` 已补 `fields` 注解与细分的权限点
- [ ] `CapabilityForm` 有 `fillPermission` / `submitPermission`

**T2**

- [ ] 工具名 / description / inputSchema 与 §1.4 一致
- [ ] **每次**调用都 `requestApproval`（不读会话授权）
- [ ] 每会话限流 20 次，超限抛错
- [ ] `value` 必须来自本轮用户消息，否则抛错
- [ ] **只**返回 `{ exists: boolean }`
- [ ] 匹配在本地内存，**不发任何请求**

**T3**

- [ ] 支持 §1.5 列出的全部 `op`，且**无 `eval`**
- [ ] 字段未注解 / 类型不匹配 / 超界 → 抛错并给出可执行的下一步
- [ ] 敏感字段不计入 `groupBy` / `distinct` 的输出

**通用**

- [ ] 每个任务只改了 write scope 内的文件（用 `git status` 自查）
- [ ] 没跑 typecheck / build

---

## 5. 实施与验收结果（已完成）

| 任务 | 状态 | 交付 |
|---|---|---|
| **T1** 地基 | ✅ | 字段注解类型、`content-redact`（脱敏唯一出口）、`DATA_READ_GRANT`、`get_page_data` 审批 + 脱敏、`call_read_api` 审批、两个 `feature.ts` 的字段注解与权限点细分 |
| **T2** `check_result_match` | ✅ | 每次必问、20 次限流、探测值必须来自用户、只回 `{ exists }`；按 Lead 要求补了**字段注解校验**（拼错字段名不得退化成"值不存在"） |
| **T3** `analyze_data` | ✅ | 10 个 op、**无 eval**、字段/类型/有界校验、敏感字段拒绝（含聚合反推）；按 Lead 要求接入 `DATA_READ_GRANT`，并把 op 级校验前移到**弹卡之前**（`planStep` 单一规则） |
| **T4**（Lead） | ✅ | 注册两个新工具、`PAGE_BOUND_TOOLS` 收口全屏排除、`AiToolContext` 两个能力、会话计数器、`list_page_forms` 审批、mock 权限点补 `update`/`fill`/`submit` |

**Lead 独立验收（离线，21/21 通过）**：脱敏 8 项（对照 §1.2 表格）、工具总数 18、两个新工具已注册、
全屏排除 5 个页面绑定工具、权限过滤仍生效（viewer 拿不到写通道）。

**teammate 自测**（各自 vm 沙箱直接执行产品 `execute`）：T2 14 组、T3 46 用例（含「11 个静态失败分支
`requestApproval` 零调用」的断言）。

### 过程中修正的**规范自身错误**（记录以免重犯）

1. **`CapabilityForm` 的位置写错** —— 它在 `lib/ai/page-capabilities.ts`，不在 `lib/features/types.ts`
   （后者只是 `import type` 复用形状）。已勘误 §1.8 与 §2 的 T1 scope。
2. **§1.4 漏了「`field` 必须已注解」** —— 否则拼错字段名会静默退化成 `{ exists: false }`，
   被模型读成"用户说的值不存在"。已补进 §1.4，并由 T2 owner 打补丁实现。
3. **§2 的 T4 范围不全** —— 漏了 `lib/ai/tools/form-tools.ts`（`list_page_forms` 的审批）
   与 `apps/mock/server/routes/permissions.get.ts`（新权限点），两者由 Lead 补做。

### 尚未做（后续）

- **其余 8 个 `feature.ts` 还没补 `fields` 注解** —— 现在只有 `table-example` 与 `data-dict/list`
  有注解；没注解的页面里 `analyze_data` 会明确抛错（这是刻意的：宁缺勿猜）。
- **`type` 没有 `array`** —— data-dict 的 `children`（嵌套数组）因此未注解。
- **`data-dict/list` 没有 `forms`** —— 它的写入口在组件内，无处声明 `fillPermission` / `submitPermission`。
- **真实后端需提供 `GET /permissions`**；mock 只是替身。且 `/permissions` 尚未走 `pnpm api` 同步契约。
- **表达式分析的结果渲染**（客户端 UI）还没做 —— 目前只把结果回给模型。
