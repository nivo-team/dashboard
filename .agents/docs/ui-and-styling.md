# UI 与样式设计规范

项目 UI 基于 Cloudflare 出品的开源组件库 **Kumo UI**（基于 Base UI 构筑），样式引擎基于 **Tailwind CSS v4**。

---

## 1. 样式引入顺序（关键）

在 `apps/web/src/styles.css` 中，导入顺序和 `@source` 声明严格不可变动：

```css
@source "../node_modules/@cloudflare/kumo/dist/**/*.{js,jsx,ts,tsx}";
@import "@cloudflare/kumo/styles/tailwind";
@import "tailwindcss";
```

> **注意**：Tailwind CSS v4 默认不扫描 `node_modules` 路径。必须通过 `@source` 显式告知 Tailwind 扫描 Kumo 产物类名，否则会导致弹窗不居中、菜单样式缺失等问题。

---

## 2. 主题与语义化颜色令牌

Kumo 采用语义化颜色系统，通过根节点上的 `data-mode="light|dark"` 属性驱动（由 `apps/web/src/lib/use-color-mode.ts` 管理）。

- **语义令牌示例**：
  - 背景色：`bg-kumo-base`（主背景）、`bg-kumo-canvas`（主画布背景）、`bg-kumo-contrast`（高对比背景）；
  - 文字色：`text-kumo-default`（主文本）、`text-kumo-subtle`（次要说明文本）、`text-kumo-brand`（品牌高亮）；
  - 边框色：`border-kumo-line`（细分界线）、`border-kumo-border`（组件边框）。
- **禁止使用**：直接在组件上写 Tailwind 的 `dark:` 变体前缀，统一使用上述语义化 `kumo-*` 变量。

---

## 3. 界面设计准则（Kumo Design）

遵循 `.agents/skills/kumo-design/SKILL.md` 规范：

| 维度 | 规则 | 说明 |
| :--- | :--- | :--- |
| **正文字号** | **固定 14px** | 按钮、输入框、正文、表格内容一律 14px；16px 及以上仅用于标题与副标题 |
| **标题大小写** | **Sentence case** | 英文标题首字母大写其余小写，禁止大写全拼或每个单词首字母大写 |
| **字距** | **禁止调整** | 不得使用 Tailwind 的 `tracking-*` 类名 |
| **字重** | **禁止粗体** | 禁用 `font-bold`；标题采用 `font-semibold`，强调文本采用 `font-medium` |
| **Hover 动画** | **即时响应** | 按钮与交互项的悬停态不配置颜色过渡过渡效果（无 `transition-colors duration-*`） |
| **动效开关** | **问 `useMotionEnabled()`** | 设置 → 外观 → 「界面动效」关掉、或系统 `prefers-reduced-motion: reduce` 时，过渡直接切换；判定唯一入口是 `#/lib/use-motion`，**不要自己拼这两个条件** |

> **动效判定只有一处**：`apps/web/src/lib/use-motion.ts` 的 `useMotionEnabled()` =
> 用户开关（`admin.shell-ui` 的 `motionEnabled`，全局、默认开）**且** 系统没要求减少动效。
> 系统设置优先级更高 —— 用户开着开关，系统说减少动效也不播。
>
> 目前接入的是 **AI 面板**（Split 宽度进出场、Float 升起与折叠变形）与
> **全屏对话页 `/$appId/sphere`**（面板进出场、收起过渡）。其余过渡（详情分屏、
> 侧边栏、设置页缩略图、光晕）暂时仍只跟随系统设置，走各自的 `motion-safe:` 或媒体查询；
> 要扩到它们时把判定换成 `useMotionEnabled()` 即可，不要另写一套。

---

## 4. 侧边栏布局定制要点

- **桌面端一屏吸顶**：Kumo Sidebar 默认使用 `min-h-svh`，当页面内容过长时可能会导致底部操作栏被撑出视口。在 `apps/web/src/styles.css` 中配置了专门规则：
  ```css
  [data-sidebar='sidebar']:not([data-mobile='true']) {
    position: sticky;
    top: 0;
    height: 100svh;
    max-height: 100svh;
    z-index: 20;
  }
  ```
