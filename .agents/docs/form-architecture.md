# 表单架构与人机协同规范（Form Architecture & AI Co-working）

> 适用范围：所有后台新增、编辑与查看类表单组件、独立表单路由（`new.tsx` / `edit.tsx`）以及 AI 表单自动化填报交互。
> 核心原则：**表单组件单一真值、独立路由极薄化、打开状态由 URL 驱动、支持弹窗/分屏/整页三态自适应、AI 表单桥双向闭环。**

---

## 1. 核心架构与设计哲学

传统后台常为弹窗写一套 Form、为分屏写一套 Form、为独立页面又写一套 Form，导致字段验证与业务逻辑三处分叉，且 AI 无法在未挂载时感知表单，更无法跨形态操作。

本项目确立统一的表单分层架构：

```
                           ┌───────────────────────────────────────────────┐
                           │            统一业务表单 (XxxFormView)          │
                           │   - 字段受控 State 与校验规则单一真值          │
                           │   - 原生注册 useAiFormFields + Submit        │
                           └──────────────────────┬────────────────────────┘
                                                  │ 注入 variant 形态
         ┌────────────────────────────────────────┼────────────────────────────────────────┐
         ▼                                        ▼                                        ▼
 【独立路由整页 (page)】                   【右侧并排分屏 (split)】                 【浮层弹窗/抽屉 (dialog)】
  - 路由文件极薄 (<30 行)                 - 与列表页同屏并排协同                   - 轻量居中弹窗或右侧抽屉
  - 独立 URL (routes/.../new.tsx)         - URL Query 同步 (?form=create)          - URL Query 同步 (?form=create)
  - 带面包屑页头与底部大保存浮条           - 紧凑布局，各自独立滚动                 - 聚焦式操作，支持 Esc 快捷关闭
```

---

## 2. 四项强制规范

### 2.1 规范一：表单组件单一真值（Single Component Rule）
- 任何实体对象的表单视图**全局只编写一个组件**（例如 `UserFormView`），存放于对应路由模块的 `-components/` 目录下；
- 严禁复制出平行的 DialogForm 或 DrawerForm；
- **组件内部纯粹只有表单**：标题（title）与描述（description）一律由承载它的当前外壳/布局统一渲染，表单组件内部绝不内嵌多余的 Header：
  - `page` 独立页面：由路由文件使用 `PageHeader` 统一渲染；
  - `split` 分屏协同：由分屏容器外壳自带的 Header 渲染；
  - `dialog` 模态弹窗：由 `LayerDialog.Title` 与 `LayerDialog.Description` 渲染；
- 模块导出标准化的元数据函数（如 `getXxxFormMetadata(mode, t)`），保证各外壳展示的标题与描述完全一致；
- 组件必须接受统一的 `FormViewProps` 契约：
  ```ts
  export interface FormViewProps<TData = any> {
    /** 渲染形态：决定外壳布局与操作按钮排版 */
    variant?: 'page' | 'split' | 'dialog'
    /** 编辑态初始数据；新建态为 null/undefined */
    initialData?: TData | null
    /** 成功回调（通知外壳刷新列表或执行导航） */
    onSuccess?: () => void
    /** 取消/关闭回调（通知外壳关闭弹窗、关闭分屏或后退） */
    onClose?: () => void
  }
  ```

### 2.2 规范二：原生注册 AI 表单桥（AI Form Bridge）
表单组件挂载时，必须在组件内部通过 `useAiFormFields` 与 `useAiFormSubmit` 注册自己：
1. **字段清单**：暴露真实字段名、中文 Label、字段控件类型（`text` / `number` / `select` / `switch` 等）；
2. **读写闭包**：提供 `getValues` 与 `setValues`，AI 写入时只放行表单声明过的白名单字段；
3. **提交闭包**：提供 `submit` 与 `canSubmit`，当字段校验不通过或正在提交时如实反馈给 AI。

### 2.3 规范三：极薄路由规范（Thin Route File）
- 独立新建路由（`new.tsx`）与编辑路由（`$id.edit.tsx`）代码量必须极小（通常不超过 30 行）；
- 路由组件**不包含表单 UI 与校验逻辑**，仅负责提取路由参数（`appId`, `id`），并渲染：
  ```tsx
  export function NewUserPage() {
    const navigate = useNavigate()
    const { appId } = Route.useParams()
    return (
      <UserFormView
        variant="page"
        onClose={() => navigate({ to: '/$appId/example/user', params: { appId } })}
        onSuccess={() => navigate({ to: '/$appId/example/user', params: { appId } })}
      />
    )
  }
  ```

