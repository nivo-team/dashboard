# @admin/ai

AI 中间层（**Hono on Cloudflare Workers**）：拼接系统提示词 + 作为 **OpenAI 兼容管道**把请求透传到 AI Gateway 并原样回传 SSE。

```bash
pnpm -C apps/ai dev        # 本地 http://localhost:3002
pnpm -C apps/ai deploy     # 部署到 Cloudflare
```

## 端点

| 端点 | 说明 |
|---|---|
| `GET /health` | 自述阶段、脱敏与鉴权是否启用、上游是否配置；**不回显密钥** |
| `POST /v1/chat/completions` | **透传管道**：注入服务端 system（按 `promptStage` 取层）→ 剥离 `promptFacts` / `promptStage` → 注入凭证 → 返回上游 body（SSE 原样） |
| `POST /v1/system-prompt` | 只取提示词（JSON）；接受 `promptStage`（缺省 `execution`） |
| `POST /v1/system-prompt/stream` | 同上，SSE：`meta` → `chunk`* → `done` |
| `GET /v1/system-prompt/layers` | 层目录（`id` + `title` + `group` + `stages` + `volatile`） |

请求体里的私有字段 **`promptFacts`** = 事实快照（页面上下文 / 页面摘要 / 工具目录 / 导航 / 任务 / 模式 / 容器 / 输出语言），
由前端上报；服务端消费后**必然删除**，不会发给厂商。字段表见
[`.agents/docs/ai-server-layer.md`](../../.agents/docs/ai-server-layer.md) §3.5。

另有私有字段 **`promptStage`**（`'router' | 'execution'`）：决定本轮装配哪几层提示词，
同样**消费后即删除**；**缺省 `execution`**（老前端行为不变）。语义见同文档 §1.4。

## 职责边界

- 本 Worker：**提示词规则**（真值在 [`packages/ai-prompt`](../../packages/ai-prompt)）+ **上游凭证** + 管道；
- AI Gateway：**provider / 模型路由 / 重试回退 / 缓存 / 限流 / DLP**；
- 前端：采集事实、执行工具（工具循环仍在前端，Worker 不参与）。

## 现在**不**做什么（别误读）

- ❌ **不校验鉴权**：`/health` 自述 `auth: 'unverified'`。CORS 白名单只约束浏览器，**拦不住 curl**；
  上线前必须补（目标是**与后端统一 token**，落点见文档 §8）。
- ❌ **不脱敏**：`src/redact.ts` 恒等占位，`/health` 自述 `redaction: false`。详见文档 §9 的取舍
  （逐块改写会放弃「零处理透传」，而网关 DLP **只能阻断/标记，不能替换**）。

## 结构

```
src/index.ts                  Hono app：CORS、/health、路由挂载、404/onError
src/routes/chat.ts            透传管道（注入 system + 凭证，原样返回上游 body）
src/routes/system-prompt.ts   提示词接口（JSON + SSE）
src/facts.ts                  HTTP 输入规范化（不信任输入）+ 阶段解析（resolvePromptStage，缺省 execution）
src/model-config.ts           上游地址 + 鉴权形态（provider-native / rest-api / direct）+ 是否覆盖 model
src/cors.ts                   来源白名单
src/redact.ts                 出站脱敏预留钩子
src/env.ts                    vars / secrets 类型边界
```

## 配置

| 名字 | 类型 | 说明 |
|---|---|---|
| `ALLOWED_ORIGINS` | var | 允许的前端来源（逗号分隔）；生产必须显式列真实域名 |
| `AI_GATEWAY_BASE_URL` | var | 上游端点。**两种填法都收**：填到 `/ai/v1` 为止，或直接粘完整端点（结尾 `/chat/completions`） |
| `AI_GATEWAY_AUTH_MODE` | var | `provider-native`（默认）/ `rest-api` / `direct` |
| `AI_GATEWAY_ID` | var | 指定 `cf-aig-gateway-id`。**留空 = 走账户 default gateway**；REST API 路径里没有 gateway 标识 |
| `AI_MODEL_ID` | var | 填了会**覆盖**客户端 model。**必须用网关命名**：`author/model`（`deepseek/deepseek-chat`）或 `@cf/author/model`；**裸名会失败** |
| `AI_GATEWAY_TOKEN` | **secret** | Cloudflare 令牌（`rest-api` 下是 `Authorization: Bearer`，需 **Workers AI > Read**；`provider-native` 下是 `cf-aig-authorization`） |
| `AI_PROVIDER_API_KEY` | **secret** | 厂商 key（`direct` 模式必需；`provider-native` 下作为上游 key；**BYOK 时留空**） |

**REST API 形态的一行配置示例**（`https://api.cloudflare.com/.../ai/v1/chat/completions`）：

```toml
AI_GATEWAY_AUTH_MODE = "rest-api"
AI_GATEWAY_BASE_URL = "https://api.cloudflare.com/client/v4/accounts/<account_id>/ai/v1"
AI_GATEWAY_ID = ""                      # 留空走 default gateway；要指定就填 gateway 名
AI_MODEL_ID = "deepseek/deepseek-chat"  # 注意 author/model 格式
```

**模型 id 的实测提醒**（详见 [`.agents/docs/ai-server-layer.md`](../../.agents/docs/ai-server-layer.md) §10.2）：

- `deepseek/deepseek-chat` 实测可用，但**不在官方模型目录**里 → `{provider}/{model}` 的 model 段走 provider 侧命名，属**未文档化路径**；
- `402 Insufficient balance` 是**账户余额/BYOK 问题**，不是配置错；
- `7003 Model not found` 才是模型 id 错（裸名如 `deepseek-flash` 必错）。

```bash
cp .dev.vars.example .dev.vars                                  # 本地
pnpm -C apps/ai exec wrangler secret put AI_GATEWAY_TOKEN       # 线上
```

`.dev.vars` 已在根 `.gitignore` 里。

> 完整设计、SSE 的官方成本依据、Cloudflare AI Gateway 的限制与鉴权/脱敏计划见
> [`.agents/docs/ai-server-layer.md`](../../.agents/docs/ai-server-layer.md)。
