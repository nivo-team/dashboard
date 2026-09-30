# 详情预览：表格内的分屏 / 抽屉（Detail Preview）

「点表格一行，不离开列表就能看详情」的通用能力。三种打开方式由本机偏好决定，
详情内容与详情页**共用同一个组件**，因此两个入口不会随迭代分叉。

- 能力实现：[`apps/web/src/components/detail-preview/`](../apps/web/src/components/detail-preview/detail-preview.tsx)
- 偏好存储：`admin.preferences:<appId>` 的 `detailOpenMode`（[store.md](./store.md)）
- 参考实现：[用户列表](../apps/web/src/features/users/user/list/index.tsx) + [用户详情视图](../apps/web/src/features/users/user/detail/user-detail-view.tsx)
- 表格侧的整行点击：[`DataTable` 的 `onRowClick`](../apps/web/src/components/data-table/data-table.tsx)

## 1. 三种打开方式

| `detailOpenMode` | 形态 | 布局 | 适用 |
| --- | --- | --- | --- |
| `split` | **分屏预览** | 主内容缩到 2/3，行尾侧 1/3 内嵌详情，两边各自滚动 | 边翻列表边看详情 |
| `sheet` | **右侧抽屉** | 从行尾侧滑出、覆盖在主内容之上，带遮罩、Esc 可关 | 只看一眼就关 |
| `page` | **跳转详情页** | 传统整页导航，无浮层 | 详情内容很重、需要独立 URL |

**默认是 `page`** —— 分屏与抽屉是需要用户主动开启的增强，升级后既有的
「点行 → 整页详情」习惯保持不变。设置入口：**设置 → 外观 → 通用设置 → 详情打开方式**。

### 移动端一律降级为 `page`

`split` 与 `sheet` 都要求视口能容下并列内容：手机上一分屏就是「两栏都读不了」，
抽屉也会把详情挤成一条。因此视口窄于外壳断点（`SHELL_MOBILE_BREAKPOINT = 768`）时
`open()` **直接执行 `onExpand`**（跳转详情页），不进入任何浮层。

这条规则收在能力内部（`useDetailPreview().open()`），**页面不要自己判断视口**；
设置页也不隐藏这两个选项，只在 hint 里如实说明移动端的行为。

### 设置页会把三种方式「演」一遍

「分屏预览 / 右侧抽屉 / 跳转详情页」这些词本身说明不了形态差异，所以 **设置 → 外观 →
通用设置 → 详情打开方式** 的每一段选项在悬浮时会弹出一个浮层，用通用缩略图
[`AppShellPreview`](../apps/web/src/components/app-shell-preview.tsx)（`div` 拼的极简外壳截图）把
「点了一行之后页面会怎么变」播一遍：主列被挤压（`split`）/ 被遮罩压暗并被面板覆盖（`sheet`）/
整块内容区换成详情页（`page`）。缩略图与真实实现逐条对应 —— 分屏面板从顶栏下方开始长
（真实是 `top-[58px]`）、抽屉连顶栏一起盖住（真实是满视口高的模态）、面板与详情页共用同一套
骨架（真实是复用同一个详情组件）。

这段动画是**纯说明性的**，与 `open()` 的行为没有任何耦合：改动方式只需要动
`settings/appearance.tsx` 里那份 `DETAIL_MODE_PREVIEW_LAYOUTS` 映射
（缩略图只认 `content` / `panel` 两个字段）。演示的起点固定是列表态，因为那正是真实场景的
起点。键盘用户不触发浮层（方向键选中即生效，设置已经改了，预览只是把结果提前画出来）。

### 分屏面板宽度可拖动（仅 `split`）

宽度**不是**写死的 1/3，而是可拖的一列：

