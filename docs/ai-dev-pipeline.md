# AI 开发流水线（issue → AI 实现 → PR → 人合并）

> **来源**：`Warp_omp_AI_GitHub自动化调研报告.md`（Warp Oz 与 omp 生态的调研）。
> **本文是这套流水线在本仓的落地设计** —— 现状与开发规范不在本文（那些在
> [`.agents/docs/`](../.agents/docs/README.md)），本文只讲「怎么让 AI 按那些规范自动干活」。
>
> **当前状态**：阶段一（地基 + 人工合并）的文件已落地，**尚未在 GitHub 上跑过第一次**。
> 首次运行清单见 §6。

---

## 1. 它解决什么问题

你要的形态是：**只给「模块细节」，AI 按本仓规范把代码写好并开 PR**。

调研报告的核心结论是：Warp Oz 与 omp 生态在**触发与门控的形态上完全同构**，
差别只是 Oz 官方产品化、omp 由社区拼装。而本仓的处境是：

| 能力 | 本仓现状 | 结论 |
| --- | --- | --- |
| 给 agent 的规范（skills / docs / 索引） | **已具备**：`AGENTS.md` + 15 份 `.agents/docs` + 21 个 skill | 比报告里的项目还完整 |
| issue → 代码的**触发层** | **没有**（仓库连 `.github/` 都没有） | 本文补的就是这两段 |
| 合并的**门控层** | **没有**：无 CI、无 lint、无单测 | 同上 |

> 上表是**建这条流水线之前**的快照，保留原样作为选型依据。**今天的实际状态**：
> `.github/workflows/ci.yml` 已就位（铁律门控 + `pnpm typecheck` + `pnpm build` + 生成物同步）；
> 静态检查由 **Vite+** 提供 —— `pnpm exec vp check`（fmt + oxlint + tsgolint 类型检查，
> 当前基线 0 error / 0 warning），但它目前只当本地手段，**没有进 CI**；**单测仍然没有**。

**所以缺的不是「AI 能力」，是「触发」与「门控」这两段管道。** 本文只建这两段。

---

## 2. 三层结构

```
L0 需求层   你填 issue 表单（模块细节） ──人打 ai:ready──▶ 触发
               └ 接口字段由 openapi.json 补，规范文档由 AGENTS.md 映射表指向

L1 执行层   .github/workflows/ai-implement.yml
               ├ build-prompt.mjs   把 issue 内容安全地拼进提示词（不进 shell）
               ├ run-agent.sh       装 agent CLI 并调用（claude / omp 二选一）
               └ 产出分支 ai/issue-<N> → 开 PR（用 PAT，否则 CI 不会自动跑）

L2 门控层   .github/workflows/ci.yml
               ├ 铁律门控    scripts/ai/check-guardrails.mjs（i18n / 禁用样式 / 受保护路径）
               ├ typecheck   pnpm typecheck
               ├ build       pnpm build
               └ 生成物同步   routeTree.gen.ts 必须与源码一起提交
            人工 review → 人工点合并（阶段一；阶段二见 §10）
```

**与报告里 Oz 的对应关系**（哪些抄了、哪些没抄）：

| Oz 的做法 | 本仓落地 | 说明 |
| --- | --- | --- |
| label 状态机两级制 | ✅ `ai:ready`（人打）/ `ai:safe-merge`（阶段二） | 意图与允许分开，永不合成一个标签 |
| 仓库即状态存储 | ✅ issue + label + PR，不引入外部数据库 | 幂等靠重跑时复用 `ai/issue-<N>` 分支 |
| 技能化 agent | ✅ 直接用现有的 `.agents/skills` 与 docs | **不需要**再写一份 agent 技能 |
| spec 先行（feature） | ⏳ 阶段二 | 阶段一先跑通「直接实现」 |
| AI 首轮 review | ⏳ 阶段二 | 阶段一先人工 review |
| 路径白名单 / diff 上限 | ⏳ 阶段二（随 safe-merge 一起） | 铁律门控已覆盖「受保护路径告警」 |
| webhook 控制平面 | ❌ 不抄 | 本仓用 GitHub Actions 就够，不值得为此维护一个服务 |

---

## 3. 文件清单

| 文件 | 作用 |
| --- | --- |
| [`ISSUE_TEMPLATE/module-request.yml`](../.github/ISSUE_TEMPLATE/module-request.yml) | 「模块细节」的结构化入口（10 个字段，含验收标准与「明确不做」） |
| [`workflows/ai-implement.yml`](../.github/workflows/ai-implement.yml) | 执行层：读 issue → 跑 agent → 提交 → 开 PR → 回写 label |
| [`ai/prompts/implement.md`](../.github/ai/prompts/implement.md) | 执行提示词：必读文档、铁律、边界、自检清单、结构化摘要格式 |
| [`ai/build-prompt.mjs`](../.github/ai/build-prompt.mjs) | 安全组装提示词（issue 正文是不可信输入，**绝不进 shell**） |
| [`ai/run-agent.sh`](../.github/ai/run-agent.sh) | CLI 适配层：**默认 `dsh`**，可切 `claude` / `omp`；换 CLI 或换 flag 只改这一个文件 |
| [`workflows/ci.yml`](../.github/workflows/ci.yml) | 门控：铁律门控 + typecheck + build + 生成物同步 |
| [`scripts/ai/check-guardrails.mjs`](../scripts/ai/check-guardrails.mjs) | 把铁律变成机器可判定的检查 |
| [`workflows/translate.yml`](../.github/workflows/translate.yml) | i18n 翻译流水线：把 `zh-CN` 的增量翻到目标语言，推分支由人开 PR（见 [.agents/docs/i18n-translation-pipeline.md](../.agents/docs/i18n-translation-pipeline.md)） |
| [`workflows/labels.yml`](../.github/workflows/labels.yml) + [`labels.yml`](../.github/labels.yml) | 标签体系的唯一真值，自动同步到 GitHub |

