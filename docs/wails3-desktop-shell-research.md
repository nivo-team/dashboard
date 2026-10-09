# Wails v3 超薄桌面壳（常驻远程 URL）调研（2026-10）

**采集时间**：2026-10-09（本机 CST）。本文件的每一条结论都来自 **一手来源**：`v3.wails.io` 官方文档（含其
Markdown 源 `wailsapp/wails` 仓库 `docs/mpress/content/**`）、`github.com/wailsapp/wails` 的
**`v3.0.0-beta.28` tag 源码**（本机 Go module cache 里就是该 tag 的完整源码）、`proxy.golang.org` /
`registry.npmjs.org` 的原始 JSON，以及**本机用 4 个真实可跑的探针程序跑出来的运行时行为**。
凡没验证过的一律进 §九，不猜。

**一句话结论**：Wails v3（当前 `v3.0.0-beta.28`，**仍是 beta，未 GA**）可以用**手写 `main.go` + `go run`
直接跑**一个「永远加载远程 http/https」的壳，**不打包任何前端产物也不需要 `wails3` CLI / Taskfile**；
但 `WebviewWindowOptions.JS` 在**三个平台都是页面加载之后**才执行（Windows 的 URL 导航分支**根本不执行**），
且 Wails **不自动把完整 JS runtime 注入远程页面**（只注入最小内核），默认 HTTP 通道
`fetch(location.origin + "/wails/runtime")` 在远程页面上**必然打到远程站点**（实测拿到的是远程服务器的
HTML，不是 Wails 的 RPC 响应）。因此**远程页面既拿不到 Wails 的绑定/事件 API，也不可能「加载前注入变量」**；
本仓库的壳据此**放弃** Wails 默认 runtime 通道、**放弃**反代与自定义 transport，改走官方
[Raw Messages](https://v3.wails.io/guides/raw-messages/) 的 `RawMessageHandler`（页面上非 `wails:` 前缀
的消息全部落到它），桌面标记则**只能**走 URL 参数 + 站点首屏内联脚本。

**本机实测环境**（`wails3 doctor` 全绿，`SUCCESS Your system is ready`）：

| 项 | 实测值 |
| --- | --- |
| Go | `go1.27.0-X:nodwarf5 linux/amd64`（`GOEXPERIMENT=nodwarf5`，`CGO_ENABLED=1`） |
| `wails3` CLI | `/home/rivo/go/bin/wails3` → **`v3.0.0-beta.23`**（比最新 tag 落后 5 个版本） |
| gcc | `16.2.1+r23+gd564253eb6c8-1` |
| GTK / WebKitGTK | gtk4 `4.22.4`、webkitgtk-6.0 `2.52.6`（默认栈）；gtk3 `3.24.52`、webkit2gtk-4.1 `2.52.6`（legacy，`-tags gtk3`） |
| 桌面环境 | Wayland（Hyprland/Omarchy 4.0.4），`DISPLAY=:0`、`WAYLAND_DISPLAY=wayland-1` |
| 其它 | npm `11.19.0`、pkg-config `3.0.7`、Docker `29.7.2` |

> 沙箱注意：本会话里 `$GOMODCACHE` 与 `~/.cache/go-build` 只读，所以 `go list -m -versions` 会报
> `open .../sum.golang.org/latest: read-only file system`。绕法是 `GOSUMDB=off` + 把
> `GOCACHE`/`GOTMPDIR` 指到可写目录；版本列表改用 `proxy.golang.org` 拿。这不是 Wails 的问题。

---

## 〇、结论速览（TL;DR）

1. **最新版是 `v3.0.0-beta.28`**（2026-10-05），模块路径 `github.com/wailsapp/wails/v3`，`go.mod` 要求
   **`go 1.25.0`**；v3 **仍是 Beta，未 GA**（官方 Roadmap 页首行就是 "Current Status: Beta"）。
2. **加载远程 URL 就是 `WebviewWindowOptions.URL`**：`application.New(application.Options{Name: ...})` +
   `app.Window.NewWithOptions(application.WebviewWindowOptions{URL: "https://example.com"})`。
   `Assets` 属于 `application.Options`（**不是**窗口字段）；纯远程壳把它**留成零值**即可（实测
   `AssetServer Info: middleware=true handler=false`，程序正常跑）。官方示例 `v3/examples/events-bug/main.go`
   与 `v3/examples/keybindings/main.go` 就是直接加载 `https://wails.io` / `https://google.com`。
3. **没有任何「文档开始执行前注入脚本」的公开 API**。`options.JS` 在 Linux 是
   `WindowLoadFinished` 回调、macOS 是 `WebViewDidFinishNavigation` 回调、**Windows 只在 `HTML != ""`
   分支经 `chromium.Init()`（真正的 document-start）执行，URL 导航分支不执行**（源码见 §三）。
   实测 Linux 上 `options.JS` 执行时 `typeof window._wails === "object"` 且 `document.readyState === "interactive"`
   —— 页面自己的脚本早就跑完了。
4. Wails 在页面加载完成后**只注入最小内核**到任意页面（含远程页）：`window._wails`、`window._wails.invoke`、
   `window._wails.environment`、空的 `window.wails`。**实测远程页面上 `Object.keys(window.wails)` 是空数组**，
   `window.wails.Call` / `window.wails.Events` 都是 `undefined`。完整 runtime 要么 npm 引
   `@wailsio/runtime`，要么引 `/wails/runtime.js`（后者由 asset server 在**本地源**提供，远程页面取不到）。
5. **默认 HTTP 通道在远程页面上必然不通**：`runtime.ts` 里 `runtimeURL()` 是
   `window.location.origin + "/wails/runtime"`。实测从远程页面 POST 过去，**HTTP 200 但响应体是远程站点自己的
   HTML**（不是 Wails 的 JSON）。另外实测 `fetch('wails://localhost/wails/runtime.js')` 抛
   `TypeError: Load failed` —— 自定义 scheme 不能被 http(s) 页面跨源 fetch。
6. **`WebviewWindow.ExecJS()` 会被 `wails:runtime:ready` 门控**（`runtimeLoaded` 标志，见 §四.3）。页面不主动
   发这条消息，壳侧所有 `ExecJS`（含 Go→JS 事件）会**永久排队、一条都到不了**。实测：不发 → 无任何反应；
   手发 `window.webkit.messageHandlers.external.postMessage("wails:runtime:ready")` → `WindowRuntimeReady`
   触发、ExecJS 立刻生效。
7. **桥只能走 `RawMessageHandler`**：页面上**不以 `wails:` 开头**的消息全部落到它（源码
   `application.go:860-868`；官方文档明说「Messages prefixed with `wails:` are reserved for internal Wails
   communication and will not be passed to your handler」）。实测在远程 http 页面上能正常收到，
   与页面来源无关，不需要端口 / CORS / 代理。
8. **`OriginInfo` 三平台填的字段不同**（结构体本身是 `Origin` / `TopOrigin` / `IsMainFrame` 三个字段）：
   macOS 给 **`Origin` + `IsMainFrame`**，Windows 给 **`Origin` + `TopOrigin`**，Linux **只有 `Origin`**。
   官方文档与源码一致（§五.2）。
9. `wails3 build` 在裸目录直接失败：`ERROR task: No Taskfile found at "<dir>"`；但 **`go run .` / `go build`
   完全可用**（实测最小 app 冷编译 27.7 s，产物 18.5 MB，GTK4 栈）。三平台的系统依赖见 §六。
10. 本壳的 bridge 协议、线程模型与三条纪律见 §五；**有一处对 `apps/desktop/README.md` 的更正**
    （`RawMessageHandler` 回调**不在**主线程，源码里是 `go a.handleWindowMessage(event)`）。

---

## 一、版本与安装

### 1.1 当前版本

```bash
# 本机 CLI
$ wails3 version
v3.0.0-beta.23

# 模块最新版（proxy.golang.org，因为本地 sumdb 只读，见文首说明）
$ curl -s https://proxy.golang.org/github.com/wailsapp/wails/v3/@latest
{"Version":"v3.0.0-beta.28","Time":"2026-10-05T15:15:35Z",
 "Origin":{"VCS":"git","URL":"https://github.com/wailsapp/wails",
           "Hash":"4adbee9c93ec873be55d13cbda8eb23504e24759",
           "Ref":"refs/tags/v3.0.0-beta.28"}}

# npm 侧的 JS 运行时同版本同一天
$ curl -s https://registry.npmjs.org/@wailsio/runtime | jq '."dist-tags"'
{ "latest": "3.0.0-beta.28" }   # 发布时间 2026-10-05T15:18:21Z，MIT，共 92 个版本
```

| 项 | 实测值 | 来源 |
| --- | --- | --- |
| 最新 tag | **`v3.0.0-beta.28`**（2026-10-05） | [`proxy.golang.org/.../@latest`](https://proxy.golang.org/github.com/wailsapp/wails/v3/@latest) |
| 模块路径 | `github.com/wailsapp/wails/v3` | [`v3/go.mod`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/go.mod) |
| **Go 最低版本** | **`go 1.25.0`**（`go.mod` 首行） | 同上；文档 "Wails requires Go 1.25 or later" — [installation](https://v3.wails.io/quick-start/installation/) |
| 是否 GA | **否，仍是 Beta** | [status（Roadmap）](https://v3.wails.io/status/)：「Current Status: Beta … Our goal is to reach a stable v3.0 release」；repo README 标题即 "Wails v3 Beta" |
| Beta 兼容承诺 | Windows amd64/arm64、macOS Intel/AS、Linux amd64/arm64（GTK4 + WebKitGTK 6.0 默认；GTK3 + WebKit2GTK 4.1 为 `-tags gtk3`，**v3.1 移除**） | [status](https://v3.wails.io/status/) |

### 1.2 安装与升级

```bash
# 安装（官方唯一推荐方式）
go install github.com/wailsapp/wails/v3/cmd/wails3@latest

# 钉住与本仓库壳一致的版本时（推荐，避免 CLI 与 go.mod 漂移）
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.28

# 自升级（CLI 自带）
wails3 update cli
```

- `go install .../cmd/wails3@latest` 出自官方 [installation 文档](https://v3.wails.io/quick-start/installation/)。
- `wails3 update cli` 是本机 `wails3 update --help` 实测存在的子命令（`Updates the Wails CLI`），
  文档 CLI 参考里也列了它（[reference/cli](https://v3.wails.io/reference/cli/)）。
- **本机 CLI 是 beta.23，比 shell 依赖的 beta.28 旧**。只要不用 `wails3 build`/`dev`（见 §六），
  旧 CLI 不影响 `go run`；但要用 CLI 就该先 `wails3 update cli`。

---

## 二、加载远程 URL 的窗口

### 2.1 确切 API

```go
app := application.New(application.Options{Name: "My Shell"}) // Assets 留零值

app.Window.NewWithOptions(application.WebviewWindowOptions{
    Name:  "main",
    Title: "My Shell",
    URL:   "https://admin.example.com/?__desktop=1", // ← 绝对 http/https URL
    Width: 1280, Height: 800,
})
```

`WebviewWindowOptions` 与内容相关的字段就四个（[源码 `webview_window_options.go:96-160`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_options.go#L96-L160)）：

| 字段 | 说明 |
| --- | --- |
| `URL string` | 要加载的 URL；**填绝对 `https://…` 就是外部站点** |
| `HTML string` | 直接喂一段 HTML（与 URL 二选一） |
| `JS string` | 页面加载**之后**注入的 JS（见 §三，**远程 URL 场景别指望它**） |
| `CSS string` | 同上，追加一段 `<style>` |

文档对 `URL` 的定性就一句：**"Load external URL instead of embedded assets."**（[Window Options § Content Options](https://v3.wails.io/features/windows/options/)）。

### 2.2 它是怎么被解析的（决定「绝对 URL 一定生效」）

```go
// internal/assetserver/assetserver.go:149
func GetStartURL(userURL string) (string, error) {
    devServerURL := GetDevServerURL()
    startURL := baseURL.String()            // Linux/macOS: wails://localhost；Windows: http://wails.localhost
    if devServerURL != "" { /* 把 devserver 的端口贴到 baseURL 上 */ }
    if userURL != "" {
        parsedURL, err := baseURL.Parse(userURL)   // ← 绝对 URL 会直接顶掉 base
        ...
        startURL = parsedURL.String()
    }
    return startURL, nil
}
```

`url.URL.Parse` 对**绝对** URL 返回该绝对 URL，所以 `URL: "https://example.com"` 就是原样加载；
只有相对路径（`"/"`、`"/settings"`）才落到本地 asset server。三平台 base：
[`assetserver_linux.go`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/internal/assetserver/assetserver_linux.go) / [`_darwin.go`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/internal/assetserver/assetserver_darwin.go) = `wails://localhost`，
[`_windows.go`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/internal/assetserver/assetserver_windows.go) = `http://wails.localhost`。

**没有任何 URL 白名单 / 校验**拦着你：`ValidateAndSanitizeURL()` 只被 `messageprocessor_browser.go`（`Browser.OpenURL` 那条路）用到，
窗口 URL 不经过它。

### 2.3 外部站点的请求不会被 Wails 截走

- **Windows**：`processRequest` 里对非 `wails.localhost` 的 host 直接 `return`，交给 WebView2 默认处理器
  （[`webview_window_windows.go:2414-2424`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_windows.go#L2414-L2424)）。
- **Linux**：只注册了 `wails://` 自定义 scheme（`linux_cgo_gtk3.go` 里 `webkit_web_context_register_uri_scheme` 一族），https 走网络。

所以远程站点的子资源、XHR、CORS 行为**与普通浏览器一致**，Wails 不介入。

### 2.4 「完全不用本地构建产物」时 `Assets` 怎么配

`WebviewWindowOptions` **没有** `Assets` 字段（文档明说："Asset configuration is **not** a `WebviewWindowOptions` field"）；
它在 `application.Options.Assets`（类型 `AssetOptions{Handler http.Handler; Middleware Middleware; DisableLogging bool}`，
[源码](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/application_options.go#L188-L207)）。

**纯远程壳：留零值即可**（`Handler == nil`）。实测日志：`AssetServer Info: middleware=true handler=false`，
程序正常启动、窗口正常加载远程页。此时若有人访问本地源（`wails://localhost/`），
拿到的是占位页（production 下 `index.html not found`）。

### 2.5 官方有没有「生产也走远程站点」的文档/示例？

- **有示例，没有专门文档**。示例见 §二.1 提到的 `v3/examples/events-bug/main.go`、`v3/examples/keybindings/main.go`；
  文档 [`whats-new.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/whats-new.md) 里也有 `window2.SetURL("https://wails.io")`。
- **没有**任何页面讨论「生产环境也把窗口指向远程站点、不打包 assets」这个组合；官方叙事里 `URL:` 的用途是
  **开发期指向 Vite dev server**（"Development (load from dev server)"）。→ 本仓库的用法属于**官方支持但未专门成文**的区域。

---

## 三、页面加载前注入 JS：官方没有这条路

**结论：Wails v3 没有公开的 init script / user script / document-start 注入 API。能用的只有「URL 参数 + 站点首屏内联脚本」。**

### 3.1 `options.JS` 三平台都在页面之后（Windows 甚至不执行）

| 平台 | 触发点 | 时机 | 源码 |
| --- | --- | --- | --- |
| Linux | `w.parent.OnWindowEvent(events.Linux.WindowLoadFinished, …)` → `w.execJS(options.JS)` | **页面加载完成后** | [`webview_window_linux.go:431-442`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_linux.go#L431-L442) |
| macOS | `OnWindowEvent(events.Mac.WebViewDidFinishNavigation, …)` → `w.execJS(options.JS)` | **导航完成后** | [`webview_window_darwin.go:1759-1770`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_darwin.go#L1759-L1770) |
| Windows | **仅在 `navigateInitialPage()` 的 `case w.parent.options.HTML != ""` 分支**里 `chromium.Init(script)` | 该分支是 document-start；**`default:`（URL 导航）分支完全不碰 `options.JS`** | [`webview_window_windows.go:2724-2755`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_windows.go#L2724-L2755) |

> Windows 的 `chromium.Init(script)` 内部是真 document-start：
> `e.webview.AddScriptToExecuteOnDocumentCreated(script, nil)`
> （[`internal/webview2/pkg/edge/chromium.go:409-415`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/internal/webview2/pkg/edge/chromium.go#L409-L415)）。
> 但它只服务于 `HTML:` 窗口，以及框架自己的 `window.external={invoke:…}`（同文件 L267）。

**实测（本机 Linux/GTK4，探针 1）**：窗口 `URL: "http://127.0.0.1:18432/"` + `JS: 'window.__jsOptionRan = (typeof window._wails)+"|"+document.readyState'`，
页面把探针 POST 回来，得到：

```json
{"late_js_option":"object|interactive","late_wails":"object","late_wails_invoke":"function"}
```

即 `options.JS` 执行时 `window._wails` 已是对象、`readyState` 已是 `interactive` —— **页面脚本早已跑完**。

### 3.2 三平台内部**确实**有 document-start 注入，但没对外开放

| 平台 | 内部机制 | 用途 | 源码 |
| --- | --- | --- | --- |
| Linux | `webkit_user_script_new(js, WEBKIT_USER_CONTENT_INJECT_ALL_FRAMES, **WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START**, nil, nil)` + `webkit_user_content_manager_add_script` | 只给 blob/formdata body 的 fetch shim 用 | [`linux_cgo_gtk3.go:1505-1516`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/linux_cgo_gtk3.go#L1505-L1516)、[`linux_cgo.go:1233-1241`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/linux_cgo.go#L1233-L1241) |
| Windows | `AddScriptToExecuteOnDocumentCreated` | `window.external`、`HTML:` 分支的 `options.JS`/`CSS` | 同 §3.1 |
| macOS | `WKUserContentController` **只** `addScriptMessageHandler:name:@"external"`，**没有** `WKUserScript` | — | [`webview_window_darwin.go:190-194`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_darwin.go#L190-L194) |

**但有个好消息**：那三个 script message handler 是**在 webview 层面注册的**（不是注入到页面里的脚本），
所以**页面第一行脚本运行时就已经能用了**。实测远程页面 document-start 探针：

```json
{"stage":"document-start","early_wails":"undefined","early_wails_invoke":"undefined",
 "early_webkit_external":"object","early_chrome_webview":"undefined"}
```

→ Linux 上 `window.webkit.messageHandlers.external` 在 document-start 就存在（Windows 对应
`window.chrome.webview`，且 `window.external.invoke` 由 `chromium.Init` 在 document-start 注入）。
**这就是「页面不用等壳注入原语就能发消息」的原因**，也是本壳 bridge 能成立的基础。

### 3.3 那么「加载前注入变量」怎么办：只能走 URL

Wails 侧没有通道，就只剩**页面自己的首屏内联脚本**这一条。做法：

```go
// 壳侧：导航前把标记写进 URL
u, _ := url.Parse(cfg.URL)
q := u.Query()
q.Set("__desktop", "1")
q.Set("__desktop_channel", cfg.Channel)
u.RawQuery = q.Encode()
app.Window.NewWithOptions(application.WebviewWindowOptions{URL: u.String()})
```

```html
<!-- 站点侧 index.html 的 <head> 第一段内联脚本（必须同步、且在打包产物之前） -->
<script>
  (function () {
    var p = new URLSearchParams(location.search)
    if (p.get('__desktop') === '1') {
      window.__DESKTOP__ = { channel: p.get('__desktop_channel') || 'stable' }
    }
  })()
</script>
```

替代方案（按代价排序，供以后需要真正 document-start 时选）：

1. **（推荐）站点自己注入** —— 你控制远程站点，`index.html` 首屏内联脚本是最干净的 document-start。
2. **反代 + 改写 HTML**：让 `Assets.Handler` 反代远程站点并往 `<head>` 插 `<script>`。代价见 §八.3
   （POST body 会被丢；而且本地源变了，cookie/OAuth/绝对地址语义全变）。
3. **`options.JS`（加载后）**：只适合「晚了也无所谓」的微调（改标题、注入样式、统计）。
4. **改 Wails 源码 / fork**：Linux 复用 `webkit_user_script_new`（加个 `Scripts []string` 选项即可），
   Windows 复用 `Chromium.Init`，macOS 要新加 `WKUserScript`。三平台工作量不对称。
5. `HTML:` + `options.JS` 在 **Windows 上**确实是 document-start，但那样就没有远程 URL 了，不适用。

---

## 四、Wails 自己的运行时怎么进到远程页面里

### 4.1 自动注入的只是「最小内核」，不是完整 runtime

三平台在**导航完成**后都会 `execJS(runtime.Core(flags))`
（Linux [`webview_window_linux.go:444`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_linux.go#L444)、
macOS `webview_window_darwin.go:1459`、Windows [`webview_window_windows.go:2801`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_windows.go#L2801)）。
`Core()` 的全部内容（[`internal/runtime/runtime.go`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/internal/runtime/runtime.go)）：

```go
var runtimeInit = `window._wails=window._wails||{};window._wails.flags=window._wails.flags||{};window.wails=window.wails||{};`
// + platform invoke:
//   linux/darwin: window._wails.invoke=function(msg){window.webkit.messageHandlers.external.postMessage(msg);};
//   windows:      window._wails.invoke=window.chrome.webview.postMessage;
// + window._wails.environment={"OS":"linux","Arch":"amd64","Debug":true}
// + Promise.resolve().then(()=>window.dispatchEvent(new Event("wails:runtime-config-ready")))
```

**实测（远程 http 页面，加载后）**：

```json
{"late_wails":"object","late_wails_invoke":"function","late_window_wails":"object",
 "late_wails_env":"{\"OS\":\"linux\",\"Arch\":\"amd64\",\"Debug\":true}",
 "window_wails_keys":[], "window_wails_Call":"undefined", "window_wails_Events":"undefined"}
```

→ `window.wails` 只是个**空壳占位**（`window.wails=window.wails||{}`），`Call`/`Events` 都不存在。
完整 runtime 的两种官方引入方式（[Frontend Runtime](https://v3.wails.io/reference/frontend-runtime/)）：

- **npm 包** `@wailsio/runtime`（推荐）：`npm install --save @wailsio/runtime`；
- **预构建 bundle** `wails3 generate runtime` 产出 `runtime.js`，或直接用 asset server 提供的
  `/wails/runtime.js`。官方原话："No need to import any Wails JS SDK at build time — `/wails/runtime.js`
  is served by the asset server at runtime."（[asset server](https://v3.wails.io/contributing/asset-server/)）。

**关键：`/wails/runtime.js` 由 asset server 在「本地源」提供。远程页面的 `location.origin` 是远程站点，
所以这个路径取不到 Wails 的 runtime。**

### 4.2 默认 HTTP 通道在远程页面上必然打不通（实测）

[`internal/runtime/desktop/@wailsio/runtime/src/runtime.ts`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/internal/runtime/desktop/@wailsio/runtime/src/runtime.ts)：

```ts
function runtimeURL(): string {
    return window.location.origin + "/wails/runtime";   // ← 远程页面上就是远程站点
}
// 默认 transport：fetch(url, {method:'POST', headers:{'x-wails-client-id':…,'Content-Type':'application/json'}, body})
```

实测（远程页面内 `fetch(location.origin + '/wails/runtime', {method:'POST', …})`）：

```json
{"status":200,"body":"<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\"><title>Remote Probe</title>…"}
```

**200，但响应体是远程站点自己的 HTML**（SPA fallback）——RPC 永远拿不到 Go 的响应。
再试自定义 scheme：

```json
{"fetch_wails_scheme_runtime_js":{"error":"TypeError: Load failed"}}
```

→ **远程页面不能跨源 fetch `wails://`。**

**页面→Go 的其余通道**：全部收在 `WebviewWindow.HandleMessage()`，只认这几条**控制消息**
（[源码](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window.go#L807-L870)）：
`wails:drag`、`wails:drag:doubleclick`、`wails:resize:<border>`、`wails:non-client-region:<json>`、
`wails:runtime:ready`、`wails:event:emit:<name>`（**且**该窗口开了 `AllowSimpleEventEmit`，否则报错丢弃）。
**没有 RPC 分支** → 远程页面上 **`Call.*` 绑定、带 payload 的事件、Dialogs/Clipboard/Screens 一律不可用**。

### 4.3 `ExecJS` 被 `wails:runtime:ready` 门控（最容易踩的一条）

```go
// webview_window.go:663
func (w *WebviewWindow) ExecJS(js string) {
    w.pendingJSMutex.Lock()
    if w.runtimeLoaded { /* 立刻注入 */ } else { w.pendingJS = append(w.pendingJS, js) } // ← 只是排队
}
// runtimeLoaded 只在收到 "wails:runtime:ready" 时置 true（webview_window.go:843-850）
```

而**发这条消息的是完整 runtime**：`index.ts` 末尾 `System.invoke("wails:runtime:ready")`
（[`src/index.ts:102`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/internal/runtime/desktop/@wailsio/runtime/src/index.ts#L102)）。

**实测对照**：

- 探针 1（页面不发这条）：壳侧 `remote.ExecJS(...)` 打印了执行日志，但页面**从未收到**（`RawMessageHandler` 无输出）。
- 探针 2（页面首屏手发 `postMessage("wails:runtime:ready")`）：立刻触发 `events.Common.WindowRuntimeReady`，
  随后的 `ExecJS` **成功到达**（`[RAW-MESSAGE] probe:execjs-ran|wails=object|jsOpt=object|interactive`）。

> ✅ 本仓库 `apps/web/src/lib/desktop-bridge.ts` 已经手发这条（`RUNTIME_READY`，并注释了「少这一条全都卡住」），
> 与实测一致。**任何以后替换页面侧实现的人都不能删这一行。**

### 4.4 Go→JS 事件能进远程页面，但依赖页面提供 `dispatchWailsEvent`

Go 侧投递事件注入的 JS 是（[`webview_window.go:1430-1432`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window.go#L1430-L1432)）：

```js
if (window._wails && window._wails.dispatchWailsEvent) { …window._wails.dispatchWailsEvent(<payload>); }
```

**它不是内核的一部分**，而是 `@wailsio/runtime` 的 `events.ts` 装上去的
（`window._wails.dispatchWailsEvent = dispatchWailsEvent`，[`src/events.ts:19-22`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/internal/runtime/desktop/@wailsio/runtime/src/events.ts#L19-L22)）。
实测：页面**没有**提供它时，Go 的 `EmitEvent` 静默丢弃；页面手写一个同名函数后，
**内置窗口事件（`linux:WindowFocusIn`…）与自定义事件（`probe-event` 带 payload）都正常到达**，
且**不受 `runtimeLoaded` 门控**（事件在 `runtime:ready` 之前就已经在送达）。

→ 本壳选择**不用 Wails 事件通道**（避免再引 runtime、也避免两个接收入口），全部走 `ExecJS → window.__bridgeRecv(...)`。

### 4.5 npm 包 `@wailsio/runtime` 的形态与「在浏览器里 import 会不会炸」

| 项 | 值 | 来源 |
| --- | --- | --- |
| 包名 / 最新版 | `@wailsio/runtime` / `3.0.0-beta.28`（2026-10-05，MIT） | `registry.npmjs.org` |
| 模块形态 | `"type": "module"`，exports 只有 `types`/`default` → **ESM-only** | 包内 `package.json`（[目录](https://github.com/wailsapp/wails/tree/v3.0.0-beta.28/v3/internal/runtime/desktop/@wailsio/runtime)） |
| 浏览器里 import | **不会抛异常**：`environment.ts` 用 `hasDOM` 守卫；`system.ts` 在拿不到原生桥时 `console.warn('⚠️ Browser Environment Detected…')` 并让 `invoke` 变成 no-op；`runtimeURL()` 是**惰性**的（SSR 安全，`#4679`） | `src/system.ts`、`src/runtime.ts` |
| tree-shaking | 官方称「you will only include the parts of the runtime that you use」；`sideEffects` 只列了 4 个有副作用的模块 | `reference/frontend-runtime`、包内 `package.json` |
| 打包体积 | **未验证**（本会话没做打包实测）。需要时验证：在站点里 `import { System } from '@wailsio/runtime'` 后跑一次生产构建看 gzip 增量 | — |

⚠️ 已知坑：**同一个页面导入两份 runtime 会静默废掉事件监听**（issue
[#6136](https://github.com/wailsapp/wails/issues/6136)：「MCP `call_bound_method` loads a second runtime copy
and silently stops all frontend event listeners」）。本壳刻意**不引** `@wailsio/runtime`，也就顺便避开这个坑。

---

## 五、本壳的 bridge 架构：为什么是 `RawMessageHandler`

> 这一节是**已定架构**的调研依据，实现见 [`apps/desktop/README.md`](../apps/desktop/README.md)。

### 5.1 选型：放弃 Wails 默认 runtime 通道（结论）

| 方案 | 为什么不用 |
| --- | --- |
| Wails 默认 HTTP runtime 通道（`Call.ByName` / `Events.On`） | 页面 `fetch(window.location.origin + "/wails/runtime")`。远程页面下 origin 是远程站点，请求打到站点自己（实测 200 + 站点 HTML），跨域且无 CORS 头 → **不通**。 |
| 反代远程站点保持同源 | 需要自己写反向代理 + HTML 改写；**且会把来源变成本地源**（cookie / OAuth / 绝对地址语义全变）；实测在 Linux 上还会**丢 POST body**（§七.7）。 |
| 自定义 transport（[官方 guide](https://v3.wails.io/guides/custom-transport/)） | `Transport.Start/Stop/JSClient` 要自己起连接（WebSocket 等）、自己做重连与安全；对「薄壳 + 一条通用消息通道」是过度设计。 |
| **`application.Options.RawMessageHandler`（采用）** | 页面上**非 `wails:` 前缀**的消息全部落到它，**与页面来源无关**，不需要端口 / CORS / 代理。官方文档：[guides/raw-messages](https://v3.wails.io/guides/raw-messages/)。 |

**官方出处（逐条）**：

- 文档：[`guides/raw-messages.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/guides/raw-messages.md)（站上 <https://v3.wails.io/guides/raw-messages/>）
  - 签名：`RawMessageHandler func(window Window, message string, originInfo *application.OriginInfo)`
  - **「Messages prefixed with `wails:` are reserved for internal Wails communication and will not be passed to your handler.」**
  - 前端发送：`import { System } from '@wailsio/runtime'; System.invoke(message)`
  - ⚠️ caution：「Always verify the origin of incoming messages before processing them.」
- API 参考：[`reference/application.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/reference/application.md)（<https://v3.wails.io/reference/application/>）：
  「`RawMessageHandler` is a field on `application.Options`, not a method. The runtime invokes it for every
  raw message sent from the frontend via `System.invoke()`」。
- 官方示例：`v3/examples/raw-message/`。
- 源码分流点（**决定性**）：

```go
// pkg/application/application.go:860-868
if strings.HasPrefix(event.message, "wails:") {
    window.HandleMessage(event.message)          // 内部保留通道
} else {
    if a.options.RawMessageHandler != nil {
        a.options.RawMessageHandler(window, event.message, event.originInfo)
    }
}
```

### 5.2 `OriginInfo` 的三平台字段差异（**必须按平台分支校验**）

结构体本身三平台同一个（[`application.go:268-272`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/application.go#L268-L272)）：

```go
type OriginInfo struct {
    Origin      string
    TopOrigin   string
    IsMainFrame bool
}
```

**但每个平台只填其中一部分**（源码与[官方文档](https://v3.wails.io/guides/raw-messages/)完全一致）：

| 平台 | 填入的字段 | 源码 |
| --- | --- | --- |
| **macOS** | `Origin` + **`IsMainFrame`**（`TopOrigin` 恒空） | [`application_darwin.go:416-431`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/application_darwin.go#L416-L431)（`processMessage(windowID, message, origin, isMainFrame)`） |
| **Windows** | `Origin` + **`TopOrigin`**（`IsMainFrame` 恒 false） | [`webview_window_windows.go:2355-2377`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/webview_window_windows.go#L2355-L2377)（`Origin: senderSource, TopOrigin: topSource`，两个来源分别是 `args.GetSource()` 与 `sender.GetSource()`） |
| **Linux** | **只有 `Origin`**（`TopOrigin` / `IsMainFrame` 都不填） | [`linux_cgo.go:1856-1861`](https://github.com/wailsapp/wails/blob/v3.0.0-beta.28/v3/pkg/application/linux_cgo.go#L1856-L1861)（GTK4）、`linux_cgo_gtk3.go:2247-2252`（GTK3）；Origin 取 `webkit_web_view_get_uri()` 的**完整 URL**，不是 RFC 意义上的 origin |

官方文档原文（[raw-messages § Platform-Specific Availability](https://v3.wails.io/guides/raw-messages/)）：

> - **macOS**: `Origin` and `IsMainFrame` are provided
> - **Windows**: `Origin` and `TopOrigin` are provided
> - **Linux**: Only `Origin` is provided

**校验建议**（本壳 `shell.Config.OriginAllowed` 就是这么做的）：**以 `Origin` 为唯一必需判据**，
`TopOrigin` / `IsMainFrame` 只作为「有值时才额外收紧」的可选条件 —— 否则 Linux 上永远过不了。
注意 Linux 的 `Origin` 是**完整 URL**（含 path），比对时应按 URL 解析后比 scheme+host(+port)，别用字符串相等。

### 5.3 线程模型（含对 `apps/desktop/README.md` 的一处更正）

`apps/desktop/README.md` 写「`RawMessageHandler` 里必须 go 出去再干活 —— 回调在主线程」。
**前半句（go 出去）是对的，后半句的理由不准确**：源码里消息泵已经是 `go` 出去的：

```go
// pkg/application/application.go:714-719
go func() {
    for {
        event := <-windowMessageBuffer
        go a.handleWindowMessage(event)     // ← 每条消息一个独立协程
    }
}()
```

所以 `RawMessageHandler` **不在主线程**，在它里面直接调 `window.ExecJS(...)` 是安全的（`ExecJS` 内部
`InvokeSync` 会阻塞**这个协程**等主线程，不是阻塞主线程）。「go 出去」真正的价值是：不要在这个协程里做
长耗时同步活（`windowMessageBuffer` 容量 64，堆满会顶住 webview 侧的投递）；以及出站统一过一条
单协程 outbox 才能保证事件顺序。

### 5.4 三条纪律（与实现一致）

1. **handler 里只入队、不干重活**（长任务 `go` 出去）。
2. **出站统一走单协程 outbox**（顺序 + 不在主线程注入 JS）。
3. **必须校验来源**（官方 caution；Linux 只能靠 `Origin`，见 §5.2）。

### 5.5 代价与边界（写给以后想扩能力的人）

- 这套 bridge **不是 Wails 的绑定系统**：没有类型生成、没有 `Call.ByName`、没有 Dialogs/Clipboard/Screens
  的 JS API。要加能力就是「Go 侧注册一个方法 + 页面侧 `call(name, payload)`」。
- **消息是字符串过 webview 原生通道**，大 payload 没有优化。传文件走 Go 侧读路径，只把结果/句柄给页面。
- **Go→JS 事件（`app.Event.Emit`）在本架构下不可用**（页面没装 `dispatchWailsEvent`）。
  要保留它就得让页面引 `@wailsio/runtime` 或自己挂 `window._wails.dispatchWailsEvent`（§4.4）。
- **页面刷新会重置一切**：`runtimeLoaded`、页面侧 `__bridge` 都会重来一遍；页面侧必须在首屏重发
  `wails:runtime:ready` + 握手（`Reload()` 后的竞态见 issue [#4872](https://github.com/wailsapp/wails/issues/4872)）。

---

## 六、构建与运行

### 6.1 手写最小 `main.go` + `go run`：**可行，已实测**

只需两个文件（下面这份**原样跑过**：窗口成功加载 `https://example.com`）：

```go
// main.go
package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func main() {
	app := application.New(application.Options{Name: "BareShell"}) // Assets 留零值
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "BareShell",
		URL:   "https://example.com",
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
```

```
// go.mod
module bare

go 1.25.0

require github.com/wailsapp/wails/v3 v3.0.0-beta.28
```

```bash
go mod tidy     # 或让 go build 自己补 go.sum
go run .        # ✅ 实测可用
go build -o shell .   # ✅ 冷编译 27.7 s，产物 18,463,872 B
```

启动日志（关键两行）：

```
INF Platform Info: ID=omarchy Name=Omarchy Version=4.0.4 GTK=4.22.4 WebKitGTK=2.52.6
INF AssetServer Info: middleware=true handler=false
```

→ **不需要 `wails3` CLI、不需要 Taskfile、不需要 `frontend/`、不需要 `go:embed` 任何产物。**

### 6.2 `wails3 build` 在没有 frontend 产物时

实测（裸目录，只有 `go.mod`/`go.sum`/`main.go`）：

```
$ wails3 build
Wails v3.0.0-beta.23 › Build
  ERROR   task: No Taskfile found at "/…/bare"
```

`wails3 build` 就是 `wails3 task build` 的包装，**必须有 `Taskfile.yml`**（[Building Applications](https://v3.wails.io/guides/build/building/)，
以及 `your-first-app` 里的 "`wails3 build` is shorthand for `wails3 task build`"）。
`wails3 init` 生成的才是完整骨架（`frontend/`、`build/Taskfile.yml`、根 `Taskfile.yml`）。
→ **本壳不用 CLI 构建，直接 `go build`**（这也是 `pnpm desktop:build` 的做法）。

### 6.3 三平台系统依赖与 cgo

| 平台 | 依赖 | cgo |
| --- | --- | --- |
| **Linux** | **默认 GTK4 + WebKitGTK 6.0**：Ubuntu 24.04+/Debian 13+ 装 `build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev`（Arch：`base-devel gtk4 webkitgtk-6.0`）。pkg-config 包名 `gtk4` / `webkitgtk-6.0` | **必须开**（`CGO_ENABLED=1`，需要 gcc/clang） |
| Linux（legacy） | `-tags gtk3` → `libgtk-3-dev libwebkit2gtk-4.1-dev`，pkg-config 包名 `gtk+-3.0` / `webkit2gtk-4.1`；**v3.1 移除** | 同上 |
| **Windows** | 只需 **WebView2 Runtime**（Win10/11 自带）；交叉编译要 mingw-w64 + Docker | 开 |
| **macOS** | 只需 **Xcode Command Line Tools**（`xcode-select --install`） | 开 |

来源：[installation](https://v3.wails.io/quick-start/installation/)、[Linux Packaging § Legacy GTK3](https://v3.wails.io/guides/build/linux/)。
本机 `wails3 doctor` 两张栈都全（gtk4 4.22.4 + webkitgtk-6.0 2.52.6 与 gtk3 3.24.52 + webkit2gtk-4.1 2.52.6），
默认构建实测走的是 **GTK4**（`Platform Info: GTK=4.22.4 WebKitGTK=2.52.6`）。

**build tag 实测（本机 beta.28）**：

| 命令 | 结果 |
| --- | --- |
| `go build -tags production` | ✅ 通过 |
| `go build -tags gtk3` | ✅ 通过 |
| `go build -tags production,devtools` | ❌ **编译失败**（`*linuxWebviewWindow does not implement webviewWindowImpl (missing method openDevTools)`） |

最后一条是已知 issue [#6151](https://github.com/wailsapp/wails/issues/6151)（Linux 上 `production,devtools` 组合
编译不过，报在 beta.24）——**本机在 beta.28 上复现了同样的错误**。
Linux 上 `webview_window_linux_dev.go` 要 `!production`、`webview_window_linux_production.go` 要
`production && !devtools`，两者互斥导致两个方法都没定义。

### 6.4 生产发布（不带本地前端产物）注意事项

1. **`production` tag 会关掉 dev-server 反代**：`build_production.go` 里 `GetDevServerURL()` 直接返回 `""`，
   `NewAssetFileServer` 退化成纯文件服务器。对「永远远程 URL」的壳没有影响（我们不用反代）。
2. **`production` 同时关掉 devtools**（除非 `devtools` tag，而 Linux 上这个组合目前编译不过，见 §6.3）。
   远程站点要用 devtools，就只能**不加 `production`** 构建 —— 这时 `Debug: true`、`DevToolsEnabled` 默认开，
   代价是多了 dev 分支代码（对壳来说可接受）。
3. **窗口 `DevToolsEnabled` 默认值**：非 production 构建默认可用（源码注释：「default true in builds
   without the `production` build tag」）。
4. 需要 `-ldflags "-s -w"` 之类瘦身、以及 `//go:embed` 图标（`build/appicon.png` → `wails3 generate icons`）
   这些属于可选打磨，不影响「远程 URL 壳」本身。

---

## 七、已知坑清单（按踩到概率排序）

1. **`ExecJS` 静默排队**（最高危）：页面不发 `wails:runtime:ready`，壳侧所有 `ExecJS` / 事件注入永远不到。
   §4.3 有实测对照。→ 本壳在 `desktop-bridge.ts` 里手发；**别删**。
2. **默认 runtime 通道在远程页面上是死的**：`fetch(location.origin + "/wails/runtime")` 打到远程站点；
   实测 200 + 站点 HTML。且 `wails://` 不能被 http(s) 页面 fetch（`TypeError: Load failed`）。
3. **`options.JS` 不是 document-start**，Windows 上 URL 导航**根本不执行**（§3.1）。想要「加载前注入」只能走 URL。
4. **没有导航拦截 / cookie API**：issue [#5799](https://github.com/wailsapp/wails/issues/5799)（open，2026-07-20）
   ——「no public API provides the target URL during navigation」「no public cookie API exists」；
   issue [#3908](https://github.com/wailsapp/wails/issues/3908)（open，label **blocked**）：
   「We would like to support cookies but this will require support for cookies over custom protocols in the
   upstream projects.」→ **远程页面里的 cookie 由平台 webview 自己管**（真实 https 源，这点比 `wails://` 本地源**更好**），
   但 **Wails 不给你读/写 cookie 的 API**；也不能拦住页面跳到别处。
5. **权限（摄像头 / 麦克风 / 通知 / 定位 / 剪贴板）**：`WebviewWindowOptions.Permissions map[PermissionType]Permission`。
   | 能力 | Linux | Windows | macOS |
   | --- | --- | --- | --- |
   | 麦克风 / 摄像头 | ✅ | ✅ | ✅（macOS 12+，还需 `Info.plist` 的 `NS*UsageDescription` + TCC） |
   | 定位 / 通知 / 剪贴板读 | ❌ 未实现（**无论怎么配都拒**） | ✅ | ❌ 未实现 |
   Windows 特例：**一旦你配了 `Permissions` 里任何一项，Wails 就不再设全局 Allow**，没列的会变成弹原生提示。
   来源：[Permissions](https://v3.wails.io/features/windows/permissions/)。
6. **devtools**：`DevToolsEnabled` 默认在非 production 构建里为 true；production 需要 `devtools` tag；
   macOS **程序化**打开 inspector 还要 `private_mac_apis`（否则静默 no-op）。Linux 上 `production,devtools`
   目前**编译不过**（§6.3）。相关：issue [#6151](https://github.com/wailsapp/wails/issues/6151)、
   [#6121](https://github.com/wailsapp/wails/issues/6121)（macOS beta19 后 inspector）。
7. **dev-server 反代的 POST body 会丢**（Linux 实测，若你以后动「反代」这个念头必看）：
   `assetserver_webview.go` 会用 `Content-Length` 头覆盖 `req.ContentLength`，而 webview 发来的请求**没有这个头**，
   于是被设成 `0`；Go 标准库 `httputil.ReverseProxy` 恰好有 `if req.ContentLength == 0 { outreq.Body = nil }`
   （`/usr/lib/go/src/net/http/httputil/reverseproxy.go:435`）→ **body 被丢掉**。
   实测对照：**直连 asset server** 时 POST body 完好（17/23/10/44 字节四种 body 全部到达）；
   **走 dev 反代**时服务器收到 `Content-Length: 0`、body 为空。
   （Wails 自己的 `/wails/runtime` 在中间件链里先于用户 handler 处理，实测**不受影响**：
   反代模式下 POST `/wails/runtime` 仍拿到 `application/json` 的真实 RPC 响应。）
8. **CORS / cookie 的语义取决于源**：远程 URL 下就是**真实远程源**，CORS 与浏览器一致；
   本地 `wails://localhost` / `http://wails.localhost` 是另一个源（官方 streams 文档原话：
   「The webview's origin is `wails://` or `http://wails.localhost` depending on platform, so a local server
   needs `CheckOrigin`, an `Access-Control-Allow-Origin` header, or both」）。
   相关 open issue：[#4628](https://github.com/wailsapp/wails/issues/4628)（video.js CORS）。
9. **两份 runtime**：同时引 npm 包与 `/wails/runtime.js` 会加载第二份 runtime 并静默废掉监听
   （[#6136](https://github.com/wailsapp/wails/issues/6136)）。
10. **热重载 / `wails3 dev` 与本壳无关**：`wails3 dev` 依赖 `Taskfile.yml` 里的 frontend dev 任务 +
    `FRONTEND_DEVSERVER_URL`（[asset server](https://v3.wails.io/contributing/asset-server/)），
    纯远程壳没有这条链路；开发时直接 `go run . -url http://localhost:3000` 更直接。
11. **NVIDIA 专有驱动可能白屏**（WebKitGTK DMA-BUF 的老问题），官方 Linux 文档有记录
    （[Linux Packaging](https://v3.wails.io/guides/build/linux/)）。
12. **`window.EmitEvent` 是多播**：一发所有窗口都收到（issue [#6207](https://github.com/wailsapp/wails/issues/6207)/[#6208](https://github.com/wailsapp/wails/issues/6208)，open）。

---

## 八、附：三条备选路线（本次未采用，记录备查）

### 8.1 纯远程 URL（本壳采用）
浏览器能做的事全都能做（cookie/CORS/绝对地址/Service Worker 语义真实），壳只做窗口 + bridge。
代价：拿不到 Wails 的绑定/事件 JS API（§5.1），大 payload 要自己约束。

### 8.2 反代远程站点保持同源
`Assets.Handler = 自己写的 reverse proxy`（或者 `FRONTEND_DEVSERVER_URL=<远程地址>` 这个**官方 dev 专用**开关，
它会让 asset server 反代非 `/wails/*` 流量，见 [asset server](https://v3.wails.io/contributing/asset-server/)；
实测设置后 `assetserver.GetStartURL` 会把端口贴到 base 上变成 `wails://localhost:<port>`，
页面确实被反代出来，且 `/wails/runtime` 返回真实 JSON —— **这条路在技术上成立**）。
**但**：(a) `FRONTEND_DEVSERVER_URL` 仅在 `!production` 构建里存在，生产等于自写反代；
(b) 来源变成 `wails://localhost`，cookie / OAuth / 绝对地址全变；
(c) 实测 Linux 上**反代的 POST body 会丢**（§七.7）—— 对真实 SPA 是致命的；
(d) 不能靠它做 document-start 注入，除非再改写 HTML。

### 8.3 自定义 transport（[guide](https://v3.wails.io/guides/custom-transport/) + `examples/websocket-transport`）
保留 Wails 全部绑定/事件 API，自己实现 `Transport{Start, Stop, JSClient}` + 页面侧 `setTransport(...)`。
**未验证点**：https 页面连接 `ws://127.0.0.1:<port>` 的混合内容策略（Chromium 视 localhost 为可信源，
WebKit 行为需实测）→ 要真走这条路，先做这个验证。

---

## 九、未验证事项 & 怎么验证

| # | 未验证 | 怎么验证 |
| --- | --- | --- |
| 1 | **Windows / macOS 上的远程 URL 行为**（本次全部实测都在 Linux/GTK4） | 在对应平台跑 §6.1 的最小 `main.go`，页面里放 document-start 探针记录 `typeof window.chrome.webview` / `window.webkit.messageHandlers.external`，并把 `OriginInfo` 原样打印出来对照 §5.2 |
| 2 | **Windows 上 `options.JS` 在 URL 导航分支「不执行」**（源码判定，未在 Windows 实机跑） | Windows 上加 `JS: 'document.title="INJECTED"'`，看标题变不变 |
| 3 | **远程页面的 cookie 持久化**（跨重启是否登录态保留） | 三平台各跑一次：远程站点 set-cookie → 关闭 → 重开，看是否还在。Linux 需顺手确认 WebKitGTK 的 data manager 目录（Wails 源码里**没有任何 cookie / website_data_manager 相关代码**，grep 结果为空） |
| 4 | **`@wailsio/runtime` 的打包体积 / tree-shaking 实测值** | 在站点里 `import { System } from '@wailsio/runtime'`，跑一次 `vp build` 对比 gzip 增量 |
| 5 | **`wails3 dev` 在没有 frontend 任务时的报错形态** | 在裸目录跑 `wails3 dev`（预期也是找不到 Taskfile） |
| 6 | **`wails://` 下 POST body 在 Windows 的表现**（§七.7 是 Linux 实测 + Go 源码推导） | Windows 上跑同一探针：直连 asset server 的 handler 打印 `r.ContentLength` 与 `len(body)` |
| 7 | **`ws://127.0.0.1` 从 https 页面的混合内容策略**（§8.3） | 起一个本地 ws server，页面里 `new WebSocket('ws://127.0.0.1:<port>')` 看是否被拦 |
| 8 | **macOS `production,devtools` 能否编译**（Linux 已确认不能） | macOS 上 `go build -tags production,devtools` |
| 9 | 本机 `wails3` CLI 仍是 beta.23，**beta.28 的 CLI 行为未逐条核对** | `wails3 update cli` 后重跑 `wails3 version` / `wails3 doctor` |

---

## 十、来源清单

**官方文档（站 + 其 Markdown 源）**

| 主题 | 站上 URL | Markdown 源（一手） |
| --- | --- | --- |
| 安装 / Go 版本要求 | <https://v3.wails.io/quick-start/installation/> | [`quick-start/installation.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/quick-start/installation.md) |
| 第一个应用 / 项目结构 | <https://v3.wails.io/quick-start/first-app/> | [`getting-started/your-first-app.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/getting-started/your-first-app.md) |
| 项目状态（Beta） | <https://v3.wails.io/status/> | [`status.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/status.md) |
| `WebviewWindowOptions` 全量 | <https://v3.wails.io/features/windows/options/> | [`features/windows/options.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/features/windows/options.md) |
| 权限（摄像头/通知…） | <https://v3.wails.io/features/windows/permissions/> | [`features/windows/permissions.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/features/windows/permissions.md) |
| **Raw Messages（本壳通道）** | <https://v3.wails.io/guides/raw-messages/> | [`guides/raw-messages.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/guides/raw-messages.md) |
| 前端 runtime 两种引法 | <https://v3.wails.io/reference/frontend-runtime/> | [`reference/frontend-runtime.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/reference/frontend-runtime.md) |
| Asset Server（dev 反代 / `/wails/runtime.js`） | <https://v3.wails.io/contributing/asset-server/> | [`contributing/asset-server.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/contributing/asset-server.md) |
| 自定义 transport | <https://v3.wails.io/guides/custom-transport/> | [`guides/custom-transport.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/guides/custom-transport.md) |
| 构建 / CLI | <https://v3.wails.io/guides/build/building/>、<https://v3.wails.io/reference/cli/> | [`guides/build/building.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/guides/build/building.md)、[`reference/cli.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/reference/cli.md) |
| Linux 依赖 / legacy GTK3 | <https://v3.wails.io/guides/build/linux/> | [`guides/build/linux.md`](https://github.com/wailsapp/wails/blob/master/docs/mpress/content/guides/build/linux.md) |

> 文档站的 Markdown 源就在 `wailsapp/wails` 仓库的 `docs/mpress/content/**`（页面 `<meta name="mpress:source">` 暴露），
> 本文件所有文档引用都对齐到该源文件，便于逐字复核。

**源码（tag `v3.0.0-beta.28`，仓库内路径前缀 `v3/`）**

- `pkg/application/webview_window_options.go`（`URL`/`HTML`/`JS`/`CSS`/`Permissions`/`AllowSimpleEventEmit`）
- `pkg/application/webview_window.go`（`ExecJS` 队列 L663、`HandleMessage` L807、事件注入 L1430、`runtimeLoaded`）
- `pkg/application/webview_window_linux.go`（L431 options.JS、L444 `runtime.Core`）
- `pkg/application/webview_window_windows.go`（L2414 仅拦 `wails.localhost`、L2355 `processMessage`/OriginInfo、L2724 `navigateInitialPage`、L2801 `runtime.Core`）
- `pkg/application/webview_window_darwin.go`（L190 WKUserContentController、L1759 options.JS、L1459 `runtime.Core`）
- `pkg/application/application.go`（L268 `OriginInfo`、L714 消息泵、L860 handler 分流）
- `pkg/application/application_options.go`（L188 `AssetOptions`、L96 `RawMessageHandler`）
- `pkg/application/linux_cgo_gtk3.go`（L1505 document-start user script、L2247 OriginInfo）
- `pkg/application/linux_blob_body_fetch_shim.go` / `.js`
- `pkg/application/urlvalidator.go`（只被 `Browser.OpenURL` 使用）
- `internal/runtime/runtime.go`（`Core()` 的全部内容）
- `internal/runtime/desktop/@wailsio/runtime/src/{runtime.ts,index.ts,events.ts,system.ts,environment.ts}`
- `internal/assetserver/{assetserver.go,assetserver_webview.go,build_dev.go,build_production.go,assetserver_{linux,darwin,windows}.go}`
- `internal/webview2/pkg/edge/chromium.go`（L267 `window.external`、L409 `Init` = `AddScriptToExecuteOnDocumentCreated`）
- `examples/{events-bug,keybindings,plain,raw-message}/main.go`

**Issue（按相关性）**

- [#5799](https://github.com/wailsapp/wails/issues/5799)（open）无导航拦截 API、无 cookie API
- [#3908](https://github.com/wailsapp/wails/issues/3908)（open，blocked）Cookies Support
- [#6151](https://github.com/wailsapp/wails/issues/6151)（open）Linux `production,devtools` 编译不过
- [#6136](https://github.com/wailsapp/wails/issues/6136)（open）两份 runtime → 监听失效
- [#4872](https://github.com/wailsapp/wails/issues/4872)（closed）Reload 后 `dispatchWailsEvent` 未定义
- [#4628](https://github.com/wailsapp/wails/issues/4628)（open）video.js CORS
- [#6207](https://github.com/wailsapp/wails/issues/6207) / [#6208](https://github.com/wailsapp/wails/issues/6208)（open）`EmitEvent` 多播

**本次实测的探针程序**（4 个，均为最小 `main.go`，跑在本机 Wayland 会话里；结论已内联到上文，源码不再随仓库保留）

| 探针 | 干了什么 | 关键结论 |
| --- | --- | --- |
| 1 | 远程 http 页面 + `options.JS` + 加载后 `ExecJS`，页面把 document-start / load / 2 s 三个时点的状态 POST 回来 | `options.JS` 在 `readyState=interactive` 后才跑；`window.wails` 空壳；`/wails/runtime` 打到远程站点；`wails://` 不可 fetch；**不发 ready 时 ExecJS 静默排队** |
| 2 | 同上，但页面首屏手发 `wails:runtime:ready` 并自挂 `dispatchWailsEvent` | ready 后 ExecJS 立刻生效；Go→JS 事件（含 payload）能进远程页面 |
| 3 | `Assets.Handler` + `FRONTEND_DEVSERVER_URL=<远程地址>`，页面走反代 | 反代链路成立、`/wails/runtime` 仍返回真实 JSON；**但反代的 POST body 被丢** |
| 4 | 直连 asset server（本地 `wails://` 源）发 POST | body 完好（string / json / blob / formdata 四种），`ContentLength` 恒为 0 |
