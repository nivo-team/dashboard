# 状态管理与按应用隔离的存储

本项目的前端状态统一由 **zustand 5**（`persist` 中间件）承载，并按「全局偏好 / 认证 / 每个应用的 UI 状态」三类划分。
核心诉求：**不同应用（Console / Analytics…）的缓存与界面状态互不污染，切回来还是离开时的样子。**

---

## 1. 三类状态一览

| 类别 | 位置 | 存储键（localStorage） | 按应用隔离 |
| --- | --- | --- | --- |
| 认证与应用选择 | `apps/web/src/lib/auth.ts` 的 `useAuthStore` | `admin.auth-state` | 否 —— 它本身就是「当前是哪个应用」 |
| 本机偏好（语言 / 外观 / 时区 / 详情打开方式 / 页面宽度） | `apps/web/src/lib/store/preferences-store.ts` | `admin.preferences:<appId>` | **是** —— 每个应用一套，没改过时继承 `:global` 基线 |
| 表格 UI（列设置 / 筛选 / 排序 / 分页） | `apps/web/src/lib/store/table-ui-store.ts` | `admin.table-ui:<appId>` | **是** |
| 仪表盘布局（卡片位置 / 尺寸） | `apps/web/src/lib/store/dashboard-store.ts` | `admin.dashboard:<appId>` | **是** —— 见 [dashboard-module.md](./dashboard-module.md) |
| 外壳 UI（侧边栏折叠 / 宽度、分屏预览宽度、界面动效开关） | `apps/web/src/lib/store/shell-ui-store.ts` | `admin.shell-ui` | 否 —— 外壳形态偏好，全局一份（**移动端不记录**） |
| 查询缓存（内存） | `apps/web/src/lib/query-client.ts` | —（不落盘） | **是** —— 每个应用一个 `QueryClient` |

判定原则：**「这个状态换个应用还成立吗？」** 成立就全局，不成立就按应用隔离。
唯一的例外是**本机偏好**：它按应用分区，但用 `:global` 作为基线做继承（见第 3 节），
所以「新应用不该突然换语言 / 主题」与「每个应用可以有自己的一套」两件事同时成立。

> ⚠️ 行为提醒：语言 / 外观 / 时区 / 详情打开方式 / 页面宽度现在都随应用走 —— **切换应用会切换这几项**
> （前提是你在这个应用里改过；没改过就一直用基线）。这是刻意的，别当成 bug。
> **界面动效开关是例外**：它放全局的 `admin.shell-ui`（不随应用走），见 §5.4。
> 其中「详情打开方式」（`detailOpenMode`：分屏 / 抽屉 / 跳转详情页）见
> [detail-preview.md](./detail-preview.md)；「页面宽度」（`pageWidth`：全宽 / 限宽居中）
> 的类名真值在 `apps/web/src/lib/page-width.ts`，两个外壳的 `<main>` 都从那里取。

---

## 2. App 作用域：`apps/web/src/lib/store/app-scope.ts`

per-app 数据的命名空间来自一个模块级的「当前作用域」：

- `getAppScope()`：当前作用域（app id；未选定应用时是 `global`）；
- `setAppScope(appId)`：切换作用域，并**广播**给所有注册过的 scoped store 让它们重新水合；
- `registerScopedStore(id, rehydrate)`：per-app store 创建后在这里登记自己的 `persist.rehydrate`。

谁负责推进作用域？**认证 store**。`currentApp` 每次变化（选定应用、手动切换、登录直达、登出）都会调用 `setAppScope`，因此业务代码不需要关心这件事。

> 顺序保证：`setAppScope` 先改 `currentScope`（storage 之后读写的是新键），再逐个 `rehydrate()`。
> localStorage 是同步 storage，zustand 的 rehydrate 同步完成，不会出现「读到上一个应用数据」的中间帧。

---

## 3. 作用域化 storage：`apps/web/src/lib/store/scoped-storage.ts`

`createScopedJSONStorage<S>(options)` 返回一个把键拼上作用域的持久化 storage：

