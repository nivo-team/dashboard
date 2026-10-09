# 项目文档：调研与设计记录

这个目录**只放「给人看」的东西**：技术选型调研、设计取舍的完整记录。它们相对稳定 ——
不会因为某次代码改动就过时，是「当时为什么这么选」的存档。

> **现状说明与开发规范不在这个目录**，在 [`.agents/docs/`](../.agents/docs/README.md) ——
> 那些描述**当前状态**（模块现状、架构、接入清单、踩过的坑），会随代码过时，
> 写给 coding agent 读，改相关代码时要顺手同步它。
>
> **契约级的硬约束在仓库根的 [`AGENTS.md`](../AGENTS.md)**（只留「不知道就会写错」的部分，
> 与一张指向各文档的索引表）。

## 目录导航

- [AI 技术选型调研 (ai-stack-research.md)](./ai-stack-research.md)
  - fx.sh / Vercel AI SDK / WebMCP / MCP SDK 的能力、浏览器可行性与体积实测对比
  - 结论：fx.sh 因 WASM JSPI 与 36 MB 产物排除，WebMCP 仍处 Origin Trial，故自研工具层
- [仪表盘栅格库调研 (dashboard-grid-layout-research.md)](./dashboard-grid-layout-research.md)
  - react-grid-layout / gridstack / dnd-kit 实测对比（版本、peer、RTL、体积、许可）
  - 结论：RGL v2 不支持 RTL，一票否决 → 手写；gridstack 是唯一条件性备选
- [AI 开发流水线 (ai-dev-pipeline.md)](./ai-dev-pipeline.md)
  - Warp Oz / omp 生态调研在本仓的落地方案：触发层（issue 模板 + label 状态机）、
    执行层（Actions 里的 agent CLI）、门控层（CI + 铁律机器门控）
  - 含首测方案、需要配置的 Secrets/Variables，以及接入时发现的存量问题
- [URL 状态管理与 TanStack Router 适配调研 (nuqs-url-state-research.md)](./nuqs-url-state-research.md)
  - nuqs 2.10.1 源码与 TanStack Router 官方适配机制实测
  - 核心 ~7.1 KB + 适配器 ~1.0 KB 体积、无 SSR 依赖、React 19 完美支持
  - 基于 OpenAPI Query 类型推导的编译期类型拦截设计方案（过滤 primary 与分页参数）
- [AI 权限与工具层重新设计 (ai-permission-and-tools-redesign.md)](./ai-permission-and-tools-redesign.md)
  - **草案 v2**。前提：工具执行在**用户浏览器里、用用户身份**，中间层不调业务接口 ——
    因此**客户端那份 AI 权限不是安全边界**（真边界在后端 RBAC）。所以问题不是"用户可篡改"，
    而是**粒度太粗**（用户面对 16 个工具名）与**三套权限并存重复**
  - 方向：权限收敛到「权限点」一套命名（工具声明 `requiredPermissions`，与页面能力 / 页面指令
    共用同一个判定入口）；UI 从"工具名"换成"模块 × 能力"；`call_write_api` 给了三个选项；
    **工具定义下沉降级为可选**（原先的安全理由不成立）
  - 含五阶段迁移路径（阶段 0-2 不依赖后端改动）与 5 个待决策项
- [AI Agent Prompt 优化与架构建议 (ai-agent-prompt-optimization.md)](./ai-agent-prompt-optimization.md)
  - 从「每轮全量注入」到「按需加载」的下一步：拆开 Router Context 与 Executor Context，
    让每个阶段只携带完成自己职责所需的上下文（含 P0–P3 优先级清单）
  - **落地状态**（文首有逐条对照表）：P0–P3⑪ 已在本仓库落地 —— 两阶段
    （`prepareStep` + `activeTools`）、工具双层描述与依赖展开、`intent`、页面上下文分层、
    分阶段 token 日志；仅剩「按真实数据继续压缩」与参数级 `inputSchema` 精简
- [Wails v3 超薄桌面壳调研 (wails3-desktop-shell-research.md)](./wails3-desktop-shell-research.md)
  - 主题：「永远加载远程 URL、不打包前端产物」到底能不能做，以及壳↔页面这条通道该走哪条路
  - 方法：`v3.0.0-beta.28` tag 源码 + 官方文档（含 Markdown 源）+ **4 个本机真实跑起来的探针程序**
  - 关键结论：`WebviewWindowOptions.JS` 三平台都在页面加载**之后**（Windows 的 URL 导航分支
    **根本不执行**）→ 桌面标记只能走 URL 参数 + 站点首屏内联脚本；Wails **不会**把完整 runtime
    注入远程页面（只注入最小内核），默认 HTTP 通道 `fetch(location.origin + "/wails/runtime")`
    必然打到远程站点 → 桥改走 `application.Options.RawMessageHandler`
    （含 `OriginInfo` 三平台字段差异、`ExecJS` 的 `wails:runtime:ready` 门控、线程模型更正）
