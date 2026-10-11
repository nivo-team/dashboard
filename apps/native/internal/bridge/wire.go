package bridge

import "encoding/json"

/*
线上协议 —— 只有三种消息，刻意保持最小，谁都能一眼看完：

	web → go   {"id":"c1","call":"core.info","payload":{…}}   请求
	go  → web  {"id":"c1","ok":true,"data":{…}}               应答
	go  → web  {"event":"shell:ready","data":{…}}             事件（单向）

`id` 由页面生成，同一页面内唯一即可 —— 壳只负责原样回填，不关心它的形态。
`payload` / `data` 是任意 JSON：壳不解释业务语义，方法名与结构由注册方约定。
*/

// Request 是页面发来的一次调用。
type Request struct {
	ID      string          `json:"id"`
	Call    string          `json:"call"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Response 是一次调用的应答。失败时 `ok=false` 且只带 `error` 文案。
type Response struct {
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	Data  any    `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
}

// Event 是壳单方面推给页面的消息。
type Event struct {
	Event string `json:"event"`
	Data  any    `json:"data,omitempty"`
}

/*
ReadyCall 是页面 bridge 装好后发的第一条消息：没有副作用，只表示「页面能收消息了」。

存在的理由：壳经常在页面 ready 之前就有话要说（例如启动参数、窗口状态）。
没有它就只能在 Go 侧 sleep 或让页面轮询；有了它，壳可以放心 `Emit`，
排队的事件会在这一刻按顺序冲出去。
*/
const ReadyCall = "__ready"