```
admin.table-ui:console      ← Console 的表格 UI 状态
admin.table-ui:analytics       ← Analytics 的表格 UI 状态（物理隔离，互不覆盖）

admin.dashboard:console     ← Console 的仪表盘卡片布局
admin.dashboard:analytics      ← Analytics 的（互不覆盖；两份都不开 `fallbackToGlobal`）

admin.preferences:console   ← Console 的语言 / 外观 / 时区
admin.preferences:analytics    ← Analytics 的（同上，各存一份）
admin.preferences:global  ← 登录前基线，新应用没改过时继承它
```

关键实现细节：作用域是在**每次读写的当下**取值的（`scopedKey(name)` 内部调 `getAppScope()`），
而不是创建 storage 时算好 —— 所以 `setAppScope()` 之后无需重建 store，下一次读写自然落到新命名空间。

两个可选开关（默认都关）：

- `fallbackToGlobal`：当前作用域没有数据时回落 `:global`。**只有偏好 store 开** ——
  它带来「新应用继承基线、改过之后才独立」；表格 UI **不开**（Console 的列设置不该继承给 Analytics）；
- `legacyUnscoped`：把无后缀的历史键（`admin.preferences`）也作为读取来源，仅升级期使用。

写入永远只落当前作用域的键 —— 回落来的值在你**改动过之后**才会被复制成该应用自己的那一份。

---

## 4. 查询缓存分区：`apps/web/src/lib/query-client.ts`

每个作用域一份 `QueryClient`，由 `AppQueryClientProvider` 按当前作用域提供给组件树：

- **隔离**：不同应用的接口数据互不可见，不会因为 queryKey 相同而串数据；
- **保留**：切换应用**不再清空缓存**（旧实现一切应用就 `queryClient.clear()`，把别的应用的缓存也一起丢了），
  切回来在 `gcTime`（5 分钟）内即时可见；
- **兜底**：登录 / 登出 / 换账号这类身份边界，用 `clearAllQueryCaches()` 全清。

业务代码无需改动：`useQuery` / `useQueryClient()` 拿到的始终是当前应用那一份。

---

## 5. 怎么用

### 5.1 读认证状态

```ts
import { useAuth, getAuthSnapshot, setCurrentApp } from '#/lib/auth'

const { user, currentApp, availableApps, logout } = useAuth()   // 组件
const auth = getAuthSnapshot()                                  // 非 React（路由 beforeLoad）
```

### 5.2 新增一个 per-app 的表格状态

```ts
import { useAppTableState } from '#/lib/store'

const [columnVisibility, setColumnVisibility] = useAppTableState<ColumnVisibilityState>(
  'example/user',        // 表格 key：全局唯一、稳定（同表在 Console / Analytics 下各存一份）
  'columnVisibility',  // 状态片段名，见 TableUiState
  () => getDefaultColumns(),   // 惰性初始值，只在没有持久化值时使用
)
```

API 与 `useState` 一致（支持函数式更新）。想恢复默认：

```ts
import { useTableUiStore } from '#/lib/store'
useTableUiStore.getState().resetTable('example/user')
```

### 5.3 新增一个任意 per-app 状态

1. 在 `table-ui-store.ts` 的 `TableUiState` 里加字段（或另建一个 store）；
2. 另建 store 时记得用 `createScopedJSONStorage()` 并 `registerScopedStore()`；
3. 想让它**继承 `:global` 基线**（像偏好那样）就传 `{ fallbackToGlobal: true }`，
   想让它**天生独立**（像表格 UI 那样）就用默认值。

### 5.4 外壳（侧边栏 / 分屏面板）UI 状态

`useShellUiStore`（`admin.shell-ui`）记录**桌面端**的侧边栏展开态与宽度，**以及详情预览
分屏面板的宽度**（`detailPanelWidth`）、**AI 面板的尺寸**（分屏 `aiPanelWidth`；
贴角浮窗 `aiFloatWidth` / `aiFloatHeight`，浮窗两个方向都可拖）。两个外壳（`AppShell` 与
`MainLayout`）共用同一份，所以在 `/settings` 收起的侧边栏，回到业务页仍是收起的。

