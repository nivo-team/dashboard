# `#/desktop` —— 桌面壳在 Web 侧的适配层

这个目录是**桌面壳专属**的页面代码。判断依据很简单：浏览器里用不到的东西放这里，
两个宿主（浏览器 / 桌面壳）都要用的东西留在 `#/components`、`#/lib`。

桌面壳本身在 [`apps/desktop/`](../../../desktop/README.md)（Wails v3 + Go）；这里只放
「跑在 webview 里的那一半」。

## 结构

```
bridge.ts                  前端与壳之间唯一的接口（传输层 call/on + 类型层 invoke/subscribe）
generated/bridge.gen.ts    ← Go 生成，别手改（`pnpm desktop:bindings`）
title-bar.tsx              桌面壳的窗口条（取代顶栏；品牌 / 搜索 / 侧边栏开关 / 历史导航 / 标签条）
blur-setting.tsx           设置 → 外观 的「窗口背景模糊」开关（浏览器里整行不渲染）
```

## 两层：传输 vs 类型

`bridge.ts` 刻意分成两层，业务代码**只碰第二层**：

| 层 | 导出 | 知道什么 |
|---|---|---|
| 传输层 | `call()` / `on()` / `off()` / `last()` / `isDesktop()` / `installDesktopBridge()` | 只知道「发一条按名字的消息」，不认具体方法名 |
| 类型层 | `invoke()` / `subscribe()` | 方法名 / 事件名与载荷、结果类型都来自生成物 |

```ts
import { invoke, subscribe } from '#/desktop/bridge'

const info = await invoke('core.info')              // 结果类型自动带上
const off = subscribe('theme:systemChanged', (d) => { d.isDarkMode })
```

方法名不要手写字面量：写错名字或载荷类型会直接编译不过（见 `generated/bridge.gen.ts`）。

## 生成物：真值在 Go

`generated/bridge.gen.ts` 由 [`apps/desktop/internal/bridge/catalog.go`](../../../desktop/internal/bridge/catalog.go)
生成 —— **名字与类型只维护一次**，两侧不会漂移。改方法 / 事件：

1. 改 `catalog.go` 的目录；
2. `main.go` 用目录里的常量注册 handler（`registry.Handle(bridge.CoreInfo, …)`）；
3. `pnpm desktop:bindings` 重新生成。

`pnpm desktop:bindings:check` 校验生成物是否最新（CI / 提交前用）。
生成物是 `*.gen.ts`，已在根 `vite.config.ts` 里排除出 fmt / lint。

## 边界：什么不在这里

- **页面标签页**（`#/lib/page-tabs`、`#/components/page-tab-strip`）**不是桌面专属** ——
  浏览器顶栏的「页面标签页」开关也会用它，所以它留在共享层；
  桌面壳的窗口条只是它的一个宿主（`title-bar.tsx`，`variant="chrome"`）。
- **首屏桌面标记**（`window.__DESKTOP__` 等）必须**在任何应用代码之前**落地，
  所以是 [`apps/web/index.html`](../../index.html) 里的内联脚本，不能搬进这里。
- **共享外壳组件**（`app-shell` / `main-layout` / 侧边栏 / 各 Header）留在 `#/components`，
  它们只是通过 `isDesktop()` 切换形态。

## 桌面标记从哪来

壳在导航前把 `?__desktop=1&__desktop_<k>=<v>` 写进 URL → `index.html` 的首屏脚本落地成
`window.__DESKTOP__` 与 `<html class="is_desktop">`，并记进 `sessionStorage`（刷新后仍在）。
`bridge.ts` 的 `isDesktop()` 只读这个标记，不碰网络。细节见
[`apps/desktop/README.md`](../../../desktop/README.md) 的「桌面标记」一节。
