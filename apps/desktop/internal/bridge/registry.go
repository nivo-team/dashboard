// Package bridge 是壳与页面之间**唯一**的通道：一个按名字注册的方法表 +
// 一条单向事件流。
//
// 它跑在 Wails 的「原始消息」通道上（`application.Options.RawMessageHandler`），
// 而不是 Wails 默认的 HTTP 运行时通道 —— 默认通道要求页面 fetch
// `window.location.origin + "/wails/runtime"`，对**远程页面**只会打到远程站点，
// 跨域又拿不到 CORS 头，等于不通。原始消息通道走的是 webview 自带的消息机制，
// 与页面来源无关，正好匹配「壳只加载线上地址」这个用法。
//
// 页面的发送原语（三平台由 Wails 在页面加载完成后注入）：
//
//	window._wails.invoke(json)            // 壳注入的包装
//	window.chrome.webview.postMessage(…)  // Windows WebView2
//	window.webkit.messageHandlers.external.postMessage(…)  // macOS / Linux WebKitGTK
//
// 壳的回复方式：往页面里执行一段 JS 调 `window.__bridgeRecv(…)`。
package bridge

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
)

// Handler 是注册进 bridge 的一个方法。payload 是页面传来的原始 JSON（可能为 nil）。
type Handler func(payload json.RawMessage) (any, error)

// Registry 是方法表 + 出站投递器。
//
// 线程约定（踩过的坑，别改）：
//   - 入站 `HandleMessage` 由壳从消息回调里 **go 出去**执行：回调本身在主线程上，
//     而回复要注入 JS（Wails 的 ExecJS 会同步等主线程），在主线程里做就是死锁；
//   - 出站统一走 `outbox` 单协程：既保证事件顺序，也保证注入 JS 永远不在主线程上。
type Registry struct {
	// Debug 打开进出站日志（`-debug`）：排查「页面到底有没有把消息发出来」用。
	Debug bool

	mu       sync.RWMutex
	handlers map[string]Handler

	send   func(js string) // 由壳注入：把一段 JS 执行在页面里
	outbox chan string
	pumpOn sync.Once

	ready    bool // 页面是否已经就绪（收到过一条合法消息）
	queue    []Event
	queueMax int
	dropped  int
}

// New 建一个空注册表。
func New() *Registry {
	return &Registry{
		handlers: map[string]Handler{},
		outbox:   make(chan string, 256),
		queueMax: 256,
	}
}

// Handle 注册一个方法。同名后注册的覆盖先注册的（扩展时改行为不必删旧的）。
func (r *Registry) Handle(name string, handler Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.handlers[name] = handler
}

// Methods 返回已注册的方法名（供 `core.info` 自述，也方便页面调试）。
func (r *Registry) Methods() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.handlers))
	for name := range r.handlers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Start 注入「往页面写 JS」的动作并启动投递协程。
// 窗口建好之后调一次；调用前 `Emit` 的事件会排队，不丢。
func (r *Registry) Start(send func(js string)) {
	r.mu.Lock()
	r.send = send
	pending := r.flushQueueLocked()
	r.mu.Unlock()

	r.pumpOn.Do(func() { go r.pump() })
	for _, js := range pending {
		r.outbox <- js
	}
}

// Emit 推一条事件给页面。页面还没就绪时排队（队列满则丢最旧的，保新的）。
func (r *Registry) Emit(name string, data any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Debug {
		log.Printf("[bridge] → %s（%s）", name, r.deliveryLocked())
	}
	r.pushLocked(Event{Event: name, Data: data})
}

// deliveryLocked 只用于日志：这条消息是会立刻投出去，还是先排队。
func (r *Registry) deliveryLocked() string {
	if r.send == nil || !r.ready {
		return "排队中"
	}
	return "投递"
}

