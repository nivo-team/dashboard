package bridge

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

/*
协议层的护栏测试。这里锁的是**跨语言契约**（页面侧
`apps/web/src/desktop/bridge.ts` 按同样的形状解析），
所以断言写得比业务代码更死一点 —— 改协议就得改这里，改不动就说明改错了。
*/

const injectedPrefix = "window.__bridgeRecv&&window.__bridgeRecv("

func newTestRegistry() (*Registry, <-chan string) {
	out := make(chan string, 32)
	registry := New()
	registry.Start(func(js string) { out <- js })
	return registry, out
}

func decodeInjected(t *testing.T, js string) map[string]any {
	t.Helper()
	if !strings.HasPrefix(js, injectedPrefix) || !strings.HasSuffix(js, ")") {
		t.Fatalf("注入的 JS 形态不对：%s", js)
	}
	var payload map[string]any
	body := js[len(injectedPrefix) : len(js)-1]
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatalf("注入的载荷不是 JSON：%v（%s）", err, body)
	}
	return payload
}

func waitInjected(t *testing.T, out <-chan string) string {
	t.Helper()
	select {
	case js := <-out:
		return js
	case <-time.After(time.Second):
		t.Fatal("等注入的 JS 超时")
		return ""
	}
}

func expectSilence(t *testing.T, out <-chan string, why string) {
	t.Helper()
	select {
	case js := <-out:
		t.Fatalf("%s（却收到了 %s）", why, js)
	case <-time.After(60 * time.Millisecond):
	}
}

func TestHandleMessageIgnoresNonBridgeMessages(t *testing.T) {
	registry, _ := newTestRegistry()

	if handled, _ := registry.HandleMessage("随便一段话"); handled {
		t.Fatal("非 JSON 消息不该被当成 bridge 消息")
	}
	if handled, _ := registry.HandleMessage(`{"foo":"bar"}`); handled {
		t.Fatal("既没有 call 也没有 id 的 JSON 不该被当成 bridge 消息")
	}
}

func TestCallResolvesWithData(t *testing.T) {
	registry, out := newTestRegistry()
	registry.Handle("demo.echo", func(payload json.RawMessage) (any, error) {
		return map[string]any{"echo": payload}, nil
	})

	handled, ready := registry.HandleMessage(`{"id":"c1","call":"demo.echo","payload":{"a":1}}`)
	if !handled || !ready {
		t.Fatalf("第一条合法消息应当既被处理又报告首次就绪，得到 handled=%v ready=%v", handled, ready)
	}

	payload := decodeInjected(t, waitInjected(t, out))
	if payload["id"] != "c1" {
		t.Fatalf("应答必须原样回填 id，得到 %v", payload["id"])
	}
	if payload["ok"] != true {
		t.Fatalf("成功的调用 ok 应为 true，得到 %v", payload)
	}
	echo, _ := payload["data"].(map[string]any)["echo"].(map[string]any)
	if echo["a"] != float64(1) {
		t.Fatalf("payload 应原样透传给方法，得到 %v", payload["data"])
	}

	// 第二次调用不该再报「首次就绪」
	if _, again := registry.HandleMessage(`{"id":"c2","call":"demo.echo"}`); again {
		t.Fatal("就绪只该报告一次")
	}
}

func TestCallUnknownMethodListsAvailable(t *testing.T) {
	registry, out := newTestRegistry()
	registry.Handle("core.ping", func(json.RawMessage) (any, error) { return "pong", nil })

	registry.HandleMessage(`{"id":"c1","call":"nope.nope"}`)
	payload := decodeInjected(t, waitInjected(t, out))

	if payload["ok"] != false {
		t.Fatalf("未注册的方法应当失败，得到 %v", payload)
	}
	message, _ := payload["error"].(string)
	if !strings.Contains(message, "core.ping") {
		t.Fatalf("错误里应当带上可用方法清单，得到 %q", message)
	}
}

func TestCallRecoversHandlerPanic(t *testing.T) {
	registry, out := newTestRegistry()
	registry.Handle("boom", func(json.RawMessage) (any, error) { panic("炸了") })

	// 处理函数跑在壳自己的协程里，panic 漏出去会带走整个应用 —— 必须变成错误应答
	registry.HandleMessage(`{"id":"c1","call":"boom"}`)
	payload := decodeInjected(t, waitInjected(t, out))

	if payload["ok"] != false || !strings.Contains(payload["error"].(string), "炸了") {
		t.Fatalf("panic 应当被兜成错误应答，得到 %v", payload)
	}
}

func TestReadyHandshakeHasNoResponse(t *testing.T) {
	registry, out := newTestRegistry()

	registry.HandleMessage(`{"call":"__ready"}`)
	expectSilence(t, out, "就绪握手不该产生应答")
}

func TestEmitQueuesUntilPageIsReady(t *testing.T) {
	registry, out := newTestRegistry()

	registry.Emit("shell:ready", map[string]any{"version": "1.0.0"})
	expectSilence(t, out, "页面就绪前不该投递事件")

	if _, ready := registry.HandleMessage(`{"call":"__ready"}`); !ready {
		t.Fatal("握手应当报告首次就绪")
	}

	payload := decodeInjected(t, waitInjected(t, out))
	if payload["event"] != "shell:ready" {
		t.Fatalf("排队的事件应当在就绪后投出去，得到 %v", payload)
	}
	if payload["data"].(map[string]any)["version"] != "1.0.0" {
		t.Fatalf("事件载荷应当原样保留，得到 %v", payload["data"])
	}

	// 就绪之后是直通
	registry.Emit("later", nil)
	if decodeInjected(t, waitInjected(t, out))["event"] != "later" {
		t.Fatal("就绪后的事件应当立即投递")
	}
}

func TestEmitKeepsOrderAndDropsOldestWhenFull(t *testing.T) {
	registry, out := newTestRegistry()
	registry.mu.Lock()
	registry.queueMax = 2
	registry.mu.Unlock()

	for _, name := range []string{"a", "b", "c"} {
		registry.Emit(name, nil)
	}
	registry.HandleMessage(`{"call":"__ready"}`)

	first := decodeInjected(t, waitInjected(t, out))["event"]
	second := decodeInjected(t, waitInjected(t, out))["event"]
	if first != "b" || second != "c" {
		t.Fatalf("队列满时应当丢最旧的、保留顺序，得到 %v / %v", first, second)
	}
	if registry.Dropped() != 1 {
		t.Fatalf("丢弃数应当被记下来，得到 %d", registry.Dropped())
	}
}
