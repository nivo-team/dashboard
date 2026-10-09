# i18n：单语言开发 + AI 翻译流水线

> **一句话**：开发阶段**只写默认语言**（`i18n.config.json` 的 `sourceLocale`），
> 其余语言由 `pnpm i18n` 用 AI 补齐 —— 带缓存（只翻增量）、支持按模块翻、
> 译文由人开 PR 审核。
>
> **语言清单的真值只有 `i18n.config.json` 一处**（`sourceLocale` + `targetLocales`）。
> 本文**刻意不列举具体语言** —— 它变过，写在这里必然过期。
> 契约见 [AGENTS.md](../../AGENTS.md) 铁律 1。

## 1. 为什么这么改

原来的规则是「用户可见文案必须所有目标语言齐全」，靠人（或 AI）在写功能时手工补译文。
实际后果：

- AI agent 每写一个页面都要额外产出多份译文，注意力被切碎、token 翻倍；
- 译文中途还可能写错键名，而这些错误**门控照不到**（门控当时只看 JSON 之间的键树一致性，
  不看代码用了什么键）；
- 一旦漏翻，非中文用户在界面上直接看到**键名**。

新契约把职责拆开：

| 角色 | 负责什么 |
| --- | --- |
| 开发者 / AI agent | **只写 `zh-CN`**，写对键名 |
| `check-keys.mjs` | 代码里的键 **↔** 源语言 JSON（缺键 = ERROR） |
| `translate.mjs` | 源语言 **→** 目标语言（只翻增量、带缓存） |
| `check-guardrails.mjs` | 键树结构健康（缺译文 = WARN，不阻塞开发） |
| `translate.mjs --check` | 译文是否等齐（CI 硬门控：没翻完不许合并） |

## 2. 日常怎么用

```bash
# 1. 加文案：只改 apps/web/src/messages/<ns>/zh-CN.json
#    代码里用类型安全的 hook，写错键名当场报错：
#      const t = useT('users')        // #/lib/use-typed-t
#      t('columns.nickname')          // ✅
#      t('columns.nicknameX')         // ❌ pnpm typecheck 直接报错

pnpm i18n:types     # 改了 zh-CN.json 之后重新生成键类型
pnpm i18n:dry       # 先看计划：会翻哪些键、哪些命中缓存
pnpm i18n:provider  # 核对配置：打到哪个网关、用哪个模型、密钥来自哪一层
pnpm i18n           # 真翻（I18N_GATEWAY_* ；未配的字段回退共用 DSH_GATEWAY_*）
pnpm i18n:check     # 校验是否还有未翻译的键（CI 同款）
```

只翻特定范围（省 token）：

```bash
pnpm i18n -- --module=users              # 只翻 users 这个命名空间
pnpm i18n -- --locale=en,ar              # 只翻英语与阿拉伯语（短码自动归一）
pnpm i18n -- --include-stale             # 连「值与中文相同」的键一起重翻（谨慎）
pnpm i18n -- --module=users --force       # 忽略缓存重翻
I18N_MODULES=users,roles pnpm i18n        # 环境变量写法（CI 更常用）
```

## 3. 三种键状态（核心语义）

| 状态 | 判定 | 处置 |
| --- | --- | --- |
| `added` | 目标语言没有这个键 | **翻译**（唯一的待办） |
| `stale` | 目标语言的值与源语言**逐字相同** | **默认跳过**；`--include-stale` 才翻 |
| `edited` | 目标语言的值与源语言不同 | **保留，绝不覆盖** |

推论：

- **存量译文天然安全**：仓库里已有的译文都是 `edited`，首跑不会动它们；
- **人工修正不会被机器冲掉**：改了某条译文后再跑翻译，它仍是 `edited`，脚本跳过。

### `stale` 为什么默认不翻

「值与中文相同」**不能可靠地推断「漏翻」**。本仓的真实反例：

- **本来就该原样**：`Ask AI` / `Ctrl K` / `string` / `number` / `/system/menus` /
  `n:menus:list` —— 品牌名、快捷键、代码、路径、权限标识；
- **汉字文化圈共用**：日语里 `操作` / `保存` / `停止` / `最大化` 与中文同形。