// HandleMessage 处理页面发来的一条原始消息。
//
// handled 表示「这是 bridge 的消息」（false 时壳直接忽略，不必报错）；
// becameReady 表示这条消息让页面**首次**就绪 —— 壳可以借此推一次初始状态。
func (r *Registry) HandleMessage(raw string) (handled bool, becameReady bool) {
	req, err := decodeRequest(raw)
	if err != nil {
		return false, false
	}

	r.mu.Lock()
	if !r.ready {
		r.ready = true
		becameReady = true
	}
	pending := r.flushQueueLocked()
	r.mu.Unlock()

	if r.Debug {
		log.Printf("[bridge] ← %s（排队事件 %d 条）", req.Call, len(pending))
	}

	for _, js := range pending {
		r.outbox <- js
	}

	// 就绪握手本身没有返回值，也不必回执
	if req.Call == ReadyCall || req.Call == "" {
		return true, becameReady
	}

	data, callErr := r.invoke(req.Call, req.Payload)
	response := Response{ID: req.ID, OK: callErr == nil, Data: data}
	if callErr != nil {
		response.Error = callErr.Error()
	}

	r.mu.Lock()
	r.pushLocked(response)
	r.mu.Unlock()

	return true, becameReady
}

// Dropped 返回被丢弃的事件数（页面长期不就绪时会涨）—— 只用于自述/诊断。
func (r *Registry) Dropped() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.dropped
}

/*
pushLocked 把一条出站消息转成 JS 并投进 outbox。

没就绪（或壳还没注入 send）就先排队；outbox 满说明页面卡住了，
这时**丢事件而不是阻塞调用方** —— 壳卡死比丢一条事件严重得多。
*/
func (r *Registry) pushLocked(msg any) {
	if r.send == nil || !r.ready {
		if len(r.queue) >= r.queueMax {
			r.queue = r.queue[1:]
			r.dropped++
		}
		event, ok := msg.(Event)
		if !ok {
			// 应答不该走到这里（应答只可能来自已就绪的页面）；丢掉并记数
			r.dropped++
			return
		}
		r.queue = append(r.queue, event)
		return
	}

	select {
	case r.outbox <- inject(msg):
	default:
		r.dropped++
	}
}

// flushQueueLocked 取走排队中的事件并转成 JS（仅在已就绪且有 send 时）。
func (r *Registry) flushQueueLocked() []string {
	if r.send == nil || !r.ready || len(r.queue) == 0 {
		return nil
	}
	out := make([]string, 0, len(r.queue))
	for _, event := range r.queue {
		out = append(out, inject(event))
	}
	r.queue = nil
	return out
}

func (r *Registry) pump() {
	for js := range r.outbox {
		r.mu.RLock()
		send := r.send
		r.mu.RUnlock()
		if send != nil {
			send(js)
		}
	}
}

// invoke 找到并执行一个方法。panic 在这里被兜住 —— 处理函数跑在壳自己的
// 协程里，漏出去会直接带走整个应用。
func (r *Registry) invoke(name string, payload json.RawMessage) (data any, err error) {
	r.mu.RLock()
	handler, ok := r.handlers[name]
	r.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("未注册的方法 %q（可用的：%s）", name, strings.Join(r.Methods(), ", "))
	}

	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("方法 %q 执行时 panic：%v", name, recovered)
		}
	}()

	return handler(payload)
}

func decodeRequest(raw string) (Request, error) {
	var request Request
	if err := json.Unmarshal([]byte(raw), &request); err != nil {
		return Request{}, err
	}
	// 只有这两种形态算我们的消息：请求必须带 call（或纯握手）
	if request.Call == "" && request.ID == "" {
		return Request{}, errors.New("不是 bridge 消息")
	}
	return request, nil
}

/*
inject 把一条消息包成页面侧的接收调用。

`json.Marshal` 默认转义 `<` `>` `&` 与 U+2028/U+2029，所以结果可以安全地当作
JS 表达式执行（不必自己再转义一遍）。前面那句存在性判断是给「页面正在重载」
这种窗口期兜底的：那一刻 `__bridgeRecv` 可能刚被卸载。
*/
func inject(msg any) string {
	payload, err := json.Marshal(msg)
	if err != nil {
		return ""
	}
	return "window.__bridgeRecv&&window.__bridgeRecv(" + string(payload) + ")"
}
