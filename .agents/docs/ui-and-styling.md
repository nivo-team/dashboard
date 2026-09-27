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
- **客户端链接桥接**：在 `apps/web/src/routes/__root.tsx` 中使用了 `<LinkProvider component={AppLink}>`，使得所有 Kumo 内置的 `<a href>` 均无缝转为 TanStack Router 的单页路由跳转。

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
- **短枚举的分段选择用 Kumo `Tabs`，不要一排 `Radio`**：`Tabs` 是**数据驱动 + 受控**的（`tabs={[{ value, label }]}` + `value` / `onValueChange`，**没有** `Tabs.List` / `Tabs.Tab` 子组件），默认 `variant="segmented"` 就是分段控件形态。设置项这类「即时生效」的选择加 `activateOnFocus`（方向键移动即选中，与 Radio 手感一致；默认要再按 Enter/Space），**尺寸保持默认的 `base`**（别传 `size="sm"`：滑块需要足够高度，且要与同页 `Select` 的高度对齐）。**可访问名称要自己兜**：它和 `Dialog` 一样只解构固定 props、**不透传 `aria-label`**，所以在外面包一层 `<div role="group" aria-label={…}>`。参考实现：`settings/appearance.tsx` 的「主题」与「详情打开方式」。
- **下拉菜单项**：`DropdownMenu.Item` **不要用 `icon` 属性** —— Kumo 内部给图标写死了 `mr-2`（物理方向），RTL 下间距不会镜像。改成把图标作为 children 的第一个节点、并给 Item 加 `className="gap-2"`，用 flex gap 交给浏览器按书写方向自适应。
- **「悬浮预览」用 Kumo `Popover` 的 `openOnHover` + 通用缩略图，能演就不用文字解释**：`#/components/app-shell-preview` 的 `AppShellPreview` 是用 `div` 拼的**极简应用缩略图**（侧栏 + 顶栏 + 表格 + 详情骨架），它**纯受控** —— `layout={{ content, panel }}` 一变就用 CSS 过渡演过去，组件自己没有状态、没有计时器；**`panel` 认的是「形态」而不是用途**，共五种：`push`（内容区分屏，从顶栏下沿开始、只挤主列）、`cover`（内容区抽屉，满高带遮罩）、`shell`（**外壳级侧列**：与 Sidebar 同级、整屏高，连顶栏一起挤窄 —— AI 的分屏视图）、`float`（行尾侧下角浮窗，浮在上面不挤压、从底部升起 —— AI 的浮窗）、`none`；过渡一律包在 `motion-safe:` 里（`reduce` 下状态仍正确、只是不播），几何量尽量用百分比（固定像素的横条落进被挤压的窄列会溢出被裁），位置只用逻辑属性（`end-0` / `border-s` / `pe-*`，RTL 自动换边），颜色走 Kumo 语义令牌 + `accentColor` 内联样式。**浮层接法与动画时序已抽成公共件 `#/components/settings-choice-preview`**（`SettingChoicePreview` + `usePreviewAnimation`），设置页只留「选项 → 缩略图布局」的映射与预览内容（`settings/appearance.tsx` 的 `DetailOpenModePreview`、`settings/AI.tsx` 的 `AiModePreview`）；`usePreviewAnimation` 先渲染基线态、180ms 后再切到目标布局，于是「选了这一项页面会怎么变」被演了一遍（设置页「调色盘」那栏只用它的静态形态）。做悬浮预览时四条注意：① **富内容浮层用 `Popover`，不要用 `Tooltip`** —— `Popover.Trigger` 原生支持 `openOnHover` / `delay` / `closeDelay`（hover 打开时 Base UI 会**关掉焦点管理器**，`modal` 默认 `false`，不抢焦点也不锁页面），且 **`Popover.Content` 收 `className` 并合并到浮层上**（`p-1.5` 能顶掉默认的 `px-4 py-3`）；`Tooltip` 的 `className` 只落到 trigger 上、浮层内边距改不到，只适合纯文字提示。**注意 Kumo 的 `Popover` 本身就是 Root**（它是 `Object.assign(PopoverRoot, { Trigger, Content, Title, Description, Close })` 的返回值，`Root` 不在其中）：写成 `<Popover.Root>` 会在运行时报 `Element type is invalid: … got: undefined`，正确写法是 `<Popover>`（与 `Tabs` 同一形态）。② **触发区用 `render={<span className="absolute inset-0" aria-hidden />}` 铺满控件，不要拿它包裹控件** —— 分段控件本身就是 `<button>`，往里塞 button 是非法嵌套；`span` 不可聚焦，所以必须同时给 `nativeButton={false}`（`Popover.Trigger` 透传该 prop），否则 Base UI 开发期会警告「期望一个原生 button」；`aria-hidden` 是因为它只是悬浮热区、没有任何可读内容，不必让读屏在 tab 里再看到一个 `role="button"`。③ **`Popover.Trigger` 的点击同样是开合开关**：只想 hover 触发就受控 `open` + 在 `onOpenChange` 里只放行 `details.reason === 'trigger-hover'`（关闭一律接受），并给 Root 传 `triggerId`（值与 trigger 的 `id` 一致，受控模式要靠它认领触发区）—— 否则触屏点一下选项就会弹出「桌面端专属」的预览，鼠标快速点一下也会把浮层留在屏幕上。④ **键盘用户不触发悬浮预览**：方向键选中时设置已经立即生效，预览只是把结果提前画出来；浮层给个 `sr-only` 的 `Popover.Title` 即可（`role="dialog"` 需要可访问名称，文案直接复用选项自己的 label，不必新增 key）。
- **Kumo 写死的物理方向类要在调用处覆盖**：Kumo 有些组件把 `text-left` / `mr-*` 这类物理方向类写死在内部，RTL 下不会镜像。调用处能拿到 `className` 时就直接用逻辑属性覆盖（`cn` 走 tailwind-merge，`text-left` 与 `text-start` 属同一冲突组，后者会顶掉前者）：`DataTable` 给 `Table` 传 `className="text-start"`、命令面板给 `CommandPalette.Item` 传 `className="text-start"` 都是这个套路。拿不到 `className` 的（如 `Sidebar.MenuButton` 内部的 DOM）只能靠 `apps/web/src/styles.css` 的全局规则或等上游修 —— **折叠态侧边栏图标居中就是这样修的**（`[data-sidebar='sidebar'][data-state='collapsed'] [data-sidebar='menu-button'] > div`，含收起文字 span 与取消 `translate-x-[-3px]`）：Kumo 内部是「图标 + `flex-1` 文字 span」且折叠态没有 `justify-center`，图标会停在 `px-3` 的位置偏左约 9px，**LTR 下同样存在**，只是侧边栏搬到右侧后更显眼。改这条时注意 `data-state` 有三个值（`peeking` / `expanded` / `collapsed`，见 Kumo 的 `state = isPeeking ? "peeking" : open ? "expanded" : "collapsed"`），**只能限定 `collapsed`**，否则会把悬停临时展开（peek）的文字一起藏掉。
- **方向性图标必须镜像**：返回箭头、执行 / 进入箭头、树表折叠 caret 这类**语义随书写方向翻转**的图标一律加 `rtl-flip`（`apps/web/src/styles.css` 的 `[dir='rtl'] .rtl-flip { transform: scaleX(-1) }`）；上下向图标（`CaretDown` / `CaretUpDown`、排序指示）与旋转类（刷新 `ArrowClockwiseIcon`）**不要**加。已按此处理：`main-layout` 的返回箭头、`user-menu` 的登出图标、`command-palette` 的执行箭头、用户详情「返回列表」、`DataTable` 树表的折叠 caret。注意 Kumo 自带样式只对日历（`rdp-*`）做了 RTL，**组件内部的方向性图标不会自动镜像** —— 用到的 Kumo 组件若自带箭头（分页器、可折叠分组等），要在 RTL 验收时逐个确认。
- **数据表格开发规范**：列编排、`useSchemaColumns` 接入步骤、渲染器约定、i18n、排序与默认隐藏列、RTL 对齐、验收清单等表格相关内容，已整体迁移至 skill `table-development`（`.agents/skills/table-development/SKILL.md`）。凡是新增/修改列表页、`DataTable`、表格列、筛选控制栏或列设置下拉，先加载该 skill 再动手；不要在此文件里重复维护表格规范。
- **可编辑详情页规范**：详情页内嵌表单 + 底部「未保存更改」浮条 + 页头状态开关（草稿 / dirty / 重置 / 切换重置）的完整契约、骨架代码、接入清单与常见坑，见 skill `editable-detail`（`.agents/skills/editable-detail/SKILL.md`）。新增或修改详情页里的可编辑表单、状态开关、保存浮条时先加载它；参考实现是 features 功能详情与数据字典分类详情。

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
- 表格与可编辑详情页的完整规范在 skill 里：**`table-development` / `editable-detail`**，改之前先加载。
