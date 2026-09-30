# 页面特性架构（src/features）

> **改页面代码前先读这份**。它定义「业务代码放哪、AI 能力怎么写、路由文件做什么」。
> 路由与外壳拓扑见 [routing-architecture.md](./routing-architecture.md)；
> AI 侧的分层与提示词见 [ai-architecture.md](./ai-architecture.md) §8。

## 1. 一句话

**路由文件只做「路径 → 组件」的薄适配；业务一律在 `src/features/**`，一个业务一个文件夹（扁平）；
每个页面用一份 `feature.ts` 说清自己是干什么的、需要什么权限、AI 能做什么、数据在哪。**

```
src/features/users/user/            ← 业务路径 = 路由路径去掉 $appId（/users/user）
  list/
    index.tsx                       页面组件（导出 UserListPage）
    feature.ts                      ★ 这一页对 AI 的全部声明（唯一真值）
  detail/
    index.tsx  feature.ts  user-detail-view.tsx  user-detail.ts
  form/                             多页共用的表单实现
    user-form-view.tsx  user-form-dialog.tsx
  create/index.tsx  create/feature.ts
  edit/index.tsx    edit/feature.ts
  demo-users.ts  user-display.tsx   模块级共享（扁平放在模块根，不再有 -data/ -components/）

src/routes/$appId/users/user/
  index.tsx        createFileRoute('…')({ component: UserListPage })   ← 只有这几行
  $id.tsx  new.tsx  $id.edit.tsx
```

## 2. 三条规则

1. **路由文件不写业务**：只 `createFileRoute` + 取参 + 把参数交给 feature 组件。
   参数通过 props 传（`<UserDetailPage appId={appId} id={id} />`）——
   页面里因此**不出现任何路由字面量**，改名不会静默失配（旧写法把 `Route.id` 散在页面里）。
2. **`-components/` 与 `-data/` 不再新增**（存量模块迁移时一并去掉）：模块私有文件直接扁平静置在
   feature 文件夹或模块根；跨页面共用的实现放一个语义文件夹（如 `form/`）。
3. **一个页面一份 `feature.ts`**：页面对 AI 暴露的全部能力只能在这里声明，
   页面里**只留一次 `useFeature(...)`**，不要再去调 `usePageCapabilities` / `useAiFormOpener` /
   `useAiPageReload`（它们仍然存在，但已降级为框架内部 plumbing）。

## 3. `feature.ts` 写什么

| 字段 | 回答的问题 | AI 侧谁用 |
| --- | --- | --- |
| `title` / `description` / `entities` | 这一页是干什么的、涉及哪些业务名词 | `get_page_context` |
| `endpoints` | 这一页用了哪些接口（**参数明细不写**，由 `endpoint-specs` 从 openapi 自动补） | `get_page_context` |
| `forms` | 表单字段、提交接口与审批策略 | `open_form` / `submit_form` |
| `searchParams` | 筛选 / 排序 / 分页规格 | `get_page_context`、`update_search_params` |
| `permissions` | 这一页的操作需要哪些权限点 | 权限过滤（`hasPageCapabilityPermission`） |
| **`commands`** | **AI 能在这一页做什么**（新建 / 删除 / 批量删除 / 导出…） | **`run_page_command`** |
| **`dataSources`** | **这一页现在有什么数据**（行 + 当前筛选 / 分页 / 选中） | **`get_page_data`** |
| `reload` | 写操作后怎么重新取数（保留筛选 / 分页） | `page-reload-bridge` |
| `openForm` | 怎么打开本页的新建 / 编辑表单 | `open_form` |

**为什么是工厂函数**（`createUserListFeature({...})`）：`commands[].run` 与 `dataSources[].read`
必须闭包**页面此刻**的 state 与处理函数。页面每轮渲染生成一份新的，`useFeature` 把最新的一份
登记进注册表 —— 于是 AI 读到的永远是用户正看着的那一屏，而不是首帧快照。

**指令的执行体必须是页面自己的函数**，不是"再调一次接口"：删除要发请求，还要 toast、
刷新表格、清空选中、关弹窗。早期让 AI 走通用 `call_write_api`，结果就是
「库里删了、界面上还在」（见 [ai-architecture.md](./ai-architecture.md) 坑 17/18）。

## 4. AI 侧怎么读

| 工具 | 读什么 | 说明 |
| --- | --- | --- |
| `get_page_context` | 页面描述 / 接口 / 表单 / 搜索参数 | 原有能力，数据来自 `useFeature` 的转换器 |
| `get_page_data` | `dataSources` + 可用指令清单 | **面板模式的核心**：这一屏的数据不用再调接口 |
| `run_page_command` | `commands` | `write` 类指令必过审批卡；`navigate` 类（打开表单）直接执行 |