它还放**界面动效开关**（`motionEnabled`，默认开）：关掉后 AI 面板与全屏对话页的过渡直接切换。
它属于这里而不是按应用分区的偏好 store，理由见 `shell-ui-store.ts` 里该字段的注释 ——
一句话是判定原则「换个应用还成立就全局」，另一句是**别把它困在某个应用的存档里**
（`admin.preferences:<appId>` 一旦写过一次就整份独立，收不到 `:global` 基线的后续变化）。
判定与接入见 [ui-and-styling.md](./ui-and-styling.md) 的「动效开关」一节与 `#/lib/use-motion`。

接线方式**桌面非受控 + 移动端受控**，代码只有一份：
`#/components/shell/shell-sidebar-provider` 的 `ShellSidebarProvider`（两个外壳都套它，
不要再各自写一遍 Provider 参数）。

```tsx
// ShellSidebarProvider 内部（简化）
const isMobile = useIsMobileViewport()
const [mobileOpen, setMobileOpen] = useState(false)

<Sidebar.Provider
  defaultOpen={sidebarOpen}                       {/* 桌面初始值 */}
  open={isMobile ? mobileOpen : undefined}        {/* 桌面 undefined = 非受控 */}
  onOpenChange={(open) => {
    if (isMobile) setMobileOpen(open)             {/* 移动端必须回写，否则抽屉按不动 */}
    persistSidebarOpen(open)                      {/* 内部还有一道视口判断，移动端不落盘 */}
  }}
  defaultWidth={sidebarWidth}
  onWidthChange={persistSidebarWidth}
  minWidth={SIDEBAR_MIN_WIDTH}
  maxWidth={SIDEBAR_MAX_WIDTH}
/>
```

**为什么移动端必须受控**：Kumo 有两套开合状态（桌面 `open` / 移动 `openMobile`），
但它的 `state`（`expanded` / `collapsed` / `peeking`）**只由桌面 `open` 推导**：

```js
const state = isPeeking ? 'peeking' : open ? 'expanded' : 'collapsed'
```

而 `Sidebar.CollapsibleContent` 用 `isOpen = isCollapsibleOpen && state !== 'collapsed'`
决定二级菜单的可见性（并写 `inert` / `aria-hidden`）。于是只要用户在桌面折叠过侧边栏
（存档 `sidebarOpen: false`），手机抽屉里点开的每个分组都会「箭头转了、内容不出来」，
`inert` 还会让子项点不进去。让移动端的 `open` 跟随抽屉后，`state` 与抽屉一致，问题消失。

而**桌面**仍保持非受控：展开态与宽度由 Provider 自己管，变化经 `onOpenChange` /
`onWidthChange` 写回 store，刷新后保持。
（注意别写成「受控 + 不回写」：`setOpenMobile` 只在受控时回调，那样抽屉会直接按不动。）

**关闭抽屉前必须先移焦点**：Kumo 是把收起的抽屉**藏**起来（`aria-hidden={!openMobile}` +
`inert`），而手机上点二级菜单是「跳路由 + 关抽屉」同一次点击 —— 焦点还在抽屉里的链接上时
浏览器会**拒绝应用**这条 `aria-hidden`，控制台出现

> Blocked aria-hidden on an element because its descendant retained focus.

于是已经收起的导航反而还留在无障碍树里。`ShellSidebarProvider` 在 `onOpenChange` 收到
`false` 时（点菜单项 / 汉堡按钮 / 关闭按钮 / Esc / 遮罩**都**走这里）先把焦点从抽屉里
`blur()` 出去，再落状态 —— 归宿与 `inert` 生效后一致（焦点落到 `body`），没有额外视觉变化。

宽度写入做了 200ms 节流（`onWidthChange` 在拖拽期间每帧触发，同步写 localStorage 会卡）。
布局常量（`SIDEBAR_WIDTH` / `SIDEBAR_MIN_WIDTH` / `SIDEBAR_MAX_WIDTH` / `SHELL_MOBILE_BREAKPOINT`）
统一从这个模块导出，两个外壳共用，避免各写一份而漂移。
移动端抽屉不提供宽度拖拽（`styles.css` 直接隐藏 `ResizeHandle`，见
[ui-and-styling.md](./ui-and-styling.md)）。

