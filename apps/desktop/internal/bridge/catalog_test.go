package bridge

import (
	"encoding/json"
	"regexp"
	"testing"
)

/*
catalog_test.go 是方法目录的护栏：它是页面侧生成物的唯一真值（见 catalog.go），
形状错了就会把错的东西生成进 `apps/web/src/desktop/generated/bridge.gen.ts`。
*/

var (
	methodNamePattern = regexp.MustCompile(`^[a-z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$`)
	eventNamePattern  = regexp.MustCompile(`^[a-z][a-zA-Z0-9]*:[a-zA-Z][a-zA-Z0-9]*$`)
)

func TestMethodsAreValid(t *testing.T) {
	if len(Methods) == 0 {
		t.Fatal("方法目录为空")
	}

	seen := map[string]bool{}
	for _, method := range Methods {
		if !methodNamePattern.MatchString(method.Name) {
			t.Errorf("方法名 %q 不符合 `<域>.<动作>` 约定", method.Name)
		}
		if seen[method.Name] {
			t.Errorf("方法名重复：%s", method.Name)
		}
		seen[method.Name] = true

		if method.Summary == "" {
			t.Errorf("方法 %s 缺少说明，生成物里会是一段空注释", method.Name)
		}
		if method.Payload == "" || method.Result == "" {
			t.Errorf("方法 %s 的 Payload / Result 不能为空（无载荷/无结果写 \"void\"）", method.Name)
		}
		if _, ok := methodSet[method.Name]; !ok {
			t.Errorf("方法 %s 没进 methodSet（检查 init 是否漏跑）", method.Name)
		}
	}
}

func TestEventsAreValid(t *testing.T) {
	if len(Events) == 0 {
		t.Fatal("事件目录为空")
	}

	seen := map[string]bool{}
	for _, event := range Events {
		if !eventNamePattern.MatchString(event.Name) {
			t.Errorf("事件名 %q 不符合 `<域>:<动作>` 约定", event.Name)
		}
		if seen[event.Name] {
			t.Errorf("事件名重复：%s", event.Name)
		}
		seen[event.Name] = true

		if event.Summary == "" {
			t.Errorf("事件 %s 缺少说明", event.Name)
		}
		if event.Payload == "" {
			t.Errorf("事件 %s 的 Payload 不能为空", event.Name)
		}
	}
}

// 目录里的每个方法名都必须是 `Handle` 认得的 —— 否则注册时会打「不在目录里」的日志。
func TestHandledNamesAreInCatalog(t *testing.T) {
	registry := New()
	for _, method := range Methods {
		registry.Handle(method.Name, func(json.RawMessage) (any, error) { return nil, nil })
	}
	if got, want := len(registry.Methods()), len(Methods); got != want {
		t.Fatalf("注册后方法数 %d，目录里 %d", got, want)
	}
}