- **外壳的整屏几何 = 两个 CSS 变量**（`apps/web/src/styles.css` 顶部）：
  | 变量 | 浏览器 | 桌面壳（带窗口条的外壳） | 谁在读 |
  | :--- | :--- | :--- | :--- |
  | `--shell-chrome-h` | `0px` | `44px`（窗口条高度，窗口条自己也取它） | 侧边栏高度、`SHELL_PANEL_FRAME`、`CONTENT_PANEL_FRAME` |
  | `--shell-content-top` | `58px`（顶栏高度） | `0px`（内容列贴到那一行顶部） | `CONTENT_PANEL_FRAME`（详情分屏列的起点） |
  取值挂在**外壳的整屏容器**上（`[data-desktop-chrome]`，见 `#/components/shell-sidebar-provider`），不是 `<html>`：桌面壳里也有没有窗口条的页面（登录、`/$appId/sphere`），它们的侧边栏 / 面板必须保持整屏高。**改窗口条高度只改这一个数**，面板与侧边栏跟着走。
- **窗口条（桌面壳）**：`#/components/desktop-title-bar`，横跨整个窗口、排在侧边栏与内容列那一行**之上**。左边是页面标签条（`#/components/page-tab-strip`，数据层 `#/lib/page-tabs`），右边是原顶栏的行末工具区；外壳在桌面壳里**不再渲染顶栏**（`AppHeader` / `MainHeader` 是同一份 chrome 的另一种形态，不是第二行）。它同时是**窗口拖拽区**（`--wails-draggable: drag`，交互件写 `no-drag` 退出），双击空白处 = 最大化 / 还原（`window.toggleMaximise`）；拖拽只在 frameless 窗口下有意义，所以壳那边同时打开了 `Frameless`（见 [`apps/desktop/README.md`](../../apps/desktop/README.md)）。
  拖拽区怎么划：两个容器（标签条、工具区外层）**只有交互件自己**写 `no-drag` —— 标签条是个 `flex-1` 的横向滚动容器，若把整条标成 `no-drag`，窗口条上「标签右边那一大片空白」就都不能拖了。
