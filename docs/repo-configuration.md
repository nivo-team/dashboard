# 仓库配置：Secrets 与 Variables 清单

> **这份文档给「要配这个仓库的人」看** —— 列出所有需要在 GitHub 上填的
> Secrets / Variables，每一项是什么、从哪取、不填会怎样。
>
> 位置：**Settings → Secrets and variables → Actions**
> （`https://github.com/<owner>/<repo>/settings/secrets/actions`）
>
> **仓库里不含任何密钥**，也不含具体端点 / 模型名 —— 全在 GitHub 上，换 provider 零代码改动。

---

## 0. 先看这个：三条流水线各需要什么

仓库有三条 workflow，各自独立，**按需配、不用全配**：

| 流水线 | 文件 | 需要配什么 |
| --- | --- | --- |
| **CI 门控**（typecheck / build / i18n 检查） | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | **什么都不用配**，开箱即用 |
| **代码作者门控**（禁止人类手写业务代码） | [`.github/workflows/code-authorship.yml`](../.github/workflows/code-authorship.yml) | 可选 `AI_COMMIT_EMAILS`（不配用内置默认） |
| **i18n 翻译** | [`.github/workflows/translate.yml`](../.github/workflows/translate.yml) | 一套 LLM 网关配置（可**共用**下面那套） |
| **AI 实现**（issue/PR → 写代码） | [`.github/workflows/ai-implement.yml`](../.github/workflows/ai-implement.yml) | 触发白名单 + **person token** + 一套 LLM 网关配置 |