---

## 4. 标签状态机与触发入口

```
                    ┌─────────────┐
  填 issue 表单 ──▶ │ ai:needs-info│（表单默认标签，表示「待补充」）
                    └──────┬──────┘
                           │ 人确认细节足够，在评论里 @ 触发账号
                           ▼
                    ┌─────────────┐
                    │  ai:running │◀── workflow 自动打（agent 正在干活）
                    └──────┬──────┘
              ┌────────────┴────────────┐
              ▼                         ▼
   ┌────────────────────┐      ┌──────────────┐
   │ ai:branch-ready    │      │  ai:blocked  │
   │ 分支已推，等人开 PR │      │（没产出/被卡）│
   └─────────┬──────────┘      └──────┬───────┘
             │ 人点 issue 里的链接建 PR │ 人在评论里补信息 → 再 @ 触发
             ▼                        └──────────┘
       人工 review → 人工合并
```

### 4.1 触发入口：只有「@ 白名单账号」

**触发方式已从「打 `ai:ready` 标签 / 评论含 `/ai`」收紧为「评论 @ 白名单账号」**。
白名单写在仓库 Variable **`AI_TRIGGER_ACCOUNTS`**（逗号分隔，如 `owocc,cocodevooo`）。

| 入口 | 事件 | 信任模型 |
| --- | --- | --- |
| **评论里 @ 白名单账号** | `issue_comment.created` | **显式校验** `author_association ∈ OWNER / MEMBER / COLLABORATOR` **且** @ 命中白名单；issue 与 PR 的评论都算 |
| 手动 Run workflow | `workflow_dispatch` | 需要仓库写权限 —— 唯一绕过 @ 的路径，等价于维护者本人授权 |

为什么收紧：旧版的 `/ai` 触发面太宽 —— **任何人**在讨论里写一句「/ai 应该这样」就能把流水线点着，
而 `@` 是一个明确的「请你做」信号；配合白名单账号，误触发基本消除。

**判定细节**（都实测过，见 §4.4）：

- `@` 匹配**大小写不敏感**（GitHub 账号本就如此，而 bash 的 `=~` 不是）；
- 用**词边界**收尾，`@owocc` 不会误匹配 `@owoccx`；
- **排除 AI 自己的评论** —— 靠 `<!-- ai-agent -->` 标记（AI 评论的作者是 PAT 背后的真人账号，
  `user.type != 'Bot'` 挡不住）；
- `ai:skip` 标签仍然**一票否决**。

### 4.2 issue 与 PR 都支持

- **issue**：从默认分支开工，推 `ai/issue-<N>` 分支，等人开 PR（或 `AI_CREATE_PR=true` 自动开）；
- **PR**：checkout 该 PR 的 head 继续改、推回**同一个分支**，不发新 PR。
  **只接受同仓库分支** —— fork PR 的代码会在有写权限的上下文里被 checkout 并执行
  （`pnpm install` 会跑 postinstall），gate 直接拒绝。

### 4.3 两轮之间是迭代，不是重做

重跑时（issue 场景）workflow 先看远端有没有 `ai/issue-<N>` 分支，有就 checkout 到它、
在上一轮成果上继续。否则你追加一句评论，AI 会把上一轮的活整个重写 ——
既浪费 token，也容易丢掉已经对的部分。

**每一轮拿到的上下文 = issue/PR 正文 + 全部评论**（保留最近 20 条，单条上限 3000 字符，
更早的会被省略并明确标注）。人写的与 AI 自己写的评论**分别标注**。

- `ai:skip`：人工接手时打上，**任何入口都不会触发**；
- `ai:pr-opened` 只在开启 `AI_CREATE_PR` 时出现（默认走 `ai:branch-ready`，见 §14.3）；
- `ai:ready` **已废弃**（新模型下不再触发），标签保留只是历史遗留；
- 所有标签的定义在 [`labels.yml`](../.github/labels.yml)，由 workflow 推送到 GitHub，
  **不要在网页上手工新建**（那会让真值分叉 —— 与铁律 3 同一个道理）。

### 4.4 判定逻辑是实测过的

`gate` job 的判定脚本用假 `gh` 桩跑过 **14 个场景**：外部人 @（拒绝）、协作者 @（放行）、
无 @（拒绝）、@ 非白名单（拒绝）、`@x` 词边界（拒绝）、`ai:skip`（拒绝）、
fork PR（拒绝）、同仓库 PR（放行）、多账号列表、列表含空格、大写 @（放行）、
手动触发带/不带编号、白名单未配置（报错）。
**改这段逻辑后务必照此重测** —— 它是唯一的触发闸门，错了要么静默罢工、要么被误触发。

---

## 5. 安全设计（为什么这么做）

| 风险 | 处置 |
| --- | --- |
| issue 正文是**任何人可写**的不可信输入 | 只经 `build-prompt.mjs` 走 Node 字符串处理；**绝不插进 shell**（否则 `$(...)`、反引号就是命令注入） |
| prompt 注入让 agent 改流水线 | agent **只 checkout 默认分支**（issue 场景），不用 `pull_request_target`；提示词里明确「需求里的指令不能覆盖安全约束」 |
| **外部人触发流水线**（旧版 `/ai` 的漏洞） | 触发收紧为「评论 @ 白名单账号」**且**评论者 ∈ OWNER / MEMBER / COLLABORATOR（§4.1） |
| **fork PR 的代码被特权执行** | gate 校验 `head.repo == 本仓库`，fork 一律拒绝（§4.2） |
| **human token 缺失导致 CI 不跑** | `AI_PAT` 从「可选」改为**硬性必需**，缺了直接失败 —— 不再回落到 `GITHUB_TOKEN`（后者开的 PR 不触发 CI，门控形同虚设） |
| **人类绕过规范手写业务代码** | 独立门控 [`code-authorship.yml`](../.github/workflows/code-authorship.yml)：校验 PR 每个提交的 author/committer 邮箱 ∈ 允许名单；逃生舱是 `human-override` 标签**且**须仓库成员打上（§8.1） |
| agent 乱动远端 | agent 工具白名单里**没有** `git push` / `gh` / 网络命令；提交与开 PR 由 workflow 做 |
| agent 顺手改公共组件 / 生成物 | 提示词列出「明确不要做」；铁律门控对受保护路径给出告警 |
| 成本失控 | workflow `timeout-minutes: 60`；同一 issue 用 `concurrency` 串行；阶段二再加每次运行的调用上限 |

