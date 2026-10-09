# @admin/desktop

**超薄桌面壳**（Wails v3 + Go）：一个只加载**远程 http/https 地址**的窗口，外加一条通用的
JS↔Go 消息通道（bridge）。

```bash
pnpm desktop          # 开发：go -C apps/desktop run .（默认加载 http://localhost:3000）
pnpm desktop:test     # 协议层护栏测试（纯 Go，不需要窗口）

# 发布：地址**只**从构建环境来，仓库里不留线上地址
DESKTOP_URL=https://admin.example.com pnpm desktop:build   # → apps/desktop/dist/nivo-desktop

# 临时指个别的地址 / 打开 devtools
go -C apps/desktop run . -url http://localhost:5173 -debug
```

> **壳里不打包前端产物**：窗口永远加载一个 http/https 地址，前端发版即生效，
> 壳本身只在「要换 webview 能力」时才需要重新发版。
>
> **开发 / 发布两套默认地址**由构建 tag 分开（见 `internal/shell/default_*.go`）：
> `go run` = `http://localhost:3000`；`-tags release` = 空，由 `DESKTOP_URL` 注入。
> 于是没人需要记着手写 `-ldflags`，也不会有人误把线上地址提交进仓库。

### 用 wails3 CLI（可选）

习惯敲 CLI 的话，这两条也能用 —— 只是把 `pnpm` 那两条换个壳：

```bash
pnpm dev            # 前端照旧自己起（壳不代管前端）
wails3 dev          # watch Go 源码 → 重启壳（配置在 build/config.yml）

DESKTOP_URL=https://admin.example.com wails3 build   # = Taskfile 的 build = scripts/build.mjs
wails3 task test                                     # = pnpm desktop:test
```

两个 CLI 自己的规矩（不是我们的配置问题）：

- **`wails3 dev` 先要一个「空闲的 Vite 端口」**：它做一次
  `net.Listen("tcp", "localhost:9245")`，被占用就直接
  `ERROR listen tcp 127.0.0.1:9245: bind: address already in use` 退出。
  那端口是留给 Wails 模板工程的前端 dev server 的，我们不用它 —— 换一个即可：
  `wails3 dev -port 9801`（或 `WAILS_VITE_PORT=9801`）。
  以前还会报 `open ./build/config.yml: no such file or directory`，那份配置现在已经补上了。
- **必须在 `apps/desktop` 目录下执行**：CLI 按相对路径找 `build/config.yml` 与 `Taskfile.yml`。

> 没装 CLI 也完全不影响：`pnpm desktop` / `pnpm desktop:build` / `pnpm desktop:test` 走的是
> 同一套 Go 命令与同一个构建脚本。

## 它做了什么

| 能力 | 落点 |
|---|---|
| 加载远程站点（不用构建产物） | `WebviewWindowOptions.URL` + `internal/shell/config.go` |
| 页面**执行前**的桌面标记 | 壳改写 URL（`?__desktop=1`）→ 站点首屏内联脚本落地成 `window.__DESKTOP__`，并记进窗口会话（刷新后仍在） |
| web → Go 的通用调用 | `bridge.Registry`（`internal/bridge/`）+ 页面侧 `__bridge.call(name, payload)` |
| Go → web 的事件推送 | `registry.Emit(name, data)` → 页面侧 `__bridge.on(name, handler)` |
| 来源校验 | `shell.Config.OriginAllowed`（只认配置地址那一个来源） |
| 无系统标题栏（页面自己画窗口条） | `WebviewWindowOptions.Frameless` + 页面侧 `--wails-draggable`（见下节） |
| 窗口自身动作 | `window.minimise` / `window.toggleMaximise` / `window.close` |

页面侧的唯一接口在 [`apps/web/src/lib/desktop-bridge.ts`](../web/src/lib/desktop-bridge.ts)，
线上协议的真值在 [`internal/bridge/wire.go`](./internal/bridge/wire.go)。