**分屏宽度（`detailPanelWidth`）与侧边栏宽度同源但写法不同**，这是刻意的：

- 常量为 `DETAIL_PANEL_DEFAULT_WIDTH` / `DETAIL_PANEL_MIN_WIDTH` / `DETAIL_PANEL_MAX_WIDTH`
  （480 / 260 / 720），默认 480 ≈ 1440 内容区的 1/3；
- 即时值与持久化值**分开**：拖动中只改组件本地 state（`usePanelResize` 的 `onChange`，每帧触发），
  松手 / 每次按键才由 `onCommit` → `persistDetailPanelWidth` 落盘一次。
  若让 `onChange` 直接写 store，zustand persist 会每帧写一次 localStorage；
  若给 store 写入加节流，面板又会滞后几百毫秒才跟手 —— 两条路都不可取；
- 因此 `persistDetailPanelWidth` **不做节流**（一次调整只写一次），但仍保留
  「移动端不记录」判断。详细交互见 [detail-preview.md](./detail-preview.md)。

---

## 6. 迁移与兼容

- **偏好三合一 + 按应用分区**：旧的 `admin.locale` / `admin.color-mode` / `admin.timezone`
  以及上一版的无后缀 `admin.preferences`，都在首次加载时被收进 `admin.preferences:global`
  （登录前基线）并删除旧键 —— 于是所有应用默认继承同一套偏好，用户无感；
  只有你在某个应用里改过之后，它才写自己的 `admin.preferences:<appId>`；
- **认证存档格式升级**：旧版手写 store 存的是裸状态对象，而 zustand persist 期望 `{ state, version }`；
  `authPersistStorage.getItem` 检测到没有 `state` 字段就就地包装，**老会话不需要重新登录**；
- **`icon` / `iconWeight` 不落存档**：它们是前端呈现资源，只认 `ALL_SYSTEM_APPS` 配置 ——
  否则改了配置（例如把图标权重从 `fill` 换回 `regular`）会被旧会话的存档顶回去。

---

## 7. 踩过的坑（改之前先看这里）

- **切应用不要清缓存**：`clearAllQueryCaches()` 只用于登录 / 登出 / 换账号。应用之间是数据域隔离，
  由分区本身保证，清掉就等于放弃了「切回来即时可见」。
- **per-app store 必须注册**：没调 `registerScopedStore()` 的 store 不会跟随作用域切换，
  会一直读 `:global` 命名空间的数据。
- **表格 key 必须稳定**：`useAppTableState` 的第一个参数是存储分区键，写成每帧变化的值（如随机数、
  包含搜索词的字符串）会让持久化数据无限膨胀且读不回来。
- **不要把会话级状态持久化**：行选择（`rowSelection`）、弹窗开关、加载态这些随会话生灭的东西留在
  `useState` 里；`TableUiState` 只收「用户调完希望留住」的项。
- **偏好 store 不要反向 import i18n**：`i18n.ts` 订阅偏好 store，方向是单向的；
  语言清单与类型为此抽到了 `apps/web/src/lib/locale.ts`（时区同理，见 `apps/web/src/lib/timezone-options.ts`）。
- **偏好切换依赖订阅链，不要在切换处手工 apply**：切应用时 `setAppScope` 会 rehydrate
  偏好 store，`i18n.ts` / `use-color-mode.ts` 的订阅随即生效。若新增一类「随偏好变化」的
  副作用（例如字体大小），正确做法是新增一个订阅，而不是在 `setAppScope` 或路由里插代码。
- **`fallbackToGlobal` 只是读取回落**：它不会把基线数据复制到该应用 ——
  想「把当前偏好固化成所有应用的新基线」，直接写 `admin.preferences:global` 那个键即可
  （例如将来做「设为默认」功能时）。
