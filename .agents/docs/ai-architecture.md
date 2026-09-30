# AI 架构（当前状态）

> **这份文档是给 AI 读的**：改 AI 相关代码前先通读它一遍。它描述**各层职责、一轮消息的
> 数据流、扩展点，以及踩过的坑** —— 契约级的硬约束在 `AGENTS.md` §9/§10，设计取舍与
> 选型调研在 `./ai-integration.md` 与 `../../docs/ai-stack-research.md`（那两份偏"给人看"）。

目录：

1. [分层](#1-分层)
2. [一轮消息的数据流](#2-一轮消息的数据流)
3. [两个正交维度：权限与模式](#3-两个正交维度权限与模式)
4. [给模型的上下文从哪来](#4-给模型的上下文从哪来)
5. [上下文预算](#5-上下文预算)
6. [扩展点：加东西改哪里](#6-扩展点加东西改哪里)
7. [已知的坑](#7-已知的坑)

---

## 1. 分层

```
L1  UI          components/ai-panel · ai-conversation · ai-composer · ai-session-picker
                components/ai-session-list（浮层形态的会话列表：搜索框 + 分组），
                  ai-session-delete-dialog（两处共用的删除确认）
                components/ai-conversation-scroller（**面板与全屏对话页共用**的会话区：
                  跟随滚动 / 上翻暂停 / 回到底部按钮 —— 两处行为必须一致）
                components/ai-bot-avatar · ai-activity-glow · beta-badge
                routes/$appId_.sphere（全屏 AI 对话页：`ai-panel` 头行「最大化」的落点，
                  逃离 `$appId` 布局、没应用侧边栏；见 routing-architecture.md §2「逃离父布局」）
                  ├─ route.tsx  布局里挂 `sphere-header`（头行常驻：会话 404 时也在，
                  │     只是标题留空）+ 会话列表加载；整块面板的**进出场动画**也在这里
                  │     （入场 scale 0.8→1 + 淡入，退场缩小淡出后才导航；
                  │     `useMotionEnabled()` 为假时都不播，见 ui-and-styling.md「动效开关」）
                  ├─ index.tsx   $appId/sphere = 新会话（挂载即 startNewSession）
                  ├─ chat/$chatId.tsx  $appId/sphere/chat/$chatId = 指定会话，
                  │     loader 用 store.hasSession 校验，找不到 → sphere-not-found
                  ├─ -components/sphere-header.tsx  头行：标题居中（按路由推导，
                  │     找不到的会话 → 空）、侧边栏展开/收起按钮
                  ├─ -components/sphere-chat.tsx  两路由共用的 chat 本体（只有会话区 +
                  │     输入区；会话区 manageHistory=false）
                  ├─ -components/sphere-sidebar  侧边栏：Kumo `Sidebar`，只有会话；
                  │     展开态下收起按钮在头行标题右侧、分隔线也画在这里（收起即消失）
                  ├─ -components/sphere-not-found  会话 404（AI 形象 + 文案 + 新对话）
                  ├─ -components/use-sphere-collapse  收起 = 回 sessionStorage 记的来源页；
                  │     出口组件调它即可（有过渡上下文就**先播收起动画再导航**，
                  │     没有就立即导航 —— 动画细节不出现在按钮里）
                  ├─ -components/sphere-transition  收起过渡的编排：状态 + 「动画跑完
                  │     （或兜底计时到点）才真正导航」，避免动画被打断时用户出不去
                  └─ -components/session-search-dialog  独立的会话搜索弹窗（只搜标题，
                        形态同命令面板但**不占 ⌘K**；⌘K 仍是全局命令面板）
                lib/ai/session-groups（会话的时间分组 / 相对时间口径，两个列表共用）
                lib/ai/panel-session（会话级记忆：面板开合状态 + 最大化前的来源 href +
                  「面板是被最大化带走的」标记 —— 回来时据此跳过面板重播的入场动画）
L2  状态        lib/ai/session-store（消息 / 状态 / 审批 / 落盘）
                lib/ai/session-boot（本次页面载入算不算「重新载入」）
                lib/store/preferences-store（本机偏好，按 app 隔离）
L3  驱动        lib/ai/chat.ts —— 一轮消息的编排（读偏好 → 挑工具 → 拼提示词 → 消费事件）
L4  运行时      lib/ai/runtime.ts —— **全仓唯一 import `ai`(Vercel AI SDK) 与 provider 的地方**
L5  工具        lib/ai/tools/{index,page-tools,data-tools,form-tools}.ts
L6  上下文      lib/ai/page-context.ts          当前页面（我在哪）
                lib/ai/page-context-registry.ts 页面声明的 AI 上下文（这页用什么接口）
                lib/ai/endpoint-specs.ts        接口参数索引（按需懒加载）
                lib/ai/form-bridge.ts           表单桥（两半注册）
                lib/ai/session-db.ts            会话持久化（IndexedDB，按 app 分区）
```

**两条硬边界**：

- **L4 不能被静态 import**：`chat.ts` 用 `await import('./runtime')` 首次发送时才加载它
  （SDK + 三个 provider 几百 KB，静态引入会进主 bundle）。`lib/ai/index.ts` 也**不要**
  导出 `runtime`。
- **L6 的接口索引是懒加载的**：`endpoint-specs.gen.ts` 有 363 KB，只允许 `import type`
  与动态 `import()` 引用它，别改成静态 import。

## 2. 一轮消息的数据流

```
用户按 Enter（AiComposer）
  └─ sendAiMessage(text, mode, images)            chat.ts
       ├─ 读偏好：aiPermission / aiAllowedTools / aiOutputLanguage / locale
       ├─ getAllowedTools(permission, allowed, { hasForms })      ← 权限过滤的唯一入口
       ├─ beginTurn(text, images)（用户消息写进 store，并立刻落盘）
       ├─ await import('./runtime')                                ← 懒加载
       ├─ toModelMessages(messages)                                ← 历史衰减 + 图片转 FilePart
       └─ streamAssistantTurn({ messages, mode, outputLocale, tools, toolContext })
            ├─ buildSystemPrompt(mode, outputLocale)               ← 每轮重算
            └─ streamText({ …, reasoning: resolveReasoning(model) })  ← 思考程度在这里落地
  └─ for await (event of stream) → StreamEventBatcher (~25ms 缓冲) → session-store.applyEvent
       └─ UI 随之平滑重渲染（PretextStreamText 段落隔离 + 滚动容器 RAF 调度，规避 Layout Thrashing）
  └─ endTurn() → 落盘

工具执行时（由 SDK 的 stopWhen 循环触发）
  └─ tool.execute(input, ctx)
       ctx = { queryClient, navigate, getPageContext, requestApproval, mode }
       └─ 需要审批的（commit / ask 模式下的表单）在这里 await ctx.requestApproval(...)
```

**几个要点**：

- **工具循环由 SDK 负责**（`stopWhen: isStepCount(...)`），我们不做调度；
- **审批发生在工具内部**，注册表那层不拦截 —— 否则模型不知道有写的能力，只会回答"我做不到"；
- **落盘只在三处**（发送后 / 一轮结束后 / 切删会话时），流式期间不写盘；
- **附件是消息 part，分两类**（`attachment` 带 `kind` 判别）：
  `kind: 'image'`（data URL）→ `toModelMessages` 转成 AI SDK v7 的 **`FilePart`**
  （`{ type: 'file', mediaType, filename, data: base64 }`；旧的 `ImagePart` 在 v7 已 deprecated，
  早期写入的 `image` part 读取时仍兼容）；
  `kind: 'text'`（md / txt，内容已由客户端解析）→ 用 `<file name="…">…</file>` 拼进**同一条**
  user 消息的文本。图片上限 4 MB、文本 256 KB、一次最多 4 个；发送前在**附件预览区**可见、
  可逐个删除；
- **思考程度与思考链流式展示**：输入时通过 AI SDK v7 的**顶层可移植参数** `reasoning`
  传递思考等级；生成时 `streamAssistantTurn` 监听 `fullStream` 的 `reasoning-delta`，
  派发 `{ type: 'reasoning' }` 流式事件，在 store 沉淀为 `{ type: 'reasoning', state: 'streaming' | 'done' }`
  part。UI 侧（`ai-conversation`）通过 Kumo `Collapsible` 折叠卡片实时呈现思考中脉冲与思考完成态，
  兼顾过程可见性与回答主文排版；
- **思考程度只有一条通路**：AI SDK v7 的**顶层可移植参数** `reasoning`，传不传由
  `resolveReasoning(model)` 决定（没声明档位、或选了 `provider-default` 就不传）。
  档位清单由模型自己声明（`reasoningLevels`），输入区的设置菜单只列这些档。
  **别改用 `providerOptions`** —— 两者不合并，那边一旦出现推理选项，顶层参数会被完全忽略。

## 3. 两个正交维度：权限与模式

这是整个设计里最容易搞错的地方，**任何时候都别把它们揉成一个开关**。

| | **权限** | **模式** |
|---|---|---|
| 存哪 | `aiPermission` + `aiAllowedTools` | `aiComposerMode` |
| 回答 | **能不能用**这个工具 | 用起来**要不要问** |
| 落点 | `getAllowedTools()` | 各工具里的 `ctx.mode` |
| 默认 | `readonly`（只读） | `ask`（询问） |

**权限三档本质是同一份勾选清单**（`resolveAllowedToolNames`）：`full` = 全选、
`readonly` = 预设勾了那几个只读工具、`custom` = 用户勾的。所以从预设档切到「自定义」时
要**继承当前档实际勾选的工具**。新增一档也只是加一条预设，别再写一条 `if` 分支。

**模式与工具的关系**（哪些工具受模式影响）：

| 工具 | `ask` | `auto` |
|---|---|---|
| `read` 类、`navigate_to` | 直接执行 | 直接执行 |
| `fill_form` | 先请用户确认 | 直接写 |
| `submit_form` | 一律确认 | `canSubmit()` 通过就直接提交 |
| `call_write_api` | 确认 | **仍然确认**（刻意不读 `ctx.mode`） |

`submit_form` 在 auto 下免确认的依据是**表单自己的 `canSubmit()`**（校验通过 + 确实有改动）——
那是「信息足够」最可靠的可判定表达，比让模型自述可信。`call_write_api` 没有这个待遇：
通用写接口**没有可预览的表单**，自动执行等于让模型直接改库。

## 4. 给模型的上下文从哪来

**四处，全部经函数计算**（不要在任何地方再拼一份）：

| 内容 | 出口 | 时机 |
|---|---|---|
| 系统提示词 | `buildSystemPrompt(mode, outputLocale)` | **每轮请求重算**（别缓存成常量） |
| 当前页面（我在哪） | `formatPageContext(getPageContext())`，注入提示词 | 每轮采集 |
| 导航清单（能去哪） | `collectNavigation(appId)` → `list_navigation` | 模型调用工具时 |
| 表单清单 | `listAiForms()` → `list_page_forms` | 模型调用工具时 |
| **页面用到的接口 + 参数明细** | `resolveAiPageContext(routePath)` + `findEndpointSpec()` → `get_page_context` | 模型调用工具时 |
| **用户 `@` 指定的位置** | `expandRouteRefs(text)`（`#/lib/ai/route-refs`），在 `toModelMessages` 里追加到 user 消息末尾 | 每轮请求 |

**`@` 引用**（`@user` / `@user:list` / `@user:1234`）的展开只做一件事：把用户打的那串
**追加**一段「模块 / 页面 / 路径」的说明（不替换原文，模型两边都能看到）。认不出来的 `@foo`
原样留着 —— 那可能是邮箱或别的工具的约定。模块键、详情路由登记在 `AI_ROUTE_REF_SPECS`，
名字 / 图标 / 关键词一律取自导航清单：**加模块看第 6 节**。
**只对 user 消息展开**（助手复述一句「你可以用 `@user`」不算引用；展开还要用当前 appId，
套到别的应用的历史消息上只会给出错的路径）。

**页面级 AI 上下文**是这套设计的核心：每个页面用 `useAiPageContext(Route.id, { description,
endpoints })` 声明「我是干什么的、我用了哪些接口」。动机是真实踩坑 —— 全局接口清单有
600+ 条且**不含参数**，模型只能猜；它曾用 `query: { uid }` 调 `GET /user/info`（要 `id`），
而用户详情页实际用的是 `GET /user` 的 `uid` 精确查询。**光看清单分不出这两者的差别**。

**参数明细不手写**：由 `scripts/gen-endpoint-specs.js` 从 `openapi.json` 生成
（已并入 `pnpm api`）。`/api` 前缀在消费侧归一化（同一份 openapi 里 450 条不带、18 条带）。

## 5. 上下文预算

改 AI 时如果觉得"变慢了/变贵了"，按这张表找：

| 项 | 量级 | 控制手段 |
|---|---|---|
| 系统提示词 | ~900 token | 保持精简；分节按需拼（暂未做） |
| 工具定义 | 10 个工具（无表单时 7 个） | `getAllowedTools(..., { hasForms: false })` 剔除表单组 |
| 单条工具结果 | **≤ 6000 字符** | `truncatePayload`，截断时**明确告知模型** |
| 历史里的工具结果 | **最近 3 轮完整**，更早占位 | `FULL_TOOL_RESULT_TURNS`（`toModelMessages`） |
| 接口参数索引 | 363 KB / gzip 23.6 KB | **懒加载**，不进主 bundle |
| 导航清单 | ~10 条 | `collectNavigation` 有缓存（键 = appId + 语言） |

**历史衰减**是收益最大的一条：工具结果会跟着后面**每一轮**重发，不衰减的话第 10 轮时
上下文里能塞几十 K token 的历史数据。衰减后是**常数级**。注意保留的是「用户说过的话 +
助手文本 + 工具调用本身（名字与入参）」—— 模型仍知道"那一步做了什么"，只是看不到返回；
占位里必须写明「需要请重新调用」，否则模型会把占位当成"结果是空的"。

## 6. 扩展点：加东西改哪里

**加一个工具**

1. 在 `tools/{page,data,form}-tools.ts` 里写 `AiToolDefinition`（`name` / `description` /
   `inputSchema` / `access` / **`group`** / `execute`）；
2. 加进 `tools/index.ts` 的 `AI_TOOLS`；
3. 需要确认的话在 `execute` 里读 `ctx.mode` 决定要不要 `await ctx.requestApproval(...)`；
4. 补 7 语言的工具名（`profile.settings.aiToolNames.<name>`）。

**别做**：在 UI 或运行时里另维护一份工具名单；把过滤散到工具内部（权限过滤只在
`getAllowedTools` 一处）。

**给一个页面接入 AI 上下文**

```tsx
useAiPageContext(Route.id, {
  description: '这一页是干什么的（给模型看的一句话）',
  entities: ['页面上出现的领域名词'],
  endpoints: [{ method: 'GET', path: '/user', purpose: '在本页里它用来做什么' }],
})
```

- **键必须用 `Route.id`**，不要手写路由字符串（重命名后会**静默失配**）；
- **`path` 写 openapi 里的原始路径**，带不带 `/api` 都查得到；
- **参数明细不要写**，由索引自动补。

**加一个可被 `@` 引用的模块**

在 `#/lib/ai/route-refs` 的 `AI_ROUTE_REF_SPECS` 里加一项：模块键（英文小写，用户要打的那个）、
模块目录页在**导航里的相对路径**、以及它下面可引用的页面（键 + 导航路径）；
有详情页的话再补 `record`（`param` / `template` / 名字）。**名字、图标、匹配关键词都从导航清单取**，
这里只登记键 —— 所以不要在这里抄一遍模块名，也不要在渲染处另拼一份菜单。

**别做**：把 `@` 的模块名单写进组件里；在导航之外再维护一份"有哪些模块"的清单
（导航里没有的模块，`listRouteRefItems` 会整块跳过，这是刻意的）。

**加一个偏好设置**

`preferences-store.ts` 有**固定 8 处**要改：类型常量 / interface 字段 / action /
持久化名单 / 初始值 / setter / `partialize` / `merge`。再补设置页的 `SettingRow` 与 7 语言文案。

**加一档权限**

只改 `resolveAllowedToolNames` 里加一条预设。界面上多一项 `Tabs`。

## 7. 已知的坑

**这些全是踩过的，别重犯：**

1. **提示词里不要复述权限。** 权限由**实际交给模型的工具清单**精确表达。提示词再写一句
   "你只能读"，一旦权限改了而提示词忘了改，模型会**放着给它的工具不用**、反过来告诉用户
   "我没权限" —— 真实发生过：`navigate_to` 已放进只读档，模型却照着旧提示词回答
   「我只有读取权限，不能执行页面跳转」。
2. **页面上下文的键用 `Route.id`。** 手写字符串会在某次重命名后静默失配，然后 AI 又不声不响
   回去猜接口。
3. **`getPageContext()` 整体不要缓存**（它含 `title`，标题随页面异步加载变化）；
   但 `matchNavLabel` / `collectNavigation` **要**缓存（前者是每次发消息时最贵的一步）。
4. **`matchNavLabel` 刻意不做权限过滤**：它反查"用户当前在哪"，与 AI 能不能去哪无关。
5. **`offsetX/offsetY` 不能用于跟随指针的高亮**：它们是相对**事件目标**的，指针移到子元素
   （消息、卡片）上时会突然变成那些元素的局部坐标，高亮乱跳。用容器 rect 算。
6. **CSS 的 `mask` 作用于整个元素**：想只裁一层背景做不到，必须拆成独立的一层元素。
7. **关掉 AI 功能时要收起已打开的面板**：否则它留在屏幕上而开关按钮已消失，用户既关不掉
   也不知道它为什么还在。
8. **工具卡片这类浮在装饰背景上的元素要有自己的底色**，否则点阵从背后透出来。
9. **`call_write_api` 两个模式都要确认**，别"顺手统一"成读 `ctx.mode`。

---

# 附：面板与接入层的完整约定

> 以下由 `AGENTS.md` §9 / §10 搬入（原文保留）。那份文件只留「不知道就会写错」的契约，
> **细节与实现约定看这里**。

## 9. AI 面板：Split View / Float (Ask AI)

- **入口与范围**：顶栏 `#/components/header-actions` 的「Ask AI」按钮**只在 `$appId` 外壳
  （`AppHeader`）显示**（`HeaderActions.showAskAi` 默认 `false`）。面板本体是 `#/components/ai-panel`
  （`AiPanel`，受控 `open` / `onClose`），展开状态由 `AppShell` 持有、**刻意不持久化**。
- **按钮是开关（toggle），但折叠态优先展开**：点一次开、再点一次关 —— `AppShell` 的
  `handleToggleAskAi` 负责分流（关着 → 打开完整面板；开着且 Float 折叠 → 展开；
  开着且展开 → 关闭，见下面 Float 那一条），并把 `isAskAiOpen` 透给
  `HeaderActions`（**只画 `aria-expanded`，展开态不加任何高亮** —— 面板本身已经占着
  屏幕，按钮再亮一块浅底只是噪音；`Ask AI` 与相邻的 `Support`、账号菜单保持同一副 ghost 皮）。
  **状态只有 `AppShell` 一份**（展开 + Float 折叠都是），按钮组件不自己存，避免与真值分叉。
- **挂载点是「与 Sidebar 同级」的那一列**：它渲染在 `Sidebar.Provider` 之内、内容列**之后**
  （`<main>` 的兄弟节点，不是内容区的一部分）。因此路由切换、`<Outlet />` 重渲染都与它无关，
  `main` 的 `data-shell-content` 语义（404 铺满等）也不需要为它加特例。
- **两种打开方式**（`admin.preferences:<appId>` 的 `aiPanelMode`，设置页 `/settings/AI`）：
  - **Split View**（`split`，默认）：外壳级挤压式分屏列 —— 几何是 `SHELL_PANEL_FRAME`
    （`sticky top-0 h-svh z-20`，与 `styles.css` 给侧边栏的那套完全一致，视觉上与侧边栏一个等级），
    内部头行固定 `h-[58px]` 与 `AppHeader` 同高，两条底边线连成一条。宽度落
    `admin.shell-ui.aiPanelWidth`（默认 400、300–720，拖拽 + 方向键，与详情分屏同一套
    `#/lib/use-panel-resize`，`onChange` 即时值 / `onCommit` 落盘）；
    **进场 / 退场是「宽度 0 ↔ panelWidth」的过渡**（`md:motion-safe:transition-[width]`，
    200ms）—— 面板贴行尾，宽度一变内容列就被推开（「推动页面」），内层在过渡窗口内**钉住
    最终宽度**（`splitAnimating`）因而读起来是「从行尾侧滑进来」而不是被挤着重排。
    四条不能省的约定：① 外框必须 `overflow-hidden`（裁掉钉宽的内层；同时把 flex item 的
    `min-width: auto` 归零，宽度才真能收到 0）；② 退场要**留在树上等动画跑完**（三态
    `splitMounted` / `splitExpanded` / `splitAnimating`，卸载计时与 CSS 时长同源
    `SPLIT_SLIDE_MS`）；③ 拖拽宽度时**摘掉过渡**（`!resizing`），否则每帧都落在 200ms
    过渡上面板不跟手；④ 移动端（覆盖式、无宽度可动）与**不能播动画时**
    （`useMotionEnabled()` 为假：关掉 设置 → 外观 →「界面动效」，或系统
    `prefers-reduced-motion: reduce`；此时连过渡类一起摘掉）都直接切到位，不走进过渡窗口；
    ⑤ **从最大化返回时这一次入场不播** —— 面板一直开着，
    只是宿主 `AppShell` 在 `/sphere` 期间被卸载过，再滑入一次会读成「被关掉又打开」
    （外壳传 `skipEnterAnimation`，这里初值直接落在展开位，见 `AiPanelProps`）。
    退场期间挂 `aria-hidden` + `inert`（读屏与键盘先「消失」）；
  - **Float**（`float`）：`fixed` 在**行尾侧下角**（`md:end-4` / `md:bottom-4`，RTL 自动换边不压住侧边栏）、
    浮在内容之上、不挤压布局，**从页面底部升起**（入场动画 = styles.css 的
    `[data-ai-float='true']` + `@keyframes ai-float-enter`，整体包在
    `prefers-reduced-motion: no-preference` 里；只有入场没有退场；**从最大化返回、
    或关掉「界面动效」时干脆不带 `data-ai-float`**，那一次不播
    —— 前者是面板并没有被关掉过，后者是用户明确要求没有过渡）。
    ⚠️ **`md:top-auto` 不能省**：`inset-0`（移动端整屏）写进去的 `top: 0` 不会被
    `md:bottom-4` 顶掉 —— top / bottom / height 同时指定时浏览器忽略的是 bottom，
    于是浮窗会贴到**视口顶端**（曾经就是这个 bug）。
  - **Float 可折叠成一条窄条**：头行里「关闭」左侧那颗按钮（`CaretDown` 收起 / `CaretUp`
    展开，`aria-expanded` 跟着走）把浮窗压成「只有头行」的一条。这条过渡用
    **`motion/react`**（`#/components/ai-panel`）：
    - **只动外框的宽高**（折叠终点 = `AI_FLOAT_MIN_WIDTH` × 头行高 `AI_PANEL_HEADER_HEIGHT`，
      展开终点 = `floatSize`）；内层那一格的宽高在变形期间被**钉在展开尺寸**上，
      由 `overflow-hidden` 裁切 —— 文字一次都不用重新换行，每帧重排的只有外框。
      钉住之后动画结束才解除，折叠态才真正只剩头行那一条；
    - **内容切换发生在动画结束时**（`isDeforming`），不是一变就切：否则动画没有内容可收缩；
    - **只有变形带时长**，拖拽改尺寸走同一条 `animate` 但 `duration: 0`，否则浮窗会追着光标跑；
    - 不能播动画时直接切（`useMotionEnabled()` 为假，见 ui-and-styling.md「动效开关」）；
    - **折叠态三个手柄一个都不挂**（不只是"不画"）：拖拽会在 `onCommit` 落盘，
      折叠期间的尺寸不该污染存档；`aiFloatWidth` / `aiFloatHeight` 里始终留着上次展开的尺寸，
      展开即原样恢复（头行右侧的会话选择器也在这个阶段才换成「AI 头像 + 当前会话标题」，
      标题与展开时同源：`#/components/ai-session-picker` 的 `useActiveSessionTitle`；
      **头像不加圆形底色 / 描边**，与消息行里的那个一致）。
    **按钮只在 Float 出现**：Split 不把回调转给头行（靠回调有无，而不是在组件里判 mode）；
    移动端浮窗是整屏、折叠不成立，按钮也不挂。
  - **折叠状态的真值在 `AppShell`**（与面板展开状态同一层，都**不持久化**）：因为顶栏那颗
    「Ask AI」按钮要按它分流 —— **关着**时打开（总是完整面板）、**开着且折叠**时这一下是
    **展开**（用户点它想看的就是对话，不能把窄条关掉让他再点一次）、**开着且展开**时才是
    关闭。Split 没有折叠态，分流条件里要带上 `aiPanelMode === 'float'`。
  - **Float 可拖拽改尺寸**：顶边改高度、行首边改宽度、行首上角同时改两者
    （`#/lib/use-panel-resize` 的 `useFloatPanelResize`，与分屏面板的 `usePanelResize`
    分工：那个只有宽度、锚点在对侧边）。尺寸落 `admin.shell-ui.aiFloatWidth` /
    `aiFloatHeight`（默认 380×560，宽 300–720、高 320–900）。**高度上限分两层**：
    静态上限 + 视口上限（`100svh − AI_FLOAT_VIEWPORT_MARGIN`，矮窗口里只有后者能拦住它）——
    CSS 的 `max-height` 与 hook 的拖拽上限必须用同一个常量，否则拖到顶时面板会先停住、
    再被 CSS 悄悄压小。拖柄的键盘语义、`data-panel-resizing` 光标值与分屏面板一致，
    但**视觉刻意相反**：浮窗的三个手柄不画任何常驻 / hover 线、角上也不放直角图标
    ——「多出一笔」会干扰浮窗边缘的阅读，提示只在鼠标样式（`ns-resize` / `ew-resize` /
    对角）上，只有键盘 `focus-visible` 留一条细线（否则 Tab 过来不知道在哪个手柄）。
    ⚠️ **拖拽方向要按书写方向翻**：手柄在面板的行首边，`side` 传的是**面板**的物理侧
    （`isRtl ? 'left' : 'right'`，与 `usePanelResize` 同一个约定），
    宽度增量是 `side === 'left' ? +dx : -dx` —— 曾经按"忽略书写方向"算，RTL 下要反着拖。
  - 移动端两者都是**整屏**（`inset-0`）。Float 刻意**不做贴底卡片**：手机屏幕本来就小，
    卡片式再砍一截高度、左右各留 12px，能看内容的地方所剩无几；而且桌面端那两个形态的
    差别（挤压内容 vs 浮在内容上）在手机上本来就读不出来，留下的只有"更小的可用面积"。
    因此 Float 的位置 / 尺寸 / 圆角 / 边框 / 阴影类一律只在 `md:` 以上生效，
    **不需要为它做 JS 视口判断**（宽高由 `motion` 写内联样式，移动端整屏不给像素值；
    拖柄也只在桌面端挂）。
- **面板几何与手柄共用** `#/components/side-panel`（`CONTENT_PANEL_FRAME` 属内容区 /
  `SHELL_PANEL_FRAME` 属外壳）；**改面板高度、手柄手感只动这里**，不要在各自组件里再写一份。
  浮窗（可拖两个方向）的手柄是 `ai-panel` 内部的 `AiFloatResizeHandle`（视觉与键盘语义
  照抄 `SidePanelResizeHandle`），拖拽逻辑同上那一个 lib 文件 —— **不要**给浮窗另建一套。
- **底部输入区**是 `#/components/ai-composer` 的 `AiComposer`（Kumo `Textarea` 的 `autoResize` +
  `minRows=2` / `maxRows=8`，最多 8 行、再多在框内滚动）。面板骨架因此是三段 flex 列 ——
  头行与输入区 `shrink-0`、中间内容区 `min-h-0 flex-1 overflow-y-auto`：**输入框不要放进滚动容器**，
  否则内容一长就被顶出视口。外观（圆角框 / 底色 / 聚焦环）**只画在外层框上**（`bg-kumo-control` +
  `ring-1` + `has-[textarea:focus]:ring-kumo-brand/50`），内层 `Textarea` 的底色 / 圆角 / padding /
  自身 ring 被逐项清零 —— **想改外观改外层，不要把 ring 加回 textarea**；清零用方向后缀
  （`px-4 pt-4 pb-0`）而不是 `p-4`，免得与 Kumo 的 `py-2` 拼出多余的上下留白。
  键盘约定：`Enter` 发送、`Shift + Enter` 换行、**输入法组字中的回车要让开**
  （`event.nativeEvent.isComposing`）；发送后清空、运行中禁用提交（见第 10 节）。
  工具行分两段：**行首的「+」（简单 AI 动作菜单）** + **行尾的设置按钮与提交位**。
  **面板与全屏对话页共用这一个 `AiComposer`**，只靠 `onConfigurePermissions` 区分。
  两块浮层都**贴着整块输入区上沿**浮出来（`anchor={composerRef}` + `w-[var(--anchor-width)]`）：
  - **行首的「+」菜单**（`PlusIcon`，模式 pill 左边；两处都给，按钮样式 `secondary`）：
    包含三项跟本轮对话直接相关的小动作 —— **添加照片和文件**、**引用位置**（打一个 `@` 唤起命令面板）、
    **新对话**（`startNewSession()`，流式中禁用）。
    长度刻意压住：真正会长的那份清单（模块 / 页面 / 记录）走输入框里的 `@`，
    模块再多也不会把这里撑爆。
    **只收两类附件**：
    **图片**以 data URL 存进会话的 `attachment` part（`kind: 'image'`），发送时转成 v7 的 `FilePart`；
    **文本文件**（md / txt）**在客户端就解析**（`File.text()`）成 `kind: 'text'` 的 part，发送时用
    `<file name="…">` 包成文本块拼进 user 消息 —— 这样任何厂商都能读，不依赖它对文档格式的支持。
    其余类型**直接说明支持哪些**，而不是收下再让厂商报错。上限：图片 4 MB、文本 256 KB
    （文本要吃上下文，所以严格得多），**一次最多 4 个 —— 图片与文本文件共用这一个额度**
    （`AI_MAX_ATTACHMENTS` 数的是附件总数，不给图片另开一份）。提醒**一律走 toast**
    （`useKumoToastManager` + `notifyAttachment`，输入区里**不再常驻提示文字**），
    且**只在真被拦下时弹**：「收不下」（太大 / 类型不支持 / **超过 4 个被截掉**）`warning`、
    读不出来 `error`；一次手势只弹一条（`warning` 优先）。**「刚好加到满」不弹** ——
    什么都没丢，不要拿一条提醒去打扰一次成功的操作。
    **⚠️ 数量闸必须在 `setAttachments` 之外算**：曾把 `setAttachmentError(limit)` 写在
    updater 里，紧接着被末尾那句「没有拦截原因」覆盖，于是那条提示从来没出现过，
    用户只觉得多选的文件凭空少了几个 —— 有副作用的 updater 别再写第二个。
    选完或直接粘贴（`onPaste` 挂在外层框上、事件从 textarea 冒泡上来）都会进**附件预览区**：
    图片是缩略图、文本文件是卡片（文件名 + 体积），**每个附件右上角都有删除按钮** ——
    发出去之前随时能撤。模型没声明 `supportsVision` 时该项**禁用**（粘贴进来的图片也不收，
    文本文件不受影响），原因走原生 `title`（悬停可见、不占版面）—— 入口本身不藏：突然消失比
    灰着更困惑。
    **⚠️ 文件选择器 `<input>` 必须挂在菜单外面**（根节点下常驻）：放进 `DropdownMenu.Content`
    会随菜单关闭一起卸载，而点菜单项正是「先关菜单、再开系统文件选择器」—— 元素没了，选完文件
    回来的 `change` 就没人接，表现是「选了一张图但附件区什么都没出现」（踩过这个坑）。
  - **`@` 引用面板**（命令面板形态，用 Kumo `DropdownMenu` 拼，浮动在输入框上方）：在输入框里打 `@`
    或点「+」里的「引用位置」都会浮出这块面板，可以引用「哪个模块 / 哪个页面 / 哪一条记录」：
    `@user` / `@user:list` / `@user:1234`。面板按 `kind` 分段展示（添加 → 模块 → 页面 → 记录），
    行内排版是「名字 + 灰色语法 + 右侧说明 + 选中项 Tab 提示」，找东西看名字比看语法快。
    行的内容来自 `#/lib/ai/route-refs`（见下），**渲染处不另加名单**。键盘：`↑↓` 换行、`Enter` / `Tab` 选中、`Esc` 收起 ——
    **必须排在「Enter 发送」之前**，否则选中那一下会顺手把消息发出去。
    **⚠️ 这块面板的难点全在「焦点必须一直留在输入框里」**（它是输入框文字驱动的：打 `@` 出、
    继续打字过滤），所以下面三个参数**缺一不可**：
    `modal={false}`（菜单默认是模态的，会铺一层遮罩 + 锁页面滚动，输入框就被挡在外面了）、
    `highlightItemOnHover={false}`（Base UI 菜单在鼠标扫过时会 focus 那一项，焦点一走输入框
    就收不到按键了）、`DropdownMenu.Content` 上的 `onFocus` 把 Base UI 送进菜单的焦点按回来
    （那次聚焦排在**下一帧**，只在 `useLayoutEffect` 里抢一次兜不住）。行高亮因此由我们自己的
    `mentionActive` 画（`bg-kumo-tint`，与 Kumo 给 `data-highlighted` 的 `bg-kumo-overlay` 同色阶）。
    **⚠️ 记录模板那一行（`@user:`）插完要压住面板**（`recordTypingRef`）：文本里还留着 `@user:`，
    不压住的话每敲一个数字菜单都会弹回来；反过来，手打 `@user:1234` 时按普通文案匹配一条都命不中，
    所以过滤器对「带冒号但一条都没匹配上」的情况特意保留了该模块的**记录行**；
  - **行尾设置按钮**（滑杆 `SlidersHorizontalIcon`，`size="sm"` = `compactSize.sm` 26px，
    与提交位同档才齐平；`models.length > 0 || onConfigurePermissions` 时才渲染）：
    **选择模型**（子菜单 `DropdownMenu.Sub` / `.SubTrigger` / `.SubContent`，列表来自
    `#/lib/store/ai-store` 的 `models`，点一项 `setActiveModel`；触发项是**一行**：标签在左、
    当前模型名在右；一个模型都没配时换成一条「去设置」的引导项）
    + **思考程度**（子菜单，只列该模型声明的 `reasoningLevels`，档位名复用
    `common:profile.settings.aiReasoningLevels`）+ **配置权限**（齿轮 `GearSixIcon`，
    只有面板给 —— 权限视图是「整块替换面板内容」的，全屏对话页没有承载它的地方）；
  - **提交位**：发送 / 停止。
  `ms-auto` 归行尾组**最左边**那一颗（有设置按钮时是它，否则是提交位）—— 两颗都挂会把剩余
  空隙平分、按钮跑到中间（全屏页踩过一次）。Kumo 的 `SubTrigger` 自带行尾右向箭头，
  不要再自绘；子菜单图标也别用 `icon` prop（写死物理方向的 `mr-2`）。
  行尾的 `ms-auto` 挂在**这颗**按钮上（没有入口时才归发送 / 停止那颗）—— 自动外边距挂到发送上，
  空白会落在两者之间，权限按钮就被推回左侧去了；挂在这颗，「权限 + 发送」才作为一组贴在行尾。
  **输入区每次挂载即聚焦**（`useEffect` + `focus({ preventScroll: true })`）—— 面板打开、
  浮窗从折叠态展开都会让它重新挂载，于是「打开就能直接打字」；`preventScroll` 是必需的，
  否则 Split 进场（宽度还在从 0 长出来、输入框被裁在外侧）会触发页面横向滚动的补偿；
  **移动端不抢焦点**（软键盘会立刻挡住刚打开的对话），这个判断只在挂载时取一次。
- **图标按钮一律带 `Tooltip`**：面板头行的折叠 / 关闭（`#/components/ai-panel`）、输入区的
  发送 / 停止 / 模式（`#/components/ai-composer`）、顶栏的 `Ask AI`（`#/components/header-actions`）。
  两个写法上的硬要求：① **必须 `render={<Button/>}`** —— Kumo 的 `Tooltip` 自己就是 trigger，
  把按钮放进 children 会得到嵌套 `<button>`（见 `#/components/settings-card` 的同一条坑）；
  ② 补 `className="cursor-pointer"`，因为 Kumo 会给 trigger 加一个 `cursor-default`。
  已知边界：`disabled` 的按钮收不到指针事件，发送按钮在输入为空时不会弹 tooltip。
- **什么时候开一段新会话**（设置 → AI 的「新会话时机」）：`admin.preferences:<appId>.aiSessionMode`
  = `continue`（默认，永远续上一个）/ `new`（**每份文档一段新会话**；上一段仍在会话列表里）。
  判据是 `#/lib/ai/session-boot` 的 `isDocumentReload()`：`sessionStorage` 里放一个标记
  （`admin.ai.sessionBooted`，按标签页隔离），整页卸载时在 `pagehide` 里删掉它 ——
  **注意 sessionStorage 本身能活过刷新**，所以「刷新即清空」是这一步主动做的，不是它自带的；
  `persisted === true`（bfcache 冻结）不算卸载，标记留着、会话不断。
  唯一生效点是 `loadHistory({ fresh: true })`（`#/lib/ai/session-store`，`AiConversation`
  传 `sessionMode === 'new' && isDocumentReload()`）：只加载会话列表、不恢复上次那段。
  **面板不参与这件事**（旧实现在 `open` 上升沿用 layout effect 清内存会话，那与「同一页面里
  接着上一段说」相矛盾，已删）：面板关掉再打开是同一份文档，当前会话连同流式增量原样留着，
  而且那时 `loadHistory` 本来就会因「同一个 app 已加载」早退。
  后果：设置改完要等**下一次刷新**才见效（判据每份文档只算一次）。
- **输入模式切换**在输入框左下角（`AiComposer` 里的 Kumo `DropdownMenu`）：`ask`（询问，默认）/
  `auto`（自动），落在 `admin.preferences:<appId>.aiComposerMode`（`#/lib/store` 的
  `AiComposerMode` / `isAiComposerMode` / `DEFAULT_AI_COMPOSER_MODE`；**加新枚举时
  `partialize` 与 `merge` 两处都要补**）。
  **它只管「用起来要不要问」，不再决定「有哪些工具可用」**（那归 AI 权限，见下一条）：
  `ask` 下与"替用户做主"有关的动作先过审批 —— `fill_form` 要确认、`submit_form` 一律确认；
  `auto` 下 `fill_form` 直接写、`submit_form` 只要表单 `canSubmit()` 通过就直接提交。
  三条坑（细节见代码注释）：① 菜单**必须 `side="top"`**；
  ② 选中标记不要用 `RadioItemIndicator`（写死 `ml-auto`，RTL 与 `ms-auto` 打架），
  自己画 `CheckIcon` + `ms-auto`；③ 菜单项图标别用 `icon` prop（写死 `mr-2`），
  图标作 children 首节点 + `gap-2`。模式图标跟着当前模式走（`ask` = `PencilLineIcon`、
  `auto` = `CaretDoubleRightIcon`），映射只在 `COMPOSER_MODE_OPTIONS.icon` 一处；
  右向双箭头标 `flipIcon` 走 `rtl-flip`。两个模式名**必须本地化**（中文「询问 / 自动」）。
  菜单项是**两行**（模式名 + 一句说明，`modeAskHint` / `modeAutoHint`），说清它管的是
  「表单要不要确认」——只写「询问 / 自动」没人知道指的是什么；因此 `Content` 用 `w-64`，
  且项上要 `items-start` 顶掉 Kumo 基类的 `items-center`（两行文字时图标 / 勾跟首行对齐）。
- **AI 权限**（`aiPermission` + `aiAllowedTools`，**默认 `readonly`**，设置 → AI）：**能用哪些工具**
  只看这里。三档 `full` / `readonly` / `custom`，自定义时按 `aiAllowedTools` 逐项放行；
  `getAllowedTools(permission, customTools)` 是**唯一**过滤点。它与模式**正交** ——
  权限回答"能不能用"、模式回答"用起来要不要问"，**别再把两者揉成一个开关**（早先
  `getToolsForMode` 拿模式当权限用，于是"询问模式"连表都填不了）。工具的分组
  （`AiToolDefinition.group`：页面 / 数据 / 表单）**由工具自己声明**，设置页的清单从
  `AI_TOOLS` 派生、不另抄名单（加工具只改工具文件）。**默认只读是刻意的**：AI 默认只能看，
  要它动数据得用户自己到设置里开。
  配置界面**只有一份**：`#/components/ai-permission-config` 的 `AiPermissionConfig`（受控：
  三档 + **始终列出**的工具清单，清单从 `AI_TOOLS` 派生）。preset 档的勾选**按档位派生**
  （只读 = `read` 类、完全访问 = 全部）且整组 `disabled`，只有 `custom` 能勾 ——
  切档时清单不闪不跳，用户能直接对比两档差在哪；切到 `custom` 时把这份派生集合继承成
  `allowedTools`，于是是「接着改」而不是「从零勾」。设置页拿它**即时写 store**；
  AI 面板的权限视图（`ai-panel` 里的 `AiPermissionView`）拿它写**本地草稿**，点「保存」才落
  store —— 权限是影响之后每一次对话的全局项，「误点一下就生效」比「多点一下保存」糟得多。
  权限视图是**整块替换**面板内容（对话区用 `hidden` 留在树上，别卸载：卸载会丢滚动位置、
  还会让 `AiConversationScroller` 重跑一次会话加载），头行仍是同一个 `h-[58px]`，
  左侧换成「返回 + 标题」，动作区只留关闭。
- 文案：面板 / 输入区 / 会话区都用 `ai` 命名空间（面板 `title` / `close` / `resize`（分屏拖柄）/
  `resizeFloat` / `resizeFloatWidth` / `resizeFloatHeight`（浮窗三个拖柄）；输入区
  `inputLabel` / `inputPlaceholder` / `send` / `mode*` / `aiSettings`（行尾设置按钮）/
  `compose` / `addPhotoAndFiles` / `aiActions` / `actionMention*` / `actionNewChatDesc` /
  `visionUnsupported`（行首「+」动作菜单）/
  `selectModel` / `modelNone` / `modelEmpty`（模型子菜单与未配置引导）/
  `reasoning`（思考程度）+ `attachmentPreview` / `attachmentRemove` / `attachmentTooLarge`
  （带 `{{size}}` 插值）/ `attachmentReadFailed` / `attachmentLimit` / `attachmentUnsupported`
  （附件预览卡片与 toast 提醒）/ `promptMentionAttachDesc` / `promptMentionHint` / `promptMentionNoMatch`
  （带 `{{query}}` 插值，`@` 引用面板）/ `mentionSection*`（添加 / 模块 / 页面 / 记录 四段标题）/
  `routeRefModuleDesc` / `routeRefRecordDesc`（模块与记录的右侧说明；模块与页面的名字复用 `common:nav.*`，
  详情页面的名字是 `common:nav.userDetail`）/
  `configurePermissions*`（配置权限那一项）/ `permissions*`（面板权限视图：标题 / 返回 / 保存 / 未保存提示；
  配置体自身的档位与工具名复用 `common:profile.settings.aiPermission*`）；会话区 `greetings.*` / `greetingPrompt` /
  `thinking` / `tool*` / `tools.*`），7 语言齐。设置项在 `common:profile.settings` 下（卡片标题复用 `general`）：
  `aiDisplayMode` / `aiDisplayModeHint` / `aiModes.*` / `aiModelReasoning*` /
  `aiModelSupportsVision*` / `aiReasoningLevels.*`（思考程度档位名只有这一份，输入区也复用）——
  **必须挂 `profile.settings` 下**
  （曾误挂到 `profile` 顶层，各语言一律回落成中文默认值）。「Ask AI」是**产品入口名**、
  各语言保留原文；而 `aiModes.split` / `aiModes.float` 是**形态名、必须本地化**。
- **工具调用卡片默认隐藏**（`aiShowToolCalls`，默认 `false`）：普通用户只关心回答内容，
  不关心中间调了哪个工具。关掉时 `AssistantPart` 对工具类 part 直接 `return null`。
  **两件事刻意不受它影响**：**审批卡**（写操作的确认是必须的交互，在 `AiConversation` 里
  独立渲染，不是可以隐藏的"输出"）、以及**「正在思考…」**（工具执行期间 `status` 仍是
  `streaming`，所以看不到工具卡片也不会显得卡死）。
  **打开后每张卡片可点击展开**：用 Kumo `Collapsible` **非受控**（会话里可能有几十条卡片，
  不该各挂一个 React state），展开显示**参数 / 错误 / 结果**三段 —— 尤其是失败时，
  不展开就完全不知道错在哪。输出用 `JSON.stringify(…, null, 2)` 缩进展示（给人排查用）
  并加 `max-h-48` 滚动（工具可能返回整页 JSON）；箭头用 `group-aria-expanded:rotate-180`
  跟着转，**比去猜 Base UI 的 data 属性名可靠**（`Trigger` 自己渲染成 button + `aria-expanded`）。
- **助手头像**（`bot-avatars` 包；设置 → AI 选形状、**默认 `clover`**）：助手消息左侧一枚（28px，
  正在生成的那条 `state="working"`、其余 `default`）。**「正在思考…」直接内聚在消息体内部渲染**
  （头像在左、思考提示在右），不再在消息列表底部用单独的 20px 小头像重复渲染第二遍（彻底解决同时出现两个头像：
  一个占着空白框、另一个在底下转圈的问题）。
  四点约定：**`theme` 必须由我们传** —— 包的 `auto` 读的是祖先 `data-theme` 属性或
  `dark`/`light` class，而本项目是 `data-mode` 驱动，交给它在「跟随系统」那档会读错；
  默认 `interactive={false}`（指针跟随与点击跳跳在面板里不表达任何意图，白多监听器）；
  设置页用**网格**而不是 `Select`（选头像本来就是看形状的事，一列 `clover`/`pebble`/`puddle`
  谁也挑不出来），且**只有选中的那个在动**（一屏 18 个 canvas 同时跑动画是白烧 CPU，
  而"谁被选中"正好用"只有它在动"表达）；形状的值列表在 `#/lib/store` 里**自己维护**
  （store 是数据层，不依赖渲染库），拼写正确性由 `<BotAvatar type={…}>` 那一行保证 ——
  写错一个字母就编译不过。
  体积：独立 chunk 51.6 kB（gzip 22 kB），被 AppShell 与设置页共享，进应用即加载
  （刻意不懒加载：canvas 头像延迟到位会闪）。
- **输出方式**（`aiOutputMode`，默认 `wait`，设置 → AI）：`wait` 下流式期间正文文字不渲染，
  消息体内持续展示「正在思考…」，这一轮结束再一次性呈现全文；`stream` 模式下一旦有非空文字到达，
  「正在思考…」便平滑让位给流式正文。**无可见内容且未处于思考状态的消息（如异常中断）自动不渲染**，
  绝不留下一个占据空白的空头像。
- **滚动**（`aiAutoScroll`，默认开，设置 → AI）：回答时自动贴底；**手动往上翻会临时暂停**
  （滚回底部自动恢复）。关键区分：**设置项管「默认跟不跟」，暂停是运行时状态、管「此刻让不让」**
  —— 两者别混成一个。没贴底时，滚动区下缘**居中浮出「回到底部」按钮**（贴底时不出现，
  否则既没用又盖住最后一行内容）；按钮层 `pointer-events-none` + 按钮自身 `pointer-events-auto`，
  免得那层透明遮罩拦住消息里的链接。回滚尊重 `prefers-reduced-motion`（reduce 下不播平滑动画）。
- **新对话的空态**：一枚**放大**的头像（96px，与会话里同一个形状 —— 于是"刚打开"和
  "正在聊"看到的是同一个角色）+ 一句**按时段变**的问候（`greetings.morning/afternoon/evening`
  + `greetingPrompt`）。两个细节：时段按**用户选的时区**（`useTimezone()` 的 `iana`）判断，
  不是本机时区 —— 这个后台里「现在几点」处处以那个设置为准；`Intl` 必须用
  `hourCycle: 'h23'`（`hour12: false` 在午夜会给出 `"24"`）。问候语加粗用 `font-semibold`
  （本仓库禁用 `font-bold`）。
- **AI 进行中的页面级反馈**（`#/components/ai-activity-glow`）：视口四周向内发光的呼吸光晕，
  `status === 'streaming'` 或等审批时出现。**两层都用 `border-beam` 的 Pulse 家族
  `pulse-inner`**（「收在边界内呼吸」）：运行态是包在**一个 `fixed inset-0`、不带子元素**的元素上
  （`borderRadius={0}`、`strength={0.7}`、`glowSize={4}` + 下面两处补偿），设置页那张预览
  （`AiActivityGlowPreview`）是同一档包住缩略图（`borderRadius={8}`、`glowSize` 默认 1、
  `active={showGlow}` 演「基线 → 亮起」）。**按尺寸要补的两处**（预览不补）：
  ① `--pulse-glow-boost: 4`（`GLOW_VIEWPORT_BOOST`）—— `pulse-inner` 的光是十几个
  `radial-gradient` 斑块拼的，**尺寸写死 px**（15~216px，位置才是百分比），按 288px 的卡片调的：
  满视口下它们退化成**几个孤立的彩点**、其余边缘全黑，这是「深色模式看不见光晕」的主因。
  该变量是包留给消费方的缩放钩子（源码注释有、README 没写）；② `glowTuning()` 提亮深色档
  （`brightness` 0.75 → 1.4、`saturation` 1.3）：同一个 alpha 压白底是 `rgb(255,198,212)`
  （亮度 211/255），压近黑底只有 `rgb(86,24,42)`（38/255）—— 而满视口下挑大梁的正是这两层宽光
  （深色档的 1.54 只补了那圈 1px 描边）。
  为什么不取另外几档：`md` / `sm` / `line` 是绕边框跑的旋转光带，像多了一条边框；
  `pulse-outside` 的光晕长在元素**外面**，而运行态的元素就是满视口、外面是屏幕外。
  四个接线上的坑：① `theme` 必须传 `useColorMode().resolved`（包的 `auto` 读 `data-theme` /
  `dark` class，读不到本项目的 `data-mode`，与 `AiBotAvatar` 同一个坑）；② 运行态的
  **定位/层级/boost 都要写在内联 `style` 上**（`position: fixed` / `inset: 0` / `zIndex` /
  `pointerEvents` / `--pulse-glow-boost`）—— 包生成的 CSS 把根写成 `position: relative`，
  属性选择器与 Tailwind 的类同级、而它的 `<style>` 挂在 body 里排在后头，用类名会被压掉；
  `pointerEvents: 'none'` 尤其不能漏（包的光层自带，**根节点没有**，漏了就是一整层吞点击的遮罩）；
  ③ **不要改成包住 `AppShell`** —— 包裹等于给 `Sidebar.Provider` 再套一层容器（sidebar 的 sticky、
  AI 面板的 fixed、详情分屏的 grid 都可能受影响），而且外壳高度随内容增长，光晕会跟着内容滚出视口；
  ④ **`prefers-reduced-motion: reduce` 下它本来会整个消失**（包用 `animation: none !important`
  关掉淡入，而 `--beam-opacity-{id}` 的 `@property` 注册初值是 0，包的 JS 呼吸循环同时也主动不启动
  —— 旧那层 CSS 只是不呼吸、光还在）。所以两处都传了 `GLOW_REDUCED_MOTION_CSS`：一条追加的
  媒体查询把那个变量钉成 1，**减的是动效，不是这个反馈本身**。
  包会进**主 bundle**（运行态这层挂在 AppShell 上，路由级懒加载兜不住）：dist 约 99 KB、gzip 14 KB。
  用户可在 **设置 → AI** 里关掉它（`aiActivityGlow`，落在 `admin.preferences:<appId>`、默认开）。

## 10. AI 接入：厂商配置 / 运行时 / 工具层

> 设计蓝图 [./ai-integration.md](./ai-integration.md)，选型调研
> [../../docs/ai-stack-research.md](../../../../docs/ai-stack-research.md)（fx.sh 与 WebMCP 均已排除）。

- **配置在 `admin.ai`（全局一份、不按应用隔离）**：厂商与模型是两张表，删厂商要**连带删它的模型**
  并清理 `activeModelId`。**API Key 明文存 localStorage**（用户已确认）：输入框 `type="password"`、
  **编辑也不回显**、列表只报「已配置 / 缺少密钥」，**任何日志 / toast / 错误都不许回显它**。
- **`#/lib/ai/runtime.ts` 是全仓唯一 import `ai`（Vercel AI SDK v7）的地方，且不要从
  `#/lib/ai/index.ts` 静态导出它**（SDK + 三个 provider 几百 KB 会进主 bundle）；
  `chat.ts` 用 `await import('./runtime')` 首次发送时才加载。
- **v7 的 API 名与 v5 不同，别凭记忆写**：`stopWhen: isStepCount(n)`（不是 `maxSteps`）、
  `inputSchema`（不是 `parameters`）、`jsonSchema()` 免 zod、`toolApproval` 是审批入口；
  provider 层没有 `dangerouslyAllowBrowser`（Anthropic / OpenAI 的浏览器细节见 docs）。
- **`access` 三档**（`read` / `act` / `commit`）现在**只描述风险等级**（权限界面按它解释、
  `readonly` 档按它过滤），**不再决定工具可用性**（那归 `getAllowedTools`）。`commit` 工具
  必须在 `execute` 里处理审批：`call_write_api` **两个模式都要** `await ctx.requestApproval(...)`；
  `submit_form` 只在 `ask` 下问（`auto` 靠表单自己的 `canSubmit()` 把关，见第 9 节）。被拒时
  **抛错**（别静默跳过，否则模型会谎报成功），审批链路异常一律 fail-closed；**四条白名单
  不要放宽**：只读接口 / 写接口 / 站内路径 / **表单字段**（`fill_form` 只放行表单自己声明的字段）。
- **给模型的一切内容都必须经过函数，并且留好过滤点**：提示词（`buildSystemPrompt`，
  每次请求重算、**不要缓存成常量**）、导航清单（`collectNavigation`）、表单清单
  （`listAiForms`）。**不要在别处再遍历 `ALL_NAV_TARGETS`、或直接读表单注册表拼一份给模型的
  清单** —— 那会把"将来按权限收窄"的落点焊死；过滤条件一律加在这些函数**内部一处**。
  提示词里任何可能随权限变化的内容同理（当前是 `formatPageContext` 与模式描述）。
- **权限三档本质是同一份勾选清单**（`resolveAllowedToolNames`，`getAllowedTools` 基于它过滤）：
  `full` = 全选、`readonly` = **预设**勾了那几个只读工具、`custom` = 用户勾的。
  所以从预设档切到「自定义」时要**继承当前档实际勾选的工具**（否则用户得从零重点一遍），
  界面上也能如实说清"只读等于勾了哪几项"。新增一档时只在这里加一条预设，别再写一条 if 分支。
- **给模型算的东西有明确的缓存边界**（别照"全都缓存"或"全都不缓存"来推）：
  - **缓存**：`collectNavigation`（键 = appId + 语言）—— 一轮里可能被 `list_navigation`
    反复触发；`matchNavLabel`（键 = appId + 语言 + pathname）—— 它是**每次发消息**采集
    页面上下文时最贵的一步（遍历全部导航项 + 逐个走 i18n）。两者输入都是静态常量 +
    少量维度，语言 / appId 变化时键不同即自动 miss，不需要手动失效。
  - **不缓存**：`getPageContext()` **整体**（它含 `title`，而标题随页面异步加载变化，
    缓存整份会把过期标题喂给模型）；`listAiForms()`（表单注册表随页面切换随时变，
    而它本身只是 `[...map.values()]`，n 只有一两个 —— 缓存只带来过期风险）。
- **AI 的输出语言**（`aiOutputLanguage`，默认 `auto` = 跟随界面语言，设置 → AI）：与**界面语言
  （`locale`）是两个维度** —— 界面语言决定按钮标题怎么写，它只决定 AI 怎么说话。
  提示词里**不能写死「用中文回答」**（这正是原来的 bug：界面切到英文，AI 照样答中文）。
  解析分两层，职责别混：**`chat.ts` 把 `auto` 解析成具体语言**（只有它认识偏好 store），
  **`runtime.ts` 只负责把语言翻成 `nativeName` 写进提示词** —— 用**自名**（「日本語」而不是
  「日语」）是因为模型的语种知识在自名上最可靠，且不必要求它懂当前界面语言里的语种叫法。
- **页面级 AI 上下文**（`#/lib/ai/page-context-registry` 的 `useAiPageContext`）：**每个新页面都要写**。
  动机是真实踩坑：全局接口清单有 600+ 条、**且不含参数**，模型去里面搜「用户」再自己猜参数 ——
  它用 `query: { uid }` 调 `GET /user/info`（该接口要 `id`），也曾在路径参数上写 query。
  于是改成让**页面自己声明**「我是干什么的、我用了哪些接口」，`get_page_context` 把它连同
  **参数明细**一起交给模型。三条约定：
  ① **键用 `Route.id`**，不要手写路由字符串 —— 手写的会在某次重命名后**静默失配**，
  然后 AI 就又不声不响地回去猜接口了；
  ② **参数明细不要手写**：由 `#/api/endpoint-specs.gen`（`scripts/gen-endpoint-specs.js`
  从 `openapi.json` 生成，已并入 `pnpm api`）自动补上，手写的迟早和后端不一致；
  ③ **`/api` 前缀在消费侧归一化**：同一份 openapi 里 450 条路径不带、18 条带，
  所以 `findEndpointSpec` 会依次试「原样 / 去 `/api` / 加 `/api`」三种写法。
  那份索引 **363 KB（gzip 23.6 KB）**，**按需懒加载**，不进主 bundle —— 它只被
  `import type` 与动态 `import()` 引用，别改成静态 import。
  参考实现：`$appId/users/user/index.tsx`（用户列表页）。
- **系统提示词只描述「模式」，不复述「权限」**（`buildSystemPrompt`）：权限那一维由
  **本轮实际交给模型的工具清单**精确表达。提示词里再写一句"你只能读"，就会与工具清单
  形成**分叉** —— 真实踩过：`navigate_to` 已经放进只读档，模型却照着旧提示词回答
  「我只有读取权限，不能执行页面跳转」，用户看到的就是"改了代码却没生效"。
  提示词里还要**明确禁止**用「我是只读 / 询问模式所以不行」来解释（模式和权限是两回事，
  且**页面跳转在所有权限档里都可用**）；能力不足时应当说"权限没开，可以去 设置 → AI 调整"。
- **表单桥分两半**（`#/lib/ai/form-bridge`）：字段读写由表单组件 `useAiFormFields`、提交由页面
  `useAiFormSubmit`，**两半靠同一个 id 拼成一条记录**；注册表在模块级 Map（不进 state），
  同步 effect **故意不写依赖数组**（否则 `fields` 会停在首次渲染的快照）。
- **页面上下文每轮重新采集**拼进 system；路由能力靠**外壳桥**注入（`AppShell` 注册）——
  `router` 没有全局单例，不要从工具模块直接 import router。`toModelMessages` 里工具结果必须是
  紧跟 assistant 的独立 `tool` 消息，只有 `state === 'done'` 的调用进历史。
- **会话持久化在 IndexedDB**（`#/lib/ai/session-db`）、按 app 分区，元数据与消息分两个 store；
  **流式期间不写盘**（只写三处：发送后 / 一轮结束后 / 切删会话时）；`loadHistory` 对同一 app 早退 ——
  面板关掉再打开是重挂载，少了它会用旧版本**覆盖掉流式回复的增量**。

---

> 以下由 `AGENTS.md` 搬入（原文保留）。那份文件现在只留**索引与铁律**，
> 各模块的细节都落在对应文档里，**需要时再来读这一份**。

## 附：契约速查 —— AI 面板

## 9. AI 面板：Split View / Float (Ask AI)

> **面板与交互的完整约定**（两种打开方式的几何、输入区、头像、输出方式、滚动、空态、
> 工具卡片、进行中光晕……）见 [.agents/docs/ai-architecture.md](./.agents/docs/ai-architecture.md)
> 的附录。下面只列**改了会坏**的契约。

- **入口只在 `$appId` 外壳**（`AppHeader` 的 `showAskAi`，默认 `false`）；面板展开状态由
  `AppShell` 持有、**刻意不持久化**；按钮是 toggle，**状态只有 `AppShell` 一份**，按钮不自己存。
- **挂载点是「与 `Sidebar` 同级」的那一列**（`<main>` 的兄弟），不是内容区的一部分 ——
  所以路由切换、`<Outlet />` 重渲染都与它无关。**面板几何与拖拽手柄共用 `#/components/side-panel`**，
  改高度 / 手感只动那里，不要在组件里再写一份。
- **两种打开方式**（`aiPanelMode`）：`split` 外壳级分屏列（宽度落 `admin.shell-ui.aiPanelWidth`）/
  `float` 行尾侧下角浮窗（不挤压布局，可拖拽改尺寸，宽高落 `admin.shell-ui.aiFloatWidth` /
  `aiFloatHeight`）。**两者在移动端都是整屏**，**不要为 Float 做 JS 视口判断**。
  ⚠️ Float 的 `inset-0` 之外**必须**写 `md:top-auto`，否则它会贴在视口顶端而不是下角。
- **三段 flex 列**：头行与输入区 `shrink-0`、中间滚动 —— **输入框不要放进滚动容器**，否则内容一长
  就被顶出视口。外观画在外层框上、内层 `Textarea` 逐项清零；`Enter` 发送、`Shift+Enter` 换行、
  **输入法组字中的回车要让开**（`event.nativeEvent.isComposing`）。
- **「权限」与「模式」是两个正交维度**（详见第 10 节）：`aiPermission` 管**能不能用**，
  `aiComposerMode` 管**要不要问**。**别再把两者揉成一个开关。**
- **工具调用卡片默认隐藏**（`aiShowToolCalls`）；打开后每张**可点击展开**看参数 / 错误 / 结果。
  **两件事刻意不受它影响**：审批卡、以及「正在思考…」。
- **助手头像是 `bot-avatars` 包**：**`theme` 必须由我们传** —— 包读祖先 `data-theme` 或 `dark` class，
  而本项目用 `data-mode` 驱动，交给它在「跟随系统」那档会读错。
- **设置项文案挂在 `common:profile.settings` 下**（曾误挂到 `profile` 顶层，各语言一律回落成中文）：
  「Ask AI」是产品入口名保留原文，而 `aiModes.split` / `aiModes.float` 是**形态名、必须本地化**。

## 附：契约速查 —— AI 接入（运行时与工具层）

## 10. AI 接入：厂商配置 / 运行时 / 工具层

> 设计蓝图 [.agents/docs/ai-integration.md](./.agents/docs/ai-integration.md)、选型调研
> [docs/ai-stack-research.md](./docs/ai-stack-research.md)；**架构总览、一轮消息的数据流、
> 上下文预算、扩展点与 9 条踩过的坑见 [.agents/docs/ai-architecture.md](./.agents/docs/ai-architecture.md)**。
> 下面只留**改错了会出事**的契约。

- **配置在 `admin.ai`（全局一份、不按应用隔离）**：厂商与模型是两张表，删厂商要**连带删它的模型**
  并清理 `activeModelId`。**API Key 明文存 localStorage**：输入框 `type="password"`、**编辑不回显**、
  **任何日志 / toast / 错误都不许回显它**。
- **`#/lib/ai/runtime.ts` 是全仓唯一 import `ai`（Vercel AI SDK v7）的地方，不要静态导出它**
  （SDK + 三个 provider 几百 KB 会进主 bundle）；`chat.ts` 用 `await import('./runtime')` 首次发送才加载。
- **v7 的 API 名与 v5 不同，别凭记忆写**：`stopWhen: isStepCount(n)`（不是 `maxSteps`）、
  `inputSchema`（不是 `parameters`）、`jsonSchema()` 免 zod、`toolApproval` 是审批入口。
- **`access` 三档只描述风险等级**，**不再决定工具可用性**（那归 `getAllowedTools`）。`commit` 工具
  必须在 `execute` 里处理审批：`call_write_api` **两个模式都要问**；`submit_form` 只在 `ask` 下问
  （`auto` 靠表单自己的 `canSubmit()` 把关）。被拒时**抛错**（别静默跳过，否则模型会谎报成功），
  审批链路异常一律 fail-closed。**四条白名单不要放宽**：只读接口 / 写接口 / 站内路径 / **表单字段**。
- **给模型的一切都要经过函数并留过滤点**（提示词 `buildSystemPrompt`、导航 `collectNavigation`、
  表单 `listAiForms`）：**不要在别处再拼一份给模型的清单** —— 那会把「将来按权限收窄」的落点焊死。
- **提示词只描述「模式」，不复述「权限」**（权限由本轮实际交给模型的工具清单精确表达）。写死一句
  「你只能读」会与工具清单**分叉** —— 真实踩过：`navigate_to` 已放进只读档，模型却照着提示词回答
  「我只有读取权限，不能执行页面跳转」。还要**明确禁止**用「我是只读 / 询问模式所以不行」来解释。
- **页面级 AI 上下文**（`useAiPageContext(Route.id, …)`）：**每个新页面都要写**，让页面声明
  「我是干什么的、我用了哪些接口」。**键必须用 `Route.id`**（手写字符串会在重命名后**静默失配**，
  然后 AI 又不声不响回去猜接口）；**参数明细不要手写**（由 `endpoint-specs` 从 openapi 自动补上），
  那份索引 **363 KB / gzip 23.6 KB，按需懒加载**，只准被 `import type` 与动态 `import()` 引用。
- **表单桥分两半**（`useAiFormFields` + `useAiFormSubmit`，靠同一个 id 拼成一条记录）；
  同步 effect **故意不写依赖数组**（否则 `fields` 会停在首次渲染的快照）。
- **会话持久化在 IndexedDB**、按 app 分区；**流式期间不写盘**（只在发送后 / 一轮结束后 / 切删会话时写）。
- **流式输出性能防卡顿三要素**：
  1. `chat.ts` 内部使用 `StreamEventBatcher` 进行约 25ms（~40fps）时间窗口的微缓冲合并，禁止每个小 token 触发一次 Zustand 重刷；
  2. `AiConversationScroller` 贴底滚动使用 `requestAnimationFrame` 驱动，禁止在渲染周期内同步读写 `scrollHeight` 触发 Layout Thrashing；
  3. `MarkdownContent` 流式状态下使用 `PretextStreamText`，利用 Pretext 离屏断行计算与自然段落解耦隔离（历史段落 memo 冻结），消除随字数增长引发的 O(N^2) 全局 Word-wrap 重排。
