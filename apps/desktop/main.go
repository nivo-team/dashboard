/*
Command desktop 是 Nivo Admin 的**超薄桌面壳**：一个只加载远程 http/https 地址的
Wails v3 窗口，外加一条通用的 JS↔Go 消息通道。

三条刻意的设计（改之前先读 `apps/desktop/README.md`）：

 1. **不打包前端产物**：窗口永远加载一个 http/https 地址，前端发版即生效，
    壳本身只在「要换 webview 能力」时才需要重新发版。
 2. **不碰 Wails 的默认运行时通道**：那条通道要求页面 fetch
    `window.location.origin + "/wails/runtime"`，对远程页面只会打到远程站点
    （跨域且无 CORS 头）。这里改用 `RawMessageHandler` —— 页面用 webview 自带的
    消息原语发 JSON，壳用注入 JS 回话，与页面来源无关。
 3. **桌面标记走 URL**：Wails 的 `WebviewWindowOptions.JS` 三平台都在页面加载
    **之后**才执行，赶不上首屏。于是壳在导航前把 `__desktop=1` 写进地址，
    页面的首屏内联脚本把它落地成 `window.__DESKTOP__` 与 `<html class="is_desktop">`。
*/
package main

import (
	"encoding/json"
	"log"
	"os"
	"runtime"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/nivo-team/dashboard/apps/desktop/internal/bridge"
	"github.com/nivo-team/dashboard/apps/desktop/internal/shell"
)

// version 由构建时注入：-ldflags "-X main.version=1.2.3"（页面侧可用 core.info 读到）。
var version = "dev"

func main() {
	cfg, err := shell.Parse(os.Args[1:])
	if err != nil {
		log.Fatalf("[desktop] 启动参数有误：%v", err)
	}

	startURL, err := cfg.StartURL()
	if err != nil {
		log.Fatalf("[desktop] %v", err)
	}

	registry := bridge.New()
	// -debug 时把 bridge 的进出站打到 stdout：排查「页面到底有没有把消息发出来」
	registry.Debug = cfg.Debug

	// 自述：页面问「我现在在哪儿」时给的全部信息（也是 shell:ready 的载荷）
	coreInfo := func() map[string]any {
		return map[string]any{
			"app":      "nivo-admin-desktop",
			"version":  version,
			"platform": runtime.GOOS,
			"arch":     runtime.GOARCH,
			"window":   "main",
			"url":      startURL,
			"origin":         cfg.Origin(),
			"titleBarHeight": cfg.TitleBarHeight,
			"marks":          cfg.Marks,
			"methods":  registry.Methods(),
			"dropped":  registry.Dropped(),
		}
	}
	registerCoreMethods(registry, coreInfo)

	app := application.New(application.Options{
		Name:        "Nivo Admin",
		Description: "Nivo Admin 桌面壳：加载远程前端，前端发版即更新",
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		/*
			页面上**不以 `wails:` 开头**的消息全部落到这里 —— 整条 bridge 的入口。
			（`wails:` 开头的是 Wails 自己的系统消息，例如拖拽、窗口就绪。）

			来源校验：窗口里不只有我们的页面，OAuth 之类的跳转会把顶层页面换成别家站点，
			而任何页面都能往壳里发消息。默认只认配置地址那一个来源。

			线程：Wails 分发这条消息用的是 `go a.handleWindowMessage(event)`
			（每条消息一个独立协程，见 `application.go`），所以这里**不在主线程**上 ——
			直接干活是安全的。唯一要避免的是把这条协程占太久：注入 JS 会阻塞等主线程。
		*/
		RawMessageHandler: func(_ application.Window, message string, origin *application.OriginInfo) {
			if origin != nil && !cfg.OriginAllowed(origin.Origin) {
				log.Printf("[desktop] 丢弃来源不可信的消息：%s", origin.Origin)
				return
			}
			handled, becameReady := registry.HandleMessage(message)
			if handled && becameReady {
				// 页面刚能收消息：把「壳已就绪」连同自述一起推过去
				registry.Emit("shell:ready", coreInfo())
			}
		},
	})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:   "main",
		Title:  cfg.Title,
		URL:    startURL,
		Width:  cfg.Width,
		Height: cfg.Height,
		/*
			**显示系统标题栏 / 红绿灯**：
			macOS 启用透明全尺寸内容窗口并挂载系统工具栏（UseToolbar + MacToolbarStyleUnifiedCompact），
			使红绿灯自动向内缩进并垂直居中；
			注意：InvisibleTitleBarHeight 必须为 0，否则 AppKit 会在原生层直接全局拦截整条顶部区域，
			导致网页内 tabs 排序无法接收鼠标事件；窗口拖拽与禁止拖拽区域完全交由 CSS 精准控制（.drag / .no-drag）。
		*/
		Frameless: false,
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBar{
				AppearsTransparent:   true,
				Hide:                 false,
				HideTitle:            true,
				FullSizeContent:      true,
				UseToolbar:           true,
				HideToolbarSeparator: true,
				ToolbarStyle:         application.MacToolbarStyleUnifiedCompact,
			},
			InvisibleTitleBarHeight: 0,
		},
		/*
			最小尺寸：外壳在 768px 以下会切成移动端抽屉（汉堡按钮在顶栏里，而顶栏
			在桌面壳里被窗口条取代）。900 让窗口根本进不到那个区间，
			顺带也保证内容区（表格、AI 分屏列）还有可用宽度。
		*/
		MinWidth:               900,
		MinHeight:              600,
		DevToolsEnabled:        cfg.Debug,
		OpenInspectorOnStartup: cfg.Debug,
		KeyBindings: map[string]func(window application.Window){
			"F12": func(w application.Window) {
				if win, ok := w.(*application.WebviewWindow); ok {
					win.OpenDevTools()
				}
			},
			"Cmd+Option+I": func(w application.Window) {
				if win, ok := w.(*application.WebviewWindow); ok {
					win.OpenDevTools()
				}
			},
			"Cmd+Alt+I": func(w application.Window) {
				if win, ok := w.(*application.WebviewWindow); ok {
					win.OpenDevTools()
				}
			},
		},
	})

	// 窗口自身的动作（frameless 之后没有系统按钮可点，双击窗口条也要能最大化）
	registerWindowMethods(registry, window)

	// 从这里开始，registry 有地方投递消息了（之前 Emit 的事件会排队等着）
	registry.Start(window.ExecJS)

	log.Printf("[desktop] 加载 %s（version=%s debug=%v）", startURL, version, cfg.Debug)
	if err := app.Run(); err != nil {
		log.Fatalf("[desktop] 运行失败：%v", err)
	}
}

