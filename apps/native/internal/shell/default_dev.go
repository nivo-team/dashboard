//go:build !release && !production

package shell

/*
开发构建（默认，`pnpm desktop` / `go run .`）的默认地址：本机前端 dev server。

与 `default_release.go` 是**一对**：同一时刻只有一个参与编译，
所以「本地开发连 localhost、发布产物连线上」这件事不需要任何人记着手写 `-ldflags`。
`-url` / `DESKTOP_URL` 仍然优先于它。
*/
const defaultURL = "http://localhost:3000"

// releaseBuild 只用于启动时自检（占位地址告警）。
const releaseBuild = false