- **标签条不是桌面壳专属**：同一个组件（`#/components/page-tab-strip` + `page-tab-item`）在浏览器里挂在**顶栏行首那一格**（替掉面包屑），由 设置 → 外观 → 「页面标签页」开关控制（`admin.shell-ui` 的 `pageTabsEnabled`，默认关；桌面壳里恒开）。两处**外观不同**：桌面壳传 `variant="chrome"`（Chrome 那种连成一片的标签：无间距、贴窗口条下沿、只圆上面两个角、激活态抬起来），浏览器用默认的 `variant="plain"`（独立小卡片）。标签条内部是**三个区**：**固定的标签区**（`shrink-0`，不滚动；**不设 `overflow`**）→ **滚动区**（`flex-1 min-w-0 overflow-x-auto`，**只允许横向滚**：`overflow-x: auto` 会把 `overflow-y` 也算成 auto，形状那半个像素的溢出就能凭空多出一段纵向可滚动区域，所以显式 `overflow-y-hidden`）→ **「+」**（跟着标签走，不钉行末）。两者外面还有一个 `max-w-[80%]` 的容器：固定的 + 可滚动的最多占窗口条八成宽，剩下那条留白是与行末工具区之间的间距；**两个区之间不留间距**（外层没有 `gap`，各自组内的间距由组内 `gap` 负责）。两个区**共用同一层「标签行」**（`tabRowClass`：`flex w-max min-w-full items-end` + 各自的 `gap`）—— 行内布局只定义一次，两个区因此不可能走偏（之前两边各写一套，就出现过「固定的比底下的高 1px」）。两个区的外层都 `pt-px` + `-mb-px`（chrome 外观下）：形状比标签盒大一整圈 —— 顶部 1px（描边上下各探出 0.5px）、左右各 9px（外翻倒角）—— 容器不留这 1px 余量就会把顶部描边整条裁掉、把倒角切平（实测过：顶部直边那一行完全没墨迹）；固定区**不能**用 `overflow-hidden` 来「禁滚动」，它本来就不滚，`overflow-hidden` 只会裁掉形状。两区同高同底，固定标签与未固定标签的基线才对得上（实测两个区的平顶描边落在完全相同的行）。滚动区自身左右各留 10px，是给激活标签那对**底部倒角**（向外探 9px）留的画布 —— 所以「固定区最后一个」与「滚动区第一个」之间会看到这 10px 的内边距，那不是两个盒子之间的间距；留白是给行末工具区的间距，也是窗口条的拖拽区（只有标签与「+」写 `no-drag`）。
- **标签条的能力**：拖拽排序（**dnd-kit**：`PointerSensor` + `distance: 6` 的激活约束，横向限制用 `@dnd-kit/modifiers`）、右键菜单（关闭 / 关闭其它 / 关闭左侧 / 关闭右侧 / 关闭全部 / 固定标签页）、固定的标签**排在最前且只显示图标**。几何与规则落在两处：排序与固定态在 `#/lib/page-tabs`（含「不跨越固定/未固定界线」的夹取），右键菜单与拖拽把柄在 `#/components/page-tab-item`。
- **拖拽只在同一组内互动**：正在拖的标签属于哪一组（固定 / 未固定）记在 `PageTabStrip` 的 `dragPinned`，另一组的标签拿到 `useSortable` 的 `disabled: { draggable, droppable }`，并摘掉自己的 `transform` —— 它既不能当落点、也不跟着位移（否则拖未固定的标签时，固定那一排会被拖着一起动）。
- **Chrome 外观的细节**：① 相邻两个未激活标签之间的**细分隔线**在 `styles.css` 里按 `data-page-tab-variant` + `data-page-tab` / `data-active` 画（`& + &` 这种关系 Tailwind 变体表达不出来）；② **激活标签的整块形状**（顶部圆角 + 底部外翻倒角 + 1px 描边）由 `#/components/page-tab-item` 画一条 **SVG 闭合路径**：一份 `fill`（末尾 `Z`）+ 一份同路径的 `stroke`（**不闭合**，底面留给下方工作区，标签底色因此压住底部分割线）。
  **为什么不用「圆角盒 + 角上径向渐变伪元素」那套**（本仓曾经的做法）：渐变描边在 125% / 150% 这类非整数设备缩放下，圆弧每个像素的覆盖率会在 0.5px 之间抖，于是露白、发虚、与直边接不上（实测：1× 下倒角末端与底边之间会空掉一整行）。SVG 路径是几何上连续的一条线，配 **`vector-effect: non-scaling-stroke`** 后缩放多少都是实心 1px；`preserveAspectRatio="none"` 让它随标签宽横向拉伸。另外三点不能省：① 形状四周留 **1px 余量**（`TAB_SHAPE_PAD`），描边（以路径为中心、上下各 0.5px）就完全落在 SVG 自己的视口内 —— 不靠 `overflow: visible`（各引擎不一致，顶部描边会被自己的视口裁掉），也不会因为溢出把标签条的 `overflow-x: auto` 撑出一段可滚动区域；② 标签根上加 **`isolate`**，形状用 `z-index: -1` 垫在内容之下 —— 绝对定位元素默认画在普通流内容**之上**，不加就会把图标与文字整片盖住（曾实测内容完全看不见）；③ 激活标签自己不再画 CSS 边框与底色（整块形状由 SVG 一次画完），但保留 `border` 维持盒模型，切换标签时内容不跳 1px。形状的 `viewBox` 高度、标签高度、条上「+」那一行的高度都取 `CHROME_TAB_HEIGHT`（一个常量）。**圆角与倒角半径对所有 chrome 标签统一是 `CHROME_TAB_FLARE`（8px）** —— 固定态与普通标签必须一致；固定态（36px）当初看着「诡异」的真正原因是**整条路径被横向拉伸**（横向 8px 被拉成 2~6px 的椭圆角），不是半径太大 —— 1:1 的测量路径已经解决，别再靠「窄标签收小半径」绕。另外：形状要按**标签自己的边框宽度**补偿坐标（`TAB_BORDER_WIDTH`）—— 绝对定位后代的包含块是祖先的 **padding box**，而路径照 border box 写，不补偿会整体偏右 1px、右边还多探出 1px（实测过）。
