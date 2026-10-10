// Package shell 是「壳」的启动配置：加载哪个地址、窗口多大，
// 以及**在导航之前**把「当前在桌面端」这件事写进 URL。
//
// 为什么标记要走 URL 而不是 `WebviewWindowOptions.JS`：Wails v3 的 `JS` 字段
// 三平台都在**页面加载完成之后**才执行（Linux `WindowLoadFinished`、
// macOS `WebViewDidFinishNavigation`；Windows 上 URL 导航分支根本不执行它），
// 那时页面的首屏脚本早跑完了。而 URL 是导航参数里唯一「页面执行前就存在」的通道，
// 所以由壳改写 URL、页面的首屏内联脚本把它落地成 `window.__DESKTOP__`。
package shell

import (
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"runtime"
	"strconv"
	"strings"
)

/*
DefaultURL 是没给 `-url` / `DESKTOP_URL` 时加载的地址 —— 值随**构建模式**变：

| 构建 | 默认地址 | 定义在 |
|---|---|---|
| `pnpm desktop` / `go run .`（开发） | `http://localhost:3000` | `default_dev.go` |
| `pnpm desktop:build`（`-tags release`） | **空** —— 由构建时的 `DESKTOP_URL` 注入 | `default_release.go` |

于是「本地开发连 localhost、发布产物连线上」不需要任何人记着手写参数，
仓库里也不会留一份会过期的线上地址（发布地址只存在于 CI 的变量里）。

链接器仍然可以临时覆盖（CI 脚本就是这么做的）：

	go build -tags release -ldflags \
	  "-X github.com/nivo-team/dashboard/apps/desktop/internal/shell.DefaultURL=https://admin.example.com"
*/
var DefaultURL = defaultURL

// ReleaseBuild 表示这是发布构建（`-tags release` / `production`），用于启动自检。
const ReleaseBuild = releaseBuild

// URL 上的桌面标记。页面侧读 `FlagKey` 与 `FlagTitleBarHeightKey`，把 `MarkPrefix*` 收进 window.__DESKTOP_MARKS__。
const (
	FlagKey               = "__desktop"
	FlagPlatformKey       = "__desktop_platform"
	FlagTitleBarHeightKey = "__desktop_title_bar_h"
	MarkPrefix            = "__desktop_"
	DefaultTitleBarHeight = 40
)

// Config 是一次启动的全部输入。
type Config struct {
	// URL 是要加载的前端地址（必须 http/https，始终远程 —— 壳里不打包前端产物）。
	URL string
	// Title 是窗口标题。
	Title string
	// Width / Height 是初始窗口尺寸。
	Width, Height int
	// MinWidth / MinHeight 是最小窗口尺寸限制（默认 800x600）。
	MinWidth, MinHeight int
	// TitleBarHeight 是 macOS 标题栏/红绿灯高度（px），默认 40。
	TitleBarHeight int
	// Platform 是当前运行的操作系统平台（如 darwin / windows / linux）。
	Platform string
	// Debug 打开 devtools 与检查器。
	Debug bool
	// Marks 是随 URL 一起交给页面的自定义标记（`-mark k=v`），
	// 页面侧在 window.__DESKTOP_MARKS__ 里读到 —— 留给以后扩展。
	Marks map[string]string
	// AllowedOrigins 是**额外**放行的来源（`-allow-origin`，可重复）。
	// 默认只认 URL 自己那个来源；站点有跳转（http→https、换域名、SSO）
	// 导致最终来源不同时，把它们显式列进来。
	AllowedOrigins []string
}

// EnvURL / EnvTitle / EnvTitleBarHeight 是命令行之外的兜底入口（打包成双击启动时更方便）。
const (
	EnvURL            = "DESKTOP_URL"
	EnvTitle          = "DESKTOP_TITLE"
	EnvTitleBarHeight = "DESKTOP_TITLE_BAR_HEIGHT"
)

type marksFlag map[string]string

func (m marksFlag) String() string {
	if len(m) == 0 {
		return ""
	}
	pairs := make([]string, 0, len(m))
	for k, v := range m {
		pairs = append(pairs, k+"="+v)
	}
	return strings.Join(pairs, ",")
}

// Set 支持 `-mark k=v` 重复出现。
func (m marksFlag) Set(value string) error {
	key, val, ok := strings.Cut(value, "=")
	if !ok || key == "" {
		return fmt.Errorf("标记要写成 k=v，收到 %q", value)
	}
	if strings.HasPrefix(key, "__") {
		return fmt.Errorf("标记名不要以 __ 开头（会和协议参数撞车）：%q", key)
	}
	m[key] = val
	return nil
}

// listFlag 是可重复出现的字符串参数（`-allow-origin`）。
type listFlag []string

func (l *listFlag) String() string { return strings.Join(*l, ",") }

func (l *listFlag) Set(value string) error {
	if strings.TrimSpace(value) == "" {
		return errors.New("来源不能为空")
	}
	*l = append(*l, strings.TrimSpace(value))
	return nil
}

func parseEnvInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

