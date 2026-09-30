# 仪表盘模块（可自定义卡片）

`/$appId/home` —— 用户自己编排的卡片工作台。侧边栏第一项（`nav.home`，文案「仪表盘」）指向它。

---

## 1. 为什么是「用户自定义」而不是「后台配好」

页面能放什么由**卡片注册表**（`src/features/home/widget-registry.tsx`）决定，不由账号权限决定。
后端目前还说不清「每个人能用多少内容」，先写一套必然要改的权限映射是净负债；
反过来让用户自己挑卡片，看不到的内容他自然不会加。

权限模型明确后的**收敛点只有一处**：在注册表项上加 `requiredPermission`，
在「添加卡片」面板里按权限过滤。栅格、持久化、编辑模式都不需要动。

---

## 2. 栅格与高度约定（`apps/web/src/lib/dashboard-constants.ts`）

| 约定 | 值 | 说明 |
| --- | --- | --- |
| 列数 | `DASHBOARD_COLUMNS = 8` | 桌面端固定 8 列；移动端降级为单列堆叠 |
| 行高 | `DASHBOARD_ROW_HEIGHT = 56px` | 单行高度 |
| 间距 | `DASHBOARD_GAP = 16px` | 横竖同值，避免「宽缝窄缝」的观感 |
| 高度档位 | `DASHBOARD_HEIGHT_STEPS = [2, 3, 4, 6, 8]` | 调整尺寸时**吸附**到档位，不产生 5.5 行这种值 |
| 宽度范围 | `[2, 8]` | 1 列仅约 120px，放不下任何内容 |

**卡片高度换算**（唯一公式，改动时两处要一起）：

```
卡片高度 = h × 56 + (h − 1) × 16
```

| h | 像素高 | 典型用途 |
| --- | --- | --- |
| 2 | 128px | 一个数字 / 一行摘要 |
| 3 | 200px | 四格概览（默认布局的「系统概览」） |
| 4 | 272px | 三四个入口 / 指标组 |
| 6 | 416px | 图表 |
| 8 | 560px | 表格 / 长列表 |

> 把 gap 算进高度是必需的：栅格用 `grid-auto-rows` 时行间还会留 gap，
> 按 `h × 行高` 估算会偏小，h 越大错位越明显。

几何换算走 `getGridMetrics(容器宽度)`：拖动位移必须用**步长**（列宽 + gap），
用列宽本身会每列差 16px、越拖越偏。

---

## 3. 数据模型与持久化

```ts
interface DashboardWidget {
  id: string      // 实例 id（拖拽定位 / 持久化主键，与 type 不同：同一类型可放多张）
  type: string    // 注册表 key
  x: number       // 起始列 0-based
  y: number       // 起始行 0-based
  w: number       // 跨列数
  h: number       // 跨行数
  config?: Record<string, unknown>  // 预留：带参数的卡片，避免将来升级要迁移存档
}

interface DashboardLayout { version: number; widgets: DashboardWidget[] }
```

- 存储键：**`admin.dashboard:<appId>`**（`#/lib/store/dashboard-store`，scoped storage，与 `admin.table-ui:<appId>` 同一套），切应用各存一份。
- `layout === null` = **用户从未自定义**，页面现算 `createDefaultLayout()`。
  刻意不在 store 初始化时写一份默认值 —— 那样每个新用户一进页面就产生存档，
  以后调整「默认长什么样」，老用户全都还停在旧的那份上。
- `normalizeLayout()` 是唯一的入口收敛点（写入时、读取存档时都调）：逐项校验 +
  clamp + 吸附档位 + **垂直压缩**。局部损坏时丢的是单张卡片，不是整份布局。

### 垂直压缩（`compactLayout`）

按「先 y 后 x」排序后依次从 `y=0` 往下找第一个不相交的位置。
必须有它：卡片可跨行，把一张 4 行卡换成 2 行就会在原地留下两行空洞；
而浏览器 CSS Grid 的自动排布**不能**回填空洞（`grid-auto-flow` 的游标只前进不回退，
`dense` 又会打乱用户设定的顺序）。

---

## 4. 编辑模式契约