- **激活标签要压住邻居**（`z-10`，拖拽中的 `z-20`）：倒角与描边长在标签盒外、左右各探出 7px，邻居一悬浮就有底色，后画的兄弟会直接糊在倒角上。这一条在两种外观下都留着（plain 外观的标签是独立小块，暂不冲突，但留着不吃亏）。
- **chrome 外观里「+」要与标签那一行对齐**：标签贴着窗口条下沿，所以「+」也放进一个与标签同高（`h-[34px]`）的行尾容器里居中 —— 直接以整条窗口条居中会看起来比标签的图标 / 文字高一截。
- **收起态侧边栏要落回窗口条下面那一行**：Kumo 在收起 / 悬浮窥探时把 `[data-sidebar='content-container']` 改成 `fixed + inset-y-0 + h-full`，以**视口**为基准 —— 桌面壳里上沿会顶到窗口最顶端（被窗口条盖住）、下沿探出视口 44px（Footer 被裁）。修法是按 `data-state` 把它的上下沿挪回窗口条下面（`styles.css` 里那条 `:not([data-state='expanded']) > [data-sidebar='content-container']`）。**为什么只看 `data-state` 就够**：Kumo 只在非展开时才给它 `fixed`（`startPeek` 里写着 `if (peekable && !open && !isMobile)`），三个状态里只有 `expanded` 对应 `open === true`。
- **客户端链接桥接**：在 `apps/web/src/routes/__root.tsx` 中使用了 `<LinkProvider component={AppLink}>`，使得所有 Kumo 内置的 `<a href>` 均无缝转为 TanStack Router 的单页路由跳转。
- **移动端抽屉里隐藏宽度拖拽手柄**：`Sidebar.ResizeHandle` 只按视口断点隐藏（`hidden … sm:block`），手机横屏 / 小平板会露出来，而抽屉宽度是固定的、拖它没意义（拖过 `minWidth` 还会让 Kumo `setOpen(false)` 把抽屉关掉）。`styles.css` 用 `[data-sidebar='sidebar'][data-mobile='true'] [data-sidebar='resize-handle'] { display: none }` 收掉。
- **移动端二级菜单展开不出来 = Provider 少接了 `open`**：Kumo 的 `Sidebar.CollapsibleContent` 用 `isOpen = isCollapsibleOpen && state !== 'collapsed'` 判断可见性，而 `state` **只由桌面 `open` 推导**——桌面折叠过侧边栏后，手机抽屉里每个分组都「箭头转了、内容不出来」（还带 `inert`，子项点不进去）。修法在 `#/components/shell-sidebar-provider`（移动端受控、`open` 跟随抽屉），完整原因见 [store.md](./store.md) §5.4。

---

> 以下由 `AGENTS.md` §5 搬入（原文保留）。`AGENTS.md` 只留契约与指针，**完整规范在这里**。

## 5. Kumo UI 与 Tailwind CSS v4 集成规范 (Kumo UI & Tailwind CSS v4 Integration Rules)

> 样式引入顺序、主题令牌与侧边栏定制的完整说明见 [./ui-and-styling.md](./ui-and-styling.md)。

- **样式引入顺序（关键）**：在 `apps/web/src/styles.css` 中，Kumo 产物的 `@source` 声明必须放在最前，随后依次是 `@import "@cloudflare/kumo/styles/tailwind";` 与 `@import "tailwindcss";`。遗漏 `@source` 将导致 Tailwind 无法扫描 Kumo 组件类名，造成弹窗居中与样式丢失。
- **语义化颜色令牌与主题**：统一使用 Kumo 语义化令牌（如 `bg-kumo-base`、`bg-kumo-canvas`、`text-kumo-default`、`text-kumo-subtle`、`border-kumo-line` 等）。主题模式（`light`、`dark`、`system`）通过根 HTML 元素上的 `data-mode` 属性驱动，由 `apps/web/src/lib/use-color-mode.ts` 集中管理。**禁止在组件中直接使用 Tailwind 的 `dark:` 变体**。
- **界面设计准则（源自 Kumo Design 规范）**：
  - 正文字号：固定为 14px（`size="sm"` 或标准正文），16px 及以上字号专用于标题与副标题；
  - 标题大小写：英文标题必须统一使用首字母大写的 Sentence case，禁止全大写或每个单词首字母大写；
  - 字距控制：禁止使用 Tailwind 的 `tracking-*` 类名；
  - 字重控制：**严禁使用 `font-bold`**；标题统一采用 `font-semibold`，强调文本采用 `font-medium`；
  - 桌面侧边栏吸顶：在 `apps/web/src/styles.css` 中通过 `[data-sidebar='sidebar']:not([data-mobile='true'])` 维持其固定视口高度与 `z-index: 20` 堆叠上下文。
