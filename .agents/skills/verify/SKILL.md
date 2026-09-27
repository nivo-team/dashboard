---
name: verify
description: 本仓库的校验总入口（TypeScript 类型检查、生产构建、浏览器人工验收与验收清单）。默认不执行——只有使用者明确点名「用 verify 校验 / 跑一下验证」时才运行；日常编码、提交与提交前都不要主动跑这些命令。
---

# 校验（verify）

**这是本仓库唯一被授权执行 typecheck / build / 浏览器验收的地方，且默认关闭。**

## 0. 触发条件（严格遵守）

| 场景 | 是否执行 |
| --- | --- |
| 使用者明确点名：如「用 verify 校验」「跑一下验证」「验证这个模块」 | ✅ 执行 |
| 日常编码、改完代码顺手确认、准备提交、提交后 | ❌ 不执行 |

- **不要在「改完代码」后自动跑 `pnpm typecheck` / `pnpm build`**，也不要为了确认渲染效果去开浏览器 —— 这些都很慢，使用者会在需要时点名；
- 写代码时用**阅读与推理**保证正确性（看类型定义、看调用方、看生成产物），而不是靠反复跑校验；
- 需要校验却没被点名时，最多提醒一句「这次没跑校验，需要的话点名 verify」。

## 1. 环境前提（踩过的坑）

**必须用系统 node，不要用工具链内置的 node。**

```bash
export PATH="/opt/homebrew/bin:$PATH"   # 系统 node（v26 一线），pnpm 也从这里取
```

- 若 `node -v` 指向的是某个内置 runtime 的 node（如 `/Users/****/.dsh/...`），`pnpm build` / `pnpm dev` 会报
  `Cannot find module '@rolldown/binding-darwin-universal'`、`code signature ... different Team IDs`
  —— 这是 **node 与 rolldown 原生 binding 签名不匹配**，与项目代码无关，换系统 node 即可；
- 这几个命令的输出都**不会**因为换了 node 而变化，无需在两个 node 下各跑一遍。

## 2. 类型检查

```bash
pnpm typecheck        # tsc --noEmit，无输出即通过
```

关注点：`useSchemaColumns<TData>` 的行类型必须是 **type 别名**（`interface` 没有隐式索引签名，会报 TS2344）；
生成的 mutation 工厂必须带 `Mutation` 后缀。

## 3. 生产构建

```bash
pnpm build            # 正常约 1.5s，输出到 apps/web/dist（已在 .gitignore）
```

构建成功后会顺带生成 `apps/web/src/routeTree.gen.ts`（`pnpm dev` 同样会触发）—— 若路由有新增/删除，
确认该文件被一起提交，不要手改它。

## 4. 浏览器验收

```bash
pnpm dev              # 后台 job，默认 http://localhost:3000
```

headless 截图（无登录态的页面，如登录页）：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --disable-gpu \
  --user-data-dir=/tmp/verify-profile --hide-scrollbars \
  --screenshot=/tmp/verify/shot.png --window-size=1440,900 \
  http://localhost:3000/
```

- headless 是**全新 profile**，没有登录态；业务页面必须先用真实测试账号登录
  （要账号就向使用者要，不要伪造 token），或者请使用者自己在已登录的浏览器里确认；
- 无法自动化的交互（悬浮、吸顶、下拉、弹窗、拖拽）请使用者在真实浏览器里点，不要靠猜；
- 验收完把 dev server 关掉（它占用 3000 端口）。

## 5. 验收清单

### 通用

- [ ] `pnpm typecheck` 与 `pnpm build` 均通过
- [ ] 页面无控制台报错；loading / error / 空态三种状态都能出现且可读
- [ ] 切换 `ar-SA`：整体 RTL（`dir="rtl"`）、表格列对齐、图标与间距镜像
- [ ] 窄屏（< 640px）不横向溢出，动作区按断点换行
- [ ] **登出必定离开**：顶栏 `UserMenu` →「退出登录」，在 `/logout` 返回成功后**一定落在 `/login`**（不能出现「请求成功却停在页面内」）；浏览器后退回不到已登出的页面（`logout()` 内的 `location.replace`）
- [ ] 进入 `/profile` 与 `/profile/settings`：侧边栏换成个人资料二级导航（品牌 Header 保留 + 「← 个人资料」模块行 + 「个人资料 / 设置」菜单），搜索按钮与 ⌘K 都能打开命令面板
- [ ] 危险确认弹窗（`DangerConfirmDialog`）：文本匹配后**输入框内回车**与点击确认按钮**都能**触发删除（各只触发一次，不重复提交）；文本不匹配时两者都无效
- [ ] ⌘K 命令面板：文案随语言切换（placeholder / 分组标题 / 空态 / 页脚主题名）；列表项**只有标题、没有第二行描述**；「操作」组的三项与 `UserMenu` →「外观」文案一致；面板里的页面项与侧边栏来自同一份 `navigation.ts` 配置（改导航项两处同时变）

### 表格（详见 `table-development` skill）

- [ ] 每个可见列只呈现一项数据；数组字段为悬浮卡片；嵌套字段已展开
- [ ] 列 id 与后端字段名一致（点击排序后请求的 `field` 参数正确）
- [ ] 默认展示全部字段（`DEFAULT_HIDDEN_COLUMNS` 为空），且能在「显示选项」里按需收起 / 恢复（下拉限高 500px 可滚动）
- [ ] ID 列在第一列
- [ ] 7 种语言的 `columns.*` 齐全（缺哪个语言会回落中文兜底）
- [ ] 操作列吸「行尾」（LTR 靠右 / RTL 靠左），外侧渐变遮罩与吸边同侧
- [ ] （树表）`features` 用的是 `treeTableFeatures`；展开/折叠可用；搜索命中深层节点时层级完整且自动展开
- [ ] （树表）子行强调线铺满整行且两端**是直角**（容器圆角会把它裁圆，见 `table-development` 的第 4 节）
- [ ] （features 树表）行内「删除」：有子项的节点只 toast 提示「请先删除子项」（不弹窗），无子项才弹「输入名称」确认；删除成功后整棵树刷新且**停留在当前页**（不是回到上一级）

### 数据字典 / 字典文案（见 `.agents/docs/dict-i18n.md`）

- [ ] 分类列表与详情两段式下钻正常，面包屑可逐级点回，删除拦截（有子分类 / 有字典项）都生效
- [ ] 字典项的新增 / 编辑 / 删除弹窗校验与提交正确，写操作后列表刷新
- [ ] 字典文案：切换语言后枚举值文案跟着变；缺文件的语种回落到 `zh-CN`；未收录项回落 `label`

### 语言包（`/config/lang`）

- [ ] 动态语言列随数据变化，默认只展开常用语言，其余可展开
- [ ] 编辑弹窗能写入指定语言，写后列表刷新；key 允许小数点层级

## 6. 报告格式

给使用者的结论按三段写，不要贴大段日志：

1. **跑了什么**：命令 + 结果（通过 / 失败 + 关键行）；
2. **发现了什么**：问题清单，每条给出复现路径与影响面；
3. **没验的部分**：明确列出没能覆盖的（如需要账号、需要动效），不要含糊带过。