## 窗口条与拖拽（frameless）

窗口是 **frameless** 的：系统标题栏连同它的最小化 / 最大化 / 关闭按钮一起没有了，
那一条 chrome 改由**页面自己画**（[`apps/web/src/components/desktop-title-bar.tsx`](../web/src/components/desktop-title-bar.tsx)：
左边页面标签条、右边原顶栏的行末工具区），壳这边只提供两件事：

- **拖拽**：页面在要拖的区域写 `--wails-draggable: drag`，交互件写 `no-drag` 退出。
  Wails 的 drag 运行时只看**鼠标落点那个元素**上的计算值，而这个自定义属性会继承 ——
  所以「条上写 drag、按钮和标签写 no-drag」就够了。别用 `-webkit-app-region`，那是 Electron 的。
- **窗口动作**：`window.minimise` / `window.toggleMaximise` / `window.close`（前两个返回
  `{ maximised, minimised }`）。页面现在只用 `toggleMaximise`：窗口条空白处**双击** =
  最大化 / 还原（macOS 的双击由 Wails 自己的运行时接管，不会重复触发）。

> **目前没有窗口按钮**：frameless 之后只能靠系统快捷键（Linux: `Alt+F4` / `Super+Q`）
> 或任务栏关窗。要补按钮时前端调上面三个方法即可，不必再动壳。
> 窗口最小尺寸是 900×600（外壳在 768px 以下会切成移动端抽屉，而汉堡按钮在顶栏里 ——
> 顶栏在桌面壳里被窗口条取代，所以干脆不让窗口进到那个区间）。

## 怎么加一个方法

Go 侧三行（`main.go` 里 `registerCoreMethods` / `registerWindowMethods` 旁边）：

```go
registry.Handle("file.pick", func(json.RawMessage) (any, error) {
	return app.Dialog.OpenFile().PromptForSingleSelection()
})
```

前端：

```ts
import { call } from '#/lib/desktop-bridge'

const path = await call('file.pick')
```

约定：**方法名 `<域>.<动作>`**（`core.info` / `file.pick` / `window.minimise`）。
未注册的方法会返回带「可用方法清单」的错误，不会静默失败。

## 怎么推一个事件

```go
registry.Emit("session:expired", map[string]any{"reason": "timeout"})
```

```ts
import { on } from '#/lib/desktop-bridge'

const off = on('session:expired', (data) => { /* … */ })
```

事件是**即时**的、不重放：页面就绪之前推的会排队（上限 256 条，满了丢最旧的），
就绪之后按顺序送达。组件挂载晚于事件到达时用 `last('事件名')` 补最近一次，
或用 `call()` 主动拉状态。

## 协议

```jsonc
// web → go
{ "id": "abc", "call": "core.info", "payload": { } }
// go → web（应答）
{ "id": "abc", "ok": true, "data": { } }
{ "id": "abc", "ok": false, "error": "未注册的方法 …" }
// go → web（事件，单向）
{ "event": "shell:ready", "data": { } }
```

## 为什么不用 Wails 默认的运行时通道

