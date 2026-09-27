# 可拖拽 / 可缩放仪表盘栅格库调研（2026-09）

**采集时间**：2026-09-27（本机 CST）。所有版本号/日期/peer/许可/体积均取自 npm registry 原始 JSON、各仓库 GitHub API 与发布包 tarball 实测，非记忆。

**评估前提（项目硬约束）**：React 19.2 + Vite 8 + TS 6 纯 SPA；Tailwind v4（无 config）+ `@cloudflare/kumo` 2.14；zustand 5；**当前零额外依赖**；8 列栅格、卡片可拖拽换位、可改「占几列 / 占几行」、编辑模式开关、布局落 localStorage；**必须支持 RTL（阿拉伯语）** 与移动端降级单列；键盘无障碍为加分项。

---

## 一、结论先说（TL;DR）

1. **RTL 是本轮选型的唯一硬否决项。`react-grid-layout` v2 官方明确不支持 RTL，且维护者已把它定性为「RFC 级设计」而非可排期任务** —— 直接出局（详见 §3.1）。
2. **`gridstack` 14 是目前唯一开箱支持完整 RTL 的候选**（12.6.0 / 2026-04-08 合并 PR #3250，`rtl?: boolean | 'auto'`），也是唯一零运行时依赖的（详见 §3.2）。
3. **`dnd-kit` 只解决「拖拽手势」，不解决「栅格」**：没有列/行模型、没有 resize、没有碰撞与压缩，这些正是 RGL core / gridstack-engine 的全部价值所在；且它的 6.x 类型在 React 19 + TS 下需要 workaround（§3.3）。
4. **本项目已经在手写这套东西**（`dashboard-constants.ts` / `dashboard-layout.ts` / `dashboard-store.ts` + 卡片框架组件，见 §5），其中**最容易被低估的栅格数学（矩形相交、垂直压缩、越界收敛）已经完成**，剩下的主要是手势、resize 手柄与键盘无障碍。
5. **推荐：继续手写，不引入库**（§6）。若「不自己维护手势与自动滚动」的优先级高于依赖洁癖，**唯一值得引入的是 gridstack 14**，落地配置见 §7。

---

## 二、对比表

| 方案 | 最新版 / 发布日 | React 19 peer 声明 | 自带 TS 类型 | 任意列数（8 列） | RTL | 响应式断点 | 键盘无障碍 | 许可 | 体积（min / gzip） | 运行时依赖 |
|---|---|---|---|---|---|---|---|---|---|---|
| **react-grid-layout** | 2.2.4 / 2026-07-29 | `react >= 16.3.0`（无上限，可装） | ✅ 自带（v2 起） | ✅ `gridConfig.cols`（默认 12） | ❌ **无，官方确认 v2 丢失** | ✅ `ResponsiveGridLayout` | ❌ 无 | MIT | 73.5 KB / **22.8 KB**（+CSS 2.7 KB） | 6 个 |
| react-grid-layout（legacy） | 1.5.4 / 2026-07-29 | 同上 | ❌ 包内无 d.ts（`typings: null`） | ✅ `cols` | ❌ 包内无 `transformDirection`（实测） | ✅ | ❌ | MIT | — | 6 个 |
| **gridstack** | 14.0.0 / 2026-09-21 | 未声明（主包无 `peerDependencies`；React 包装同包发布） | ✅ 自带 | ✅ `column`（默认 12） | ✅ **12.6.0 起官方 full RTL** | ✅ `columnOpts.breakpoints` | ❌ 仅 PR #3092 未合并 | MIT | 92 KB / **25.1 KB**（+CSS min 6.1 KB） | **0** |
| **@dnd-kit/core + sortable** | 6.3.1 / 2024-12-05（sortable 10.0.0 / 2024-12-04） | `react >= 16.8.0` | ⚠️ 自带，但含全局 `JSX.Element`（React 19 + TS 报 TS2503） | ❌ 无模型，全自写 | ❌ 无，全自写 | ❌ 全自写 | ✅ `KeyboardSensor` | MIT | 14.2 + 3.7 KB gzip | 3 + 2 个 |
| @dnd-kit/react（新架构） | 0.5.0 / 2026-06-11（beta 0.5.1-beta 2026-09-12） | `react ^18 \|\| ^19` | ✅ | ❌ 无模型，全自写 | ❌ | ❌ | ✅ | MIT | 33 KB gzip（+`@dnd-kit/dom` 29.7 KB） | 4 个 |
| @snapgridjs/react（2026 新库） | 0.10.0 / 2026-08-01 | `react >= 18` + `@dnd-kit/react ^0.4.0`（与 0.5.0 冲突） | ✅ | ✅ | ❌ README 未提；core 依赖 `react-grid-layout ~2.2.3` → **继承 RGL 的 RTL 缺口** | ✅ | ✅ | MIT | 163 KB unpacked | 2 + dnd-kit |
| react-mosaic-component | 7.1.0 / 2026-09-10 | `react 16 - 19` | ✅（`index.d.cts/mts`） | ❌ 模型是平铺窗口，无列/行单位 | ❌ | ❌ | ❌ | Apache-2.0 | 134 KB / 39.4 KB（+CSS 23 KB） | 11 个 |
| **手写（当前路线）** | — | — | — | ✅ 已实现 | ✅ CSS Grid 逻辑列天然镜像，仅指针换算需按 `dir` 取反 | ✅ 用现有 `useIsMobileViewport` | 需自写 | — | 0 | **0** |