- **危险操作二次确认**：删除等不可逆操作用通用组件 `#/components/danger-confirm-dialog`（`DangerConfirmDialog`）—— **必须原样输入 `confirmationText` 才能点亮确认按钮**（前后空白忽略），目标文本用行内复制按钮 `#/components/copyable-value`（`CopyableValue`，`bg-kumo-tint` 代码块样式、点击即复制、成功后图标变对勾并 `role="status"` 播报）展示；文案与描述由调用方传入（描述建议用 `<Trans>` 把目标对象加粗）。刻意不用 Kumo 的 `DeleteResource`（输入框/文案/排版写死且偏重），也不用 `ClipboardText`（它是输入框形态的整块字段、默认 `lg`，放在一句话中间偏重）。
- **短枚举的分段选择用 Kumo `Tabs`，不要一排 `Radio`**：`Tabs` 是**数据驱动 + 受控**的（`tabs={[{ value, label }]}` + `value` / `onValueChange`，**没有** `Tabs.List` / `Tabs.Tab` 子组件），默认 `variant="segmented"` 就是分段控件形态。设置项这类「即时生效」的选择加 `activateOnFocus`（方向键移动即选中，与 Radio 手感一致；默认要再按 Enter/Space），**尺寸保持默认的 `base`**（别传 `size="sm"`：滑块需要足够高度，且要与同页 `Select` 的高度对齐）。**可访问名称要自己兜**：它和 `Dialog` 一样只解构固定 props、**不透传 `aria-label`**，所以在外面包一层 `<div role="group" aria-label={…}>`。参考实现：`settings/appearance.tsx` 的「主题」「详情打开方式」与「页面宽度」。
- **下拉菜单项**：`DropdownMenu.Item` **不要用 `icon` 属性** —— Kumo 内部给图标写死了 `mr-2`（物理方向），RTL 下间距不会镜像。改成把图标作为 children 的第一个节点、并给 Item 加 `className="gap-2"`，用 flex gap 交给浏览器按书写方向自适应。
- **「悬浮预览」用 Kumo `Popover` 的 `openOnHover` + 通用缩略图，能演就不用文字解释**：`#/components/app-shell-preview` 的 `AppShellPreview` 是用 `div` 拼的**极简应用缩略图**（侧栏 + 顶栏 + 表格 + 详情骨架），它**纯受控** —— `layout={{ content, panel, contentWidth }}` 一变就用 CSS 过渡演过去，组件自己没有状态、没有计时器；**`panel` 认的是「形态」而不是用途**，共五种：`push`（内容区分屏，从顶栏下沿开始、只挤主列）、`cover`（内容区抽屉，满高带遮罩）、`shell`（**外壳级侧列**：与 Sidebar 同级、整屏高，连顶栏一起挤窄 —— AI 的分屏视图）、`float`（行尾侧下角浮窗，浮在上面不挤压、从底部升起 —— AI 的浮窗）、`none`；过渡一律包在 `motion-safe:` 里（`reduce` 下状态仍正确、只是不播），几何量尽量用百分比（固定像素的横条落进被挤压的窄列会溢出被裁），位置只用逻辑属性（`end-0` / `border-s` / `pe-*`，RTL 自动换边），颜色走 Kumo 语义令牌 + `accentColor` 内联样式。**浮层接法与动画时序已抽成公共件 `#/components/settings-choice-preview`**（`SettingChoicePreview` + `usePreviewAnimation`），设置页只留「选项 → 缩略图布局」的映射与预览内容（`settings/appearance.tsx` 的 `DetailOpenModePreview` 与 `PageWidthPreview`、`settings/AI.tsx` 的 `AiModePreview`）；`usePreviewAnimation` 先渲染基线态、180ms 后再切到目标布局，于是「选了这一项页面会怎么变」被演了一遍（设置页「调色盘」那栏只用它的静态形态）。做悬浮预览时四条注意：① **富内容浮层用 `Popover`，不要用 `Tooltip`** —— `Popover.Trigger` 原生支持 `openOnHover` / `delay` / `closeDelay`（hover 打开时 Base UI 会**关掉焦点管理器**，`modal` 默认 `false`，不抢焦点也不锁页面），且 **`Popover.Content` 收 `className` 并合并到浮层上**（`p-1.5` 能顶掉默认的 `px-4 py-3`）；`Tooltip` 的 `className` 只落到 trigger 上、浮层内边距改不到，只适合纯文字提示。**注意 Kumo 的 `Popover` 本身就是 Root**（它是 `Object.assign(PopoverRoot, { Trigger, Content, Title, Description, Close })` 的返回值，`Root` 不在其中）：写成 `<Popover.Root>` 会在运行时报 `Element type is invalid: … got: undefined`，正确写法是 `<Popover>`（与 `Tabs` 同一形态）。② **触发区用 `render={<span className="absolute inset-0" aria-hidden />}` 铺满控件，不要拿它包裹控件** —— 分段控件本身就是 `<button>`，往里塞 button 是非法嵌套；`span` 不可聚焦，所以必须同时给 `nativeButton={false}`（`Popover.Trigger` 透传该 prop），否则 Base UI 开发期会警告「期望一个原生 button」；`aria-hidden` 是因为它只是悬浮热区、没有任何可读内容，不必让读屏在 tab 里再看到一个 `role="button"`。③ **`Popover.Trigger` 的点击同样是开合开关**：只想 hover 触发就受控 `open` + 在 `onOpenChange` 里只放行 `details.reason === 'trigger-hover'`（关闭一律接受），并给 Root 传 `triggerId`（值与 trigger 的 `id` 一致，受控模式要靠它认领触发区）—— 否则触屏点一下选项就会弹出「桌面端专属」的预览，鼠标快速点一下也会把浮层留在屏幕上。④ **键盘用户不触发悬浮预览**：方向键选中时设置已经立即生效，预览只是把结果提前画出来；浮层给个 `sr-only` 的 `Popover.Title` 即可（`role="dialog"` 需要可访问名称，文案直接复用选项自己的 label，不必新增 key）。
- **Kumo 写死的物理方向类要在调用处覆盖**：Kumo 有些组件把 `text-left` / `mr-*` 这类物理方向类写死在内部，RTL 下不会镜像。调用处能拿到 `className` 时就直接用逻辑属性覆盖（`cn` 走 tailwind-merge，`text-left` 与 `text-start` 属同一冲突组，后者会顶掉前者）：`DataTable` 给 `Table` 传 `className="text-start"`、命令面板给 `CommandPalette.Item` 传 `className="text-start"` 都是这个套路。拿不到 `className` 的（如 `Sidebar.MenuButton` 内部的 DOM）只能靠 `apps/web/src/styles.css` 的全局规则或等上游修 —— **折叠态侧边栏图标居中就是这样修的**（`[data-sidebar='sidebar'][data-state='collapsed'] [data-sidebar='menu-button'] > div`，含收起文字 span 与取消 `translate-x-[-3px]`）：Kumo 内部是「图标 + `flex-1` 文字 span」且折叠态没有 `justify-center`，图标会停在 `px-3` 的位置偏左约 9px，**LTR 下同样存在**，只是侧边栏搬到右侧后更显眼。改这条时注意 `data-state` 有三个值（`peeking` / `expanded` / `collapsed`，见 Kumo 的 `state = isPeeking ? "peeking" : open ? "expanded" : "collapsed"`），**只能限定 `collapsed`**，否则会把悬停临时展开（peek）的文字一起藏掉。
- **方向性图标必须镜像**：返回箭头、执行 / 进入箭头、树表折叠 caret 这类**语义随书写方向翻转**的图标一律加 `rtl-flip`（`apps/web/src/styles.css` 的 `[dir='rtl'] .rtl-flip { transform: scaleX(-1) }`）；上下向图标（`CaretDown` / `CaretUpDown`、排序指示）与旋转类（刷新 `ArrowClockwiseIcon`）**不要**加。已按此处理：`main-layout` 的返回箭头、`user-menu` 的登出图标、`command-palette` 的执行箭头、表格示例详情「返回列表」、`DataTable` 树表的折叠 caret。注意 Kumo 自带样式只对日历（`rdp-*`）做了 RTL，**组件内部的方向性图标不会自动镜像** —— 用到的 Kumo 组件若自带箭头（分页器、可折叠分组等），要在 RTL 验收时逐个确认。
- **数据表格开发规范**：列编排、`useSchemaColumns` 接入步骤、渲染器约定、i18n、排序与默认隐藏列、RTL 对齐、验收清单等表格相关内容，已整体迁移至 skill `table-development`（`.agents/skills/table-development/SKILL.md`）。凡是新增/修改列表页、`DataTable`、表格列、筛选控制栏或列设置下拉，先加载该 skill 再动手；不要在此文件里重复维护表格规范。
- **可编辑详情页规范**：详情页内嵌表单 + 底部「未保存更改」浮条 + 页头状态开关（草稿 / dirty / 重置 / 切换重置）的完整契约、骨架代码、接入清单与常见坑，见 skill `editable-detail`（`.agents/skills/editable-detail/SKILL.md`）。新增或修改详情页里的可编辑表单、状态开关、保存浮条时先加载它；参考实现是 features 功能详情与数据字典分类详情。
- **全站路由链接规范（RouterLink 唯一约定）**：全站所有文本链接与页面跳转一律使用通用封装组件 `#/components/router-link`（`RouterLink`，亦可从 `#/components/app-link` 导入）。**严禁**手写 `<a>` 标签或裸用 TanStack `<Link>` 手拼 `text-kumo-brand` / `underline` 散落样式。
  - **设计系统主色**：颜色由 Kumo 官方语义令牌 `text-kumo-link` 驱动，自带正规 hover 渐变与主题自适应；
  - **无缝 SPA 路由**：借由根级 `LinkProvider`，自动桥接至 TanStack Router 进行纯客户端跳转；
  - **变体约定**：操作/辅助链接用 `variant="plain"`（无下划线），正文行内实体链接用 `variant="inline"`（规范下划线微调与偏移）；
  - **属性兼容**：同时支持 TanStack Router 的 `to` 属性与标准的 `href` 属性，外链支持 `<RouterLink.ExternalIcon />`。

