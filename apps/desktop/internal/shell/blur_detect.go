package shell

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// BlurSupport 包含当前平台/环境对窗口背景模糊的支持判定结果。
type BlurSupport struct {
	Supported bool   `json:"supported"`
	Reason    string `json:"reason"`
}

// DetectBlurSupport 检测当前宿主平台是否支持窗口背景模糊与穿透。
func DetectBlurSupport() BlurSupport {
	switch runtime.GOOS {
	case "darwin":
		return BlurSupport{
			Supported: true,
			Reason:    "macOS 原生支持毛玻璃材质 (Vibrancy)",
		}
	case "windows":
		return BlurSupport{
			Supported: true,
			Reason:    "Windows 原生支持 Mica / Acrylic 材质",
		}
	case "linux":
		return detectLinuxBlurSupport()
	default:
		return BlurSupport{
			Supported: false,
			Reason:    "当前操作系统平台不支持原生窗口毛玻璃背景",
		}
	}
}

func detectLinuxBlurSupport() BlurSupport {
	// 1. 检查 Hyprland
	if os.Getenv("HYPRLAND_INSTANCE_SIGNATURE") != "" || os.Getenv("XDG_CURRENT_DESKTOP") == "Hyprland" {
		// 进一步检查 Hyprland 是否已开启模糊
		if out, err := exec.Command("hyprctl", "getoption", "decoration:blur:enabled").Output(); err == nil {
			str := string(out)
			if strings.Contains(str, "bool: true") || strings.Contains(str, "int: 1") {
				return BlurSupport{
					Supported: true,
					Reason:    "Hyprland 合成器已开启 GPU 背景模糊",
				}
			}
			return BlurSupport{
				Supported: true,
				Reason:    "Hyprland 合成器支持背景模糊（可在配置中开启）",
			}
		}
		return BlurSupport{
			Supported: true,
			Reason:    "检测到 Hyprland 桌面环境，支持背景模糊",
		}
	}

	// 2. 检查 KDE Plasma (KWin)
	xdgDesktop := os.Getenv("XDG_CURRENT_DESKTOP")
	if os.Getenv("KDE_FULL_SESSION") == "true" || strings.Contains(strings.ToUpper(xdgDesktop), "KDE") {
		return BlurSupport{
			Supported: true,
			Reason:    "KDE Plasma (KWin) 合成器原生支持窗口背景模糊",
		}
	}

	// 3. 检查 Swayfx
	if os.Getenv("SWAYSOCK") != "" {
		if out, err := exec.Command("sway", "-v").Output(); err == nil && strings.Contains(strings.ToLower(string(out)), "swayfx") {
			return BlurSupport{
				Supported: true,
				Reason:    "Swayfx 合成器原生支持窗口模糊效果",
			}
		}
	}

	// 4. 检查 X11 下运行的独立合成器 (picom)
	if os.Getenv("XDG_SESSION_TYPE") == "x11" || os.Getenv("DISPLAY") != "" {
		if out, err := exec.Command("pgrep", "-x", "picom").Output(); err == nil && len(strings.TrimSpace(string(out))) > 0 {
			return BlurSupport{
				Supported: true,
				Reason:    "X11 Picom 合成器运行中，支持背景模糊",
			}
		}
	}

	return BlurSupport{
		Supported: false,
		Reason:    "当前 Linux 桌面环境未检测到支持背景模糊的合成器（如 Hyprland / KDE Plasma / Picom）",
	}
}
