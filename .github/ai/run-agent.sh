#!/usr/bin/env bash
#
# AI agent 适配层 —— 「用哪个 CLI、怎么调用」只在这里定义一次。
#
# 为什么要这一层：workflow 只负责编排（checkout / 装依赖 / 开 PR），
# agent CLI 的参数细节（各家的 flag 差异、版本升级后的变化）全部收敛在这个文件。
# 换 CLI 或换 flag 时**只改这里**，不要散到 workflow 里。
#
# 用法：run-agent.sh <prompt 文件路径>
#
# 环境变量：
#   AI_AGENT            dsh | claude | omp（默认 dsh）
#   DSH_GATEWAY_KEY     dsh 的网关凭据 —— 被 .github/ai/dsh-patch.yml 的 apiKeyEnv
#                       引用；凭据解析里「进程环境」层优先级最高（官方文档点名了
#                       「CI 机密」这个用法），所以不必写任何凭据文件
#   DSH_GATEWAY_*       dsh 的 provider 配置（端点 / 模型 / 协议 / 方言），
#                       完整清单见 .github/ai/dsh-patch.yml 末尾
#   DSH_HOME            可选，harness home（默认 ~/.dsh）
#   AI_MODEL            可选，指定模型（claude / omp 用；dsh 的模型走 patch）
#   ANTHROPIC_API_KEY   claude 需要
#   ANTHROPIC_BASE_URL  可选，走自建/第三方网关时设置（claude 用）
#
set -euo pipefail

PROMPT_FILE="${1:?用法: run-agent.sh <prompt 文件路径>}"
[[ -f "$PROMPT_FILE" ]] || { echo "::error::prompt 文件不存在: $PROMPT_FILE"; exit 1; }

AI_AGENT="${AI_AGENT:-dsh}"
PROMPT="$(cat "$PROMPT_FILE")"

echo "== agent=$AI_AGENT prompt=$(wc -c <"$PROMPT_FILE") 字节 =="

case "$AI_AGENT" in
  dsh)
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
    ;;

  claude)
    # Claude Code：本仓已有 CLAUDE.md 与 .claude/skills，它能直接读到仓库规范，
    # 所以是零额外配置的默认选择。
    if ! command -v claude >/dev/null 2>&1; then
      echo "== 安装 @anthropic-ai/claude-code =="
      npm install -g @anthropic-ai/claude-code
    fi

    # 权限最小化：只放行「读 + 改文件 + 跑校验」。
    # 刻意**不给** git push / gh / 网络类命令 —— 提交与开 PR 由 workflow 负责，
    # agent 不该有动远端的能力（对应报告里的「push 限定在它自己 checkout 过的分支」）。
    #
    # 注意：Claude Code 的 flag 会随版本演进。首次运行请核对 `claude --help`；
    # 若 --permission-mode / --allowedTools 的名字变了，改这一处即可。
    args=(
      -p "$PROMPT"
      --permission-mode acceptEdits
      --allowedTools "Read,Write,Edit,Glob,Grep,Task,Bash(pnpm typecheck),Bash(pnpm build),Bash(pnpm install),Bash(ls:*),Bash(cat:*),Bash(git status),Bash(git diff:*),Bash(git log:*)"
      # text 而非 stream-json：流水线要解析末尾的 ---AI-SUMMARY--- 块，
      # 纯文本下 grep 就能取到；换成 stream-json 时摘要会埋在 JSON 里，
      # 需要额外的解析步骤。想留结构化事件流时改这里（并同步改 workflow 的解析）。
      --output-format text
    )
    [[ -n "${AI_MODEL:-}" ]] && args+=(--model "$AI_MODEL")

    claude "${args[@]}"
    ;;

  omp)
    # omp（Oh My Pi）：社区实证的 headless 路径（报告 §2.4）。
    # 它支持 40+ provider，走 OpenAI 兼容网关时比 claude 更灵活。
    if ! command -v omp >/dev/null 2>&1; then
      echo "== 安装 omp =="
      curl -fsSL https://omp.sh/install | sh
      export PATH="$HOME/.omp/bin:$PATH"
    fi

    args=(-p "$PROMPT" --mode json --max-time 45m)
    # 无头环境下没有交互终端，审批必须在启动时定档（omp 在无头下不支持挂起询问）
    args+=(--approval-mode yolo)
    [[ -n "${AI_MODEL:-}" ]] && args+=(--model "$AI_MODEL")

    omp "${args[@]}"
    ;;

  *)
    echo "::error::未知的 AI_AGENT: $AI_AGENT（支持 dsh | claude | omp）"
    exit 1
    ;;
esac

echo "== agent 执行结束 =="