// Parse 解析命令行参数。args 不含程序名（传 os.Args[1:]）。
func Parse(args []string) (Config, error) {
	cfg := Config{
		URL:            firstNonEmpty(os.Getenv(EnvURL), DefaultURL),
		Title:          firstNonEmpty(os.Getenv(EnvTitle), "Nivo Admin"),
		Width:          1280,
		Height:         800,
		MinWidth:       800,
		MinHeight:      600,
		TitleBarHeight: parseEnvInt(os.Getenv(EnvTitleBarHeight), DefaultTitleBarHeight),
		Platform:       runtime.GOOS,
		Debug:          !ReleaseBuild || os.Getenv("DESKTOP_DEBUG") == "1",
		Marks:          map[string]string{},
	}

	fs := flag.NewFlagSet("desktop", flag.ContinueOnError)
	fs.StringVar(&cfg.URL, "url", cfg.URL, "要加载的前端地址（http/https）")
	fs.StringVar(&cfg.Title, "title", cfg.Title, "窗口标题")
	fs.IntVar(&cfg.Width, "width", cfg.Width, "初始窗口宽度")
	fs.IntVar(&cfg.Height, "height", cfg.Height, "初始窗口高度")
	fs.IntVar(&cfg.MinWidth, "min-width", cfg.MinWidth, "最小窗口宽度")
	fs.IntVar(&cfg.MinHeight, "min-height", cfg.MinHeight, "最小窗口高度")
	fs.IntVar(&cfg.TitleBarHeight, "titlebar-height", cfg.TitleBarHeight, "窗口标题栏/红绿灯高度（px）")
	fs.BoolVar(&cfg.Debug, "debug", cfg.Debug, "打开 devtools（非发布构建默认开启）")
	fs.Var(marksFlag(cfg.Marks), "mark", "随 URL 传给页面的标记，可重复：-mark channel=beta")
	fs.Var((*listFlag)(&cfg.AllowedOrigins), "allow-origin",
		"额外放行、允许调用 bridge 的来源，可重复：-allow-origin https://www.example.com")

	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}

	// 发布构建不预置地址：走到这儿就说明构建时漏了 DESKTOP_URL
	if strings.TrimSpace(cfg.URL) == "" {
		if ReleaseBuild {
			return Config{}, errors.New(
				"发布构建需要地址：构建时设 DESKTOP_URL=…（见 apps/desktop/scripts/build.mjs），" +
					"或运行时用 -url / DESKTOP_URL 指定",
			)
		}
		return Config{}, errors.New("需要地址：用 -url 或 DESKTOP_URL 指定要加载的前端地址")
	}

	if _, err := cfg.StartURL(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// StartURL 返回真正交给窗口的地址：原地址 + `__desktop=1` (+ 每个标记一个 `__desktop_<k>=<v>`)。
//
// 只接受 http/https：壳的定位是「加载线上站点」，file:// 或自定义 scheme 会让
// 页面的 origin 变成 null（fetch、cookie、OAuth 全部跟着坏）。
func (c Config) StartURL() (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(c.URL))
	if err != nil {
		return "", fmt.Errorf("地址解析失败：%w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("地址必须是 http/https（收到 %q）", c.URL)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("地址缺少主机名：%q", c.URL)
	}

	query := parsed.Query()
	query.Set(FlagKey, "1")
	platform := c.Platform
	if platform == "" {
		platform = runtime.GOOS
	}
	query.Set(FlagPlatformKey, platform)
	if c.TitleBarHeight > 0 {
		query.Set(FlagTitleBarHeightKey, strconv.Itoa(c.TitleBarHeight))
	}
	for key, value := range c.Marks {
		query.Set(MarkPrefix+key, value)
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

// Origin 返回配置地址的来源（scheme://host），用于校验消息确实来自我们自己的页面。
func (c Config) Origin() string {
	parsed, err := url.Parse(strings.TrimSpace(c.URL))
	if err != nil || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

// OriginAllowed 判断一条入站消息的来源是否可信。
//
// 为什么要判：窗口里不只有我们的页面 —— OAuth 之类的跳转会把**顶层页面**换成
// 别家站点，而任何页面都能往壳里发消息。消息通道本身就是权限面，所以默认只认
// 配置地址那一个来源（站点有跳转就显式加 `-allow-origin`）。
//
// 两个刻意的宽松：
//   - Linux 给的是**整条页面 URI**（`https://host/path?x=1`），所以比的是 scheme://host 而不是整串；
//   - origin 为空表示平台没给出信息来源（老版本 / 未知平台）：这时放行 ——
//     宁可少一道防线，也不要一个查不出来的「bridge 不响应」。
func (c Config) OriginAllowed(origin string) bool {
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return true
	}

	candidate := parsed.Scheme + "://" + parsed.Host
	if candidate == c.Origin() {
		return true
	}
	for _, allowed := range c.AllowedOrigins {
		if normalizeOrigin(allowed) == candidate {
			return true
		}
	}
	return false
}

// normalizeOrigin 把 `-allow-origin` 的值收敛成 scheme://host
// （容忍写成一整条 URL、或结尾多一个斜杠）。
func normalizeOrigin(value string) string {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" {
		return strings.TrimSpace(value)
	}
	return parsed.Scheme + "://" + parsed.Host
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