两条 LLM 流水线**默认共用同一套** `DSH_GATEWAY_*`。想让翻译用不同的模型或另一个网关，
再补 `I18N_*` 覆盖即可 —— 见 [§3](#3-可选的翻译单独配置i18n_)。

> ⚠️ **门控要真正阻断合并，必须开启分支保护** —— 见 [§6](#6-让门控真正生效分支保护)。

---

## 1. AI 实现流水线（`.github/workflows/ai-implement.yml`）

执行体固定为 `dsh`，密钥只有一把。**必填 7 项**：

| 类型 | 名字 | 说明 | 示例 |
| --- | --- | --- | --- |
| Variable | **`AI_TRIGGER_ACCOUNTS`** | **触发白名单**：只有评论里 @ 到这些账号才触发（逗号分隔） | `owocc,cocodevooo` |
| **Secret** | **`AI_PAT`** | **person token（硬性必需）**：fine-grained PAT，`contents` + `pull_requests` + `issues` 写权限。缺了 workflow 直接失败 | `github_pat_…` |
| **Secret** | `DSH_GATEWAY_KEY` | 网关 API key。换 provider 时**只改它的值**，名字不动 | `sk-…` |
| Variable | `DSH_GATEWAY_BASE_URL` | 网关端点（OpenAI 兼容 base） | `https://gateway.example.com/v1` |
| Variable | `DSH_GATEWAY_MODEL` | 模型 id | `deepseek/deepseek-chat` |
| Variable | `DSH_GATEWAY_API` | 协议 | `openai-completions` |
| Variable | `DSH_GATEWAY_THINKING` | 推理方言。填**网关认的名字**；模型不支持推理时也要给一个值 | `deepseek` |

### 1.0 怎么触发

**只有在 issue 或 PR 的评论里 @ 到 `AI_TRIGGER_ACCOUNTS` 里的账号才会触发**，
且评论者必须是仓库成员（OWNER / MEMBER / COLLABORATOR）。

```
@cocodevooo 按这个 issue 实现
```

旧版的「打 `ai:ready` 标签」与「评论含 `/ai`」**已取消** —— `/ai` 太容易被普通讨论误触发。

### 1.0.1 为什么 `AI_PAT` 是硬性必需

用默认的 `GITHUB_TOKEN` 开的 PR **不会触发** `pull_request` 类 workflow
（GitHub 防递归机制）—— 那样 CI 不跑，门控形同虚设。所以本流水线**不再回落到
`GITHUB_TOKEN`**：没配 `AI_PAT` 就在「检查配置」步骤直接失败，而不是悄悄用一个失效的 token。

创建方式：GitHub `Settings → Developer settings → Personal access tokens → Fine-grained`，
仓库选本仓，权限给 `Contents: Read and write`、`Pull requests: Read and write`、`Issues: Read and write`。

> `api` / `baseURL` / `model` / `thinkingFormat` 之所以必填：`gateway` 是**手写路由**，
> 不是 pi-ai 内置 catalog，没有默认值可继承。缺任一项，workflow 的「检查配置」步骤
> 会**逐项点名**，不必等模型调用才失败。

### 1.1 可选：让 agent 自动开 PR

| 类型 | 名字 | 说明 |
| --- | --- | --- |
| **Secret** | `AI_PAT` | fine-grained PAT，需 `contents` + `pull_requests` + `issues` 写权限 |
| Variable | `AI_CREATE_PR` | 填 `true` 开自动建 PR；不填则**只推分支**，由人开 PR |

**为什么建议配 `AI_PAT`**：用默认的 `GITHUB_TOKEN` 开的 PR **不会触发 CI**
（GitHub 防递归机制）—— 那样门控形同虚设，PR 得人工重新触发。缺 `AI_PAT` 时
workflow 不会失败，只会打一条 `::warning::`。

### 1.2 换 provider：**只改变量，不换密钥**

**只有一把密钥：`DSH_GATEWAY_KEY`。** 换 provider —— 包括换成 OpenAI 兼容的任意端点 ——
**不需要新增任何 Secret**，只改下面这几个 Variable 即可：

| 要改什么 | Variable | 例子 |
| --- | --- | --- |
| 协议 | `DSH_GATEWAY_API` | `openai-completions`（换 OpenAI 兼容端点时改这里） |
| 端点 | `DSH_GATEWAY_BASE_URL` | `https://api.openai.com/v1` |
| 模型 | `DSH_GATEWAY_MODEL` | `gpt-4o` |
| 推理方言 | `DSH_GATEWAY_THINKING` | 与网关/模型匹配的档位名 |

密钥名**始终不变**，只是它的**值**跟着换成新 provider 的。这就是为什么不需要
`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` —— 它们代表的是「key 与执行体绑定」的旧模型，
而现在执行体固定、provider 由变量决定。

`DSH_GATEWAY_KEY` 会被 [`dsh-patch.yml`](../.github/ai/dsh-patch.yml) 的 `apiKeyEnv`
按名字引用，所以改 provider 时不用碰仓库里任何文件。

### 1.3 这些不再需要了（已移除）

| 名字 | 为什么移除 |
| --- | --- |
| `ANTHROPIC_API_KEY` | 旧的 `AI_AGENT=claude` 分支用；该分支已删 |
| `OPENAI_API_KEY` | 旧的 `AI_AGENT=omp` 分支用；该分支已删 |
| `DEEPSEEK_API_KEY` | 从未被消费 |
| `AI_AGENT` | 执行体已固定为 `dsh` |
| `ANTHROPIC_BASE_URL` | 随 claude 分支一起移除 |

`DSH_GATEWAY_MODEL_NAME` / `_REASONING` / `_CONTEXT_WINDOW` / `DSH_AGENT_REASONING`
这四个也一并从 workflow 里清掉了 —— 它们被注入环境但**没有任何消费方**
（`dsh-patch.yml` 与 `run-agent.sh` 都不读，实测 grep 0 命中）。将来要用得先在
`dsh-patch.yml` 里接线，并注意 YAML 硬约束：**写了 key 就必须有值**
（[`ai-dev-pipeline.md`](./ai-dev-pipeline.md) §13.2）。

---

## 2. i18n 翻译流水线（`.github/workflows/translate.yml`）

**最省事的配法：什么都不用额外配** —— 它默认回退到 §1 那套 `DSH_GATEWAY_*`，
只要 §1 配好了，翻译就能跑。

要在**本地**跑 `pnpm i18n`，把密钥放进环境变量即可（`i18n.config.json` 只放地址与模型名）：

```bash
export I18N_GATEWAY_KEY=sk-…     # 缺省回退 DSH_GATEWAY_KEY
pnpm i18n:provider               # 先核对：打到哪个网关、用哪个模型
pnpm i18n
```

---

## 3. 可选的「翻译单独配置」（`I18N_*`）

翻译默认与 agent 共用 provider，但**每一个字段都能单独拆开** —— 三层回退，
逐字段独立判定：

```
I18N_* 环境变量  >  i18n.config.json 的 provider 段  >  共用的 DSH_GATEWAY_*
```

**只覆盖想改的那一项即可**，其余继续共用：

| 类型 | 名字 | 说明 |
| --- | --- | --- |
| **Secret** | `I18N_GATEWAY_KEY` | 翻译的网关密钥；不填则回退 `DSH_GATEWAY_KEY` |
| **Secret** | `I18N_PROVIDER_KEY` | 可选。仅 `provider-native` 且**不用 BYOK** 时的厂商 key |
| Variable | `I18N_GATEWAY_BASE_URL` | 翻译的端点；不填则回退 `DSH_GATEWAY_BASE_URL` |
| Variable | `I18N_GATEWAY_MODEL` | **翻译的模型**；不填则回退 `DSH_GATEWAY_MODEL` |
| Variable | `I18N_GATEWAY_API` | 协议；不填则回退 `DSH_GATEWAY_API` |
| Variable | `I18N_GATEWAY_AUTH_MODE` | `provider-native` / `rest-api` / `direct`；**留占位符或空则按地址自动推断** |
| Variable | `I18N_GATEWAY_ID` | 可选，`cf-aig-gateway-id`（Cloudflare AI Gateway 用） |

**典型场景**：

- **只想换翻译的模型**（地址、密钥继续共用）→ 只配 `I18N_GATEWAY_MODEL`
- **翻译走另一个网关** → 配 `I18N_GATEWAY_BASE_URL` + `I18N_GATEWAY_KEY`
- **翻译用便宜的模型**（省钱）→ 只配 `I18N_GATEWAY_MODEL`

三种鉴权形态与 [`apps/ai/src/model-config.ts`](../apps/ai/src/model-config.ts) 同义：

| `authMode` | 地址形态 | 密钥发到哪个头 |
| --- | --- | --- |
| `provider-native` | `gateway.ai.cloudflare.com/v1/<acct>/<gw>/<provider>` | `cf-aig-authorization` |
| `rest-api` | `api.cloudflare.com/client/v4/accounts/<acct>/ai/v1` | `Authorization` |
| `direct` | 厂商原生 / 自建网关 | `Authorization` |

> **不用背这张表** —— 地址填对时脚本会**自动推断**鉴权形态。
> 想确认就 `pnpm i18n:provider`，它只打印不翻译。

---

## 4. ⚠️ 占位符：预置配置的坑

**GitHub 不允许 Variable 为空值**（API 报 `Variable value cannot be empty`）。
所以预置仓库配置时，只能先填一个占位符，由人再改成真值。

**本仓统一用尖括号形式的占位符**：`<FILL_ME>`、`<YOUR_GATEWAY_URL>` 之类。

检查脚本会**把整体被尖括号包裹的值当作「没配」**，所以占位符**不会**造成假通过：

- `pnpm i18n:provider` 会报 `⚠ 这些变量还是占位符…`
- AI 流水线的「检查配置」步骤会**直接失败**并点名

> 只认「整体包裹」形式，所以 URL 里的 `<account_id>` 段（前面还有内容）不受影响。

---

## 5. 一次配好的完整流程

### 5.1 用 `gh` 预置（值留占位符，之后自己改）

```bash
# AI 流水线必填（Secret 可空，Variable 只能先填占位符）
gh variable set DSH_GATEWAY_BASE_URL --body '<FILL_ME>'
gh variable set DSH_GATEWAY_MODEL    --body '<FILL_ME>'
gh variable set DSH_GATEWAY_API      --body 'openai-completions'
gh variable set DSH_GATEWAY_THINKING --body '<FILL_ME>'
gh secret   set DSH_GATEWAY_KEY      # 交互式粘贴，或 --body '<FILL_ME>'
```

### 5.2 到网页上改成真值

`Settings → Secrets and variables → Actions → Variables` 逐个点开改。
（Variable 改值：点名字 → Update；Secret 只能**重新 set**，看不到原值。）

### 5.3 核对

```bash
pnpm i18n:provider        # 翻译侧：打印端点/模型/密钥来源，占位符会点名
gh variable list          # 列出当前所有 Variable
gh secret list            # 列出当前所有 Secret（只显示名字与时间）
```

### 5.4 验证真的能跑

给任意 issue 打 `i18n:ready` 标签触发翻译，或到 Actions 页手动 Run workflow
（`i18n 翻译` → Run workflow）。跑通后它会推一个 `i18n/translate-<run>` 分支并
回一条链接到 issue。

---

## 5.5 代码作者门控（`code-authorship.yml`）

**规则：业务代码只由 AI 流水线产出。** 人写需求 → AI 写码 → 人 review 合并。

| 情况 | 结果 |
| --- | --- |
| PR 的提交全部来自允许邮箱 | ✅ 通过 |
| 混入人类邮箱的提交 | ❌ **失败**，逐条列出违规提交 |
| 带 `human-override` 且由仓库成员（admin / write / maintain / triage）打上 | ✅ 豁免 |
| 带 `human-override` 但打标签的人不是仓库成员 | ❌ 仍失败 |

**配置项（可选）**：

| 类型 | 名字 | 说明 |
| --- | --- | --- |
| Variable | `AI_COMMIT_EMAILS` | 允许的提交邮箱（逗号分隔）。不配则用内置默认：`cocodev@agent.qq.com,i18n-bot@users.noreply.github.com` |

**逃生舱 `human-override`** —— 紧急修复、改 typo、回滚时用。仓库成员给 PR 打上这个标签即放行。
（标签已创建；若被删除，跑一次「同步标签」workflow 或在网页上按 `.github/labels.yml` 重建。）

> 判定看的是**提交身份**，不是「PR 是谁开的」—— 人开 PR 是正常流程
> （AI 推完分支后，本就由人点链接创建 PR）。

---

## 6. 让门控真正生效：分支保护

**⚠️ 只配好 workflow 是不够的** —— 当前仓库默认分支**未开启分支保护**，
门控失败只显示一个红叉，**不阻止合并，也不阻止直接 push**。

要让规则成为硬门槛，到 `Settings → Branches → Add branch protection rule`，
分支填 `canary`（或默认分支名），勾选：

- ✅ **Require a pull request before merging** —— 这是根本；否则可以直接 push 到 canary，绕过一切门控
- ✅ **Require status checks to pass before merging**，并选中：
  - `typecheck + build` —— CI（含 i18n 检查）
  - `提交身份` —— 代码作者门控
- ✅ **Require branches to be up to date before merging**
- ❌ 保持 **Allow force pushes / Allow deletions** 关闭

配好后，人类手写的 PR 会被 `提交身份` 拦下，CI 不绿也合不进去。

---

## 7. 相关文档

- **改 workflow 本身 / 了解设计取舍** → [`ai-dev-pipeline.md`](./ai-dev-pipeline.md) §13
  （为什么用 `--patch`、三条实测硬约束、换 provider 的完整动作）
- **翻译流水线怎么工作** → [`.agents/docs/i18n-translation-pipeline.md`](../.agents/docs/i18n-translation-pipeline.md)
- **`dsh` 的 patch 结构** → [`.github/ai/dsh-patch.yml`](../.github/ai/dsh-patch.yml) 末尾有逐项说明
