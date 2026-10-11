# `#/layouts` —— 全端应用外壳布局体系

工作空间前端管理台的统一定制外壳布局目录，根据当前平台环境提供三套物理隔离、独立演进的布局变体，并在顶层入口实现自动分发。

---

## 一、三大布局变体定位

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
├── common/                 # 跨布局共享的纯净展示层组件
│   ├── nav-shared.tsx      # 通用导航按钮与快速搜索
│   └── content-column.tsx  # 统一内容列容器
├── default/                # 1. Web 通用布局
│   ├── app-layout.tsx      # 业务外壳（AppShell）
│   ├── main-layout.tsx     # 通用外壳（MainLayout）
│   ├── sidebar.tsx         # 专属业务侧边栏
│   ├── main-sidebar.tsx    # 专属通用外壳侧边栏
│   └── header.tsx          # 专属顶栏
├── desktop/                # 2. PC 桌面原生布局
│   ├── app-layout.tsx      # 桌面业务外壳
│   ├── main-layout.tsx     # 桌面通用外壳
│   ├── sidebar.tsx         # 桌面专属业务侧边栏
│   ├── main-sidebar.tsx    # 桌面专属通用外壳侧边栏
│   ├── title-bar.tsx       # 桌面原生窗口条
│   └── shell-layout.tsx    # 桌面全高骨架
└── mobile/                 # 3. 移动端专用布局
    ├── app-layout.tsx      # 移动业务外壳
    ├── main-layout.tsx     # 移动通用外壳
    ├── sidebar.tsx         # 移动专属抽屉业务侧边栏
    ├── main-sidebar.tsx    # 移动专属抽屉通用侧边栏
    └── header.tsx          # 移动专属沉浸式顶栏
```

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
