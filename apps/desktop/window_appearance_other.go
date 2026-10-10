//go:build !darwin && !linux

package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

func setupNativeWindow(window *application.WebviewWindow) {
	// 针对非 macOS/Linux 平台（Windows Mica 由 WebviewWindowOptions.Windows 接管）
}

func setNativeWindowTheme(window *application.WebviewWindow, mode string, resolved string) {
	// 针对非 macOS 平台的占位（Windows 走原生 Theme / Mica 机制）
}