| 项 | 值 |
| --- | --- |
| 默认宽度 | `480px`（≈ 1440 内容区的 1/3，即最初的「主区域分 1/3」） |
| 范围 | `260 – 720px`（常量在 `#/lib/store/shell-ui-store`） |
| 持久化 | `admin.shell-ui.detailPanelWidth` —— **全局一份**（与侧边栏宽度同源，切应用不跳变）、跨标签页同步、移动端不记录 |
| 键盘 | `←/→` 或 `↑/↓` 按物理方向 ±10px、`Home` 到最小、`End` 到最大 |
| 高度 | 固定为「视口 − AppHeader（58px）」= `h-[calc(100svh-58px)]`，贴顶栏下沿、贴视口底，内部独立滚动 |
| 外观 | 无 `ring`、无圆角、无外 padding；与主内容之间只有一条 `border-s border-kumo-line` |
| 手柄 | 位于面板行首边、**骑在面板那条分隔线上**：8px 热区两侧各 `-4px` 负边距（`-ms-1 -me-1`）→ 对 flex 布局**占位为 0**，主列与面板严丝合缝，手柄以中心跨边框内外各半 + `z-10` 盖在两列之上，与面板同高。hover / 聚焦 / 拖动时的高亮线就是**边框本身被点亮**，而不是旁边多出一条线。**不要改回起始侧正边距**（`ms-1`）：那 4px 会实打实占位，在两列之间撑出一条露底的白缝 |

**实现方式：复刻 Kumo 的 `Sidebar.ResizeHandle`，零依赖**（`#/lib/use-panel-resize`）。
Kumo 自己就没有用任何面板 / 拖拽库（它的依赖只有 `@base-ui/react`、`cnfast`、`motion`、
`shiki`、`d3-geo`、`react-day-picker`、`use-sync-external-store`），拖拽就是
`pointerdown` + `document` 上的 `pointermove/pointerup`，核心约 40 行。
复刻它换来的是：分屏面板与侧边栏的**手感、光标、hover 反馈、键盘语义完全一致**，
也不会为一个分割条引入第二套布局抽象（`react-resizable-panels` 会接管面板组的尺寸分配，
与本仓库「主内容 `flex-1` + 面板固定宽」的结构重叠）。
同一个文件里还有 `useFloatPanelResize`（**贴角浮窗**的宽 + 高两个方向，AI 的 Float 形态）：
拖拽 / 键盘 / 全局光标那一套是共用的，差别只在锚点（浮窗固定底边与行尾边）。

两个容易踩的实现细节：

- **即时值与持久化值必须分开**：`onChange` 每帧触发（写组件本地 state），
  `onCommit`（松手 / 每次按键）才落盘。直接让 `onChange` 写 store 会让 zustand persist
  每帧写一次 localStorage；给 store 写入加节流又会让面板滞后几百毫秒才跟手。
- **拖动起点用实测宽度**：`pointerdown` 时读 `getBoundingClientRect().width`，
  而不是信任 store 里的值 —— 窄视口下 `max-width: calc(100% - 320px)`（保证主内容至少 320px）
  会把面板压小，用存储值起步会让拖动一开始就跳。

## 2. 架构

```
AppShell
└─ <main>                            ← 纯容器：**不带 padding / max-w**
   └─ DetailPreviewProvider          ← 状态源 + 布局容器（padding 在这里分列下发）
      ├─ flex 行（flex-1, items-start）
      │  ├─ 主列 flex-1              ← 承接原 main 的 padding + max-w；<Outlet />（列表页）
      │  ├─ 拖拽手柄（仅 split 打开时）
      │  └─ 行尾列（仅 split 打开时） ← 分屏面板：贴边满高、无边框圆角、内部自管 padding
      └─ Dialog portal               ← 抽屉（仅 sheet 时 open）
```

**padding 的归属（`AppShell` 与 `MainLayout` 的唯一结构差异）**：`$appId` 外壳的 `<main>`
只是纯容器，padding 被下移给**两列分别设置** ——

| 区域 | padding | 宽度约束 |
| --- | --- | --- |
| 主内容列 | `ps-4 py-4 md:ps-6 md:py-5 lg:ps-8 lg:py-6` + 行尾侧 `pe-4 md:pe-6`（面板打开时 `lg:pe-6`，关闭时 `lg:pe-8`） | 面板关闭**且**页面宽度为「限宽居中」档时 `mx-auto max-w-[1440px]`（见 `#/lib/page-width`，默认全宽不收窄） |
| 分屏面板 | 外层 0；由面板内部的 header（`px-4 py-3`）与内容区（`p-4`）各自设置 | 内联 `width`（可拖）+ `max-w-[calc(100%-320px)]` 兜底 |

若 padding 留在 `main` 上，面板会被一起推进来、永远贴不到视口右缘与底部 ——
这是「面板看起来像一张浮动卡片，而不是一整列」的根因。
`_main` 外壳（`MainLayout`）没有分屏面板，保持原来的 `main` + padding 写法不变。

