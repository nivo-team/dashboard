//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -mmacosx-version-min=10.14
#cgo LDFLAGS: -framework Cocoa -framework WebKit

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static void updateVisualEffectViews(NSView* view, NSAppearance* appearance, NSVisualEffectMaterial material) {
	if (view == nil) return;
	if ([view isKindOfClass:[NSVisualEffectView class]]) {
		NSVisualEffectView* ev = (NSVisualEffectView*)view;
		[ev setAppearance:appearance];
		[ev setMaterial:material];
		[ev setState:NSVisualEffectStateActive];
		[ev setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
		[ev setNeedsDisplay:YES];
	}
	for (NSView* sub in [view subviews]) {
		updateVisualEffectViews(sub, appearance, material);
	}
}

static void updateWebViews(NSView* view) {
	if (view == nil) return;
	if ([view isKindOfClass:[WKWebView class]]) {
		WKWebView* wv = (WKWebView*)view;
		@try {
			[wv setValue:@NO forKey:@"drawsBackground"];
			[wv setValue:[NSColor clearColor] forKey:@"backgroundColor"];
		} @catch (NSException* e) {}
		if (@available(macOS 12.0, *)) {
			wv.underPageBackgroundColor = [NSColor clearColor];
		}
	}
	for (NSView* sub in [view subviews]) {
		updateWebViews(sub);
	}
}

void setNativeAppearance(void* ptr, const char* mode) {
	NSString* modeStr = [NSString stringWithUTF8String:mode];
	dispatch_async(dispatch_get_main_queue(), ^{
		NSWindow* window = nil;
		if (ptr != NULL) {
			id obj = (id)ptr;
			if ([obj isKindOfClass:[NSWindow class]]) {
				window = (NSWindow*)obj;
			} else if ([obj respondsToSelector:@selector(window)]) {
				window = [obj window];
			}
		}
		// 兜底：如果传入指针无法直接解析为 NSWindow，直接从 NSApp 活跃窗口列表获取
		if (window == nil) {
			window = [NSApp keyWindow] ?: [NSApp mainWindow];
			if (window == nil && [[NSApp windows] count] > 0) {
				window = [[NSApp windows] firstObject];
			}
		}

		if (window == nil) {
			NSLog(@"[desktop] setNativeAppearance 错误：未找到目标 NSWindow");
			return;
		}

		NSAppearance* appearance = nil;
		NSVisualEffectMaterial material = NSVisualEffectMaterialUnderWindowBackground;

		if ([modeStr isEqualToString:@"dark"]) {
			appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
		} else if ([modeStr isEqualToString:@"light"]) {
			appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
		} else {
			// system 跟随系统
			appearance = nil;
		}

		// 1. 设置窗口级外观（影响红绿灯、Toolbar 及系统控件）
		[window setAppearance:appearance];
		[window setOpaque:NO];
		[window setBackgroundColor:[NSColor clearColor]];

		// 2. 设置并递归更新内容视图及所有毛玻璃特效层
		if ([window contentView]) {
			[[window contentView] setAppearance:appearance];
			updateVisualEffectViews([window contentView], appearance, material);
			updateWebViews([window contentView]);
			[[window contentView] setNeedsDisplay:YES];
		}

		[window invalidateShadow];
		NSLog(@"[desktop] setNativeAppearance 成功更新窗口外观: mode=%@, window=%p", modeStr, window);
	});
}
*/
import "C"
import (
	"log"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func setupNativeWindow(window *application.WebviewWindow) {
	// macOS 原生毛玻璃与透明度已在 WebviewWindowOptions.Mac.Backdrop 配置接管
}

func setNativeWindowTheme(window *application.WebviewWindow, mode string, resolved string) {
	effective := resolved
	if mode == "system" {
		effective = "system"
	}

	var ptr unsafe.Pointer
	if window != nil {
		ptr = window.NativeWindow()
	}
	log.Printf("[desktop] setNativeWindowTheme 执行：window=%v, ptr=%v, effective=%s", window != nil, ptr, effective)

	cMode := C.CString(effective)
	defer C.free(unsafe.Pointer(cMode))
	C.setNativeAppearance(ptr, cMode)
}
