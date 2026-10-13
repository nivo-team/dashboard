---
name: platform-ops
description: 本仓库的仓库级运维入口 —— AI 开发流水线（issue → AI 实现 → PR → 人合并）、CI 门控与标签状态机、GitHub Secrets / Variables 配置、i18n 翻译流水线。改 .github/ 下的 workflow、issue 模板、prompts，或配置仓库 Secrets 时加载它。
---

# 平台运维（platform-ops）

**「仓库怎么运转」的入口。** 前三个 skill 管代码怎么写，这个管**代码之外的那套机器**：
谁有资格写、写完怎么验、怎么发、文案怎么翻译。

## 0. 先读哪份

| 你要做什么 | 读 |
| --- | --- |
| **改 AI 开发流水线 / issue 模板 / CI 门控 / 标签状态机** | [references/ai-dev-pipeline.md](./references/ai-dev-pipeline.md) —— 触发层 + 执行层 + 门控层，含标签状态机与铁律对应表 |
| **配仓库的 Secrets / Variables / 分支保护** | [references/repo-configuration.md](./references/repo-configuration.md) —— 每条流水线要配什么、从哪取、不填会怎样、占位符为什么不能当空值 |
| **加 / 改用户可见文案（翻译流水线怎么跑）** | [references/i18n-translation-pipeline.md](./references/i18n-translation-pipeline.md) |

日常写业务文案**不需要**读这里的第三份 —— 铁律只有一条：**只写源语言**（见下）。

## 1. 三条流水线，各管一件事

| 流水线 | 触发 | 干什么 |
| --- | --- | --- |
| **AI 实现** | 白名单账号在 issue 里评论 `@` 指定账号 | 读 issue → 读对应文档 → 改代码 → 开 PR。**只有 @ 白名单账号才触发** |
| **代码作者门控** | 所有 PR | 每个 commit 的 author email 必须在允许名单内 —— 业务代码只允许流水线产出 |
| **i18n 翻译** | 源语言文案变更 | 只翻增量、带缓存，补齐到各目标语言 |

## 2. 三条铁律（任何改动都适用）

1. **只写源语言**：新增 / 修改用户可见文案时**只改**
   `apps/web/src/messages/<ns>/<sourceLocale>.json`，**不要手写其它语言** ——
   它们由 `pnpm i18n`（或 `translate.yml`）用 AI 补齐。
   **语言清单的真值只有 `i18n.config.json` 一处**（`sourceLocale` + `targetLocales`），
   **不要在文档、注释或代码里列举语言** —— 它变过，抄到别处必然过期。
2. **`pnpm i18n:check` 会拦住「没补翻译就合并」**；键名写错会在 `pnpm typecheck` / `pnpm build` 直接报错。
3. **不要动** `.github/` 下的流水线配置，除非需求明确要求。

## 3. 校验命令的分工（容易搞混）

- **人**：默认**不跑** `typecheck` / `build` / `vp check` / `vp fmt` / 浏览器验收 ——
  它们收在 skill **`verify`** 里，只有使用者点名才执行。
- **CI**：流水线里**必须跑**，它是合并的硬门控。

这条约束管的是「人别为了确认而顺手跑」，**不是**「禁止在流水线里跑」。详见 [references/ai-dev-pipeline.md](./references/ai-dev-pipeline.md) 的门控层。

## 4. 维护本 skill

- 流水线拓扑改了（新增 workflow、改标签状态机、改触发方式）就同步 `ai-dev-pipeline.md`，
  并回来核对 §1 的三行表。
- 新增 Secret / Variable 后同步 `repo-configuration.md` 的清单。
- `AGENTS.md` 只保留指向本 skill 的一行。