若把它们当漏翻：翻完结果**还是同一个值** → 下次仍是 `stale` → **反复重翻**，
既白烧 token，又让 `--check` 永远不通过。本仓接入时实测这类键有 **89 个**，
而 `added` 是 **0**。

所以：`--check` 只认 `added`；`stale` 只出现在报告里（并说明原因），
确认其中确有漏翻时才用 `--include-stale` 或 `--force`。

## 4. 缓存（省 token 的关键）

- 位置：`.cache/i18n/<locale>.json`（`.cache` 已在 `.gitignore`，不进仓库）
- 命中条件：同一个「模块 + 键 + 源文」→ 直接复用译文，**0 次 AI 调用**
- 失效条件：源文变了 / `cache.version` 变了 / 超过 `cache.ttlDays`
- CI 里用 `actions/cache` 跨运行复用（见 `.github/workflows/translate.yml`）

实测：同一批键跑第二次，网关调用次数**不增加**。

## 4.5 模型与地址：三层回退（翻译可独立，也可共用 agent）

翻译**程序化直调** OpenAI 兼容的 `/chat/completions`，不经 agent / CLI。
配置按**字段**独立地三层回退 —— 只覆盖想改的那一项即可：

| 优先级 | 来源 | 放什么 |
| --- | --- | --- |
| 1 | `I18N_*` 环境变量 | 翻译专属覆盖（CI 的 Secret / Variable、本地临时改） |
| 2 | `i18n.config.json` 的 `provider` 段 | 可进 git 的非敏感默认（地址、模型名） |
| 3 | `DSH_GATEWAY_*` 环境变量 | **与 AI 开发流水线（agent）共用**的那套 |

**逐字段独立**是关键：

```bash
# 只换翻译模型，地址与密钥继续共用 agent 的
I18N_GATEWAY_MODEL=qwen/qwen3-max pnpm i18n

# 只把翻译指向另一个网关，模型仍共用
I18N_GATEWAY_BASE_URL=https://…/ai/v1 pnpm i18n
```

**密钥只走环境变量**（`i18n.config.json` 要进仓库，不该出现密钥）：

| 变量 | 用途 | 缺失时回退 |
| --- | --- | --- |
| `I18N_GATEWAY_KEY` | 主密钥（形态见下表） | `DSH_GATEWAY_KEY` |
| `I18N_PROVIDER_KEY` | 可选；provider-native 且**不用 BYOK** 时的厂商 key | —— |

`authMode` 留空时**按地址推断**，共用 agent 的地址时通常什么都不用配：

| authMode | 地址形态 | 密钥发到哪个头 |
| --- | --- | --- |
| `provider-native` | `gateway.ai.cloudflare.com/v1/<acct>/<gw>/<provider>` | `cf-aig-authorization` |
| `rest-api` | `api.cloudflare.com/client/v4/accounts/<acct>/ai/v1` | `Authorization` |
| `direct` | 厂商原生 / 自建网关 | `Authorization` |

三种形态的语义与 [`apps/ai/src/model-config.ts`](../../apps/ai/src/model-config.ts) 一致 ——
同一个 AI Gateway，别两处各说各话。

**核对配置**用 `pnpm i18n:provider`（只打印、不翻译、不写文件）：

```
翻译 provider 配置（翻译专用变量 > i18n.config.json > 与 agent 共用）：
  端点   https://gateway.ai.cloudflare.com/v1/<account_id>/gw/openai/chat/completions
  模型   qwen/qwen3-max   ← I18N_* 变量
  鉴权   provider-native（网关 key 发送，厂商 key 不发送）

来源：地址 共用 DSH_GATEWAY_*（agent）｜模型 I18N_* 变量｜密钥 共用 DSH_GATEWAY_*（agent）
```

