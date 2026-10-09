//go:build !darwin

package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

func setNativeWindowTheme(window *application.WebviewWindow, mode string, resolved string) {
	// 针对非 macOS 平台的占位（Windows 走原生 Theme / Mica 机制）
}
