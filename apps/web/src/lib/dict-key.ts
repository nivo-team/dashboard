/**
 * 字典 key 的命名空间适配层（**架构升级时唯一需要改的文件**）。
 *
 * ## 背景
 *
 * 新架构的字典分类在接口里带一层临时命名空间：分类 `code` 与 `/data_dict/options`
 * 的返回 key 都是 `new.user.status`；正式版会去掉 `new.` 这层，变成 `user.status`。
 *
 * 业务代码一律使用**逻辑 key**（`user.status`，不带命名空间），映射只在本文件做：
 *
 * - `data_dict/options` 的返回映射：`new.user.status` → `user.status`（并过滤历史命名空间）；
 * - 字典文案查表（`messages/dict/<模块>/<locale>.json`）的目录结构同样基于逻辑 key，
 *   所以**升级时两份数据都不用动，业务模块的代码也不用动**。
 *
 * ## 升级步骤（待后端去掉 `new.` 后）
 *
 * 1. 把 `DICT_NAMESPACE` 改成 `''`（或直接删掉前缀判断）；
 * 2. 跑一遍 `verify` skill 确认字典文案与 options 仍能取到；
 * 3. 没有第 3 步 —— 其余代码不感知命名空间。
 */
/**
 * 字典 key 的命名空间开关。
 *
 * 新架构早期，分类 code 与 `/data_dict/options` 的返回 key 都带一层临时的 `new.`
 * 命名空间（`new.user.status`），业务代码则统一使用逻辑 key。现在服务端
 * （见 `apps/mock`）已经直接下发逻辑 key，这里随之置空 —— 不再需要任何剥离动作。
 *
 * 保留常量与过滤分支是为了让「将来若再引入命名空间」只需改这一处；
 * 置空时 `stripDictNamespace` 不做过滤，原样返回。
 */
export const DICT_NAMESPACE: string = ''

function splitSegments(value?: string | null): string[] {
  return String(value ?? '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

/**
 * 剥掉临时命名空间，得到逻辑 key。
 *
 * - `new.user.status` → `user.status`
 * - 历史命名空间（`common.channel` 等）→ `null`（**用于过滤旧数据**，不进入新架构）
 * - `DICT_NAMESPACE` 为空串时不做过滤，原样返回（正式版行为）
 */
export function stripDictNamespace(rawKey?: string | null): string | null {
  const raw = String(rawKey ?? '').trim()
  if (!raw) return null

  if (DICT_NAMESPACE) {
    if (!raw.startsWith(DICT_NAMESPACE)) return null
    const logical = raw.slice(DICT_NAMESPACE.length).trim()
    return logical || null
  }

  return raw
}

/**
 * **展示用**：剥掉临时命名空间；不属于该命名空间时**原样返回**（不丢信息）。
 *
 * 与 `stripDictNamespace` 的差别在失败语义：
 * - `stripDictNamespace` 是**过滤**语义（返回 `null` = 这条数据不属于新架构，丢掉），
 *   用于构建 options / 文案映射；
 * - 本函数是**展示**语义（剥不掉就显示原值），用于列表、信息卡片等直接呈现 code 的地方。
 *
 * 例：`new.user.status` → `user.status`；`common.channel` → `common.channel`。
 */
export function displayDictCode(code?: string | null): string {
  const raw = String(code ?? '').trim()
  if (!raw) return ''
  return stripDictNamespace(raw) ?? raw
}

/**
 * 分类 `code`（或 options 的原始 key）→ dict path：`new.user.status` → `user.status`。
 *
 * 去掉命名空间后**至少要剩两段**（模块 + 分类 key）才可寻址，否则返回 `null`
 * —— 表示这个分类没有前端文案 / 选项，调用方直接回落后端 `label`。
 */
export function dictPathOf(code?: string | null): string | null {
  const path = stripDictNamespace(code)
  if (!path || splitSegments(path).length < 2) return null
  return path
}

/** dict path → 模块名：`user.status` → `user`；不足以寻址时返回 `null`。 */
export function dictModuleOf(path?: string | null): string | null {
  const segments = splitSegments(path)
  return segments.length >= 2 ? segments[0] : null
}

/** dict path → 分类 key：`user.status` → `status`；不足以寻址时返回 `null`。 */
export function dictKeyOf(path?: string | null): string | null {
  const segments = splitSegments(path)
  return segments.length >= 2 ? segments.slice(1).join('.') : null
}