### 2.4 规范四：表单打开状态进入 URL（URL-Driven Form State）
- 在列表页同页面打开表单时，开启状态与关键 ID 必须同步至 URL Query（通过 `nuqs` 映射）：
  - 新建状态：`?form=create`
  - 编辑状态：`?form=edit&editId=10001`
- 配合 `clearOnDefault: true`：关闭表单时对应参数自动从 URL 中清除；
- **核心收益**：
  - 用户刷新页面、浏览器前进/后退、分享链接均能精准保持表单打开状态；
  - AI 可通过 URL 状态或 `open_form` 工具直接唤起表单。

---

## 3. 打开形态偏好（Form Open Preference）

在用户偏好中提供 `formOpenMode` 配置（`admin.preferences:<appId>`）：

| `formOpenMode` | 形态 | 布局行为 | 适用场景 |
| --- | --- | --- | --- |
| `dialog` | **弹窗/抽屉**（默认） | 在列表页中以 LayerDialog 弹出，背景毛玻璃 | 快速新建、轻量编辑 |
| `split` | **分屏协同** | 列表挤压到左侧 2/3，表单固定在右侧 1/3 并列展开 | 边对照列表边创建/编辑 |
| `page` | **独立页面** | 点击新建/编辑直接导航至独立路由页面（如 `new.tsx`） | 复杂字段沉浸式录入 |

> **移动端降级保护**：当视口宽度小于 768px 时，无论配置为何档位，一律自动降级为 `page` 跳转，避免移动端分屏或弹窗挤压不可用。

---

## 4. 人机协同（AI 自动填表闭环）

AI 填报操作由四个原子工具串联完成：

```
       ┌──────────────────────┐
       │   用户自然语言指令    │
       └──────────┬───────────┘
                  ▼
       ┌──────────────────────┐
 1.    │      open_form       │  AI 呼出目标表单（更新 URL / 唤起弹窗或分屏）
       └──────────┬───────────┘
                  ▼
       ┌──────────────────────┐
 2.    │   list_page_forms    │  AI 读取当前挂载表单的字段结构与现存值
       └──────────┬───────────┘
                  ▼
       ┌──────────────────────┐
 3.    │      fill_form       │  AI 将提取出的键值写入受控表单，前端界面实时回显
       └──────────┬───────────┘
                  ▼
       ┌──────────────────────┐
 4.    │     submit_form      │  请求用户确认卡片，确认后触发表单验证并提交入库
       └──────────────────────┘
```

1. **`open_form`**：接收 `action: 'create' | 'edit'`、可选 `id` 与可选 `values`（一步完成打开与预填），使 AI 在表单未打开时具备主动唤起与填报能力；
2. **`list_page_forms`**：从表单桥读取当前活跃表单信息，杜绝 AI 凭空臆测字段名；
3. **`fill_form`**：通过 `setValues` 闭包安全更新组件 State，受白名单保护；
4. **`submit_form`**：触发组件的保存链路。审批由 `lib/ai/approval-policy.ts` 的策略表决定 —— `ask` 下弹卡、**`auto` 下免问**（由表单自己的 `canSubmit()` 把关）。表单显式写 `requireApproval: true` 才会在两个模式下都强制确认。

---

## 5. 页面能力 JSON 规格声明与集中权限过滤（遵循铁律 4）

页面除了渲染表格、表单，最重要的职责是**以标准化 JSON 结构向 AI 声明它具备的全部能力**。

### 5.1 JSON 规格结构 (`PageCapabilitiesSpec`)
通过 `definePageCapabilities` 在模块顶层静态声明：
- `routeId`: 路由模板
- `title` / `description` / `entities`: 页面业务综述与核心概念
- `forms`: 页面可操作的表单清单（含 `id`、`action`、`permission` 权限点、`fields` 字段规格定义）
- `actions`: 页面可触发的交互动作（含批量删除、导出、操作区等，支持 `permission`）
- `endpoints`: 页面调用的接口与用途

### 5.2 全局集中过滤点 (`filterPageCapabilities`)
所有给模型消费的上下文（系统提示词、`get_page_context`、表单工具、页面清单）**统一流经 `filterPageCapabilities(spec, authContext)` 这一处函数**：
- 严格遵循 `AGENTS.md` 铁律 4：当未来对接权限体系时，当前用户未获得的权限（如无 `table-example:edit`），其对应的表单、操作按钮与接口将**在此处直接被就地裁剪**；
- AI 永远只能感知当前用户实际拥有的合法能力，从根本上杜绝越权猜测与非法调用。
