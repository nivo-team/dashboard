# 字典多语言文案库（messages/dict）

> 目标读者：需要给「数据字典」的枚举值补多语言的开发者。
> 相关文档：[data-dict-module.md](./data-dict-module.md)（字典模块现状）、[lang-module.md](./lang-module.md)（后端翻译表）。

## 1. 它解决什么

后端的 `data_dict` 是**单语言枚举表**：一个字典项只有一份 `label`（中文），没有语言维度。要支持多语言有两条路：

| 方案 | 代价 |
| --- | --- |
| 后端给 `data_dict` 加 `language` 字段 | 改表 + 改接口；每条翻译都要入库，字典量大了后端内存与查询都变重 |
| **前端承载（本方案）** | 翻译随前端版本发布；后端零改动，也不占后端内存 |

因此本项目把**字典项文案**放在前端 `apps/web/src/messages/dict/`，按模块拆分、按需加载。

## 2. 目录与命名

```
apps/web/src/messages/dict/
├── user/                  ← 模块（= 分类 code 的模块段，见第 3 节）
│   ├── zh-CN.json         ← 语言文件名与 UI locale 完全一致（见 apps/web/src/lib/i18n.ts）
│   ├── en-US.json
│   └── ja-JP.json
└── channel/
    ├── zh-CN.json
    └── en-US.json
```

- **只放真实存在的语言**：没有 `tr-TR.json` 就整份回落（第 4 节），不必为 7 种语言建空文件；
- 语言文件名取 `SUPPORTED_LOCALES` 的 key（`zh-CN` / `en-US` / `ja-JP` / `ar-SA` / `hi-IN` / `es-ES` / `tr-TR`），**不要**写成 `en` / `zh-cn` 这类简写，也不要与后端 `/lang` 的语言码（`en` / `jp`）混用；
- 目录名 = 模块名，小写、连字符分隔。

## 3. 文件结构与 code 切分

文件内容是一层「分类 → 项」的嵌套（可再深）：

```json
{
  "account-type": {
    "normal": "普通用户",
    "anchor": "主播",
    "merchant": "币商"
  }
}
```

- 外层 key = **分类 key**；
- 内层 key = 字典项的 `value`（与后端 `data_dict.value` 完全一致）；
- 值 = 该语言的显示文案（**中文也要写**，见第 4 节）。

分类 `code` → 文件位置的切分规则（以 `new.user.account-type` 为例）：

| 段 | 含义 | 去向 |
| --- | --- | --- |
| `new` | 命名空间 / 分组（当前固定） | **丢弃** |
| `user` | 模块 | 目录 `dict/user/` |
| `account-type` | 分类 key | 文件内最外层 key |

即 `new.user.account-type` + `value=normal` → `apps/web/src/messages/dict/user/zh-CN.json` 的 `account-type.normal`。

- 本文把「模块 + 分类 key」这一串称为 **dict path**（`user.account-type`），它是所有 API 的入参；path 的解析与 **临时 `new.` 命名空间的剥离**统一在 `apps/web/src/lib/dict-key.ts`（升级时只改那一个文件，见 [dict-options.md](./dict-options.md) 第 4 节）；
- `code` 去掉首段后**至少剩两段**才可寻址（模块 + 分类 key）；不足两段时不做文案覆盖，直接回落 `label`；
- 层级可以更深（`new.user.profile.level`）：模块仍是 `user`，分类 key 是 `profile.level` —— **目录不再分下去**，层级全部由文件内的 key 承担（与 `/lang` 对 key 的处理一致）；
- 字典项 `value` 若本身含点（例如下发给 C 端用的 `new.channel.google_play`），在 JSON 里作为**完整字符串 key** 书写（`"new.channel.google_play": "Google Play"`），不要拆成嵌套对象 —— 取值是按 `value` 原样查表的。

## 4. 取值与回落链

单个字典项取文案（组件层统一走 `<DictItemText>` / `useDictItemText`）：

```
当前语言文件 → zh-CN 文件 → 后端 label → value
```

- **中文也走字典文件**：`zh-CN.json` 是文案的权威来源，后端 `label` 只作「尚未收录」时的兜底。
  代价是：在后台改了 `label`，**已收录项**的展示文案不会变（改文案要改文件、随版本发布）；
- 语言文件整份缺失（如没有 `tr-TR.json`）时回落到 `zh-CN.json`；单个 key 缺失时按上面逐级回落。

## 5. 加载方式（按需，不 eager）

`apps/web/src/lib/dict-messages.ts` 用 `import.meta.glob('/apps/web/src/messages/dict/*/*.json')`（**不带 `eager`**）建立「模块 → 语言 → `() => import(...)`」索引，再用 TanStack Query 按 `(模块, 语言)` 缓存加载结果：

- 构建时每个 JSON 生成独立 chunk，**首屏不加载任何字典文案**；
- 只有真正渲染到某模块的字典项时，才拉该模块 × 当前语言的那一个文件；
- 缓存 `staleTime: Infinity`（前端静态资源，不存在过期）。

这与 `apps/web/src/lib/i18n.ts` 的 UI 文案（`eager: true`，全量进内存）是**两套机制**，不要合并。

## 6. 与另外两套文案的边界（重要）

| 车道 | 存放位置 | 典型内容 | 能否运行时修改 |
| --- | --- | --- | --- |
| UI 文案 | `apps/web/src/messages/<ns>/<locale>.json` | 按钮、标题、表头、提示 | 否，随版本发布 |
| **字典文案（本方案）** | `apps/web/src/messages/dict/<module>/<locale>.json` | **业务枚举值**（账号角色、渠道……） | 否，随版本发布 |
| 客户端文案 | 后端 `/lang` 表（见 lang-module.md） | 要下发给 C 端 App 的文案 | 是，运营在「配置 → 语言包」编辑 |

判断标准：

- 给管理员看的界面文字 → UI 文案；
- 业务枚举值的名称 → 字典文案；
- 要下发给 C 端 App 的 → `/lang` 表（字典项**不要**写进 `/lang`）。

## 7. 工作流

1. 后台新建字典分类（`code` 形如 `new.user.account-type`）与字典项（`value` 形如 `normal`）；
2. 在本目录建 `dict/<模块>/<locale>.json`，按第 3 节写 key；
3. **中文一并写进 `zh-CN.json`**，不要只依赖后端 `label`；
4. 组件里用 `<DictItemText item={row} />`（或 `<DictText path="user.account-type" value={v} />`）渲染，
   不要再写 `row.label` 或 `t('accountTypes.xxx')`；
5. 需要校验时点名 `verify` skill（见第 8 节）。

## 8. 校验

本目录的改动**默认不触发** typecheck / build / 浏览器验收 —— 这些统一收在 `verify` skill 里，只有在明确点名时才执行。

## `dict-key.ts`：`new.` 前缀的唯一适配点

正式版的字典 key 不带 `new.` 前缀，而当前后端返回的是 `new.user.account-type` 这类。
**这个差异只允许在 `apps/web/src/lib/dict-key.ts`（`DICT_NAMESPACE`）里处理** —— 业务侧一律写逻辑
key（`user.account-type`），正式版去掉前缀时业务代码一行都不用改。
