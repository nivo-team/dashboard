# 字典选项（data_dict/options）获取层

> 目标读者：需要**用字典驱动枚举**（徽章、下拉、筛选器）的开发者。
> 配套文档：[dict-i18n.md](./dict-i18n.md)（字典**文案**的多语言）、[data-dict-module.md](./data-dict-module.md)（字典模块现状）。

## 1. 它解决什么

业务里的枚举有两件事要做：

| 需求 | 由谁提供 |
| --- | --- |
| 「有哪些值」「顺序」「是否禁用」「是否默认」「备注」 | **后端字典**（本文件，`GET /data_dict/options`） |
| 「每个值在**当前语言**下显示什么」 | 前端字典文案库（[dict-i18n.md](./dict-i18n.md)） |

把两者分开的好处：运维在后台增删角色 / 渠道时，前端**不用改代码**就能跟上；
而显示文案仍随前端版本发布（多语言、可评审）。

## 2. 接口特征

```text
GET /data_dict/options        # 无参数、一次全量
→ { code, message, result: { [分类code]: V1DataOption[] } }
```

```json
{
  "new.user.account-type": [
    { "label": "普通用户", "value": "normal", "disabled": false, "other": { "is_default": false, "remark": "" } }
  ]
}
```

- **一次拿到所有分类的选项**，所以进应用时预取一次、全应用共享（第 5 节）；
- `V1DataOption` 的 `value` / `other` 在 openapi 里是 `unknown`，本层负责收窄成稳定形态。

## 3. 规范化后的形态

`apps/web/src/lib/dict-options.ts` 把原始条目收成 `DictOption`：

```ts
type DictOption = {
  value: string      // 选项值（业务枚举值，如 normal）
  label: string      // 后端单语言显示文本（通常中文）
  disabled: boolean
  isDefault: boolean // 来自 other.is_default
  remark: string     // 来自 other.remark
}
```

`value` 为空或为对象、`label` 缺失（回退为 `value`）等异常一律就地处理，调用方拿到的永远是可用条目。

## 4. 命名空间适配层（**升级时只改这一处**）

当前后端把新架构的分类挂在临时命名空间 `new.` 下，接口 key 与分类 `code` 都是
`new.user.account-type`；**正式版会去掉这一层**，变成 `user.account-type`。

业务代码一律只写**逻辑 key**（`user.account-type`），映射集中在 `apps/web/src/lib/dict-key.ts`：

```ts
export const DICT_NAMESPACE = 'new.'   // ⏳ 正式版改成 ''（或删掉前缀判断）
```

- `stripDictNamespace('new.user.account-type')` → `user.account-type`；
  非 `new.` 开头的历史 key（`common.*` 等）→ `null`，**在获取层就被过滤掉**，不会进入业务；
- `dictPathOf()` 在此之上要求「至少两段」（模块 + 分类 key），否则视为不可寻址；
- **字典文案（`messages/dict/<模块>/<locale>.json`）的目录结构也基于逻辑 key**，
  所以升级时前端文案文件、业务模块代码都不需要动；
- **展示**用 `displayDictCode()`：同样是剥前缀，但剥不掉时**原样返回**（不丢信息）——
  用于列表与信息卡片里直接呈现 `p_code` / 字典项 `code` 的地方
  （数据字典模块的编码列、「完整编码」卡片、面包屑的名称回落都已接入）。

升级步骤：把 `DICT_NAMESPACE` 改为 `''` → 跑一次 `verify` skill 确认取值正常 → 完成。

> 这也是为什么 `dictPathOf` 不能写成「无条件丢掉首段」：那样在 `user.account-type`
> 时代会把模块名当命名空间丢掉，导致字典文案整体失效。

## 5. 预取时机（进应用时，非阻塞）

`apps/web/src/routes/$appId/route.tsx` 的外壳组件里调用 `useDictOptions()`：

- **不放在 `beforeLoad`** —— 预取是非阻塞的，进应用不需要等接口返回；
- 全应用共享同一份缓存（`staleTime` 10 分钟），业务模块调用即为命中；
- 失败不会阻断外壳渲染；接口层的业务错误仍由全局拦截器弹 toast。

