//go:build linux

package main

/*
#cgo linux pkg-config: gtk4 webkitgtk-6.0
#include <gtk/gtk.h>
#include <webkit/webkit.h>
#include <stdlib.h>
#include <string.h>

static gboolean applyTransparencyCallback(gpointer data) {
	GtkWidget* widget = GTK_WIDGET(data);
	if (widget != NULL) {
		GtkCssProvider* provider = gtk_css_provider_new();
		const char* css =
			"window, window.background, #webview-box {\n"
			"    background-color: transparent;\n"
			"    background-image: none;\n"
			"    box-shadow: none;\n"
			"}\n";
		gtk_css_provider_load_from_string(provider, css);

		GdkDisplay* display = gtk_widget_get_display(widget);
		if (display != NULL) {
			gtk_style_context_add_provider_for_display(
				display,
				GTK_STYLE_PROVIDER(provider),
				GTK_STYLE_PROVIDER_PRIORITY_APPLICATION
			);
		}
		g_object_unref(provider);
	}
	return G_SOURCE_REMOVE;
}

void setLinuxWindowTransparentAsync(void* windowPtr) {
	if (windowPtr == NULL) return;
	g_idle_add((GSourceFunc)applyTransparencyCallback, windowPtr);
}

typedef struct {
	void* windowPtr;
	char* mode;
	char* resolved;
} ThemeContext;

static void updateWebkitBackground(GtkWidget* widget, gboolean isDark) {
	if (widget == NULL) return;
	if (WEBKIT_IS_WEB_VIEW(widget)) {
		GdkRGBA rgba;
		if (isDark) {
			rgba.red = 0.08f; rgba.green = 0.08f; rgba.blue = 0.08f; rgba.alpha = 0.0f;
		} else {
			rgba.red = 1.0f; rgba.green = 1.0f; rgba.blue = 1.0f; rgba.alpha = 0.0f;
		}
		webkit_web_view_set_background_color(WEBKIT_WEB_VIEW(widget), &rgba);
	}
	for (GtkWidget *child = gtk_widget_get_first_child(widget); child != NULL; child = gtk_widget_get_next_sibling(child)) {
		updateWebkitBackground(child, isDark);
	}
}

static gboolean applyThemeCallback(gpointer data) {
	ThemeContext* ctx = (ThemeContext*)data;
	if (ctx != NULL) {
		const char* effective = ctx->resolved;
		if (effective == NULL || strlen(effective) == 0) {
			effective = ctx->mode;
		}
		gboolean isDark = (effective != NULL && strcmp(effective, "dark") == 0);

		// 1. 同步 GtkSettings 全局属性
		GtkSettings* settings = gtk_settings_get_default();
		if (settings != NULL) {
			// GTK 4.20+ 推荐使用的色彩方案属性
			g_object_set(settings,
				"gtk-application-prefer-dark-theme", isDark,
				"gtk-interface-color-scheme", isDark ? GTK_INTERFACE_COLOR_SCHEME_DARK : GTK_INTERFACE_COLOR_SCHEME_LIGHT,
				NULL);

			// 智能更新主题名（适配带 -dark / 无 -dark 后缀的主题包）
			char* currentTheme = NULL;
			g_object_get(settings, "gtk-theme-name", &currentTheme, NULL);
			if (currentTheme != NULL) {
				char newTheme[256];
				if (isDark) {
					if (!strstr(currentTheme, "-dark") && !strstr(currentTheme, "-Dark")) {
						snprintf(newTheme, sizeof(newTheme), "%s-dark", currentTheme);
						g_object_set(settings, "gtk-theme-name", newTheme, NULL);
					}
				} else {
					char* darkSuffix = strstr(currentTheme, "-dark");
					if (!darkSuffix) darkSuffix = strstr(currentTheme, "-Dark");
					if (darkSuffix != NULL) {
						size_t prefixLen = darkSuffix - currentTheme;
						if (prefixLen < sizeof(newTheme)) {
							strncpy(newTheme, currentTheme, prefixLen);
							newTheme[prefixLen] = '\0';
							g_object_set(settings, "gtk-theme-name", newTheme, NULL);
						}
					}
				}
				g_free(currentTheme);
			}
		}

		// 2. 更新具体窗口控件的 CSS 类及 WebKit 视图
		if (ctx->windowPtr != NULL) {
			GtkWidget* win = GTK_WIDGET(ctx->windowPtr);
			if (isDark) {
				gtk_widget_add_css_class(win, "dark");
				gtk_widget_remove_css_class(win, "light");
			} else {
				gtk_widget_add_css_class(win, "light");
				gtk_widget_remove_css_class(win, "dark");
			}
			updateWebkitBackground(win, isDark);
		}

		if (ctx->mode) free(ctx->mode);
		if (ctx->resolved) free(ctx->resolved);
		free(ctx);
	}
	return G_SOURCE_REMOVE;
}

void setLinuxThemeAsync(void* windowPtr, const char* mode, const char* resolved) {
	ThemeContext* ctx = (ThemeContext*)malloc(sizeof(ThemeContext));
	ctx->windowPtr = windowPtr;
	ctx->mode = mode ? strdup(mode) : NULL;
	ctx->resolved = resolved ? strdup(resolved) : NULL;
	g_idle_add((GSourceFunc)applyThemeCallback, ctx);
}
*/
import "C"
import (
	"log"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func setupNativeWindow(window *application.WebviewWindow) {
	if window == nil {
		return
	}
	ptr := window.NativeWindow()
	if ptr == nil {
		return
	}
	log.Printf("[desktop] 为 Linux GTK4 窗口应用背景透明样式: ptr=%v", ptr)
	C.setLinuxWindowTransparentAsync(ptr)
}

func setNativeWindowTheme(window *application.WebviewWindow, mode string, resolved string) {
	var ptr unsafe.Pointer
	if window != nil {
		setupNativeWindow(window)
		ptr = window.NativeWindow()
	}

	cMode := C.CString(mode)
	defer C.free(unsafe.Pointer(cMode))
	cResolved := C.CString(resolved)
	defer C.free(unsafe.Pointer(cResolved))

	log.Printf("[desktop] 设置 Linux 原生窗口主题: mode=%s, resolved=%s, ptr=%v", mode, resolved, ptr)
	C.setLinuxThemeAsync(ptr, cMode, cResolved)
}
