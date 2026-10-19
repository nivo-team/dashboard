# 测试（现状、规范与边界）

> 什么时候读：**加用例 / 改测试策略 / 判断「这块该不该有测试」之前**。
>
> 一句话：`vp test` 跑纯逻辑单测；接口契约靠 mock smoke；浏览器行为靠 verify skill 的人工验收。
> 三者职责不重叠，**不要用单测去覆盖后两者的活**。

## 1. 怎么跑

```bash
pnpm test              # 全量跑一次（= pnpm -C apps/web test = vp test）
pnpm test:watch        # 监听模式
pnpm -C apps/web exec vp test src/lib/app-config.test.ts   # 只跑一个文件
pnpm -C apps/web exec vp test -t '单应用模式'               # 只跑名字匹配的用例
```

- **不要单独安装 `vitest`**：`vp test` 用的是 vite-plus 自带的 Vitest 5，
  断言与 mock 一律从 `vite-plus/test` 引：
  ```ts
  import { describe, expect, it, vi } from 'vite-plus/test'
  ```
  `import ... from 'vitest'` 在本仓解析不到。
- 配置写在 `apps/web/vite.config.ts` 的 `test` 块（**不用 `vitest.config.ts`**）。
- `vp test` 默认跑一次就退出（不像裸 Vitest 默认 watch）；要监听用 `vp test watch`。

## 2. 放哪、怎么命名

**与源文件同目录，`<模块名>.test.ts`** —— `apps/web/src/lib/app-config.test.ts` 测的是
`apps/web/src/lib/app-config.ts`。理由：拆文件/搬目录时测试跟着走，不会留下孤立的测试树。

## 3. 环境：node，且**不读 `.env`**

- `environment: 'node'`：仓库里的存储层都对 `typeof window === 'undefined'` 做了兜底
  （`scoped-storage` / `cross-tab-sync` / `auth-store`），所以 store 能在 node 里直接 import；
- **`envDir: false`（仅 test 模式）**：测试不加载本机 `.env` / `.env.local`。
  否则某台机器上的 `VITE_MULTI_APP=true` 会把「缺省是单应用」这类用例变成假阳性 ——
  **测试只看自己打的桩，不看开发者机器上碰巧有什么**；
- `unstubEnvs: true` + `restoreMocks: true`：每个用例后自动还原，桩不会泄漏到下一个用例。

## 4. 铁律：读 `import.meta.env` 的模块必须重新 import

环境变量在构建期就被**静态替换**进模块常量，所以「改了 env 再调同一个函数」是无效的。
正确姿势是「重置模块 → 打桩 → 动态 import」三连：

```ts
async function loadConfig(env: Record<string, string> = {}) {
  vi.unstubAllEnvs()
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return await import('./app-config')
}
```

同理，**单例 store** 要在 `beforeEach` 里显式 `reset()`，否则上一个用例写进去的状态会漏过来。
需要「两个不同身份的 store」时用 `vi.resetModules()` + 动态 import 拿新实例。

## 5. 什么该测、什么不该测

| 该测 | 例子 |
| --- | --- |
| **纯逻辑**：输入 → 输出确定，无时间/网络/渲染依赖 | 部署模式推导、权限判定与派生、数据映射、格式化、过滤管道 |
| **易错的不变量**（写错了没人会发现） | 「`Admin` 不是超管」、「单应用模式恒不进选择页」、「env 指派的超管」 |

| 不该测 | 为什么 |
| --- | --- |
| 组件渲染 / DOM 行为 | 当前**刻意没有**引入 happy-dom；要测就走浏览器验收（verify skill），别为它拉一套 DOM 依赖 |
| 生成的产物（`*.gen.ts`、`packages/api-client/src/generated/**`） | 生成物的正确性由生成器与 CI 的「生成物与源码同步检查」保证 |
| mock 数据本身 | 那是契约的一部分，由 `apps/mock/scripts/smoke.mjs` 从接口层验 |
| 实现细节（私有函数、内部状态形状） | 改实现就红一片，等于把重构成本翻倍 |

**不要为了好测而改产品代码**（加只为测试存在的导出、把私有函数公开、塞测试分支）——
那是拿生产代码偿还测试的债。真需要时，先问「这个契约本身是不是该有个公开函数」。

## 6. 三层验证的边界