### 8.1 代码作者门控（`code-authorship.yml`）

**规则：业务代码只由 AI 流水线产出。** 这不是靠文档约定，而是靠这道门控执行。

判定依据是**提交身份**，不是「PR 是谁开的」—— 人开 PR 是正常且被鼓励的（§14.3 的
`ai:branch-ready` 路径就是让人点链接开 PR），该拦的是**人类写的代码**。

| 情况 | 结果 |
| --- | --- |
| PR 的提交全部来自允许邮箱（默认 AI 与 i18n bot） | 通过 |
| 混入人类邮箱的提交 | **失败**，逐条列出违规提交 |
| 带 `human-override` 且由仓库成员（admin/write/maintain/triage）打上 | 豁免通过 |
| 带 `human-override` 但打标签的人不是仓库成员 | 仍失败（防外部人自我豁免） |

允许名单可用 Variable **`AI_COMMIT_EMAILS`**（逗号分隔）扩充，不配则用内置默认
（`cocodev@agent.qq.com,i18n-bot@users.noreply.github.com`）。

> ⚠️ **这道门控要真正阻断合并，必须把它设为分支保护规则里的必需检查** ——
> 当前仓库的默认分支**未开启分支保护**，所以门控失败只是「红叉」，
> 不阻止直接合并。见 §6.4。

> 判定逻辑同样实测过（13 个场景：AI 提交、人类提交、混合、rebase 改 committer、
> 成员/非成员豁免、自定义白名单、含空格白名单）。

---

## 6. 首次运行清单（需要人在 GitHub 上做的事）

### 6.1 配置 Secrets 与 Variables

`Settings → Secrets and variables → Actions`：

> 完整清单与「从哪取」的说明见 **[`repo-configuration.md`](./repo-configuration.md)** —— 那是给人照单配置用的。

| 类型 | 名称 | 必需 | 说明 |
| --- | --- | --- | --- |
| Variable | **`AI_TRIGGER_ACCOUNTS`** | ✅ | **触发白名单**（逗号分隔账号，如 `owocc,cocodevooo`）。没有它任何 @ 都不触发 —— 见 §4.1 |
| Secret | **`AI_PAT`** | ✅ | **person token**：`contents` + `pull_requests` + `issues` 写权限。**硬性必需**，缺了直接失败 —— 不再回落到 `GITHUB_TOKEN`（后者开的 PR 不触发 CI，门控形同虚设） |
| Secret | **`DSH_GATEWAY_KEY`** | ✅ | **唯一的一把密钥**。换 provider 时只改它的**值**，名字不动 |
| Variable | `DSH_GATEWAY_BASE_URL` / `_MODEL` / `_API` / `_THINKING` | ✅ | provider 配置 —— 换 provider（含换 OpenAI 兼容端点）**只改这几个变量**，完整清单见 §13.1 |
| Variable | `AI_CREATE_PR` | 可选 | 默认 `false`：**不自动建 PR**，而是在 issue 里给一条「一键创建 PR」链接（理由见 §14.3）。设 `true` 才自动建 |
| Variable | `AI_COMMIT_EMAILS` | 可选 | 作者门控的允许名单（逗号分隔邮箱）；不配用内置默认（AI + i18n bot）—— 见 §8.1 |

> **只有一把密钥。** 不存在 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` —— 那套
> 「key 与执行体绑定」的模型已移除（见 §12.5）。换 provider 只需改
> `DSH_GATEWAY_API`（协议）等 Variable，凭据始终是同一个 `DSH_GATEWAY_KEY`。

> ⚠️ **一个安全细节**：DSH 在认证失败时会把 key 的**后 4 位**打进日志
> （`Your api key: ****8f25 is invalid`）。GitHub 的 secret masking 只遮完整值，
> 遮不住这种部分回显 —— 所以 Actions 日志不要设成公开可见（私有仓库默认没问题）。

### 6.2 推送并验证地基

```bash
git checkout -b chore/ai-pipeline
git add .github scripts/ai docs/ai-dev-pipeline.md docs/README.md
git commit -m "chore(ai): 搭建 AI 开发流水线（触发层 + 门控层）"
git push origin chore/ai-pipeline
```

推送后**先看两个 workflow 是否绿**：

1. `同步标签` —— 跑完后仓库里应出现 `ai:ready` 等 6 个标签（阶段二标签也已建好，但未使用）；
2. `CI` —— 应通过。**若不通过，先修地基，不要让 AI 在红的基础上开工。**

### 6.3 跑第一次实测

按 §7 走。

### 6.4 ⚠️ 开启分支保护（让门控真正生效）

**当前仓库的默认分支未开启任何保护 —— 门控失败只是个红叉，不阻止合并。**
要让「代码作者门控」与 CI 真正成为合并的硬门槛，必须到
`Settings → Branches → Add branch protection rule`（分支填 `canary`）并勾选：

- ✅ **Require a pull request before merging** —— 否则可直接 push 到 canary，绕过一切门控；
- ✅ **Require status checks to pass before merging**，并选中这几个 check：
  - `typecheck + build`（CI，含 i18n 检查）
  - `提交身份`（代码作者门控）
- ✅ **Require branches to be up to date before merging** —— 避免「绿灯后 base 又变了」；
- ❌ **Allow force pushes / deletions** 保持关闭。

> 为什么必须配这步：本仓的整个安全模型建立在「人能 review、但不能直接改」之上。
> 没开分支保护时，维护者（以及任何有写权限的人）可以直接 push 到 canary，
> 那时 `code-authorship.yml` 只是事后示警，拦不住任何东西。

> ⚠️ 同时注意：`Settings → Actions → General → Workflow permissions` 当前是
> **read-only**（`default_workflow_permissions: read`）。本仓的 workflow 都是显式声明
> `permissions:` 的，所以不受影响；但若将来加了没声明权限的 workflow，它会拿不到写权限。

---

## 7. 首测方案

### 7.1 首测需求（已选定：仪表盘加一张卡片）

**为什么选它**：[`.agents/docs/dashboard-module.md`](../.agents/docs/dashboard-module.md) §6
已经把「新增一张卡片」的步骤写成了确定性三条（写内容组件 → 注册表加一条 → 补默认语言文案），
**改动面固定、真值唯一、验收客观**，是最适合第一次跑的形状。

**卡片选「版本信息」**（静态、不发请求）：与现有三张（系统概览 / 快捷入口 / 数据概览）不重复，
且不触碰「接口口径未定时不接假接口」这条约定。

把下面内容填进 issue 表单（也可直接粘贴为 issue 正文）：

```markdown
### 模块名称
仪表盘「版本信息」卡片

