package bridge

/*
catalog.go 是 bridge **方法 / 事件目录**：名字、一句话说明、以及页面侧的 TS 载荷类型。

它是页面侧 bridge 类型的**唯一真值**：

  - `main.go` 注册 handler 时只用这里的方法名常量（`registry.Handle(bridge.CoreInfo, …)`），
    方法名因此不可能在两侧各写一份而悄悄漂移；
  - `go run ./cmd/genbindings`（`pnpm desktop:bindings`）读这份目录，渲染成
    `apps/web/src/desktop/generated/bridge.gen.ts`，页面侧只消费生成物。

## 为什么类型是「TS 表达式字符串」而不是 Go 结构体

bridge 的载荷是自由形态的 JSON，壳不解释业务语义（见 `wire.go`）。若用 Go 结构体表达，
就要再维护一层 Go→TS 的类型映射（Wails 自带的 bindings 生成器就是干这个的），
而本壳刻意不走 Wails 的运行时通道 —— 这里用最直接的方式：类型写在目录里，
生成器只做渲染。代价是它与 handler 的实际返回要人工保持一致，收益是零依赖、一眼看完。

## 怎么加一个方法

1. 在下面加方法名常量，并往 `Methods` 里加一条（`Payload` / `Result` 写 TS 表达式，
   无载荷/无结果写 `"void"`）；
2. 在 `main.go` 的注册处 `registry.Handle(bridge.你的常量, …)`，返回的值与 `Result` 对齐；
3. 跑 `pnpm desktop:bindings` 更新生成物。

`Registry.Handle` 会对「不在本目录里的名字」打日志提醒 —— 光注册不登记，页面侧就没有类型。
*/

// Method 是页面可以 `call` 的一个方法。
type Method struct {
	Name    string // `<域>.<动作>`，如 `core.info`
	Summary string // 一句话说明（生成到 TS 注释里）
	Payload string // 载荷的 TS 类型表达式；无载荷写 "void"
	Result  string // 结果的 TS 类型表达式；无结果写 "void"
}

// CatalogEvent 是壳主动 `Emit` 给页面的一个事件（名字避开 wire.go 的线上消息 `Event`）。
type CatalogEvent struct {
	Name    string // `<域>:<动作>`，如 `shell:ready`
	Summary string // 一句话说明（生成到 TS 注释里）
	Payload string // 载荷的 TS 类型表达式
}

/* ── 方法名（main.go 注册时只用这些） ─────────────────────────────────────── */

const (
	CoreInfo             = "core.info"
	CorePing             = "core.ping"
	DemoEcho             = "demo.echo"
	ThemeGetSystem       = "theme.getSystem"
	ThemeSet             = "theme.set"
	WindowMinimise       = "window.minimise"
	WindowToggleMaximise = "window.toggleMaximise"
	WindowClose          = "window.close"
	WindowOpenDevTools   = "window.openDevTools"
	WindowGetBlurSupport = "window.getBlurSupport"
)

/* ── 事件名 ───────────────────────────────────────────────────────────────── */

const (
	EventShellReady         = "shell:ready"
	EventThemeSystemChanged = "theme:systemChanged"
)

/* ── 复用的载荷形状 ───────────────────────────────────────────────────────── */

// coreInfoTS 是 `core.info` 与 `shell:ready` 共用的自述形状（见 main.go 的 coreInfo）。
const coreInfoTS = `{
  app: string
  version: string
  platform: string
  arch: string
  window: string
  url: string
  origin: string
  titleBarHeight: number
  blurSupported: boolean
  blurReason: string
  marks: Record<string, string>
  methods: string[]
  dropped: number
}`

// windowStateTS 是窗口方法的返回（见 main.go 的 windowState）。
const windowStateTS = `{
  maximised: boolean
  minimised: boolean
}`

/* ── 目录 ─────────────────────────────────────────────────────────────────── */

// Methods 是全部方法的目录。生成器按名字排序后输出，顺序在这里无关紧要。
var Methods = []Method{
	{
		Name:    CoreInfo,
		Summary: "壳的自述：版本、平台、窗口信息、可用方法与自定义标记",
		Payload: "void",
		Result:  coreInfoTS,
	},
	{
		Name:    CorePing,
		Summary: "探活：返回 pong 与壳侧时间",
		Payload: "void",
		Result:  `{ pong: boolean; at: string }`,
	},
	{
		Name:    DemoEcho,
		Summary: "演示往返：把载荷原样回显（可删）",
		Payload: "unknown",
		Result:  `{ echo: unknown }`,
	},
	{
		Name:    ThemeGetSystem,
		Summary: "读取宿主系统的明暗主题",
		Payload: "void",
		Result:  `{ isDarkMode: boolean }`,
	},
	{
		Name:    ThemeSet,
		Summary: "把页面主题同步给宿主窗口（标题栏 / 毛玻璃跟着变）",
		Payload: `{ mode: string; resolved: string }`,
		Result:  `{ success: boolean; mode: string; resolved: string }`,
	},
	{
		Name:    WindowMinimise,
		Summary: "最小化窗口",
		Payload: "void",
		Result:  windowStateTS,
	},
	{
		Name:    WindowToggleMaximise,
		Summary: "最大化 / 还原窗口（窗口条空白处双击）",
		Payload: "void",
		Result:  windowStateTS,
	},
	{
		Name:    WindowClose,
		Summary: "关闭窗口",
		Payload: "void",
		Result:  "void",
	},
	{
		Name:    WindowOpenDevTools,
		Summary: "打开 devtools",
		Payload: "void",
		Result:  "void",
	},
	{
		Name:    WindowGetBlurSupport,
		Summary: "当前宿主平台是否支持窗口背景模糊及原因",
		Payload: "void",
		Result:  `{ supported: boolean; reason: string }`,
	},
}

// Events 是壳可能推给页面的全部事件。
var Events = []CatalogEvent{
	{
		Name:    EventShellReady,
		Summary: "页面就绪后壳推来的第一条事件，载荷与 core.info 相同",
		Payload: coreInfoTS,
	},
	{
		Name:    EventThemeSystemChanged,
		Summary: "宿主系统明暗主题变化",
		Payload: `{ isDarkMode: boolean }`,
	},
}

// methodSet 让 `Registry.Handle` 能校验「注册的名字是否登记在目录里」（init 里建）。
var methodSet map[string]struct{}

func init() {
	methodSet = make(map[string]struct{}, len(Methods))
	for _, method := range Methods {
		methodSet[method.Name] = struct{}{}
	}
}
