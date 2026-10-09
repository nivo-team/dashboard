#!/usr/bin/env bash
#
# AI agent 适配层 —— 「用哪个 CLI、怎么调用」只在这里定义一次。
#
# 为什么要这一层：workflow 只负责编排（checkout / 装依赖 / 开 PR），
# agent CLI 的参数细节（flag 差异、版本升级后的变化）全部收敛在这个文件。
# 换 CLI 或换 flag 时**只改这里**，不要散到 workflow 里。
#
# ## 只有一个执行体，也只有一把密钥
#
# 本仓固定用 dsh，**不提供 claude / omp 的分支**。原因：那些执行体各自要求
# 自己的密钥（ANTHROPIC_API_KEY / OPENAI_API_KEY），于是「换执行体」就等于
# 「再配一把 key」—— 密钥面随模式膨胀，且每把都要单独轮换、单独审计。
#
# 换 provider（含换成 OpenAI 兼容的任意端点）**不需要动这个文件、也不需要新密钥**：
# 改 `.github/ai/dsh-patch.yml` 读的那几个变量即可 ——
#   DSH_GATEWAY_API      协议（如 openai-completions）
#   DSH_GATEWAY_BASE_URL 端点
#   DSH_GATEWAY_MODEL    模型 id
#   DSH_GATEWAY_THINKING 推理方言
# 凭据始终是同一把 `DSH_GATEWAY_KEY`。
#
# 用法：run-agent.sh <prompt 文件路径>
#
# 环境变量：
#   DSH_GATEWAY_KEY     网关凭据 —— 被 .github/ai/dsh-patch.yml 的 apiKeyEnv 引用；
#                       凭据解析里「进程环境」层优先级最高（官方文档点名了
#                       「CI 机密」这个用法），所以不必写任何凭据文件
#   DSH_GATEWAY_*       provider 配置（端点 / 模型 / 协议 / 方言），
#                       完整清单见 .github/ai/dsh-patch.yml 末尾
#   DSH_HOME            可选，harness home（默认 ~/.dsh）
#   DSH_PATCH           可选，patch 文件路径（默认 .github/ai/dsh-patch.yml）
#
set -euo pipefail

PROMPT_FILE="${1:?用法: run-agent.sh <prompt 文件路径>}"
[[ -f "$PROMPT_FILE" ]] || { echo "::error::prompt 文件不存在: $PROMPT_FILE"; exit 1; }

PROMPT="$(cat "$PROMPT_FILE")"

echo "== prompt=$(wc -c <"$PROMPT_FILE") 字节 =="

# DeepSeek Harness 的 one-shot 模式：提交一个任务、等它停稳、把最后一条
# 非空 assistant 文本打到 stdout，然后退出（成功 0 / 失败 1）。
# 它原生读 AGENTS.md（dsh-agent-instructions）与 .agents/skills
# （dsh-skill-filesystem），所以本仓的规范不需要额外接线。
#
# 实测（本机 @deepseek-ai/dsh 0.1.5-rc.3，2026-09-27）：端到端跑通 ——
# profile 自动初始化、插件加载、凭据解析、网关调用、退出码全部正常。
if ! command -v dsh >/dev/null 2>&1; then
  echo "== 安装 @deepseek-ai/dsh =="
  # 用 pnpm 而不是 npm：npm 11.19 的 arborist 在 DSH 的依赖树上会崩
  # （TypeError: Cannot read properties of null (reading 'matches')），已实测。
  # --allow-build：pnpm 默认拦截依赖的 build script，而 DSH 的 bash 工具走
  # dsh-subprocess-local（含 native 构建）。不放行的话 agent 只能读写文件、
  # 跑不了 pnpm typecheck 这类自检 —— 那会显著拉低一次通过率。
  pnpm add -g @deepseek-ai/dsh --allow-build=@deepseek-ai/dsh-subprocess-local
fi

# headless profile 首次使用会从随附模板自动初始化，所以第一次运行会慢一些
# （要在 $DSH_HOME/profiles/headless 下装插件依赖）。
#
# --patch 叠加 provider 配置（网关地址 / 模型清单 / 凭据引用名）。
# 要换模型就改 .github/ai/dsh-patch.yml 里的 agent-default-model。
DSH_PATCH="${DSH_PATCH:-.github/ai/dsh-patch.yml}"
args=(--profile headless)
if [[ -f "$DSH_PATCH" ]]; then
  args+=(--patch "$DSH_PATCH")
else
  echo "::warning::找不到 patch 文件 $DSH_PATCH —— 将回落到 profile 自带的默认 provider"
fi
args+=("$PROMPT")

dsh "${args[@]}"

echo "== agent 执行结束 =="