### 目标
让使用者一眼看到当前前端构建版本与部署环境，便于反馈问题时说明版本。
只做展示，不需要任何接口。

### 参考的现有模块
apps/web/src/features/home/metrics-card.tsx

### 目标路由 / 位置
按现有约定（/$appId/home 的卡片栅格）

### 字段 / 列 / 内容清单
版本号 · string · 只读 · 取 package.json 的 version
环境   · string · 只读 · 取 VITE_API_BASE_URL 推断，未配置时显示「未配置」
构建方式 · string · 只读 · 固定文案，标明是前端静态构建

### 涉及的接口
无（纯静态卡片，不请求任何接口）

### 交互要求
1. 卡片内容只渲染内容本身，不要自己画卡片外壳（标题/图标/拖拽手柄由
   DashboardWidgetFrame 统一提供）
2. 默认尺寸用行单位，高度必须是 DASHBOARD_HEIGHT_STEPS 里的档位
3. 全局唯一，不允许同时放多张

### 验收标准
- [ ] 注册表里新增一条，type 取 'version'，allowMultiple 为 false
- [ ] 新组件位于 -components/cards/ 下，只渲染内容、不含外壳
- [ ] 文案齐全（title + 各字段名），键树与其它卡片一致
- [ ] 阿拉伯语（RTL）下布局不错位
- [ ] 配色只用 Kumo 语义令牌，无 dark: / font-bold / tracking-*
- [ ] 不新增任何第三方依赖，不发任何请求