几个刻意的取舍：

- **Provider 放在 `AppShell` 而不是各列表页**：每个列表页都要能打开预览，
  而浮层必须活在「主区域」内（分屏是挤压式布局，挂到 body 上就没法挤压）。
  放在壳里还顺带解决了「切换路由自动收掉浮层」与「移动端降级」两件事。
- **挤压式而不是 overlay 覆盖**：`split` 的语义是「同屏并列」，主内容真的缩到 2/3
  （表格变窄、出现横向滚动），而不是被一块半透明面板盖住右侧几列。
- **面板是一条「列」而不是一张卡片**：无 `ring`、无圆角、无外 padding，
  高度取满视口剩余（`h-[calc(100svh-58px)]`，58px = AppHeader 高度），
  与主内容之间只有一条 `border-s` 分隔线 —— 拖拽手柄**骑在这条线上**（见下），
  hover 时被点亮的就是它，不会出现「边框 + 手柄线」两条分离的线。
- **抽屉复用 Kumo `Dialog`**：Kumo 没有 sheet 组件，但它的 `Dialog`（Base UI）
  自带遮罩、焦点陷阱、Esc 关闭、滚动锁定 —— 这些手写极易出错。
  组件里只用 className 把它从「居中模态」改成「贴行尾全高面板」
  （见第 4 节的两个坑）。
- **「展开」= 先关浮层、再执行 `onExpand`**：两者不会同时存在，
  避免「面板还在、路由已经换了」这一帧错位。

## 3. 接入清单

### 3.1 把详情抽成 props 驱动的组件

路由组件不能直接复用（它绑在 `Route.useParams()` 上）。新建
`-components/xxx-detail-view.tsx`，用 `variant` 区分两种外壳：

```tsx
export interface XxxDetailViewProps {
  id: string
  /** page：完整页面（自带页头）；preview：浮层内（页头交给浮层容器） */
  variant?: 'page' | 'preview'
  /** page 形态的「返回列表」行为；不传就不渲染该按钮 */
  onBack?: () => void
}
```

**不要从路由文件反向 import `Route`** —— 会形成「详情视图 ↔ 路由」循环依赖。
导航行为一律由调用方以回调传入。

预览形态下要做的调整只有排版：页头交给浮层、主体更紧凑、多列网格降到单列
（1/3 宽度下 `sm:grid-cols-2` 会把字段名挤断行）。

### 3.2 路由层变薄

```tsx
export const Route = createFileRoute('/$appId/xxx/$id')({
  component: XxxDetailPage,
})

function XxxDetailPage() {
  const navigate = useNavigate()
  const { appId, id } = Route.useParams()
  return (
    <XxxDetailView
      id={id}
      onBack={() => navigate({ to: '/$appId/xxx', params: { appId } })}
    />
  )
}
```

### 3.3 列表页把「打开详情」汇到一个函数

**所有入口（名称按钮、头像、行内菜单、整行点击）都走同一个函数**，
这样四个入口的行为永远一致：

```tsx
// 只取 open：它在 Provider 内是稳定引用，浮层开合不会导致表格列被反复重建
const { open: openPreview } = useDetailPreview()

const openDetail = useCallback(
  (row: Xxx) => {
    const id = String(row.id)
    openPreview({
      key: id,                                   // 换对象 → 主体重建、滚动复位
      title: row.name,                           // 面板标题
      description: `ID ${id}`,                   // 标题下的次要信息（建议等宽）
      onExpand: () => navigate({ to: '/$appId/xxx/$id', params: { appId, id } }),
      render: () => <XxxDetailView id={id} variant="preview" />,
    })
  },
  [appId, navigate, openPreview],
)
```

### 3.4 表格接上整行点击

```tsx
<DataTable table={table} onRowClick={openDetail} />
```

`onRowClick` 会自动忽略来自行内交互元素（复选框 / 按钮 / 链接 / 菜单 / 输入控件）
的点击，也会忽略文本拖选 —— **列里不需要再写 `stopPropagation`**。

## 4. 坑与约定

### 4.1 Kumo `Dialog` 只接收 className / style / size / container

其余 props（`aria-label`、自定义 `data-*`）**不会透传到弹层元素上**。
抽屉的可访问名称因此由 `Dialog.Title` 提供（视觉上隐藏一份 `sr-only` 标题即可）。