**程序化调用怎么保证拿到 JSON**：请求带 `response_format: { type: 'json_object' }`；
若网关 / 模型不吃这个字段（400 且报文提到 `response_format`）会**去掉它重试一次** ——
提示词本身已要求「只输出 JSON」，加上 `parseJsonResponse` 的容错（容忍 ```json 围栏与前后解释），
去掉通常也能拿到。返回后**只接受输入里出现过的键**，模型自造或漏掉的键都不会污染语言文件。

## 5. 配置：`i18n.config.json`（仓库根，唯一真值）

```jsonc
{
  // 语言清单的真值就在这两行 —— 别抄到别处
  "sourceLocale": "zh-CN",           // 开发默认语言：AI 只写它
  "targetLocales": ["ar-SA"],        // 翻译流水线的目标语言
  "modules": { "langs": { "enabled": false } },   // 按模块开关
  "provider": {                                    // 见 §4.5；密钥不写这里
    "baseUrl": "",                                 // 留空 = 回退 DSH_GATEWAY_BASE_URL
    "model": "",                                   // 留空 = 回退 DSH_GATEWAY_MODEL
    "authMode": "",                                // 留空 = 按 baseUrl 推断
    "gatewayId": "",                               // 可选，cf-aig-gateway-id
    "timeoutMs": 120000
  },
  "cache": { "dir": ".cache/i18n", "ttlDays": 30, "version": 1 },
  "limits": { "maxKeysPerRun": 2000, "concurrency": 4, "batchSize": 40 },
  "check": {
    "dynamicKeyPrefixes": ["columns.", "status."], // 允许动态拼接的键前缀
    "untranslatedAllowlist": ["ID", "URL", "OK"]   // 跨语言通用值，不算漏翻
  }
}
```

- **短码归一**：`"en"` → `en-US`、`"jp"` → `ja-JP`、`"ar"` → `ar-SA`。
  同时兼容后端 `/lang` 那套非标准短码（`cn`/`jp`），映射表在 `scripts/i18n/lib/config.mjs`。
- 语言清单的真值是 `apps/web/src/lib/locale.ts` 的 `SUPPORTED_LOCALES`，脚本从源码读，
  **不维护第二份**。
- 环境变量可覆盖：`I18N_TARGET_LOCALES`、`I18N_MODULES`。

## 6. 类型检测：写错键名在编译期就报错

```tsx
import { useT } from '#/lib/use-typed-t'

const t = useT('users')
t('columns.nickname')   // ✅ 编译期通过
t('columns.nicknameX')  // ❌ TS2345：不在该命名空间的键集合里
t(`cell.${kind}`)       // ✅ 动态前缀白名单（见 check.dynamicKeyPrefixes）
```

生成物 `apps/web/src/i18n-keys.gen.ts` 由 `pnpm i18n:types` 维护（**不要手改**）。
它导出 `I18nNamespaceKeys` / `I18nKeysOf<N>` / `I18nDynamicKey` 等类型。

### ⚠️ 为什么不用 i18next 内置的 `CustomTypeOptions.resources`

**试过，不可行**：把 10 个命名空间、约 1000 个键的精确 `resources` 类型接进
`declare module 'i18next'` 后，`pnpm typecheck` 直接 **abort（exit 134，无任何输出）**。

排查与依据（2026-10，i18next 24.2.3 + react-i18next 15.7.4 + TypeScript 6.0.3）：

- 单命名空间（312 键）≈ 11 秒可用；全量（1002 键）崩溃 → **阈值在规模**；
- 去掉模板字面量类型后同样崩溃 → 不是 `` `${Prefix}${string}` `` 的锅；
- 降级为 `Record<string, unknown>` 不崩溃，但键校验完全失效；
- 把扁平联合类型（`'a' | 'a.b' | …`）交给 `resources` 也不行：`keyof` 字符串联合得到
  `"length" | "toString" | …`（字符串自带方法），不是键集合；
- 改用**代码生成的扁平联合** + `useT()` 后：**37 秒、零崩溃、错误确实被拦住**。

这与 i18next 与 TypeScript 的已知问题一致：代价来自 `t.d.ts` 对整棵资源树的递归键路径展开，
与调用点数量相乘；本仓 900+ 处 `t()` 调用足以把类型实例化推过上限
（参见 i18next #1857 / #2246、microsoft/TypeScript #53087 / #63195）。
**注意**：不要试图用类型级递归「拍平」键路径 —— 实测比嵌套还贵数倍，正是崩溃路径。
要扁平化就**代码生成**（本仓的做法）。

### 升级路径（等条件允许时）

i18next **≥ 25.4** 的 `enableSelector: "optimize"` 是官方根治方案（文档称可处理任意规模字典，
v26 默认开启、v27 计划弃用 string-key 类型）。届时可切到 `t($ => $.a.b.c)` 写法并删掉本方案。
当前 i18next 版本是 24.2.3，**该版本没有 `enableSelector`**。

## 7. 与门控的对应

| 检查 | 脚本 | 强度 |
| --- | --- | --- |
| 代码里的键 ↔ 源语言 | `check-keys.mjs --strict` | **ERROR** |
| 真缺失（`added`）是否为 0 | `translate.mjs --check` | **ERROR**（CI） |
| 生成类型是否过期 | `gen-types.mjs --check` | **ERROR**（CI） |
| 键树结构（缺译文 / 多键） | `check-guardrails.mjs` | WARN（不阻塞开发） |
| 禁用样式、受保护路径 | `check-guardrails.mjs` | ERROR / WARN |

CI 的三道 i18n 检查在 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) 的
「i18n 检查」步骤，跑在 `pnpm install` **之前**（只依赖 Node 内置模块，违规最快失败）。

> 历史上这里有一套 `i18n-baseline.json` 豁免机制。新契约下**已移除**：
> 缺译文不再阻塞开发，源语言缺键则本就是错误、不该豁免。

## 8. 翻译流水线（CI）

[`.github/workflows/translate.yml`](../../.github/workflows/translate.yml)：

```
打 i18n:ready 标签 / 手动 Run workflow
        │
        ▼
  1 translate --provider         配置检查（只打印端点/模型/密钥来源，缺项即失败）
  2 translate --dry --stats      现状报告
  3 恢复 .cache/i18n 缓存        命中即 0 token
  4 translate                    真翻（只翻增量）
  5 translate --check            有漏翻即失败
  6 有改动 → 推分支 i18n/translate-<run>
        │
        ▼
  在 issue 里回「一键创建 PR」链接 → 人开 PR → 审核译文 → 合并
