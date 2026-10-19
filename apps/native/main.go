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
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/nivo-team/dashboard/apps/native/internal/bridge"
	"github.com/nivo-team/dashboard/apps/native/internal/shell"
)

// version 由构建时注入：-ldflags "-X main.version=0.0.1-alpha"（页面侧可用 core.info 读到）。
var version = "0.0.1-alpha"

var (
	currentThemeMode     = "system"
	currentThemeResolved = "light"
)

/*
windowFrameless 决定窗口要不要去掉系统标题栏。

**Windows 去边框**：系统标题栏和页面自己的窗口条是上下叠着的**两条横条** ——
系统那条白占 32px，样式还不受页面主题（毛玻璃 / 深浅色 / 圆角）控制。去掉之后窗口只剩
页面那条，其余仍由系统与 Wails 接管：拖拽走页面侧 `wails:drag`
（→ `WM_NCLBUTTONDOWN HTCAPTION`，与 macOS 同一条路径）、边缘缩放、双击最大化
（页面侧 `handleDesktopHeaderDoubleClick`）、Win11 圆角与投影。

**代价：系统画的那三个窗口按钮（最小化 / 最大化 / 关闭）也一起没了**，Windows 上关窗口
只能靠 Alt+F4、任务栏右键或系统快捷键。这不是没试出来 —— Wails v3 不提供「隐藏标题栏但
保留系统按钮」的模式（Electron 的 `titleBarOverlay` 那种），它出 `Frameless` 时把
`WM_NCCALCSIZE` 的客户区放成整窗、非客户区清零，DWM 没有标题栏区可画；实测再把整块 DWM
边框（`DwmExtendFrameIntoClientArea` 全 -1）扩进客户区，系统也**不会**重新画按钮
（把一个没有任何自绘按钮的页面装进同一个窗口截图即可确认，标题栏区域始终是空的）。
页面侧因此只在行末按系统按钮的宽度留一条**空白**安全区（`--shell-window-controls-w`，
见 `apps/web/src/styles.css`）—— 将来要做按钮，落点就在那里；要系统按钮，就得把系统标题栏留回来。

**macOS 必须保留系统标题栏**：红绿灯（关闭 / 最小化 / 缩放）就长在那条
`AppearsTransparent + FullSizeContent` 的系统标题栏里，去掉标题栏等于去掉三个按钮。

**Linux 也保留**：GTK 原生标题栏同样自带窗口控制，删掉没有替代品。
*/
func windowFrameless(platform string) bool {
	return platform == "windows"
}

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
			"app":            "nivo-admin-desktop",
			"version":        version,
			"platform":       runtime.GOOS,
			"arch":           runtime.GOARCH,
			"window":         "main",
			"url":            startURL,
			"origin":         cfg.Origin(),
			"titleBarHeight": cfg.TitleBarHeight,
			"blurSupported":  cfg.BlurSupported,
			"blurReason":     cfg.BlurReason,
			"marks":          cfg.Marks,
			"methods":        registry.Methods(),
			"dropped":        registry.Dropped(),
		}
	}
	registerCoreMethods(registry, coreInfo)

	app := application.New(application.Options{
		Name:        "Nivo Admin",
		Description: "Nivo Admin 桌面壳：加载远程前端，前端发版即更新",
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		Linux: application.LinuxOptions{
			ProgramName: "nivo-desktop",
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

	bgType := application.BackgroundTypeSolid
	if cfg.Platform == "darwin" || cfg.Platform == "windows" || cfg.Platform == "linux" {
		bgType = application.BackgroundTypeTranslucent
	}

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:           "main",
		Title:          cfg.Title,
		URL:            startURL,
		Width:          cfg.Width,
		Height:         cfg.Height,
		BackgroundType: bgType,
		/*
			**窗口边框与系统标题栏 / 红绿灯**：

			Windows 走 `windowFrameless` → `Frameless: true`：去掉系统标题栏，窗口条整条由页面
			承担（拖拽 / 双击最大化 / 缩放 / 圆角投影仍在，但系统那三个窗口按钮随之消失，
			见 `windowFrameless` 的注释）。

			macOS 保留系统标题栏，并启用透明全尺寸内容窗口 + 系统工具栏（UseToolbar +
			MacToolbarStyleUnifiedCompact），使红绿灯自动向内缩进并垂直居中；
			注意：InvisibleTitleBarHeight 必须为 0，否则 AppKit 会在原生层直接全局拦截整条顶部区域，
			导致网页内 tabs 排序无法接收鼠标事件；窗口拖拽与禁止拖拽区域完全交由 CSS 精准控制（.drag / .no-drag）。
		*/
		Frameless: windowFrameless(cfg.Platform),
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
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
		Windows: application.WindowsWindow{
			BackdropType: application.Mica,
			/*
				**composition hosting**：把 WebView2 从「子 HWND 承载」换成 DirectComposition 承载，
				父窗口因此自己持有非客户区命中测试 —— 这是 Wails 让**页面自绘的窗口按钮具备原生行为**
				（`HTMINBUTTON` / `HTMAXBUTTON` / `HTCLOSE`、悬停与按下态、最大化键的 Win11 贴靠布局）
				的唯一途径。页面侧用 `--wails-non-client-region` 标出那些矩形，
				由 `#/native/bridge` 的 `reportNonClientRegions` 上报（单位物理像素）。

				为什么非要它：Windows 的系统按钮无法独立于系统标题栏存在（实测把整块 DWM 边框扩进
				客户区也不画，详见 `windowFrameless` 的注释），而 macOS 的红绿灯只能长在系统标题栏里
				—— 于是「无标题条 + 原生按钮」在 Windows 上只能落成「页面画按钮、行为归系统」。

				代价：文档把该模式标为 Experimental（改动渲染与输入的承载方式），
				换 Windows / WebView2 版本时要重新验一遍页面渲染与命中。
			*/
			WebView2CompositionHosting: true,
		},
		/*
			最小尺寸限制：最小宽度 800px，最小高度 600px，
			保证桌面壳在任何平台上的最小可用空间与内容区（表格、AI 分屏列）显示正常。
		*/
		MinWidth:  cfg.MinWidth,
		MinHeight: cfg.MinHeight,
		/*
			DevToolsEnabled 只是「允许打开」：`-debug` 下 F12 / ⌘⌥I 可以**手动**调起。
			刻意不设 OpenInspectorOnStartup —— devtools 不再自动弹出，免得每次启动都盖住窗口。
		*/
		DevToolsEnabled: cfg.Debug,
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

	setupNativeWindow(window)
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		setupNativeWindow(window)
	})

	// 窗口自身的动作（frameless 之后没有系统按钮可点，双击窗口条也要能最大化）
	registerWindowMethods(registry, app, window, cfg, bgType)
	registerThemeMethods(registry, app, window)

	// 从这里开始，registry 有地方投递消息了（之前 Emit 的事件会排队等着）
	// 监听系统主题变化，实时推送给前端
	app.Event.OnApplicationEvent(events.Common.ThemeChanged, func(event *application.ApplicationEvent) {
		isDark := false
		if event != nil && event.Context() != nil {
			isDark = event.Context().IsDarkMode()
		} else if app.Env != nil {
			isDark = app.Env.IsDarkMode()
		}
		log.Printf("[desktop] 系统主题变化，通知前端：isDark=%v", isDark)
		registry.Emit("theme:systemChanged", map[string]any{
			"isDarkMode": isDark,
		})
	})

	registry.Start(func(js string) {
		for _, win := range app.Window.GetAll() {
			if w, ok := win.(*application.WebviewWindow); ok {
				w.ExecJS(js)
			}
		}
	})

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
func registerWindowMethods(registry *bridge.Registry, app *application.App, window *application.WebviewWindow, cfg shell.Config, bgType application.BackgroundType) {
	registry.Handle(bridge.WindowOpen, func(payload json.RawMessage) (any, error) {
		var req struct {
			Path   string `json:"path"`
			Name   string `json:"name"`
			Title  string `json:"title"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		}
		if len(payload) > 0 {
			_ = json.Unmarshal(payload, &req)
		}
		if req.Name == "" {
			req.Name = "sphere"
		}
		// 规范化命名：独立页面窗口统一映射为 page_*
		if strings.HasPrefix(req.Name, "standalone_") {
			req.Name = "page_" + strings.TrimPrefix(req.Name, "standalone_")
		}

		log.Printf("[desktop] 收到 window.open: name=%s, path=%s", req.Name, req.Path)
		// 若对应命名的独立窗口已存在（如 sphere / settings 单例），则激活置顶展示
		if existing, ok := app.Window.GetByName(req.Name); ok {
			if win, ok := existing.(*application.WebviewWindow); ok {
				win.Show()
				win.Focus()
				if req.Path != "" {
					targetURL, err := cfg.TargetURL(req.Path, req.Name)
					if err == nil {
						win.SetURL(targetURL)
					}
				}
				return map[string]any{
					"success": true,
					"name":    req.Name,
					"created": false,
				}, nil
			}
		}

		targetURL, err := cfg.TargetURL(req.Path, req.Name)
		if err != nil {
			return nil, err
		}

		width := req.Width
		if width <= 0 {
			width = 1080
		}
		height := req.Height
		if height <= 0 {
			height = 740
		}
		title := req.Title
		if title == "" {
			if req.Name == "sphere" {
				title = "Sphere"
			} else if req.Name == "settings" {
				title = "设置"
			} else {
				title = cfg.Title
			}
		}

		newWin := app.Window.NewWithOptions(application.WebviewWindowOptions{
			Name:           req.Name,
			Title:          title,
			URL:            targetURL,
			Width:          width,
			Height:         height,
			MinWidth:       720,
			MinHeight:      520,
			BackgroundType: bgType,
			// 子窗口（设置 / 页面工作区 / Sphere）与主窗口同一套窗口条，边框规则也必须一致
			Frameless: windowFrameless(cfg.Platform),
			Mac: application.MacWindow{
				Backdrop: application.MacBackdropTranslucent,
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
			Windows: application.WindowsWindow{
				// 与主窗口同一套窗口条，非客户区（原生按钮命中）必须同样走 composition hosting
				BackdropType:               application.Mica,
				WebView2CompositionHosting: true,
			},
			DevToolsEnabled: cfg.Debug,
		})

		setupNativeWindow(newWin)
		setNativeWindowTheme(newWin, currentThemeMode, currentThemeResolved)
		newWin.Show()
		newWin.Focus()

		return map[string]any{
			"success": true,
			"name":    req.Name,
			"created": true,
		}, nil
	})
	/*
		`window.*` 的窗口动作作用在**发起调用的那一扇窗口**上。

		主窗口之外还有设置 / 页面工作区 / Sphere 这些独立窗口，它们共用同一套页面窗口条，
		「最小化」绝不能最小化到别人头上。页面把自己的窗口名（`__desktop_window`）随载荷带上；
		名字为空或认不出来时回退到主窗口（保持 `window.close` 既有的「不给名字就关主窗口」语义）。
	*/
	forWindow := func(payload json.RawMessage) *application.WebviewWindow {
		if name := windowNameOf(payload); name != "" {
			if target, ok := app.Window.GetByName(name); ok {
				if win, ok := target.(*application.WebviewWindow); ok {
					return win
				}
			}
		}
		return window
	}

	registry.Handle(bridge.WindowMinimise, func(payload json.RawMessage) (any, error) {
		win := forWindow(payload)
		win.Minimise()
		return windowState(win), nil
	})

	registry.Handle(bridge.WindowToggleMaximise, func(payload json.RawMessage) (any, error) {
		win := forWindow(payload)
		win.ToggleMaximise()
		return windowState(win), nil
	})

	registry.Handle(bridge.WindowClose, func(payload json.RawMessage) (any, error) {
		win := forWindow(payload)
		if win == window {
			window.Close()
			return nil, nil
		}
		// 独立窗口：立即在屏幕上隐藏窗口，提供零延迟关闭体验
		win.Hide()
		// 延迟安全销毁：确保 macOS AppKit 的原生拖拽/输入会话（NSDraggingSession）
		// 已经完全结束释放，避免跨窗口拖拽合并时触发 use-after-free 原生段错误
		go func() {
			time.Sleep(300 * time.Millisecond)
			win.Close()
		}()
		return nil, nil
	})

	registry.Handle(bridge.WindowOpenDevTools, func(json.RawMessage) (any, error) {
		window.OpenDevTools()
		return nil, nil
	})

	registry.Handle(bridge.WindowGetBlurSupport, func(json.RawMessage) (any, error) {
		res := shell.DetectBlurSupport()
		return map[string]any{
			"supported": res.Supported,
			"reason":    res.Reason,
		}, nil
	})
}

func windowState(window *application.WebviewWindow) map[string]any {
	return map[string]any{
		"maximised": window.IsMaximised(),
		"minimised": window.IsMinimised(),
	}
}

/*
windowNameOf 取 `window.*` 载荷里的目标窗口名（`{ "name": "sphere" }`）。

空字符串表示「没指定」，由调用方决定回退到哪一扇（`registerWindowMethods` 里回退主窗口）。
命名与 `window.open` 一致：`main` / `settings` / `sphere` / `page_*`。
*/
func windowNameOf(payload json.RawMessage) string {
	var req struct {
		Name string `json:"name"`
	}
	if len(payload) > 0 {
		_ = json.Unmarshal(payload, &req)
	}
	return req.Name
}

/*
registerCoreMethods 注册内置方法。刻意只留「我是谁 / 你还活着吗」加一个演示往返的
echo —— 业务方法由使用者在 main 里自己 `registry.Handle("你的方法名", …)`。

命名约定：`<域>.<动作>`，例如 `core.info`、`window.minimise`、`file.pick`。
*/
func registerThemeMethods(registry *bridge.Registry, app *application.App, window *application.WebviewWindow) {
	registry.Handle(bridge.ThemeGetSystem, func(json.RawMessage) (any, error) {
		return map[string]any{
			"isDarkMode": shellSystemIsDark(app),
		}, nil
	})

	registry.Handle(bridge.ThemeSet, func(payload json.RawMessage) (any, error) {
		var req struct {
			Mode     string `json:"mode"`
			Resolved string `json:"resolved"`
		}
		if len(payload) > 0 {
			_ = json.Unmarshal(payload, &req)
		}

		/*
			`system` 的**真值在壳侧**，不信页面传来的 resolved。

			原因：Linux（WebKitGTK）的 `prefers-color-scheme` 跟着 **GTK 主题**走，而壳为了
			「强制深 / 浅」改的正是 GTK 主题 —— 于是页面拿到的永远是「上一次强制的结果」，
			切回「跟随系统」就会卡在上一次的深浅。壳用 XDG 桌面门户读到的才是当前系统偏好。
		*/
		resolved := req.Resolved
		if req.Mode == "system" {
			if shellSystemIsDark(app) {
				resolved = "dark"
			} else {
				resolved = "light"
			}
		}

		log.Printf("[desktop] 前端主题同步：mode=%s, 页面 resolved=%s, 壳采用=%s", req.Mode, req.Resolved, resolved)
		currentThemeMode = req.Mode
		currentThemeResolved = resolved
		for _, w := range app.Window.GetAll() {
			if win, ok := w.(*application.WebviewWindow); ok {
				setNativeWindowTheme(win, req.Mode, resolved)
			}
		}
		return map[string]any{
			"success":  true,
			"mode":     req.Mode,
			"resolved": resolved,
		}, nil
	})
}

/*
shellSystemIsDark 读宿主当前是不是深色，**调度到主线程**再读。

Wails 的 `Env.IsDarkMode()` 在 macOS 上落到 AppKit 的 `effectiveAppearance`（主线程 API），
而 bridge 的方法各自跑在独立协程里（见 bridge 包的线程约定）—— 直接读是未定义行为，
所以统一用 `InvokeSyncWithResult` 回主线程。Linux 上它走 XDG 桌面门户（DBus），本身与线程无关。
*/
func shellSystemIsDark(app *application.App) bool {
	return application.InvokeSyncWithResult(func() bool {
		if app.Env == nil {
			return false
		}
		return app.Env.IsDarkMode()
	})
}

func registerCoreMethods(registry *bridge.Registry, info func() map[string]any) {
	registry.Handle(bridge.CoreInfo, func(json.RawMessage) (any, error) {
		return info(), nil
	})

	registry.Handle(bridge.CorePing, func(json.RawMessage) (any, error) {
		return map[string]any{"pong": true, "at": time.Now().Format(time.RFC3339)}, nil
	})

	/*
		示例方法（可以删）：留着能用一行验证「页面 → Go → 页面」整条链路：

			const { echo } = await window.__bridge.call('demo.echo', { hello: 'world' })
	*/
	registry.Handle(bridge.DemoEcho, func(payload json.RawMessage) (any, error) {
		if len(payload) == 0 {
			return map[string]any{"echo": nil}, nil
		}
		return map[string]any{"echo": payload}, nil
	})
}