### 4.2 抽屉的定位覆盖：CSS 类管尺寸与圆角（内联样式管定位），动画必须走 `style`

Kumo 内部用 cnfast（tailwind-merge）合并 `cn(默认类, 调用方 className)`，
所以**同组类会被顶掉**：

- `rounded-none` 能顶掉 `rounded-xl`，但**不要再额外加 `rounded-s-xl`** ——
  逻辑圆角与 shorthand 是两个组、不会被合并，谁生效取决于 CSS 顺序；
- 进出场动画属性是**内联样式** `transitionProperty: 'scale, opacity'`，
  className 顶不掉它，必须用 `style` 覆盖（`DialogContent` 的 style 是
  `{...默认, ...调用方}`）。

**水平定位（`left` / `right`）必须用内联物理属性，不要用 `end-0` 这类逻辑属性** ——
这里踩过一次真 bug（RTL 下抽屉依然靠右）：

- Kumo 的默认类是**物理**的 `left-1/2`（配合 `-translate-x-1/2` 居中）；
- 最初用 `left-auto` 顶掉它、再配 `end-0`（`inset-inline-end: 0`）表达「贴行尾」。
  LTR 下没问题：`left-auto` 管左侧、`end-0` 解析成 `right: 0`，互不干扰；
- **RTL 下 `end-0` 解析成的正是 `left: 0`**，与 `left-auto` 撞在同一个物理属性上，
  谁赢只看 Tailwind 生成的 CSS 顺序（实际是 `left-auto` 赢）。于是 `left` / `right`
  双双为 auto，弹层退回 static position，再按 RTL 包含块的块级盒过约束解贴到**右侧**；
- 现在由 `sheetPositionStyle(isRtl)` 用内联样式写物理 `left` / `right`
  （内联优先级最高，且物理属性不受 `direction` 影响），这条路与 CSS 顺序、
  与逻辑属性的解析都无关了。

> 注意：`dir="rtl"` 是设在 `<html>` 上的（`AppRootLayout` 同步 `document.documentElement.dir`），
> portal 到 `body` 的弹层**能**继承到方向 —— 分屏面板用的 `border-s` / `-ms-1` / `-me-1`
> 这类逻辑属性在 RTL 下工作正常。上面这个坑的成因是「物理与逻辑争抢同一属性」，
> 不是「portal 丢了 dir」。

### 4.3 `data-starting-style:` 用无方括号写法

Kumo（Tailwind v4）生成的是 `data-ending-style:scale-90` 形态的类
（选择器为 `[data-ending-style]`）。要顶掉默认的缩放动画必须用**同样的写法**：
写 `data-[ending-style]:` 变体链不同，cnfast 不会消解，两个类会同时存在。

### 4.4 RTL 下抽屉从另一侧滑入（用钩子类 + 全局 CSS，不要用 `rtl:` 变体）

面板在 RTL 下贴左侧（`end-0` 是逻辑属性），滑入方向也要反过来。但
Tailwind 的 `rtl:` 变体生成的是 `&:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *)` ——
`:where()` **特异性为 0**，与 `data-starting-style:translate-x-full` 同特异性，
谁生效只看源码顺序；想用 `!`（important）压制又会引入与变体语法的耦合。

因此组件只挂一个钩子类 `detail-preview-sheet`（本身不带样式），
由 `apps/web/src/styles.css` 里这条**特异性更高**（`[dir]` + 类 + `[data-*]`）的规则负责反向位移：

```css
[dir='rtl'] .detail-preview-sheet[data-starting-style],
[dir='rtl'] .detail-preview-sheet[data-ending-style] {
  translate: -100% 0;
}
```

动画属性依旧走 `style` 覆盖（原因见 4.2），`translate` 是物理属性，所以必须显式写这一条。

### 4.5 路由变化会自动关闭浮层

Provider 监听 `location.href`：点侧边栏、面包屑、浏览器前进后退都会收掉浮层。
列表页因此不需要自己清理。「展开」是**先关浮层再导航**，避免两个动画叠加。

### 4.6 数据取数

预览面板里的详情组件与详情页走同一份取数逻辑。若详情有多个入口（列表 / 详情页 / 预览），
优先把取数收敛到 `-data/` 的 hook（或用查询缓存），避免「列表点一次、展开再点一次」
造成重复请求放大。

## 5. 验收清单

