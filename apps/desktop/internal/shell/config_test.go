package shell

import (
	"net/url"
	"testing"
)

func TestStartURLMarksDesktopAndKeepsEverythingElse(t *testing.T) {
	cfg := Config{
		URL:            "https://admin.example.com/app?theme=dark#/home",
		TitleBarHeight: DefaultTitleBarHeight,
		Marks:          map[string]string{"channel": "beta"},
	}

	got, err := cfg.StartURL()
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}

	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatalf("结果不是合法地址：%v", err)
	}
	query := parsed.Query()
	if query.Get(FlagKey) != "1" {
		t.Fatalf("应当带上 %s=1，得到 %q", FlagKey, got)
	}
	if query.Get(FlagPlatformKey) == "" {
		t.Fatalf("应当带上 %s，得到 %q", FlagPlatformKey, got)
	}
	if query.Get(FlagTitleBarHeightKey) != "40" {
		t.Fatalf("应当带上 %s=40，得到 %q", FlagTitleBarHeightKey, got)
	}
	if query.Get(MarkPrefix+"channel") != "beta" {
		t.Fatalf("标记应当带前缀进 URL，得到 %q", got)
	}
	if query.Get("theme") != "dark" || parsed.Fragment != "/home" {
		t.Fatalf("原有参数与 hash 必须保留，得到 %q", got)
	}
}

func TestStartURLRejectsNonHTTP(t *testing.T) {
	for _, raw := range []string{"file:///tmp/index.html", "wails://wails/", "admin.example.com", ""} {
		if _, err := (Config{URL: raw}).StartURL(); err == nil {
			t.Fatalf("%q 不该通过（只收 http/https）", raw)
		}
	}
}

func TestOriginAllowed(t *testing.T) {
	cfg := Config{
		URL:            "https://admin.example.com/",
		AllowedOrigins: []string{"https://www.admin.example.com/anything?x=1"},
	}

	cases := []struct {
		origin string
		want   bool
	}{
		{"https://admin.example.com", true},
		{"https://admin.example.com/app?x=1", true}, // Linux 给的是整条 URI
		{"https://www.admin.example.com", true},     // -allow-origin 放行的跳转目标
		{"https://accounts.google.com/o/oauth2", false},
		{"http://admin.example.com", false}, // scheme 不同 = 不同来源
		{"http://localhost:3000", false},
		{"", true}, // 平台没给来源：放行（否则会静默打死 bridge）
	}

	for _, testCase := range cases {
		if got := cfg.OriginAllowed(testCase.origin); got != testCase.want {
			t.Fatalf("OriginAllowed(%q) = %v，期望 %v", testCase.origin, got, testCase.want)
		}
	}
}

func TestParseDefaultsAndFlags(t *testing.T) {
	t.Setenv(EnvURL, "")
	t.Setenv(EnvTitle, "")

	cfg, err := Parse([]string{"-url", "http://localhost:5173", "-mark", "channel=beta", "-debug"})
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if cfg.URL != "http://localhost:5173" || !cfg.Debug || cfg.Marks["channel"] != "beta" {
		t.Fatalf("参数没解析对：%+v", cfg)
	}
	if cfg.Width == 0 || cfg.Height == 0 || cfg.Title == "" {
		t.Fatalf("默认值应当补上：%+v", cfg)
	}
}

func TestParseRejectsBadMark(t *testing.T) {
	if _, err := Parse([]string{"-mark", "__desktop_bad=1"}); err == nil {
		t.Fatal("以 __ 开头的标记名会和协议参数撞车，应当拒绝")
	}
	if _, err := Parse([]string{"-mark", "novalue"}); err == nil {
		t.Fatal("不是 k=v 的标记应当拒绝")
	}
}