- **侧边栏的 Provider 接法不要在两个外壳里各写一遍**：桌面非受控、移动端受控（`open` 跟随抽屉）
  这套接法有个必须解释清楚的坑（原因见 5.4），统一用 `#/components/shell/shell-sidebar-provider` 的
  `ShellSidebarProvider`；**移动端的 `open` 一定要在 `onOpenChange` 里回写**，否则抽屉按不动。
- **移动端状态不落盘**：`persistSidebarOpen` / `persistSidebarWidth` 写入前都做了
  `isDesktopViewport()` 判断。新增外壳类状态时沿用这个约定，不要把抽屉开合写进存档。


---

## 8. 多标签页同步（`apps/web/src/lib/store/cross-tab-sync.ts`）

**zustand 的 `persist` 不做跨标签页同步。** 它只在启动时 hydrate 一次、之后每次 `set` 写盘，
既不监听 storage、也不广播 —— 官方 persist 参考页只承诺
"persist a store's state across page reloads or application restarts"，源码里 grep 不到
任何 `addEventListener`；旧版文档 FAQ「How can I rehydrate on storage event」的答复就是
「用 Persist API 自己实现」，官方至今没有内置（issue #714 未落地，BroadcastChannel 版 PR 已关闭）。

所以本项目自己接了 `enableCrossTabSync(store, { storageName, scoped?, onExternalChange? })`：

- 监听 `window` 的 `storage` 事件 —— 规范保证**只由其它标签页写入时触发、本页不触发**
  （且 `setItem` 时 oldValue 与新值相同会直接返回），所以天然没有回环，不需要"忽略自己写入"的标记；
- **键匹配**：非 scoped store 认 `name` 本身；scoped store 认 `<name>:<当前 appId>` 与
  `<name>:global`（基线）。scope 在**每次事件里重新求值**，所以切应用之后依然正确；
- `event.storageArea` 存在且不是 `localStorage` 时跳过（排除 sessionStorage）；
- **不要写 `e.newValue && …`**（官方 FAQ 示例就有这个坑）：`removeItem` / `clearStorage`
  触发的事件 `newValue` 为 `null`，加了这层判断会把「被清空」这类更新整个漏掉；
- `rehydrate()` 的类型是 `Promise<void> | void`：localStorage 是同步 storage（实际同步完成、
  事件到达时盘上已是新值，不存在读到旧值的竞态），但仍要 `Promise.resolve(…).then()` 之后再跑
  副作用，这样两种 storage 实现下都对；
- 返回取消订阅函数，并在内部挂 `import.meta.hot.dispose` —— 否则 Vite HMR 每次热替换都会
  再叠一个监听器。

**四处接线**：认证（`admin.auth-state`）、偏好（`admin.preferences:<appId>`，scoped）、
表格 UI（`admin.table-ui:<appId>`，scoped）、外壳 UI（`admin.shell-ui`）。
认证那处的副作用是**安全相关**的：外部登出时要先 `setAppScope(currentApp)` 让 per-app 状态
跟着换，再 `redirectToLogin()` —— 否则本页会拿已被服务端作废的 Token 继续请求（要等 401 才反应）。

**为什么不引第三方**：`zustand-middleware-cross-tab`、`zustand-persist-sync` 在 npm registry
上并不存在；`zustand-sync-tabs`（周下载约 7.6k）与 `use-broadcast-ts`（约 7.2k）可用，但都
替代不了「按作用域键过滤 + 与已有 persist 保持单一真值」这段接线，自己这 40 行更贴合。
**为什么不用 BroadcastChannel**：它适合「不落盘也要广播、或要携带额外元数据」的场景；
本项目状态本来就持久化，而 storage 事件的**写盘与广播是同一次原子操作**，不会出现
「盘上旧值 + 广播新值」的分叉，也不需要自定义消息协议。

> 已知边界：若两个标签页跑的是**不同版本的 store 定义**（一个 tab 停在旧包、另一个已更新），
> 两边 `partialize` / `merge` 的写回内容可能不同而互相覆写。同一次部署下不会发生。