```

**配置检查交给脚本自己的 `--provider`**，不在 workflow 里再抄一份必填清单 ——
必填项随鉴权形态而变（`provider-native` 下密钥可选），硬写一份必然与脚本分叉。

workflow 同时注入 `I18N_*` 与共用的 `DSH_GATEWAY_*`：只配后者也能跑（逐字段回退），
想单独拆模型就加一个 `I18N_GATEWAY_MODEL` Variable 即可。完整凭据清单见
[`.github/ai/dsh-patch.yml`](../../.github/ai/dsh-patch.yml) 末尾。

**默认不自动开 PR**：用 `GITHUB_TOKEN` 开的 PR 不会触发 CI（防递归），
反而制造「门控在工作」的错觉 —— 与 [docs/ai-dev-pipeline.md](../../docs/ai-dev-pipeline.md) §14.3 同一取舍。

## 9. 开发期语言锁定（可选）

本地默认只写中文、其它语言可能还没翻，切过去会看到半截回退。需要时锁一下：

```bash
# apps/web/.env.local
VITE_I18N_LOCK_LOCALE=zh-CN
```

设了之后 UI 固定该语言、`useLocale().setLocale` 变成空操作（`isLocaleLocked` 为 `true`，
切换入口据此隐藏）。不设则维持原行为。

## 10. 已知边界

- **`dict/**` 不参与**：字典文案按 [dict-i18n.md](./dict-i18n.md) 的设计「只放真实存在的语言，
  缺就整份回落」，语言之间本来就可以不同，`check-guardrails` 对它跳过键树比对；
  翻译脚本对它的行为是「源语言 → 目标语言」逐项复制翻译，**不强制所有目标语言齐全**。
- **`langs` 命名空间**：只有 `zh-CN` 且全仓零引用，`enabled: false`（待确认后删除）。
- **AI 译文质量无法自动判定**：只能靠缓存 + `--dry` 报告 + 人工 PR review，
  所以**译文 diff 必须进 PR 可见**。
- **存量译文不重译**：短期术语可能与新译文不一致；需要时 `--force --module=<ns>` 按模块重刷。
- **本阶段不动** `apps/ai`（Hono Worker）与后端 `/lang` 表体系，只管前端 `messages`。