- **入口**：页头右侧「自定义」（`Edit`）；进入后页头换成「恢复默认布局 / 添加卡片 / 完成」。
- **即时保存**：拖动、添加、移除都立刻写 store；「完成」只是退出编辑模式。
  与仓库里其他 per-app UI 状态（表格列设置、筛选）一致，**没有保存按钮**。
  代价是误删不可撤销，因此编辑态给了显眼的「恢复默认布局」。
- **编辑态下卡片内容不可交互**（`pointer-events-none`）：否则点「快捷入口」里的链接会直接跳走。
- **移动端不支持拖拽 / 缩放**：窄屏放不下 8 列，拖动只会横向跑偏；缩放手柄也会压住内容。
  移动端仍可添加 / 移除卡片，布局按单列堆叠渲染。
- **键盘可用**：拖拽手柄聚焦后用方向键移动卡片，缩放手柄的方向键改尺寸（上下键换档位）。
  左右方向按书写方向翻转。

### 为什么不用库（选型结论）

调研见 **[dashboard-grid-layout-research.md](./dashboard-grid-layout-research.md)**（2026-09，含来源 URL）。结论：

- **`react-grid-layout` v2 不支持 RTL**，且维护者已定性为「RFC 级设计」——
  本项目有阿拉伯语（`dir="rtl"`），一票否决。
- **`gridstack` 14 是唯一 RTL 达标的候选**，但要引入自带 CSS 体系（与 Kumo/Tailwind v4 打架）、
  命令式 DOM、React 包装无 React 19 背书、且没有键盘支持。
- **`dnd-kit` 只解决拖拽手势**：列/行模型、resize、碰撞压缩仍要全写。
- 因此**手写**：CSS Grid 的列线在 `dir="rtl"` 下天然镜像，只有「指针 x → 列号」
  的换算需要按方向取反（`use-dashboard-grid` 里的 `direction`），成本约 20 行。

---

## 5. 目录结构

```
apps/web/src/lib/
  dashboard-constants.ts        # 栅格几何：列数 / 行高 / 档位 / 步长换算
  dashboard-layout.ts           # 数据模型 + normalize + compact（纯逻辑，无 React）
  store/dashboard-store.ts      # per-app 持久化（admin.dashboard:<appId>）

apps/web/src/features/home/            # 业务代码（一个业务一个文件夹，扁平）
  index.tsx                     # 页面：页头编辑开关 + 栅格 + 添加卡片面板（导出 HomePage）
  feature.ts                    # ★ 对 AI 的声明：卡片数据源 + 编排指令（见 features-architecture.md）
  use-dashboard-grid.ts         # 拖动 / 缩放 / 键盘交互（指针事件 + RTL 换算）
  widget-registry.tsx           # 卡片注册表（有哪些卡片可选）—— 唯一真值
  dashboard-grid.tsx            # 栅格容器（8 列定位 / 移动端单列）
  dashboard-widget-frame.tsx    # 卡片外壳 + 编辑态手柄（拖拽 / 移除 / 缩放）
  add-widget-dialog.tsx         # 「添加卡片」面板
  overview-card.tsx             # 各卡片的**内容**（不含外壳，扁平放在模块根）
  quick-actions-card.tsx
  metrics-card.tsx
  version-card.tsx

apps/web/src/routes/$appId/home/
  index.tsx                     # 薄适配：createFileRoute + 渲染 HomePage
```

**目录约定**：业务代码在 `src/features/**`（薄路由 + 一页一份 `feature.ts`）——
迁移前的 `-data/` / `-components/` 已取消，见 [features-architecture.md](./features-architecture.md)。

**对 AI 的声明**（`feature.ts`，页面里一次 `useFeature`）：
数据源 `widgets`（当前卡片与 `x/y/w/h`、是否编辑态 / 默认布局）与 `available-widgets`（注册表全部卡片）；
指令 `add-widget`（传 `type`，不弹卡）、`remove-widget`（传**实例 id**，弹确认卡）、
`reset-dashboard-layout`（不可撤销，弹确认卡）。**新增卡片时只动注册表**，声明会自动跟着变
（卡片清单从 `DASHBOARD_WIDGETS` 派生，页面里不另抄一份）。

---

## 6. 新增一张卡片