/*
registerWindowMethods 注册窗口自身的动作（`window.*`）。

存在的理由只有一个：窗口是 **frameless** 的（见上面的 WebviewWindowOptions），
系统标题栏连同它的最小化 / 最大化 / 关闭按钮一起没有了 —— 这些能力必须有别的地方接。
目前页面只用了第一项：

  - 窗口条空白处**双击** → `window.toggleMaximise`（Linux / Windows 由页面自己接；
    macOS 的双击由 Wails 的 drag 运行时直接处理，不会走到这里）；
  - `window.minimise` / `window.close` 先备着：将来在窗口条上加按钮（或做成托盘菜单）时
    直接用，不必再改壳的启动路径。

命名仍守 `<域>.<动作>`；前两个统一返回窗口当前状态，调用方一次往返就能拿到新值。
窗口方法内部都会 `InvokeSync` 到主线程，所以从 bridge 的协程里调是安全的。
*/
func registerWindowMethods(registry *bridge.Registry, window *application.WebviewWindow) {
	registry.Handle("window.minimise", func(json.RawMessage) (any, error) {
		window.Minimise()
		return windowState(window), nil
	})

	registry.Handle("window.toggleMaximise", func(json.RawMessage) (any, error) {
		window.ToggleMaximise()
		return windowState(window), nil
	})

	registry.Handle("window.close", func(json.RawMessage) (any, error) {
		window.Close()
		return nil, nil
	})

	registry.Handle("window.openDevTools", func(json.RawMessage) (any, error) {
		window.OpenDevTools()
		return nil, nil
	})
}

func windowState(window *application.WebviewWindow) map[string]any {
	return map[string]any{
		"maximised": window.IsMaximised(),
		"minimised": window.IsMinimised(),
	}
}

/*
registerCoreMethods 注册内置方法。刻意只留「我是谁 / 你还活着吗」加一个演示往返的
echo —— 业务方法由使用者在 main 里自己 `registry.Handle("你的方法名", …)`。

命名约定：`<域>.<动作>`，例如 `core.info`、`window.minimise`、`file.pick`。
*/
func registerCoreMethods(registry *bridge.Registry, info func() map[string]any) {
	registry.Handle("core.info", func(json.RawMessage) (any, error) {
		return info(), nil
	})

	registry.Handle("core.ping", func(json.RawMessage) (any, error) {
		return map[string]any{"pong": true, "at": time.Now().Format(time.RFC3339)}, nil
	})

	/*
		示例方法（可以删）：留着能用一行验证「页面 → Go → 页面」整条链路：

			const { echo } = await window.__bridge.call('demo.echo', { hello: 'world' })
	*/
	registry.Handle("demo.echo", func(payload json.RawMessage) (any, error) {
		if len(payload) == 0 {
			return map[string]any{"echo": nil}, nil
		}
		return map[string]any{"echo": payload}, nil
	})
}