### 明确不做
不要改 dashboard-grid / dashboard-widget-frame / add-widget-dialog 等公共组件
不要改 registration 的既有三条
不要顺手重构其它卡片
不要引入接口调用
```

填完由维护者打 `ai:ready`，或到 `Actions → AI 实现 → Run workflow` 手动填 issue 号触发。

### 7.2 度量什么（这才是实测的意义）

首测不是「看它能不能跑」，而是量出**基线数据**：

| 指标 | 怎么看 | 首测目标 |
| --- | --- | --- |
| 一次通过率 | 首次 PR 是否 CI 全绿且人工 review 无返工 | ≥ 1 次成功即可，先记录真实值 |
| 返工轮次 | 人工 review 打回几次 | 记录 |
| 改动范围 | PR 里 `git diff --stat` 的文件数与行数 | 预期 3~4 个文件（1 新组件 + 注册表 + 文案文件 + 可能 routeTree） |
| 规范遵从 | 铁律门控是否报警告、人工核对文案与 RTL | 期望零 ERROR |
| 墙钟耗时 | issue 打标签 → PR 出现的时长 | 记录 |
| 成本 | Actions 分钟数 + 模型 token | 记录 |

### 7.3 建议的第二个实测（更真实：修存量缺陷）

见 §9 —— 那个 i18n 缺口是**真实存在的用户可见缺陷**，验收标准完全客观
（跑 `pnpm typecheck` 之外，直接跑铁律门控：基线收窄即通过），
比加卡片更能检验「AI 能否独立完成一个真实修复」。

---

## 8. 铁律与门控的对应（哪条被机器管住了）

| 铁律 | 机器门控 | 强度 |
| --- | --- | --- |
| 1. 只写 `zh-CN`，其它语言由流水线补 | `check-keys.mjs`（代码↔源语言，**ERROR**）+ `translate.mjs --check`（译文等齐，**ERROR**）；`check-guardrails.mjs` 对「缺译文」只报 WARN（新契约下缺译文是正常中间态） | **ERROR** |
| 2. 禁 `dark:` / `tracking-*` / `font-bold` | 同上，扫 diff 新增行 | **ERROR** |
| 3. 名单只有一个真值 | 无（语义级，机器判不了） | 靠提示词 + 人工 review |
| 4. 给模型的内容过函数、过滤集中 | 无（同上） | 靠提示词 + 人工 review |
| 5. 校验命令默认不跑 | **CI 里必跑** —— 两者不冲突：铁律约束的是「人别顺手跑」，CI 是合并门控 | — |
| 6. AGENTS.md 不超 64 KB | 无 | 现状 5.8 KB，无需 |

> 铁律 3 / 4 判不了是**已知边界**：不要在门控里硬造一个假检查（会逼出绕过它的写法）。

---

## 9. 接入时发现的存量问题（实测的第一批素材）

跑门控的第一分钟就查出两处**已存在的**铁律违规 —— 这不是脚本误报：

1. **`common` 命名空间 6 个语言各缺 9 个键**（共 54 条），而代码**真的在用**它们：
   - `unsavedChanges.*`（可编辑详情页的保存浮条：`有未保存的更改` / `保存` / `重置`）
   - `dangerConfirm.*`（危险操作二次确认）
   - `clipboard.*`（复制按钮）
   → 影响：非中文使用者在这三处会看到**中文**（或 key）。

   **处置（2026-10 已更新）**：原先是写进 `i18n-baseline.json` 豁免。**该机制已移除** ——
   新契约下「缺译文」只报 WARN、不再阻塞开发，而「源语言缺键」本就是错误、不该豁免。
   这 54 条后续已补齐；剩下的缺口交给 `translate.mjs --check` 在 CI 拦住。

2. **`langs` 命名空间只有 `zh-CN.json`**（1/7 语言）。
   **处置**：脚本报 WARN 不报 ERROR（无法由机器判定是「遗漏」还是「刻意单语言」）。
   排查后确认**全仓零引用**（`useTranslation('langs')` 已不存在），
   已在 `i18n.config.json` 标 `enabled: false`，待确认后连同文件一起删除。

---

## 10. 演进路线（阶段二，稳定后再做）

按报告里 Oz 的做法，**在有一次通过率数据之后再决定**：

1. **spec 先行**：feature 类需求先产出 `product.md`（行为不变量）+ `tech.md`（实现计划），
   人打 `ai:plan-approved` 才实现 —— 大改动走这条，小改动仍直通；
2. **AI review**：PR opened 时给固定格式（Overview / Concerns / Verdict）；
   注意 Oz 的取舍 —— **只对外部 PR 留阻塞性 review**，不阻塞自己人的 PR；
3. **`ai:safe-merge` 自动合并**：前置条件是 CI 全绿 + 路径白名单 + diff 行数上限 + 文件数上限
   + head 分支以 `ai/` 开头；任一不满足就退回人工；
4. **防腐烂**：changes-requested 的 PR 7/10/14 天三级提醒后自动关闭；
   PR closed 时取消在途 run；
5. **AI 分支保护**：给 `main` 开分支保护（要求 CI 通过 + 至少 1 个 approve），
   这样「AI 只能开 PR」由 GitHub 强制，而不是靠流程约定。

---

## 11. 已知边界

- **本机网络**：`github.com:443` 与 `api.openai.com` 在本机不可达、`api.anthropic.com` 返回 403，
  但 `api.github.com` 与 SSH(22) 可用。所以**执行体必须在 Actions runner 上**（云端网络自由），
  本机只做 git over SSH 与 API 调用。
- **`.claude/skills` 与 `CLAUDE.md` 其实都是软链**（`.claude/skills -> ../.agents/skills`、
  `CLAUDE.md -> AGENTS.md`），所以「两份副本会漂移」这条早期判断已过时：
  真值始终只有一份（`.agents/skills` 与 `AGENTS.md`），改一处即可，不需要同步两处。
- **静态检查有了，单测还是没有**：`pnpm exec vp check`（fmt + oxlint + tsgolint 类型检查）能挡住格式、
  lint 与类型问题，CI 里仍只跑 `pnpm typecheck` + `pnpm build`；但门控终究只能挡住「类型错、构建错、
  铁律违规」，运行时行为（比如卡片真的渲染出来了吗）**必须人工验收** —— 这是 docs 里一直强调
  「不要用跑 typecheck 代替理解代码」的原因。
- **模型成本**：每次运行都是一个完整 agent 会话（读文档 + 读代码 + 改代码），
  成本随 issue 复杂度上升。`AI_MODEL` 选便宜模型跑简单任务，是常见的省钱做法。

---

## 12. 执行体为什么是 DSH（调研与实测记录）

**日期**：2026-09-27 · **被测版本**：`@deepseek-ai/dsh@0.1.5-rc.3`

### 12.1 为什么不是 Claude Code / omp

调研报告里的两个参照系都是「外部 agent 接进 GitHub」，而本仓的处境不同：
**DSH 就是本项目的 harness**，它原生具备这条流水线需要的三件事，且不需要任何胶水：

| 能力 | 由谁提供 | 对本仓的意义 |
| --- | --- | --- |
| 读仓库指令 | `@deepseek-ai/dsh-agent-instructions` | `AGENTS.md` 自动生效，索引表与铁律不需要重新接线 |
| 读技能 | `@deepseek-ai/dsh-skill-filesystem` | `.agents/skills/` 里的 `table-development` / `editable-detail` 直接可用 |
| 一次性任务 | `@deepseek-ai/dsh-headless` | 正是 CI 需要的形态（见下） |

另外它还有 `@deepseek-ai/dsh-webhook-github` 与 `@deepseek-ai/dsh-schedule` —— 意味着
将来若要走「常驻服务 + webhook」的 Oz 式路线，不必换成别的 harness。

### 12.2 关键事实（均已实测或读包内文档确认）

- **它是 npm 包**：`@deepseek-ai/dsh`，`bin: { dsh: lib/bin.js }`，**`os` 未限制** →
  可以在 GitHub 的 Linux runner 上装并跑（Electron 那 112 MB 的 asar 与本方案无关）。
- **headless 用法**：`dsh --profile headless "<任务>"` —— 跑一个全新的持久化会话，
  把**最后一条非空 assistant 文本**打到 stdout，然后退出（`turn/end` 完成为 0，否则为 1）。
  **不监听任何端口**；`headless` profile 首次使用时从随附模板自动初始化。
- **凭据四层，环境变量优先级最高**（`dsh-credentials-local` 文档）：

  | 层 | 来源 | 可写 | 优先级 |
  | --- | --- | --- | --- |
  | 继承的进程环境 | `env` | 否 | **始终优先** |
  | `$DSH_HOME/.credentials.yaml` | `file` | 是 | 次之 |
  | `<cwd>/.env` | `project-env` | 否 | 再次 |
  | `$DSH_HOME/.env` | `user-env` | 否 | 最低 |

  文档原文点名了这个场景：*「按次覆盖（`DEEPSEEK_API_KEY=… dsh`、**CI 机密**、容器 `-e`）
  代表本次运行的操作者意图」*。**所以 CI 里只要一个 Secret（`DSH_GATEWAY_KEY`），
  不需要写配置文件。**

- **默认模型**：`dsh-base` 的 `agent-default-model` 配的是
  `provider: deepseek-official` + `model: deepseek-v4-flash`，即**开箱即用就是 DeepSeek 官方**。
- **装它必须用 pnpm，不能用 npm**：npm 11.19 的 arborist 在 DSH 的依赖树上会崩
  （`TypeError: Cannot read properties of null (reading 'matches')`，触发点是
  `@tabby_ai/hijri-converter` 那条依赖链）。DSH 自己也是用 pnpm 管理 profile 插件的。
- **pnpm 默认会拦截 native 构建**（`dsh-subprocess-local`、`node-pty`、`koffi`…）。
  `dsh-subprocess-local` 是 bash 工具的实现，所以安装时要
  `--allow-build=@deepseek-ai/dsh-subprocess-local`，否则 agent 只能读写文件、跑不了自检。

### 12.3 实测结果：链路全通，只差凭据

在本机（macOS，node v26.7.0）用 pnpm 装上 `@deepseek-ai/dsh@0.1.5-rc.3` 后：

```bash
DSH_HOME=<可写目录> dsh --profile headless "只回答一个词：pong"
```

结果 —— **profile 自动初始化成功、插件树加载成功、凭据解析成功、真实 API 请求发出去了**：

```
dsh: AUTH: Authentication Fails, Your api key: ****8f25 is invalid (request_id: …)
```

唯一失败的是 `~/.dsh/.credentials.yaml` 里那把 key **本身无效**（尾号 `8f25`），
与流水线无关。也就是说：**从 checkout 到「模型真的被调用」这条路径已经验证完毕**，
配一把有效的 `DSH_GATEWAY_KEY` 即可跑通。

### 12.4 还没验证到的两件事（首次运行要盯）

1. **工具层**：上面的实测停在认证阶段，所以 agent 的 bash / 文件工具**没被真正跑过**。
   首次运行时重点看它能否执行 `pnpm typecheck`：
   - 报子进程相关错误 → 12.2 里那条 `--allow-build` 没生效；
   - 报 `SANDBOX_UNAVAILABLE` → 沙箱 runner 缺失（见下）。

   **权限与沙箱（复查后确认的行为，不需要我们改）**：`dsh-base` 的默认是
   `sandbox-policy.mode = workspace-write`（文件影响限制在 workspace 根 + `/tmp`）
   + `approval = ask`（越界操作要审批，而 headless 下没有应答者 → **fail closed**，
   不是静默放行）。两条推论：**agent 无法 `git push`** —— 它的工具集里没有远端能力，
   提交与推送都由 workflow 做；越界操作会被明确拒绝。
   但它的 bash 工具**依赖平台 runner**（Linux 上靠 bwrap / Landlock），
   两者都没有时按失败关闭返回 `SANDBOX_UNAVAILABLE` —— 所以 workflow 里
   显式装了 `bubblewrap`，**那一步别删**。
2. **首次运行耗时**：`headless` profile 第一次要装插件依赖（本机实测解包后有 500 个包），
   所以在 CI 上第一次会明显慢于后续。若嫌慢，可给 `$DSH_HOME/profiles/headless` 加
   `actions/cache`。

### 12.5 为什么只有一个执行体、一把密钥

`run-agent.sh` **只保留 `dsh` 一个分支**，`claude` / `omp` 的分支已删除。

原本那两个分支存在的唯一理由是「各自要自己的密钥」（`ANTHROPIC_API_KEY` /
`OPENAI_API_KEY`）—— 也就是 **key 与执行体绑定**。那个模型有两个问题：

1. **密钥面随模式膨胀** —— 每多一个执行体就多一把要配、要轮换、要审计的 key；
2. **它其实是多余的** —— 换 provider（含换成 OpenAI 兼容的任意端点）只需要改
   `DSH_GATEWAY_API`（协议）与 `DSH_GATEWAY_BASE_URL`（端点），凭据始终是同一把
   `DSH_GATEWAY_KEY`。既然「支持 OpenAI」不需要 OPENAI_API_KEY，那 `omp` 分支
   就没有存在意义。

顺带的好处：`dsh` 是本仓规范的原生读者（直接读 `AGENTS.md` 与 `.agents/skills`），
少一层第三方 CLI 的供应链面，也少一处 flag 随版本漂移的风险。

---

## 13. provider 配置：仓库零值，全部由 CI 注入

本仓**不走 DeepSeek 官方端点**，而是走第三方网关。provider 配置放在
[`.github/ai/dsh-patch.yml`](../.github/ai/dsh-patch.yml)，以 `--patch` 叠加层生效 ——
但这个文件是**纯结构**：端点、模型、协议、推理方言全部由环境变量注入，
**仓库里不出现任何私人网关信息**。换 provider 只改 GitHub 上的 Secrets / Variables，
一行代码都不用动。

### 13.1 必填清单（5 项，缺一不可）

| 类型 | 名字 | 说明 |
| --- | --- | --- |
| Secret | `DSH_GATEWAY_KEY` | 网关 API key |
| Variable | `DSH_GATEWAY_BASE_URL` | 端点 |
| Variable | `DSH_GATEWAY_MODEL` | 模型 id |
| Variable | `DSH_GATEWAY_API` | 协议（如 `openai-completions`） |
| Variable | `DSH_GATEWAY_THINKING` | 推理方言（如 `deepseek`） |

`api` / `baseURL` / `model` 之所以必填，是因为 `gateway` 是**手写路由**
（不是 pi-ai 内置 catalog）—— 没有 catalog 可以继承这几项。缺任一项时，
workflow 的「检查配置」步骤会逐项点名，不必等模型调用才失败。

### 13.2 三条实测出来的硬约束

1. **对象 key 位置不支持 `!!js`** —— 写 `!!js process.env.X:` 会退化成字符串
   `'[object Object]'`，然后报 `NO_ADAPTER: no adapter registered for provider …`。
   所以 `providers` 下的**路由名必须写死**；本仓取中性的 `gateway`，不绑任何厂商。
2. **写了 key 就必须有值** —— 校验器不接受 `undefined`：
   ```
   INVALID_CONFIG: … sets compat "thinkingFormat" with no value;
   give it one, or remove the key …
   ```
   所以文件里**不放任何"可选字段"**：每个出现的字段都对应一个必填环境变量。
3. **不能用三元表达式** —— `a ? b : c` 里的 ` : ` 会被 YAML 当作 mapping 分隔符，
   整个表达式变成一个对象，报 `expected number but got [object Object]`。要用 `||`。

### 13.3 以后要加回来的东西

[`dsh-patch.yml`](../.github/ai/dsh-patch.yml) 末尾的注释写了细节，摘要：

- **`contextWindow` / `name`**：现在省略，由 DSH 兜底（contextWindow 默认 262144）。
  想显式控制就加字段 —— 但注意 13.2 第 2 条：加了就必须有值。
- **推理档**（`reasoning` + `models[].reasoningEfforts`）：**必须成对出现**。
  只设 `reasoning: high` 而不声明 `reasoningEfforts` 会报
  `UNSUPPORTED_REASONING_EFFORT: … does not support reasoning effort "high"`。
  两者都是网关特定的档位名，需要时一起补。

### 13.4 换 provider 的完整动作

1. 改 Secret **`DSH_GATEWAY_KEY` 的值**（名字不用动）；
2. 改 Variables `DSH_GATEWAY_BASE_URL`、`DSH_GATEWAY_MODEL`、`DSH_GATEWAY_THINKING`，
   必要时再改 `DSH_GATEWAY_API`；
3. 完。**仓库零改动。**

### 13.5 实测记录（2026-09-27）

在项目根、用真实网关、完全模拟 CI 的方式跑通：

```
DSH_GATEWAY_KEY=<由 Secret 注入> \
DSH_GATEWAY_BASE_URL=… DSH_GATEWAY_MODEL=… \
DSH_GATEWAY_API=openai-completions DSH_GATEWAY_THINKING=deepseek \
  dsh --profile headless --patch .github/ai/dsh-patch.yml "只回答一个词：gamma"   →  gamma