- [ ] 设置 → 外观 → 通用设置里的三项切换后**立即生效**，刷新后保持（按应用隔离）；
- [ ] `split`：主内容缩到 2/3、面板占 1/3，两边**各自滚动**，列表不被遮挡；
- [ ] 分屏面板**贴住顶栏下沿、视口右缘与底部**，高度满一屏、**无边框无圆角**，
      与主内容之间只有一条分隔线（不是一张浮起来的卡片）；
- [ ] 面板与主内容的 padding 各自独立：调到 260px 最窄时内部文字不贴边、不溢出；
- [ ] 面板关闭后，主内容的 padding 与宽度上限回到与改动前**逐像素一致**；
- [ ] 拖动分屏面板与主内容之间的手柄可改宽度：跟手无延迟、松手后刷新仍是该宽度、
      另一个标签页也同步；键盘 `←/→` ±10px、`Home`/`End` 到两端；
- [ ] 手柄与面板分隔线**贴合**：悬停时看到的是那条边框变亮，而不是旁边多出一条线；
      手柄热区跨在边框上（面板最左侧 4px 内也能起拖）；
- [ ] 拖动过程中光标保持 `col-resize`、不会选中表格文字；拖到手柄外松手也能正常结束；
- [ ] RTL（阿拉伯语）下拖拽方向与方向键语义随之翻转（往另一侧拖才是变宽）；
- [ ] `sheet`：从行尾侧滑入、有遮罩、Esc 与遮罩点击都能关闭；
- [ ] 面板里的「展开」→ 关闭浮层并进入详情路由（浏览器后退应回到列表）；
- [ ] 点复选框 / 行内按钮 / 行内菜单 / 拖动选中文本**不会**误触发详情；
- [ ] 切换侧边栏 / 面包屑 / 浏览器前进后退后浮层自动消失；
- [ ] 视口窄于 768px 时点行**直接跳转详情页**，不出现任何浮层；
- [ ] RTL（阿拉伯语）下抽屉仍贴在行尾侧、方向性图标已镜像；
- [ ] 深色模式下分屏面板与抽屉的描边、底色都跟随主题令牌；
- [ ] 业务外壳内的 404（`/$appId/xxx` 乱输）仍然**铺满内容区**（padding 下移后由
      `styles.css` 的两条 `[data-detail-preview-*]` 规则兜住）。

## 404 与 padding 的联动（改布局时必须同步）

`$appId` 外壳的 `<main>` **不再带 padding / max-w** —— 它下发给两列分别设置，
这样分屏面板才能贴住视口右缘与底部。因此 **404 的「铺满」规则也随之下移**到
`[data-detail-preview-main]` / `[data-detail-preview-layout]`（见 `apps/web/src/styles.css`）。

`_main` 外壳（`MainLayout`）没有分屏，它的 `<main>` 保持原样。

---

> 以下由 `AGENTS.md` 搬入（原文保留）。那份文件现在只留**索引与铁律**，
> 各模块的细节都落在对应文档里，**需要时再来读这一份**。

## 附：契约速查 —— 详情预览

## 7. 详情预览：表格内的分屏 / 右侧抽屉 (Detail Preview)

「点表格一行，不离开列表就能看详情」是通用能力 —— 完整说明、接入清单与坑见
**[.agents/docs/detail-preview.md](./.agents/docs/detail-preview.md)**；参考实现是用户列表 + 用户详情视图。

- 能力在 `#/components/detail-preview`（`DetailPreviewProvider` / `useDetailPreview`），
  挂在 `AppShell` 里，**同时是状态源与布局容器**；三种打开方式由 `detailOpenMode` 决定
  （默认 `page`），**移动端一律降级为 `page`，页面不要自己判断视口**。
- **详情组件必须 props 驱动**（`variant: 'page' | 'preview'`）：详情页与预览面板共用同一个
  组件，路由文件只做「取参数 + 接 onBack」。**禁止从详情视图反向 import 路由的 `Route`**（循环依赖）。
- **列表页所有入口汇到一个 `openDetail`**；**整行点击一律走 `DataTable` 的 `onRowClick`**
  （它已自动忽略行内交互元素与文本拖选），**列里不要再写 `stopPropagation`**。
- **动分屏布局时必须同步 404 的「铺满」规则**（padding 已下移到
  `[data-detail-preview-main]` / `[data-detail-preview-layout]`，见 `styles.css`）。