| 层 | 工具 | 管什么 | 现状 |
| --- | --- | --- | --- |
| 单测 | `pnpm test`（`vp test`） | 纯逻辑的正确性 | 见下表 |
| 接口契约 | `node apps/mock/scripts/smoke.mjs`（需先 `pnpm mock`） | 真实接口的返回结构、权限码、写操作生效 | 103 项全绿 |
| 静态检查 + 构建 + 浏览器验收 | verify skill | 类型、格式、渲染与交互 | 使用者点名时才跑 |

CI（`.github/workflows/ci.yml`）依次跑：铁律门控 → i18n 检查 → `pnpm typecheck` → **`pnpm test`** → `pnpm build`。
单测是**合并门控**，所以新增用例应当稳定、无外网依赖、毫秒级。

## 7. 现有用例

| 文件 | 覆盖 |
| --- | --- |
| `src/lib/app-config.test.ts` | 单/多应用、单/多账号、进入选择页策略（`auto` / `always` / `never`）、默认应用 id 与名称、`VITE_SUPER_ADMIN_ID` 命中规则、部署快照 |
| `src/lib/store/permission-store.test.ts` | `normalizeRoleName`、`computePermissions`（`Admin` 不是超管 / 通配 / 模块展开）、store 的 `setIdentity` ↔ `setPermissions` 顺序无关性、`resetPermissions` |
| `src/layouts/common/nav-matching.test.ts` | 侧边栏高亮的等价写法（`/home` 的四种 URL）、子路径前缀命中、`roles-other` 不误命中 |
| `src/features/ai/components/composer/attachments.test.ts` | 附件三道闸（单个上限 / 总数上限 / 类型白名单）、边界值、**提示优先级**（加满了 > 收不下 > 读不出来）、被拦下的文件不占额度、体积格式化 |
| `src/features/ai/components/composer/mention.test.ts` | `@` 必须是行首或空白之后（邮箱里的 `@` 不算）、四处匹配通道、**记录引用兜底**（`@mod:1234` 不误报「没有匹配」）、分段与跨段连续的行号 |
| `src/lib/navigation/filter.test.ts` | `feature` / `permission` 声明的三种写法与 `:*` 补全、摊平、组级 `all` / `any`、折叠项的收敛与修剪、组内清空、自定义谓词、`enablePermissionFilter: false`、超管、真实名单的「只有 `dict:read` 时系统组可见」回归 |
| `src/features/ai/components/panel/float-geometry.test.ts` | 浮窗三形态判定：折叠只在桌面端成立、**变形期间内容仍是展开态**（一变内容动画就没东西可收）、关掉动效时直接切到位、终点尺寸（折叠 = 最小宽 × 头行高）随存档变 |
| `src/features/ai/components/panel/permission-draft.test.ts` | 「有没有未保存的更改」：能力**按集合比、不按顺序比**（勾选顺序跟着点击走，按顺序比会一直误报未保存）、换档位算改过、多 / 少 / 换一个都算改过 |
| `src/features/ai/components/conversation/message-parts.test.ts` | 会话可见性四条规则：等待模式流式期间文字隐藏、跳转建议卡永远可见、工具卡跟着「显示详细信息」、任务卡只留最后一张且悬浮时静默；外加「正在思考…」的四个前提、用户附件分堆（新老两种图片 part） |
| `src/features/ai/components/conversation/greeting.test.ts` | 空态问候**看用户选的时区而不是本机**（同一瞬间上海上午 / 纽约晚上）、三段分界、午夜归晚上 |
| `src/features/ai/components/conversation/format.test.ts` | token 紧凑写法（0 是有效值、`undefined` 是占位符）、工具值格式化（字符串原样、对象带缩进、`undefined` 与**循环引用**都不许把卡片弄空白） |

## 8. 待补的缺口（按价值排序）

1. `lib/store/app-scope` + `scoped-storage` 的键生成与 legacy 迁移（纯逻辑，好测）；
2. `features/select-app/feature.ts` 这类「页面声明 → AI 能力」的映射；
3. `lib/dict-key.ts` 的 `new.` 前缀适配；
4. AI 的页面清单/上下文裁剪（`features/ai/core/page-context.ts` 的过滤点）。

> 加用例时**顺手把这一节减一行**，别让「待补」变成永远不补的许愿池。
