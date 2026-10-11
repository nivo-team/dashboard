//go:build release || production

package shell

/*
发布构建（`pnpm desktop:build`，即 `-tags release`）**不预置任何地址**。

地址由构建时的环境变量 `DESKTOP_URL` 注入（CI 里就是那个变量），落到 `DefaultURL`。
刻意不给默认值：发布产物不该猜自己要连哪儿 —— 空地址会在启动时直接报错说明怎么补，
而不是安静地打开一个空白窗口。

	DESKTOP_URL=https://admin.example.com pnpm desktop:build

为什么用构建 tag 而不是运行时判断：`go run` 与 `go build` 的产物本身没有可靠区别。
tag 把「开发 / 发布」钉在构建命令里（`desktop:build` 已带 `-tags release`），
地址则只从环境变量来 —— 于是仓库里没有第二份会过期的线上地址。

同时接受 `production` tag：将来若改用 `wails3 build`（它默认带 `-tags production`），
这套行为依然生效。
*/
const defaultURL = ""

// releaseBuild 只用于启动时自检（缺地址时给出更明确的报错）。
const releaseBuild = true