## 6. API（`#/lib/dict-options`）

| API | 用途 |
| --- | --- |
| `useDictOptions()` | 全量：`{ options, isPending, error, refetch }`，`options` 是「逻辑 key → 选项」 |
| `useDictOptionList('user.account-type')` | **业务首选**：某个分类的选项列表（不存在时返回空数组） |
| `useDictOptionEntries('user.account-type')` | 选项 + **当前语言文案**（`{ ...option, text }`）—— 渲染标签、筛选候选用它 |
| `useDictOption(path, value)` | 某个分类下的单个选项（找不到返回 `undefined`） |
| `pickDictOptionLabel(options, value)` | 纯函数取 label —— **循环里用这个**，不要在循环里调 hook |
| `pickDictOptionText(options, value, localizedText)` | 固定回落链的取值：`字典文案 → options.label → value` |
| `normalizeDictOptions(raw)` | 把接口原始返回转成逻辑映射（测试 / 非 hook 场景） |

## 7. 显示文案的回落链

```
字典文案（当前语言，messages/dict）
  → options.label（后端单语言，通常中文）
  → 原始 value
```

组件里统一用 `pickDictOptionText(accountTypeOptions, type, pickDictTextWithFallback(...))`
（参考实现：`apps/web/src/routes/$appId/users/user/-data/user-display.tsx`）。

- 想加**新角色**：后台加字典项 → 徽章自动出现（文案先用 options.label）；
- 想加**多语言**：在 `messages/dict/<模块>/<locale>.json` 补 key 即可，业务代码不动。

### 7.1 筛选条件（FilterBuilder）

筛选字段目录来自生成产物 `apps/web/src/api/query-params.gen.ts`（从 openapi enum 提取），里面只有 value、也没有多语言。
用 `FilterBuilder` 的 `resolveFieldOptions` 在**运行时**用字典覆盖它：

```tsx
const accountTypeEntries = useDictOptionEntries('user.account-type')

const resolveFilterFieldOptions = useCallback<ResolveFilterFieldOptions>(
  (field) => {
    const entries = dictFilterEntries[field.param]
    // ⚠️ 字典未就绪时返回 undefined（而不是空数组）：
    //    `??` 不会对空数组回退，返回 [] 会得到一个没有任何候选的下拉
    if (!entries || entries.length === 0) return undefined
    return entries
      .filter((entry) => !entry.disabled)
      .map((entry) => ({ value: entry.value, label: entry.text }))
  },
  [dictFilterEntries],
)
```

- 已应用条件的 chip 文案通过 `describeFilterCondition(condition, field, labels, optionLabelOf)` 的**第 4 个参数**传入，
  否则会显示 `账号类型 normal` 而不是 `账号类型 普通用户`；
- `disabled: true` 的字典项不会出现在候选里；
- 参考实现：`apps/web/src/routes/$appId/users/user/index.tsx`（用户列表的 `account_type`）。

## 8. 已接入

| 位置 | 用法 |
| --- | --- |
| `$appId` 外壳（所有应用） | `useDictOptions()` 预取 |
| 用户列表 / 详情的账号角色徽章 | `useDictOptionList('user.account-type')` + 字典文案覆盖 |
| 用户列表的高级筛选（`account_type`） | `useDictOptionEntries('user.account-type')` → `FilterBuilder.resolveFieldOptions` + chip 文案（第 7.1 节） |
| 数据字典的编码列 / 「完整编码」卡片 / 面包屑回退 | `displayDictCode()` 剥掉 `new.`，显示与复制都是逻辑 code |

## 9. 待收敛（搜 `⏳`）

| 项 | 说明 |
| --- | --- |
| `DICT_NAMESPACE = 'new.'` | 后端去掉命名空间后改为 `''`（`apps/web/src/lib/dict-key.ts`） |
| 字典选项的缓存时长 | 目前 10 分钟；若运营要求改完即生效，改为在字典写操作后 `invalidateQueries` |

## 10. 校验

本层的改动**默认不触发**校验；需要时点名 `verify` skill（不要主动跑 typecheck / build / 浏览器）。