（star / 活跃度：RGL 22,439★、最近提交 2026-09-16；gridstack 9,142★、2026-09-26；dnd-kit 17,675★、2026-09-12；react-mosaic 4,801★、2026-09-24。来源见各节链接。）

---

## 三、每个候选的关键事实

### 3.1 react-grid-layout（RGL）— **RTL 出局**

**版本与维护**
- npm latest `2.2.4`，`time.2.2.4 = 2026-07-29`；同一天还发布了 `legacy` dist-tag `1.5.4`（v1 分支仍在修，仓库有 `release/1.5.4` 分支）。
- v2.0.0（2025-12-09）是**完整 TypeScript 重写**：hooks API（`useContainerWidth` / `useGridLayout` / `useResponsiveLayout`）、可插拔 `PositionStrategy` / `Compactor` / 约束系统；v1 API 通过 `react-grid-layout/legacy` 100% 兼容。
  来源：[CHANGELOG.md](https://github.com/react-grid-layout/react-grid-layout/blob/master/CHANGELOG.md)、[registry 文档](https://registry.npmjs.org/react-grid-layout)、[GitHub 仓库](https://github.com/react-grid-layout/react-grid-layout)
- 仓库 22,439★、61 open issues、最近 push 2026-09-16、MIT。

**React 19**
- `peerDependencies`: `{"react": ">= 16.3.0", "react-dom": ">= 16.3.0"}`（[registry latest](https://registry.npmjs.org/react-grid-layout/latest)）→ 无上限，安装不冲突。
- README 兼容表写的是 `>= 2.0.0 → React 18+, TypeScript`（[README](https://github.com/react-grid-layout/react-grid-layout#compatibility)），未单独声明 19。
- 运行时链路上的 `react-draggable` 已在 4.6.0（2026-05-29）内部完成 React 19 适配（"Internal: Support React 19 …nodeRef-based browser tests"），4.5.0 起为 v19 更新 `nodeRef` 类型（[react-draggable CHANGELOG](https://github.com/react-grid-layout/react-draggable/blob/master/CHANGELOG.md)）；RGL v2 的 d.ts 用 `react_jsx_runtime.JSX.Element`，无全局 JSX 依赖，TS 侧干净。
- ⚠️ 但耦合风险已被验证过一次：`react-draggable` 4.6.0 曾让 RGL 的拖拽/缩放整体失效（issue [#2268](https://github.com/react-grid-layout/react-grid-layout/issues/2268)，2026-07-29 关闭，同日发布的 2.2.4/1.5.4 即修复）。引入 RGL = 接受这条由上游第三方决定的故障链。

**8 列 / 行高**
- `GridConfig.cols` 默认 12，任意值可用；`rowHeight` 默认 150（[README API Reference](https://github.com/react-grid-layout/react-grid-layout#gridconfig)）。
- 实测包内像素公式（`dist/chunk-76RTO6EO.mjs`）：`height = round(h * rowHeight + max(0, h-1) * marginY)`；`colWidth = (containerWidth - marginX*(cols-1) - containerPadding[0]*2) / cols`。

**RTL：明确不支持（关键证据）**
- 官方 issue [#1794 "RTL Support for react-grid-layout"](https://github.com/react-grid-layout/react-grid-layout/issues/1794)：2022-11-07 创建（申请方版本 1.3.4），**至今 open**，仅 3 条评论；维护者 STRML 于 2026-08-04 的 triage 原文：

  > RTL was supported in v1 through a `transformDirection` prop (commits d2b5c15/859c82f) but that support didn't survive the v2 TypeScript rewrite — v2's positioning, drag deltas, and compaction are all LTR-anchored. … A full RTL implementation needs mirrored positioning math, mirrored drag delta, mirrored east/west resize, and an `isRTL`/`direction` prop threaded through the components. **This is an RFC-level design, not an agent task.**

- RTL 相关 issue 全量只有 7 条，其中 open 的还有 [#2002 "[rtl resize] 在 RTL 下缩小反而变大"](https://github.com/react-grid-layout/react-grid-layout/issues/2002)（2023-12 创建，2026-08 仍更新）与 2018 年的 PR [#875 add RTL support by 'transformDirection'](https://github.com/react-grid-layout/react-grid-layout/pull/875)（**仍未合并**）。
- **实测 v1.5.4 发布包内根本没有 `transformDirection`**（对 `react-grid-layout-1.5.4.tgz` 全包 grep 无命中），v1 README 也无任何 RTL 说明 → 「退回 v1 拿 RTL」这条路也不成立。
- 唯一可走的自定义路径是 v2 的 `positionStrategy`（`calcStyle` + `calcDragPosition` 可覆写，[README 自定义策略章节](https://github.com/react-grid-layout/react-grid-layout#creating-a-custom-position-strategy)），但按维护者所述，还要自己镜像拖拽 delta、east/west resize 与 compaction —— 这已经超过「引入一个库」的收益。

**响应式 / 键盘 / 体积 / 许可**
- 响应式：`ResponsiveGridLayout` 内置断点 `{lg:1200, md:996, sm:768, xs:480, xxs:0}` 与 `cols:{lg:12, md:10, sm:6, xs:4, xxs:2}`，可整体覆写。
- 键盘：包内无任何 keydown/KeyboardSensor 引用，仓库只有 1 条键盘相关 issue（[#1907](https://github.com/react-grid-layout/react-grid-layout/issues/1907)）→ **无键盘拖拽/缩放能力**。
- 体积：Bundlephobia [73.5 KB min / 22.8 KB gzip](https://bundlephobia.com/package/react-grid-layout@2.2.4)；`unpackedSize` 447,579 B；样式 `css/styles.css` 仅 2.7 KB。
- 许可：MIT（包内 LICENSE + registry `license: MIT`）。
- 类型：v2 自带（`types: dist/index.d.ts`，含 `.d.mts`/`.d.ts` 双条件）；`@types/react-grid-layout@2.1.0` 已被官方标记为 **stub 并 deprecated**（"react-grid-layout provides its own type definitions"），v1 用户只能锁 `@types/react-grid-layout@1.3.6`（对应 v1 API）。

### 3.2 gridstack — **唯一 RTL 达标**

**版本与维护**
- npm latest `14.0.0`，`time.14.0.0 = 2026-09-21`；近半年节奏密集（13.0.2/13.1.2 → 13.2.0 → 13.3.0 → 14.0.0）。
- 仓库 9,142★、28 open issues、最近 push 2026-09-26、MIT（[LICENSE](https://github.com/gridstack/gridstack.js/blob/master/LICENSE)，Copyright 2019-2025 Alain Dumesny）。
- **运行时依赖为空**（registry `dependencies: {}`）—— 对「零额外依赖」的项目最友好。

**React 19**
- 主包**没有 `peerDependencies` 字段**（[registry latest](https://registry.npmjs.org/gridstack/latest)），既不禁也不承诺 React 19。
- React 包装与主包同发：`gridstack/dist/react`（`<GridStack options components>` + `useGridStack()`），需要 `import "gridstack/dist/gridstack.css"`（[react/README.md](https://github.com/gridstack/gridstack.js/blob/master/react/README.md)）。
- 其 `react/package.json` 的 devDependencies 仍是 `react ^18.3.1`、`@types/react ^18.3.3`；在 gridstack 仓库内检索 "react 19" 无相关兼容 issue（命中的都是 vite/angular 版本 bump）→ **无已知阻塞，但也无官方背书，属"需实机验证"项**。

**8 列 / 行高 / 响应式**
- `column: N` 任意（默认 12，README 有 `GridStack.init({column: N})`）。
- 响应式自 v10 起改为显式配置：`columnOpts: { breakpoints: [{w: 768, c: 1}] }`（旧的 `oneColumnMode`/`oneColumnSize` 已删除，且「1 列模式默认不再自动启用」）。
  来源：[README](https://github.com/gridstack/gridstack.js#readme)、`dist/types.d.ts` 的 `Responsive`/`Breakpoint` 接口。
- 移动端：v6 起原生 mouse + touch 事件（无需 h5 drag），README 有 mobile demo 与 `alwaysShowResizeHandle: 'mobile'`。

**RTL：官方完整支持（关键证据）**
- PR [#3250 "implemented full rtl support"](https://github.com/gridstack/gridstack.js/pull/3250) 于 **2026-04-06 合并**（+134/−51，6 文件），描述明确：元素在 `rtl` 下从右向左排布、拖拽与缩放均正确；关闭 issue [#819](https://github.com/gridstack/gridstack.js/issues/819)。CHANGES 中对应 **12.6.0 (2026-04-08)**："feat: #3250 full RTL support"（[doc/CHANGES.md](https://github.com/gridstack/gridstack.js/blob/master/doc/CHANGES.md)）；后续 PR [#3269](https://github.com/gridstack/gridstack.js/pull/3269) 做了清理。
- 类型定义（`dist/types.d.ts`，源文件 `apps/web/src/types.ts`）：
  `rtl?: boolean | 'auto'` —— 注释："if true turns grid to RTL, and applies the `grid-stack-rtl` class. Possible values are true, false, 'auto' (default?: 'auto')"，并给出官方 demo `demo/right-to-left(rtl).html`。
- **落地细节（实测源码）**：`'auto'` 的判定是 `el.style.direction === 'rtl'`（inline style），而项目的 `dir="rtl"` 是加在 **根节点** 上的属性，`el.style.direction` 为空 → **自动检测不会生效，必须显式传 `rtl: true`**。开启后 gridstack 会给根元素加 `grid-stack-rtl` 类，CSS 用 `right: 0` + `[gs-x="0"] { right: 0% }` 等规则接管（`dist/gridstack.css`）。
- 状态同步注意：`save()` 会把 `o.rtl` 与 `el.style.direction` 相等时改写为 `'auto'`，持久化前后语义会变，恢复时要重新显式设置。

**键盘 / 体积 / CSS 集成成本**
- 键盘：**无**。PR [#3092 "Move items with keyboard controls"](https://github.com/gridstack/gridstack.js/pull/3092)（+270 行）自 2025-07-10 起 **仍 open 未合并**；`dist` 中的 keydown 监听只用于取消操作。
- 体积：Bundlephobia [92 KB min / 25.1 KB gzip](https://bundlephobia.com/package/gridstack@14.0.0)；`unpackedSize` 2,162,392 B（含 angular/vue/react 包装与 sourcemap）；另需 `gridstack.css` 10,560 B（min 6,138 B）。
- 集成成本：gridstack 自带一套定位/占位/动画样式体系（`.grid-stack-item`、`--gs-cell-height`、`--gs-item-margin-*` 等），必须引入它的 CSS 并与 Kumo 语义令牌 + Tailwind v4 共存；布局是命令式 DOM（React 包装用 portal 把组件塞进 widget），与现有 `DASHBOARD_*` 纯数据模型是两套世界观。

### 3.3 dnd-kit（@dnd-kit/core + sortable，自己写 resize）

**版本与维护**
- `@dnd-kit/core` 6.3.1（2024-12-05）、`@dnd-kit/sortable` 10.0.0（2024-12-04）、`@dnd-kit/modifiers` 9.0.0 —— **stable 线已 21 个月没有新版本**；团队实际开发转向新架构 `@dnd-kit/react` 0.5.0（2026-06-11，beta 0.5.1-beta 更新到 2026-09-12）。仓库 17,675★、最近 push 2026-09-12、MIT。
- `peerDependencies`: core/sortable 均为 `react >= 16.8.0`（无上限）。

**React 19 + TS 的实际摩擦（实测）**
- 安装包内仍有**全局 `JSX.Element`** 引用：core 4 处（`DragOverlay.d.ts`、`NullifiedContextProvider.d.ts`、`AnimationManager.d.ts`、`Accessibility.d.ts`）、sortable 1 处（`SortableContext.d.ts`）。React 19 不再提供全局 `JSX` 命名空间 → TS 报 `TS2503 Cannot find namespace 'JSX'`（issue [#1559](https://github.com/clauderic/dnd-kit/issues/1559)，2024-12 报出、2026-02 关闭，但**没有对应版本发布**）。需要 `declare global { namespace JSX {...} }` 之类的 workaround，或跳去 0.x 新架构。
- 新架构 `@dnd-kit/react` 有 **React 19 StrictMode 下 `DragDropProvider` manager 被销毁**的 open bug（[#2116](https://github.com/clauderic/dnd-kit/issues/2116)，2026-07-31），Vite 模板默认开 StrictMode，命中概率高。

**它不提供什么（决定了「自写 resize」的真实工作量）**
- 没有栅格/列/行模型、没有 resize：官方口径是 drag 专用（[#445 Add drag/resizing](https://github.com/clauderic/dnd-kit/issues/445)、[#1127 Resize - is it possible?](https://github.com/clauderic/dnd-kit/issues/1127) 均 closed）。
- 因此选择 dnd-kit = 仍然要自己实现：像素↔列/行换算、8 列吸附档位、拖拽中的碰撞判定与占位预览、垂直压缩、resize 手柄（含 RTL 方向镜像）、localStorage 序列化、窄屏单列降级、自动滚动。**这些正是 RGL core / gridstack-engine 的全部内容**（`gridstack-engine.js` 1,373 行、`dd-draggable.js` 534 行、`dd-resizable.js` 342 行）。
- 它唯一带来的是**手势抽象 + 键盘无障碍**：`KeyboardSensor`、`defaultKeyboardCoordinateGetter`、`sortableKeyboardCoordinates`（core/sortable index.d.ts 实测导出）。

### 3.4 补充发现（2026 年新库与其他）

- **`@snapgridjs/react` 0.10.0（2026-08-01）**：自称 "a react-grid-layout v2 alternative, built on dnd-kit"，headless 无 CSS、自带类型、有 `<ResponsiveGridLayout>`、**键盘可访问（Enter/Space 拾起、方向键移动、Esc 取消）**，MIT。但：① 仓库 30★、2026-05-30 才建仓、版本 0.x（[eleung/snapgrid](https://github.com/eleung/snapgrid)）；② peer 要求 `@dnd-kit/react ^0.4.0`，而当前 latest 是 0.5.0（安装即 peer 冲突）；③ 其 `@snapgridjs/core` 依赖 `react-grid-layout ~2.2.3`（薄封装 RGL 的 layout engine）→ **RGL 的 RTL 缺口被继承**；④ README 全文（4,351 字符）零次提及 RTL。**结论：适合作为观察对象，不适合作为本项目生产依赖。**（[registry](https://registry.npmjs.org/@snapgridjs/react)）
- **`@joyfill/react-grid-layout` 1.5.1（2025-03-24）**：RGL v1 的企业 fork，无类型字段、依赖仍是 react-draggable ^4.4.5，落后且未修 RTL → 排除。
- **react-mosaic-component 7.1.0（2026-09-10）**：Apache-2.0、peer `react 16 - 19`、11 个运行时依赖（react-dnd 16 全家桶）、CSS 23 KB、无 RTL 引用。它是 **tiling window manager**（分屏/标签/拖拽重排窗口），没有「8 列 × 行单位」的卡片模型，也没有卡片换位语义 → **模型不匹配，排除**。
- 其他排除：`allotment` 1.20.5（IDE 式分割面板）、`react-resizable-panels` 4.13.3（同上，本仓库 AGENTS.md 已明确不为分割条引入）、`react-rnd` 10.5.3（自由拖拽，无栅格/断点/RTL）、`muuri` 0.9.5（2021 年停更）、`interactjs` 1.10.28（低层手势原语）、`dockview`（面板停靠，不是卡片栅格）。
- 许可对照：候选里 RGL / gridstack / dnd-kit / allotment / react-rnd 均为 **MIT**，react-mosaic 为 **Apache-2.0**（含专利授权、需保留 NOTICE）。私有商业项目均可使用，无 copyleft 风险。

---

## 四、RTL 与键盘：三条硬事实

| | RTL | 键盘拖拽/缩放 |
|---|---|---|
| react-grid-layout 2.2.4 | ❌ 官方确认 v2 丢失，需镜像定位 math + drag delta + east/west resize + compaction（RFC 级） | ❌ 无实现 |
| gridstack 14.0.0 | ✅ `rtl: true`（12.6.0+，建议显式传值，`'auto'` 只读 inline style） | ❌ PR #3092 未合并 |
| dnd-kit（v6 / 0.x） | ❌ 不涉及，坐标镜像需自写（但自写时天然可做） | ✅ `KeyboardSensor` + `sortableKeyboardCoordinates` |
| 本项目手写 | ✅ CSS Grid 逻辑列在 `dir="rtl"` 下自动镜像，只需把「指针 x → 列号」按方向取反 | 可自写（卡片已有 `onKeyDown` 接口） |

> 换句话说：**「RTL 可用」与「键盘无障碍开箱」目前分布在两个不同的库里，没有任何一个候选同时满足两者**；而这两项对当前项目恰好是「硬需求 + 加分项」。

---

## 五、与本项目现状的对齐（重要）

工作区里已经有（未跟踪的新文件，属本轮正在进行的实现）：

- `apps/web/src/lib/dashboard-constants.ts`：`DASHBOARD_COLUMNS = 8`、`DASHBOARD_ROW_HEIGHT = 56`、`DASHBOARD_GAP = 16`、高度档位 `[2,3,4,6,8]`、`widgetHeightToPx(h) = h*56 + (h-1)*16`、`snapHeight` / `clampWidgetWidth` / `clampWidgetX`。
- `apps/web/src/lib/dashboard-layout.ts`：布局数据模型 + 版本号 + `normalizeLayout()`（逐项校验、非法值就地回落）+ **`compactLayout()` 垂直压缩（矩形相交判定 + 确定性落位）**。
- `apps/web/src/lib/store/dashboard-store.ts`：zustand persist，键 `admin.dashboard:<appId>`，走既有 scoped storage 与跨标签同步。
- `apps/web/src/routes/$appId/home/-components/`：`dashboard-widget-frame.tsx` 已给出拖拽手柄 / 缩放手柄的 `onPointerDown` + `onKeyDown` 回调位与 aria-label；`cards/` 三张卡片 + `-data/widget-registry.tsx`。

**结论性判断**：库能提供的「栅格数学 + 压缩 + 序列化」这部分，本项目已经写完且更贴合自身约束（per-app 存储、跨标签同步、档位吸附、Kumo 令牌）。**引入 RGL/gridstack 会把这块已完成的资产换成库的模型**（gridstack 还额外要求命令式 DOM 与自带 CSS），而换来的收益目前只剩「拖拽手势实现」——偏偏在这个点上 gridstack 拿不到 RTL 之外的加分（无键盘），RGL 更是连 RTL 都没有。

---

## 六、推荐

### 主推：**继续手写，不引入新依赖**（与当前路线一致）

理由（按权重排序）：

1. **RTL 是一票否决**：唯一同时满足「8 列 + 换位 + 缩放 + RTL」的库只有 gridstack；RGL 官方已把 RTL 定性为 RFC 级重构，且 issue 挂了 3 年 10 个月，不能押注。
2. **手写方案的 RTL 成本最低**：CSS Grid 的列线在 `dir="rtl"` 下自动从右往左，`grid-column-start` 语义天然镜像；唯一需要方向感知的是「指针坐标 → 列号」的一处换算（`x = dir === 'rtl' ? cols - 1 - floor(px / colWidth) : floor(px / colWidth)`），约 20–40 行。用库反而要处理它自己 LTR 锚定的定位与手柄方向。
3. **收益/代价不对称**：gridstack 要付出「10.5 KB 自带 CSS 体系与 Kumo/Tailwind v4 打架 + 命令式 DOM + React 包装无 React 19 声明 + 无键盘 + 放弃已有 8 列档位与 per-app 存储模型」的代价，只为换「手势 + 拖拽时的库内重排」。
4. **依赖传染风险已被上游验证**：RGL 因为 `react-draggable` 4.6.0 一度拖拽/缩放全废（#2268）；dnd-kit stable 线 21 个月未发版，其 d.ts 在 React 19 + TS 下仍留 `JSX.Element`（#1559）。零依赖项目引入这类链条，与项目现有的「依赖门槛高」约定不符。

### 手写剩余工作量估计（针对当前代码基）

| 模块 | 预估 | 说明 |
|---|---|---|
| 指针/触摸手势骨架（阈值、`setPointerCapture`、触摸与滚动冲突） | 150–250 行 | 可参考仓库已有 `apps/web/src/lib/use-panel-resize.ts`（约 40 行）的「pointer 事件 + clamp + onChange/onCommit 分离」范式，但网格版要处理跨格吸附 |
| 拖拽中的实时落位/占位预览/碰撞反馈 | 100–150 行 | 复用已有 `overlaps()` 逻辑，需要一版"试算布局" |
| resize 手柄（宽 w / 高 h，含档位吸附与最小宽度） | 80–150 行 | 已有 `snapHeight` / `clampWidgetWidth` |
| 键盘无障碍（方向键移动、Shift+方向键改尺寸、`aria-live` 播报） | 80–150 行 | 组件已留 `onKeyDown` 位；这是"加分项"，可后置 |
| RTL 指针换算 | 20–40 行 | 一处换算 + 手柄方向 |
| 自动滚动 / 边界 / 动画过渡（FLIP 或纯 CSS） | 50–100 行 | 移动端可降级为"只读单列"，省掉大部分 |
| **合计** | **约 480–840 行 + 边界测试** | 其中**最难的栅格压缩已完成**（`compactLayout`），这是最容易被低估的一块 |

### 条件性备选（只在下面条件成立时才考虑）

- **若不接受自己维护手势与自动滚动、且 RTL 必须像素级正确** → 引入 **gridstack 14**（唯一 RTL 满分的库，零依赖）。落地方式见 §7。要接受：命令式 DOM、引入 `gridstack.css`、React 包装未声明 React 19（需实机验证）、无键盘支持。
- **若键盘无障碍是硬性验收项、可放弃库级 RTL** → 用 `@dnd-kit/core` + `sortable`，但必须清楚：resize、8 列吸附、碰撞压缩、localStorage 全部仍要自写（等于把上面 480–840 行里的手势部分换掉，其余照旧），并处理 `JSX.Element` 类型 workaround。**收益有限，不推荐为此单独引入。**

---

## 七、可执行的落地配置（若走库路线）

### 行高/间距单位的三方对照（本项目 56 / 16 约定为基准）

| 约定 | 公式 | 映射到 8 列 + 56 / 16 |
|---|---|---|
| **本项目（现状）** | 卡片高 `= h*56 + (h-1)*16`；列宽 `= (W - 16*7)/8` | — |
| **RGL 2.2.4** | `height = round(h*rowHeight + max(0,h-1)*marginY)`，`colWidth = (W - marginX*(cols-1) - padding*2)/cols` | `gridConfig={{ cols: 8, rowHeight: 56, margin: [16,16] }}` → **逐像素等价**（h=2 → 128px ✓，h=3 → 200px ✓） |
| **gridstack 14** | item 高度 `= h * cellHeight`，可见内容再按四边 `margin` 内缩（源码注释："margin variables **inside the cell height**"），即可见高 `= h*cellHeight - 2*margin` | `column: 8, cellHeight: 72, margin: 8` → 可见高 `= 72h - 16`：h=2 → 128px ✓，h=3 → 200px ✓；相邻卡片可见间距 `= 2*8 = 16` ✓ |

> gridstack 的 `cellHeight` 是**含间距**的行高，与 RGL「行高 + 间距」语义不同，换算时容易错；表内数值已用两侧源码公式互相验算，但仍建议首屏用 `grid.getCellHeight()` 与实测 `getBoundingClientRect()` 复核一次。

### gridstack 14 的最小配置（备选路线）

```ts
// 仅列出与本需求相关的选项，非完整代码
{
  column: 8,                       // 8 列
  cellHeight: 72,                  // 含间距行高（等价 56 行高 + 16 间距）
  margin: 8,                       // 四边各 8 → 相邻间距 16，与现有 DASHBOARD_GAP 一致
  rtl: true,                       // ⚠️ 必须显式 true：'auto' 只读 el.style.direction，根节点 dir 属性检测不到
  float: false,                    // 垂直压缩（等价现有 compactLayout 的 gravity up）
  columnOpts: { breakpoints: [{ w: 768, c: 1 }] },  // 移动端降级单列（v10+ 需显式配置）
}
```

- **编辑模式开关**：`grid.enableMove(false)` / `grid.enableResize(false)`（[API](https://github.com/gridstack/gridstack.js/blob/master/doc/README.md)），关闭时可用 `setStatic(true)` 释放资源。
- **持久化**：`grid.save(false)` 返回 `GridStackWidget[]` → 直接落 `localStorage`；恢复用 `grid.load(saved)`。注意源码会把与 `el.style.direction` 相等的 `rtl` 改写成 `'auto'`，恢复时要重新显式 `rtl: true`。
- **React 接法**：`import { GridStack } from "gridstack/dist/react"` + `import "gridstack/dist/gridstack.css"`（CSS 必须与 Tailwind v4 的 import 顺序对齐，并覆盖其自带视觉）。
- **RTL 必须回归验证**：拖拽方向、east/west resize 手柄语义、`x=0` 是否贴右边、以及 `save/load` 往返后 `rtl` 是否仍为 `true`。

### RGL 2.2.4 的配置（**仅作对照，RTL 不达标不建议采用**）

```ts
{ gridConfig: { cols: 8, rowHeight: 56, margin: [16,16] },
  dragConfig: { enabled: editing }, resizeConfig: { enabled: editing },
  onLayoutChange: (layout) => persist(layout) }
// 移动端：ResponsiveGridLayout + breakpoints/cols 每断点给一份 layout
// RTL：无官方支持，需自写 positionStrategy（calcStyle/calcDragPosition）+ 自定义 east/west resize 语义
```

---

## 八、来源清单

- npm registry 原始 JSON：[/react-grid-layout/latest](https://registry.npmjs.org/react-grid-layout/latest)、[/gridstack/latest](https://registry.npmjs.org/gridstack/latest)、[/@dnd-kit/core/latest](https://registry.npmjs.org/@dnd-kit/core/latest)、[/@dnd-kit/react/latest](https://registry.npmjs.org/@dnd-kit/react/latest)、[/@snapgridjs/react](https://registry.npmjs.org/@snapgridjs/react)、[/react-mosaic-component/latest](https://registry.npmjs.org/react-mosaic-component/latest)、[/@types/react-grid-layout/latest](https://registry.npmjs.org/@types/react-grid-layout/latest)
- RGL：[仓库](https://github.com/react-grid-layout/react-grid-layout)、[CHANGELOG](https://github.com/react-grid-layout/react-grid-layout/blob/master/CHANGELOG.md)、[README](https://github.com/react-grid-layout/react-grid-layout#readme)、RTL [issue #1794](https://github.com/react-grid-layout/react-grid-layout/issues/1794) / [#2002](https://github.com/react-grid-layout/react-grid-layout/issues/2002) / [PR #875](https://github.com/react-grid-layout/react-grid-layout/pull/875)、[issue #2268](https://github.com/react-grid-layout/react-grid-layout/issues/2268)、[react-draggable CHANGELOG](https://github.com/react-grid-layout/react-draggable/blob/master/CHANGELOG.md)
- gridstack：[仓库](https://github.com/gridstack/gridstack.js)、[README](https://github.com/gridstack/gridstack.js#readme)、RTL [PR #3250](https://github.com/gridstack/gridstack.js/pull/3250) / [PR #3269](https://github.com/gridstack/gridstack.js/pull/3269) / [issue #819](https://github.com/gridstack/gridstack.js/issues/819)、[CHANGES](https://github.com/gridstack/gridstack.js/blob/master/doc/CHANGES.md)、键盘 [PR #3092](https://github.com/gridstack/gridstack.js/pull/3092)、[React 包装说明](https://github.com/gridstack/gridstack.js/blob/master/react/README.md)
- dnd-kit：[仓库](https://github.com/clauderic/dnd-kit)、[issue #1559（JSX 命名空间）](https://github.com/clauderic/dnd-kit/issues/1559)、[issue #2116（React 19 StrictMode）](https://github.com/clauderic/dnd-kit/issues/2116)、[#445](https://github.com/clauderic/dnd-kit/issues/445) / [#1127](https://github.com/clauderic/dnd-kit/issues/1127)
- 其他：[snapgrid 仓库](https://github.com/eleung/snapgrid)、[react-mosaic](https://github.com/nomcopter/react-mosaic)
- 体积：[Bundlephobia react-grid-layout@2.2.4](https://bundlephobia.com/package/react-grid-layout@2.2.4)、[gridstack@14.0.0](https://bundlephobia.com/package/gridstack@14.0.0)、[@dnd-kit/core@6.3.1](https://bundlephobia.com/package/@dnd-kit/core@6.3.1)、[@dnd-kit/react@0.5.0](https://bundlephobia.com/package/@dnd-kit/react@0.5.0)、[react-mosaic-component@7.1.0](https://bundlephobia.com/package/react-mosaic-component@7.1.0)
- 类型/源码级实测：`react-grid-layout@2.2.4.tgz`、`react-grid-layout@1.5.4.tgz`、`gridstack@14.0.0.tgz`、`@dnd-kit/core@6.3.1.tgz`、`@dnd-kit/sortable@10.0.0.tgz`、`react-mosaic-component@7.1.0.tgz` 解包后 grep（公式、`JSX.Element` 计数、`rtl` 字段、CSS 变量均来自这些文件）
