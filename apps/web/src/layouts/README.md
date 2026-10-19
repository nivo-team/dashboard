# `#/layouts` —— 全端应用外壳布局体系

工作空间前端管理台的统一定制外壳布局目录，根据当前平台环境提供三套物理隔离、独立演进的布局变体，并在顶层入口实现自动分发。

---

## 一、三大布局变体定位

> 变体之间**共用**的部分（侧边栏、高亮判定、外观常量）在 `common/`，见第二节末尾。

| 布局变体 | 目录 | 适用环境 | 核心特征 |
|---|---|---|---|
| **`default`** | `src/layouts/default/` | 标准 Web 浏览器 | Flex 一行流、AppSwitcher、折叠展开与宽度拖拽手柄、常规顶栏 |
| **`desktop`** | `src/layouts/desktop/` | PC 桌面原生壳（macOS / Windows / Linux） | 整宽固定浮层窗口条（避让红绿灯）、全高毛玻璃侧边栏、无移动端抽屉逻辑、支持独立子窗口 |
| **`mobile`** | `src/layouts/mobile/` | 移动端原生壳（如 Android APK）与移动小屏视口 | 沉浸式顶部安全区适配（`safe-area-inset-top`）、汉堡按钮唤出全屏抽屉侧边栏、点击后自动收拢 |

---

## 二、目录结构

```
src/layouts/
├── index.ts                # 统一对外入口（AppShell / MainLayout / 变体导出）
├── types.ts                # 布局契约与类型定义（LayoutVariant / LayoutSlots）
├── provider.tsx            # 全端共享的 Sidebar.Provider 与开合控制
├── use-active-layout.ts    # 宿主与视口自动决策 Hook
├── common/                 # **跨布局共享**：侧边栏实现与展示层零件
│   ├── app-sidebar.tsx     # 业务侧边栏：三端共用的一份实现 + 变体表
│   ├── main-sidebar.tsx    # 外壳侧边栏：同上（含设置二级导航）
│   ├── sidebar-variant.ts  # SidebarVariant 与「外壳布局 → 变体」映射
│   ├── sidebar-chrome.ts   # 平台相关 className（安全区 / 折叠态 / 收起态隐藏）
│   ├── nav-matching.ts     # 导航高亮判定（纯函数，有单测）
│   ├── nav-shared.tsx      # 外壳导航按钮与快速搜索
│   └── content-column.tsx  # 统一内容列容器
├── default/                # 1. Web 通用布局
│   ├── app-layout.tsx      # 业务外壳（AppShell）
│   ├── main-layout.tsx     # 通用外壳（MainLayout）
│   └── header.tsx          # 专属顶栏
├── desktop/                # 2. PC 桌面原生布局
│   ├── app-layout.tsx      # 桌面业务外壳
│   ├── main-layout.tsx     # 桌面通用外壳
│   ├── title-bar.tsx       # 桌面原生窗口条
│   └── shell-layout.tsx    # 桌面全高骨架
└── mobile/                 # 3. 移动端专用布局
    ├── app-layout.tsx      # 移动业务外壳
    ├── main-layout.tsx     # 移动通用外壳
    └── header.tsx          # 移动专属沉浸式顶栏
```

### 侧边栏：一份实现，三个变体

**不要**再往 `default/` `desktop/` `mobile/` 里放 `sidebar.tsx` —— 三端的侧边栏差异只有四类
（顶栏形态、底部折叠按钮、点击后是否收起抽屉、长文案是否在收起态隐藏），已经收敛成
`common/*-sidebar.tsx` 里的变体表。加平台 = 在表里加一行。

两个必须知道的约束（细节见
[platform-development / routing-architecture.md](../../../../.agents/skills/platform-development/references/routing-architecture.md)）：

1. 抽屉感知拆成 `*View`（纯视图）+ `Drawer*`（读 `useSidebar()`）两层 —— **桌面壳没有
   `Sidebar.Provider`**，合并会让桌面端一渲染就报错；
2. 桌面壳点「设置」开独立窗口，但**设置窗口内的导航不能再开一个**（`settingsInOwnWindow`
   只在非设置区生效）。

---

## 三、使用说明

### 3.1 在路由中使用统一入口（推荐）
在业务路由或通用外壳路由中，无需关心当前所处平台，直接引入统一外壳：

```tsx
import { AppShell, MainLayout } from '#/layouts'

// 业务外壳（$appId 路由）
export const Route = createFileRoute('/$appId')({
  component: AppShell,
})

// 通用外壳（_main 路由）
export const Route = createFileRoute('/_main')({
  component: MainLayout,
})
```

### 3.2 显式指定变体
若需要强制使用某一端的特定布局（例如在设计器或预览调试模式下）：

```tsx
<AppShell variant="desktop" />
<AppShell variant="mobile" />
<AppShell variant="default" />
```

或直接消费对应端的组件模块：

```tsx
import { DesktopLayout, MobileLayout, DefaultLayout } from '#/layouts'
```
