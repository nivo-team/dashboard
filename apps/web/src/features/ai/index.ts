/**
 * **AI 模块的唯一出口** —— 整个 AI 核心（逻辑 / 界面 / 渲染 / 全屏页 / 页面声明框架）
 * 都收在 `src/features/ai/`，外部只 import 这一个 barrel。
 *
 * ## 目录结构
 *
 * | 目录 | 是什么 | 原来的位置 |
 * |---|---|---|
 * | `core/` | **核心逻辑**：会话、运行时、工具、上下文、权限、审批 | `lib/ai/**` |
 * | `components/` | 面板 / 输入区 / 会话列表 / 权限配置等 **11 个 UI 组件** | `components/ai-*.tsx` |
 * | `markdown/` | 助手回复的 **Markdown 渲染** + 流式排版引擎（pretext） | `components/markdown-*`、`lib/pretext` |
 * | `sphere/` | **全屏对话页**（`/$appId/sphere`） | `features/sphere/**` |
 * | `page/` | **页面声明框架**：一页一份 `feature.ts` 向 AI 声明能力 | `lib/features/**` |
 *
 * ## 两条硬约定的**新落点**（搬迁前它们靠目录名表达，现在靠这个 barrel 的边界表达）
 *
 * 1. **页面侧只从 `#/features/ai/page` 导入**（`defineFeature` / `useFeature`）。
 *    不要从这里 import —— 这个 barrel 会把面板、会话 store 一起拖进来。
 *    页面目录里的 `feature.ts` 与组件按原约定引 `#/features/ai/page`。
 *
 * 2. **`core/runtime` 不从任何 barrel 导出**：它 import 了 AI SDK 与 provider 包（几百 KB）。
 *    静态导出会让任何 `import '#/features/ai'` 的文件把它们拖进主 bundle ——
 *    `core/chat.ts` 用动态 `import('./runtime')` 在真正发送消息时才加载。
 *    这条约定从 `lib/ai/index.ts` 原样继承，**别在这里"顺手补全"**。
 *
 * ## 为什么不导出 `components/` / `sphere/`
 *
 * 它们的消费方是**外壳与路由**（`app-shell.tsx`、`routes/$appId_.sphere/**`），
 * 本来就是逐个精确 import 的（避免把不需要的组件拉进主 bundle）。
 * 这里只再导出 `core`，让"要用 AI 能力"的调用方有一个稳定入口。
 */
export * from './core'