1. 在 `src/features/home/` 写**只渲染内容**的组件（不要自己画卡片外壳：

   标题、图标、拖拽手柄、移除按钮统一由 `DashboardWidgetFrame` 提供，
   自己画会漏掉编辑态，表现为「这张卡拖不动也删不掉」）。
2. 在 `src/features/home/widget-registry.tsx` 的 `DASHBOARD_WIDGETS` 加一条：
   `type`（**上线后不要再改**，存档里存的就是它）、`titleKey`、`descriptionKey`、
   `icon`、`content`、`defaultSize`（高度必须是档位）、`allowMultiple`。
3. 在 `apps/web/src/messages/dashboard/*.json` 补 `cards.<type>.title` 等文案（**7 种语言**，
   键树必须完全一致）。

页面、栅格、添加面板都不需要改。

**当前三张卡片都是静态的（不发请求）**，这是刻意的：指标口径未定之前先接假接口，
只会让页面看起来「有数据」，掩盖口径未定这件事。`metrics` 卡片因此用占位值
「—」+「示例」徽章 + 一行说明，**不把兜底数据伪装成后端值**。
接口就绪后只需把组件里的常量换成 query 结果，布局与样式不用动。

---

## 7. 已知取舍

| 取舍 | 现状 | 说明 |
| --- | --- | --- |
| 持久化粒度 | 按 **app** 分区，不按用户 | 多人共用一台设备时，后登录的账号会看到前一个账号的布局。加用户维度需要同时改 `scoped-storage`（第二段作用域）与 `cross-tab-sync`（`matches` 拼接），并让认证 store 在**同一应用内换账号**时也广播 rehydrate —— 属基础设施级改动，应独立评估。改造点已在 `dashboard-store.ts` 的注释里写明。 |
| 未保存提示 | 无 | 即时保存，没有脏状态。 |
| 自动滚动 | 无 | 卡片拖到视口边缘不会自动滚动页面；布局通常一屏可见，暂未实现。 |
| 未知卡片类型 | 保留并提示 | 存档里出现当前版本没有的 `type` 时渲染占位而不是丢弃，避免降级 / 卡片下线时静默改掉用户布局。 |

---

> 以下由 `AGENTS.md` 搬入（原文保留）。那份文件现在只留**索引与铁律**，
> 各模块的细节都落在对应文档里，**需要时再来读这一份**。

## 附：契约速查 —— 仪表盘

## 8. 仪表盘：用户可自定义的卡片栅格 (Dashboard)

侧边栏第一项（`nav.home`，文案「仪表盘」）对应的 `/$appId/home` 是**用户自己编排的卡片工作台**。
完整契约与「新增一张卡片」的步骤见 **[.agents/docs/dashboard-module.md](./.agents/docs/dashboard-module.md)**，
库选型调研（含来源 URL）见 **[docs/dashboard-grid-layout-research.md](./docs/dashboard-grid-layout-research.md)**。

- **几何约定是单一真值**（`#/lib/dashboard-constants`）：8 列 / 56px 行高 / 16px 间距，
  **布局里只存行单位，永远不要存像素**。
- **`normalizeLayout` 是唯一的输入收敛点**（写入与读存档都走它）；`compactLayout` 是垂直压缩，
  **CSS Grid 的自动排布做不到这件事**（游标只前进不回退），别试图删掉它。
- 持久化在 `admin.dashboard:<appId>`；**`layout === null` 表示「从未自定义」**，
  页面现算默认布局 —— **不要在 store 初始化时写一份默认值**，否则以后调整默认布局老用户全停在旧的。
- **卡片注册表是「有哪些卡片可选」的唯一真值**（`src/features/home/widget-registry.tsx`）：新增卡片 =
  写一个**只渲染内容**的组件 + 注册表加一条 + 补齐 7 语言文案。**不要在卡片里自己画外壳**
  （标题 / 拖拽手柄 / 移除按钮统一由 `DashboardWidgetFrame` 提供）。注册表里的 `type` 上线后不要再改。
- **手写拖拽 / 缩放，不要引入栅格库**（`react-grid-layout` 不支持 RTL，一票否决）。
- 现有三张卡片都不发请求；`metrics` 用占位值 +「示例」徽章，**不要把兜底数据伪装成后端值**。
