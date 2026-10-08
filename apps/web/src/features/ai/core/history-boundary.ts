import type { AiMessage } from './types'

/**
 * 历史工具结果的**衰减边界** —— 纯函数、零运行时依赖（单独成文件就是为了可测）。
 *
 * ## 它解决什么
 *
 * 工具结果是**最容易撑爆上下文**的东西：一次 `call_read_api` 可能返回几百行 JSON
 * （单条上限见 runtime 的 `MAX_RESULT_CHARS`），而它会跟着后面每一轮重发。
 * 但后续对话真正需要的往往只是「当时调了什么、拿到没有」—— 具体数据要再用，
 * 模型重新调一次就是。所以更早的轮次只留一句占位。
 *
 * 保留的是：用户说过的话、助手的文本、以及**工具调用本身（名字 + 入参）** ——
 * 模型仍然知道"那一步做了什么"，只是看不到那几百行返回。
 *
 * ## 为什么是「阶梯」而不是「每轮前移一位」
 *
 * 各家厂商的前缀缓存都要求「**只追加、不改写历史**」（见 `.agents/docs/ai-server-layer.md` §7.6）：
 * 编辑 / 删除 / 重排任何早期消息都会让缓存失配。而"每轮前移一位"的衰减，
 * 等于**每一轮都改写一处历史** —— 上一轮写入的缓存前缀单元因此永远匹配不上，
 * 命中率被系统性压低。
 *
 * 按阶梯前进后，只在总轮数跨过 6、9、12… 时改写一次（频率降到 1/N），
 * 而上下文仍然有界：保留轮数在下限之上浮动，最多多留 `DROP_STEP_TURNS - 1` 轮。
 *
 * **代价**是那时会多留几轮的工具结果 —— 但多留的部分**命中缓存**（价格约为未命中的
 * 1/10 ~ 1/50），远比「每轮都让整段前缀失配」划算。
 */

/** 保留**完整**工具结果的最近轮数（下限）；更早的只留一句占位。 */
export const FULL_TOOL_RESULT_TURNS = 3

/** 衰减点的**阶梯**：丢弃点每前进一次，就跨过这么多轮。 */
export const DROP_STEP_TURNS = 3

/**
 * 算出「从哪里之后保留完整工具结果」—— 返回值之前的工具结果走占位。
 *
 * - 总轮数 ≤ 下限 → `0`（全部保留）；
 * - 否则丢弃点按 `DROP_STEP_TURNS` 阶梯前进：**同一档内的多轮请求拿到同一个边界**；
 * - 边界只前进不后退（总轮数单调增长 ⇒ 公式单调），历史不会被"改回来"。
 */
export function resolveRecentBoundary(messages: readonly AiMessage[]): number {
  let totalTurns = 0
  for (const message of messages) {
    if (message.role === 'user') totalTurns += 1
  }

  const dropTurns =
    Math.floor(Math.max(0, totalTurns - FULL_TOOL_RESULT_TURNS) / DROP_STEP_TURNS) * DROP_STEP_TURNS
  if (dropTurns === 0) return 0

  // 边界 = 第 dropTurns 轮**之后**的位置
  let seen = 0
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].role !== 'user') continue
    seen += 1
    if (seen > dropTurns) return i
  }
  return 0
}