Wails v3 的 `Call.ByName` / `Events.On` 走的是 HTTP：页面 `fetch(window.location.origin + "/wails/runtime")`，
而 `/wails/runtime` 由 **Wails 的 asset server** 提供。页面一旦来自远程站点
（我们这种用法），这个 fetch 只会打到远程站点 —— 跨域、又没有 CORS 头，等于不通。
（想继续用那套 API 的话，官方给的两条路是「反代远程页保持同源」或
[自定义 transport](https://v3.wails.io/guides/custom-transport/) —— 前者毁掉真实来源
（cookie / OAuth / 绝对地址全变，Linux 上还会丢 POST body），后者要自己起连接，
都比这个壳该有的复杂度高。实测证据见调研文档 §八。）

这里改走官方文档 [Raw Messages](https://v3.wails.io/guides/raw-messages/) 的
`application.Options.RawMessageHandler`：页面上**不以 `wails:` 开头**的消息全都会落到它，
与页面来源无关，也不需要端口、CORS 或代理。发送原语由 Wails 在页面加载完成后注入
（三平台各一个）：

```js
window.chrome.webview.postMessage(msg)                     // Windows WebView2
window.webkit.messageHandlers.external.postMessage(msg)     // macOS / Linux WebKitGTK
window._wails.invoke(msg)                                   // 上面两个的包装
```

回复走 `window.ExecJS('window.__bridgeRecv(…)')`（官方示例用 `window.EmitEvent`；
这里直接用 ExecJS 是为了**只有一个接收入口**，不必再让页面侧监听 Wails 事件）。
**三条纪律**：

1. 消息回调**不在主线程**（Wails 是每条消息一个独立协程），所以直接在回调里干活是安全的；
   要避免的是把那条协程占太久 —— 注入 JS 会阻塞等主线程；
2. 出站全部经 `Registry` 的单协程 outbox，保证事件顺序，也让注入 JS 不落在主线程上；
3. **来源必须校验**（官方标注为 caution）：只认配置地址那一个来源（跳转场景用 `-allow-origin` 加）。

代价：bridge **不做大 payload 优化**（消息是字符串过 webview 通道）。传文件请走 Go 侧读路径，
只把结果/句柄给页面。

### 页面侧必须发的系统握手

页面还要先发一条**裸字符串** `wails:runtime:ready`。壳的 `WebviewWindow.ExecJS`
在收到它之前只会把 JS 排进 `pendingJS`（`webview_window.go` 的 `runtimeLoaded`），
而那条消息平时是 `@wailsio/runtime` 在加载时发的 —— 我们刻意不引那个包，
所以由 `#/lib/desktop-bridge` 自己发（常量 `RUNTIME_READY`）。

**少了它，壳推回去的每条消息都会永远卡在壳的队列里**（页面侧看起来就是「调用成功但永远收不到回应」）。
顺序也不能反：先 `wails:runtime:ready`，再 bridge 自己的 `__ready`。

## 桌面标记

壳在导航前把标记写进 URL —— 这是唯一「页面执行前就存在」的通道
（Wails 的 `WebviewWindowOptions.JS` 三平台都在页面加载**之后**才执行，
Windows 上 URL 导航分支根本不执行它）：

```
https://admin.example.com/?__desktop=1&__desktop_channel=beta
```

站点首屏内联脚本（[`apps/web/index.html`](../web/index.html)）把它落地成：

```html
<html class="is_desktop" data-is-desktop="true">
```

```js
window.__DESKTOP__ === true
window.__DESKTOP_MARKS__ === { channel: 'beta' }   // 来自 -mark k=v
```

随后把 `__desktop*` 参数从地址栏抹掉（否则会被当成路由的 search 参数）。
**默认 `data-is-desktop="false"`** —— 浏览器、SSR、没跑内联脚本的旧站点都走这条。

### 标记要在**每次加载**都在（否则一刷新就没了）

壳只在**启动那一次**导航时能改写地址（页面加载之后的注入点赶不上首屏），而标记紧接着就被
上面那句「从地址栏抹掉」清掉了 —— 于是第 2 次加载（用户按 F5、壳自己 `Reload`、
`window.location.reload()`）就再也没有标记：窗口条与标签条会整个消失，看起来像「刷新后
标签页丢了」。

所以首屏内联脚本把「这个窗口是桌面壳」连同 `-mark` 的键值记进 **`sessionStorage`**
（`admin.desktop`），后续每次加载先读它，读到就照常落地 `window.__DESKTOP__` 与
`is_desktop`。三个性质正是这里要的：

- **只属于这一个窗口会话**：刷新、站内跳转都在；窗口关掉后一般随之清空（就算 webview 把它
  留下来也无害：下一次启动壳照样会写 URL，两者说的是同一件事）；
- **不跟浏览器串**：sessionStorage 按浏览上下文隔离，同源的浏览器标签页各有各的；
- **不碰路由**：标记不进 URL，也就不需要路由去忽略一个参数。

浏览器里没有这个存档，行为与以前完全一样（`data-is-desktop="false"`）。

## 配置

| 来源 | 说明 |
|---|---|
| `-url` / `DESKTOP_URL` | 要加载的地址（http/https）。开发构建默认 `http://localhost:3000`；**发布构建必须给**（构建时 `DESKTOP_URL` 注入，运行时同名变量仍优先） |
| `-title` / `DESKTOP_TITLE` | 窗口标题 |
| `-width` / `-height` | 初始尺寸（默认 1280×800） |
| `-debug` | 打开 devtools |
| `-mark k=v` | 随 URL 交给页面的自定义标记，可重复 |
| `-allow-origin <来源>` | 额外放行、允许调用 bridge 的来源，可重复 —— 站点有 http→https / 换域名 / SSO 跳转时用 |

> **Linux 构建依赖**：默认栈是 **GTK4 + WebKitGTK 6.0**（旧栈要 `-tags gtk3`）。
> 本机 `wails3 doctor` 全绿；不装 `wails3` CLI 也能 `go run`（壳不做打包）。
> 版本、平台差异与实测细节见 [docs/wails3-desktop-shell-research.md](../../docs/wails3-desktop-shell-research.md)。

发布构建的地址**只从构建环境来**（CI 里配 `DESKTOP_URL` 变量即可），产物里没有默认域名：

```bash
DESKTOP_URL=https://admin.example.com pnpm desktop:build
# 等价于：
go -C apps/desktop build -tags release -o dist/nivo-desktop \
  -ldflags "-X github.com/nivo-team/dashboard/apps/desktop/internal/shell.DefaultURL=https://admin.example.com"
```

没给 `DESKTOP_URL` 时构建脚本**直接失败**并说明怎么补；万一拿到一个没编地址的发布产物，
它启动时会明确报错而不是开一个空白窗口。

## 结构

```
main.go                          组装：配置 → app → RawMessageHandler → 窗口（frameless）→ 窗口方法
internal/bridge/registry.go      方法表 + 出站投递（协议逻辑都在这里）
internal/bridge/wire.go          线上协议（三种消息）
internal/shell/config.go         启动参数、URL 标记、来源校验
internal/shell/default_dev.go    开发构建的默认地址（!release）
internal/shell/default_release.go 发布构建：地址由 DESKTOP_URL 注入（release）
scripts/build.mjs                发布构建（读 env → ldflags → 产物）
build/config.yml                 wails3 dev 的 watch 配置（只监听 *.go）
Taskfile.yml                     wails3 build / task 的任务（build → scripts/build.mjs）
```

## 还没做（按需再加）

- **窗口按钮**：frameless 之后没有最小化 / 最大化 / 关闭按钮（能力已在
  `window.minimise` / `window.toggleMaximise` / `window.close`，缺的只是画在哪）。
- **macOS 适配**：交通灯位置的留白（窗口条左侧目前从最左边开始）、双击行为与
  `Mac.CornerType` / 圆角 / 按钮状态都还没调 —— 其它平台不受影响。
- **打包安装包**：目前是 `go build` 出单个可执行文件；要 dmg/msi/AppImage 得补
  Wails 的 `Taskfile.yml` + 图标资源（`wails3 build`）。
- **原生能力**：菜单、托盘、文件对话框、深色模式跟随 —— 都在 Wails 的 `application`
  包里，需要时在 `main.go` 注册成 bridge 方法即可。
- **鉴权**：bridge 目前只校验消息来源（`OriginAllowed`）。要按用户身份收窄，
  落点是 `Registry` 的注册处 —— 给方法加一层「谁能调」的判定即可。