注册键是**当前路由模板**（`router.state.matches.at(-1).routeId`，与 `getPageContext().routePath` 同源），
由 `useFeature` 自动登记 —— 页面里不写路由字符串。

**容器差异**：全屏对话页没有业务页面，`get_page_data` / `run_page_command` / `update_search_params`
在 `getAllowedTools(..., { surface: 'sphere' })` 里**根本不发给模型**（见 ai-architecture §8.1）。

## 5. 加一个新页面（标准步骤）

1. `src/features/<模块路径>/<页面>/index.tsx`：把页面组件写出来，导出（不带 `Route`）。
2. 同目录 `feature.ts`：`createXxxFeature(options)` → `defineFeature({...})`，把
   `title/description/entities/endpoints/forms/searchParams/permissions` 与
   `commands` / `dataSources` / `reload` / `openForm` 写全。
3. 页面里 `useFeature(...)` 一次，把 state 与处理函数交给工厂。
4. `src/routes/...` 加薄路由：`createFileRoute` + 取参 + 渲染 feature 组件。
5. 导航项（`src/lib/navigation.ts`）与 i18n 文案（7 语言）照常。

## 6. 迁移现状

| 模块 | 状态 |
| --- | --- |
| `users/user`（list / detail / create / edit / form） | ✅ 已迁移（参考实现：`features/users/user/list/feature.ts`） |
| `system/features`（功能树 / 功能详情 / 权限点 / 表单） | ✅ 已迁移（`features/system/features/`）。三个页面各一份 `feature.ts`；根视图的数据由 `FeatureContainer` 用 `onData` 上报；功能详情的表单桥早已接好 |
| `system/data-dict`（分类树 / 字典项 / 两个表单） | ✅ 已迁移（`features/system/data-dict/`）。列表只有数据源（弹窗状态在表格组件里，指令待补）；详情：数据源 ×2 + **表单桥**（AI 可填可存） |
| `home`（仪表盘：栅格 + 卡片注册表） | ✅ 已迁移（`features/home/`）。**没有接口的页面**：数据源给"现在有哪些卡片"，指令给"加 / 移 / 重置布局"（`add-widget` 免确认，移除与重置要确认） |

**四个业务模块已全部迁完**（users / home / data-dict / system.features）—— 页面上不再有
`-components/` / `-data/`，业务代码一律在 `src/features/**`。
仍未迁移的是**外壳级页面**（设置、应用选择等，它们没有业务数据、也不需要 AI 页面声明）。

**下一步（补齐指令）**：data-dict 与 features 目前只有数据源、没有 `commands` ——
它们的增删弹窗状态都在表格 / 容器组件内部。补齐方式二选一：
① 把弹窗状态提到页面；② 让子组件暴露命令句柄（`onRequestCreate` / `onRequestDelete(id)` 这类回调），
页面在 `commands.run` 里调用。两种都不改数据源部分。

> 未迁移页面上 AI 调 `get_page_data` 会拿到 `data: []` + 一条"改用 search_api / call_read_api"
> 的指路（**不是报错**，见 `feature-tools.ts`）—— 所以迁移进度只影响"能不能直接读页面数据"，
> 不影响 AI 能不能干活。

## 7. 迁移一个模块的标准步骤（照做即可）

1. **摸底**：`find routes/$appId/<模块> -type f`，列出页面路由（`index.tsx` / `$id.tsx` / `new.tsx` /
   `$id.edit.tsx`）与各自的 `-components` / `-data`，再 `grep` 一遍 AI 注册点
   （`usePageCapabilities` / `useAiPageContext` / `useAiFormOpener` / `useAiFormFields`）。
2. **建目录**：`src/features/<模块路径>/<页面>/{index.tsx,feature.ts}`；
   跨页面共用的实现放语义目录（如 `form/`），模块级小工具扁平静置在模块根。
3. **搬文件用 `git mv`**（保留历史，不要重打代码），随后只改两件事：
   相对导入路径；去掉文件里的 `export const Route` / `Route.useParams()` / `Route.id`。
4. **薄路由**：路由文件只留 `createFileRoute` + 取参 + `<XxxPage appId={…} id={…} />`。
5. **写 `feature.ts`**：把原先散落的四类注册合成一份，并补 `commands`（与页面按钮一一对应）
   与 `dataSources`（已加载的数据 + 当前筛选 / 分页 / 选中）。只读页**不要**硬造指令。
6. **页面接一次** `useFeature(...)`，删掉旧的注册调用。
7. **核对**：`pnpm guardrails`；grep 旧路径确认无悬空引用；在
   [features-catalog.md](./features-catalog.md) 补这一节 + 测试清单，并更新上面的现状表。

功能说明与测试清单见 [features-catalog.md](./features-catalog.md)。