---

> 以下由 `AGENTS.md` 搬入（原文保留）。那份文件现在只留**索引与铁律**，
> 各模块的细节都落在对应文档里，**需要时再来读这一份**。

## 附：契约速查 —— Kumo UI 与 Tailwind

## 5. Kumo UI 与 Tailwind CSS v4 集成规范 (Kumo UI & Tailwind CSS v4 Integration Rules)

> **完整规范见 [.agents/docs/ui-and-styling.md](./.agents/docs/ui-and-styling.md)**：样式引入顺序、主题令牌、
> 危险操作确认组件、分段控件、悬浮预览的接法（`Popover` 而不是 `Tooltip`）、
> Kumo 写死的物理方向类怎么覆盖、折叠态侧边栏图标居中的修法…… 下面只列必须记住的。

- **样式引入顺序（漏了就没有弹窗样式）**：`apps/web/src/styles.css` 里 Kumo 的 `@source` 必须放**最前**，
  之后才是 `@import "@cloudflare/kumo/styles/tailwind";` 与 `@import "tailwindcss";`。
- **颜色只用 Kumo 语义令牌**（`bg-kumo-base` / `text-kumo-default` / `border-kumo-line` …）；
  主题由根节点 `data-mode` 驱动 —— **禁止 Tailwind 的 `dark:` 变体**。
- **设计准则**：正文固定 14px（16px+ 只给标题）；英文标题用 Sentence case；**禁用 `tracking-*`**；
  **严禁 `font-bold`**（标题 `font-semibold`、强调 `font-medium`）。
- **短枚举（≤3 项）用 `Tabs` 分段控件，长枚举用 `Select`**，不要一排 `Radio`。
- **方向性图标必须加 `rtl-flip`**（返回 / 进入箭头、树表 caret）；上下向与旋转类**不加**。
  注意 **Kumo 组件自带的方向性图标不会自动镜像**，RTL 验收时要逐个确认。
- **危险操作二次确认**用 `#/components/danger-confirm-dialog`：必须原样输入 `confirmationText`
  才能点亮确认按钮。
- **全站链接统一用 `#/components/router-link`（`RouterLink`）**：严禁裸写 `<a>` 或手拼样式，颜色由 Kumo 官方链接语义（`text-kumo-link`）与变体（`plain` / `inline`）统一定制。
- 表格与可编辑详情页的完整规范在 skill 里：**`table-development` / `editable-detail`**，改之前先加载。