```

即装包（pnpm + `--allow-build`）、patch 叠加、凭据解析（走环境变量层）、
网关调用、退出码全部正常。反向情况也验证过 —— 未设 key 时会明确报
`MISSING_CREDENTIAL: … resolves DSH_GATEWAY_KEY, which is not set`，不会静默用错凭据。

### 为什么用 --patch 而不是改 profile

1. CI runner 每次都是全新的，没有本机 `~/.dsh/profiles/desktop` 可用；
2. 本机日常配置与 CI 配置解耦，互不影响；
3. 配置跟着代码进 review —— 换网关是会影响 CI 行为的改动，不该只藏在本机。

---

## 14. 首次实测记录（2026-09-27）

**任务**：issue #1 —— 仪表盘新增「版本信息」卡片（用 §7.1 的草稿发的）。
**结果**：**成功**。人工 review 后已合并进 main（merge commit `7994e68`）。

### 14.1 流水线各段的表现

| 环节 | 结果 |
| --- | --- |
| 触发（issue 打 `ai:ready`） | ✅ |
| Actions 装 DSH + 沙箱依赖 | ✅ |
| agent 实现 | ✅ 产出符合仓库规范的代码 |
| commit + push 分支 `ai/issue-1` | ✅ 提交身份是当时配的 `ai-agent`（`cocodev` 是之后才换的） |
| 开 PR | ❌ 被 GitHub 仓库设置挡住（见 14.3） |
| 人工 review + 合并 | ✅ 由人完成 |

### 14.2 产出质量（9 文件 / +201 / -1）

范围与 issue 里的「明确不做」**完全不冲突**。几处值得记下的实现选择 ——
它们说明 agent 真的去读了 `.agents/docs/`：

- **只渲染卡片内容**，没有重复实现 `DashboardWidgetFrame` 的外壳。
  这是该任务最容易踩的坑（文档里专门警告过「自己画外壳会导致卡片拖不动也删不掉」）；
- **版本号读 `package.json?raw`**，没有另维护一份常量 —— 对应铁律 3「只有一个真值」；
- **环境推断刻意不反推**。它的注释原文：
  「这里刻意**不根据「没有 test」反推生产** —— 那会把任何未知地址都说成生产，属于编造」，
  与本仓「缺值不编造」的既定约定一致（`metrics` 卡片的占位值就是同一条）；
- 高度取了档位（`h: 3` ∈ `DASHBOARD_HEIGHT_STEPS`）、`allowMultiple: false`、
  未改动注册表里已有的三条；
- 文案齐全且键树一致（非默认语言是地道翻译，不是机翻占位）。

铁律门控在合并前本地跑过一次：**通过**（唯一 warning 是 `langs` 的存量问题，与本次无关）。

### 14.3 暴露的问题：AI 不该自动创建 PR（已改为默认关闭）

首次运行时报了：

```
pull request create failed: GraphQL: GitHub Actions is not permitted to
create or approve pull requests (createPullRequest)
```

排查后发现这里有**两个独立的限制** —— 只解决第一个会留下更糟的后果：

1. GitHub 默认不允许 Actions 用 `GITHUB_TOKEN` 创建 PR（一个仓库开关即可解开）；
2. **用 `GITHUB_TOKEN` 创建 PR 产生的 `opened` 事件不会触发其它 workflow**
   （防递归机制）。也就是说 PR 建出来了，**CI 却不会跑** —— 铁律门控、typecheck、
   build 全部失效。这时「PR 创建成功」反而制造了「门控在工作」的错觉。

所以默认流程改成 **AI 只推分支、不开 PR**：workflow 在 issue 里评论一条
「一键创建 PR」的 compare 链接，由人点一下。人开的 PR 是正常事件，CI 照常跑 ——
而且零配置、不用维护 PAT。

要无人值守自动建 PR：配 `AI_PAT`（fine-grained，含 `pull_requests: write`）
并把 Variables 里的 `AI_CREATE_PR` 设成 `true`。这时 `secrets.AI_PAT` 会覆盖
`GITHUB_TOKEN`，上面两个限制同时绕开。

### 14.4 第一次没能验证到的：agent 的 bash 工具

这次任务是靠文件读写工具完成的，**没有证据表明它执行过 `pnpm typecheck`**。
也就是说 §12.4 第一条（沙箱 runner 是否可用）仍未证实。
下一个任务可以刻意挑一个「必须跑命令才能确认」的需求来验它。

→ **第二次实测专门验了这个，结论见 §14.5。**

### 14.5 第二次实测（issue #2）：全链路跑通，bash 工具验证通过

**任务**：设置里新增「关于」页面 —— 刻意挑了一个**必须跑构建才能完成**的任务
（新增路由文件后必须重新生成 `apps/web/src/routeTree.gen.ts`，而它只能由
`pnpm build` / `pnpm dev` 产生）。
**结果**：**成功**。人创建 PR #3 并合并（`a457a02`）。

| 环节 | 结果 |
| --- | --- |
| 打 `ai:ready` → AI 实现 | ✅ |
| **agent 执行构建**、生成 `routeTree.gen.ts` | ✅ **首次验证通过** |
| 推分支 `ai/issue-2` | ✅ 提交作者 `cocodevooo <cocodev@agent.qq.com>` |
| 人创建 PR #3 → CI → 合并 | ✅ |
| 铁律门控（合并后本地复跑） | ✅ 通过 |

**产出**：`10 文件 / +171 / -7`，与验收标准完全对齐。几处值得记下的：

- **主动做了 RTL 适配** —— 右对齐用 `text-end` 而不是 `text-right`；
- **复用已有文案键** —— 卡片标题用现成的 `profile.sections.basic`，
  没有为「基本信息」新造一个语义重复的 key；
- **引用了上一次的产出** —— 注释里写「与仪表盘的版本信息卡同一套做法
  （见 `src/features/home/version-card.tsx`）」，即跨 issue 学习本仓做法；
- 版本号仍走 `package.json?raw`，解析失败用 `—` 而不是编造版本。

**这次为什么能验证 bash 工具**：`routeTree.gen.ts` 的 diff 是标准生成物的形状
（`RouteImport` / `getParentRoute` 那一套，手写不可能长这样），说明 agent
在 runner 里**真的执行了构建命令** —— 也就是 `--allow-build=@deepseek-ai/dsh-subprocess-local`
与预装 bubblewrap 那两个补丁**都按预期生效了**。

同时**提交作者是 `cocodevooo`**，说明 AI 专用账号 + email 关联那套身份配置也生效了。

---

## 15. 已知不足（2026-09-27 记录，供下一次规划）

只跑通过**一次**真实任务（issue #1）。下面的判断来自那一次运行 + 实现本身的缺口，
不是猜测。

### 15.1 还没被证明的

- **agent 的 bash 工具**：✅ **已在第二次实测中验证**（§14.5）—— 它执行了构建并生成
  `routeTree.gen.ts`，沙箱 runner、`--allow-build`、包管理器三者都实际用上了。
- **复杂任务的表现**：一次成功不等于稳定。列表页 / 表格 / 详情表单这类多文件改动的
  一次通过率仍是未知数。
- **自动建 PR**：默认由人创建 PR 那条链路**已在第二次实测中跑通**（§14.5）；
  但「自动建 PR + CI 自动跑」（`AI_PAT` + `AI_CREATE_PR=true`）**仍未实跑验证**。
  `claude` / `omp` 两个备选执行体也从未跑过。

### 15.2 结构上的缺口

- **规则与引擎没分离** —— `scripts/ai/check-guardrails.mjs` 里的「7 种语言」
  「禁用 `dark:`」都是**本仓的**规则，写死在代码里。这意味着这套门控
  **别人拿不走**：它可以是一个仓库的自动化，但还不是能被复用的资产。
  要往「模板 / 开源」方向走，得先做这一步（引擎读规则表，规则表按仓库替换）。
- **提示词与本仓强耦合** —— `implement.md` 写死了本仓的 `AGENTS.md` 索引结构与
  6 条铁律，换个仓库要重写。
- **没有 spec 阶段** —— 复杂需求直接进实现，方向跑偏要等到 PR 才被发现。
- **没有失败重试与成本控制** —— 每次触发都是一整个 agent 会话；同一 issue
  重复触发既无次数上限，也无并发去重（只有 `concurrency` 串行）。
- **没有 AI review 与自动合并** —— 全靠人工。这是刻意的（先积累通过率数据），
  代价是「AI 写完还得等人」。

### 15.3 下一次规划建议从这两个问题开始

1. **边界**：这套东西是「给自己仓库用的自动化」，还是「能被别人 `Use this template`
   的通用资产」？前者不需要抽象；后者必须先做 15.2 第一条。
2. **先补哪块**：是先扩大可信区间（验掉 bash 工具与复杂任务），
   还是先抽象成可复用资产（规则表 + 提示词模板）？
