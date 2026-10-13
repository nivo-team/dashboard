---
name: business-development-editable-detail
description: 可编辑详情页的统一交互规范（详情内嵌表单 + 底部「未保存更改」浮条 + 页头状态开关 + 草稿/重置/切换重置）。新增或修改详情页里的可编辑表单、状态开关、保存浮条时由 business-development 按需加载。
---

# 可编辑详情页（references/editable-detail）

> 本文件是 [business-development](../SKILL.md) 的引用页。

适用：**在详情页里直接编辑一个实体**（不是列表页弹窗）。
列表页弹窗只负责「**新建**」（以及树结构的「新增子项」），实体的**修改一律进详情页**。

参考实现（挑一份读透再动手）：

- `src/features/roles/detail/index.tsx` + `../role-form.tsx`
  （角色详情；同一个浮条里还提交「菜单授权」这类关联资源 —— 最完整的一份）
- `src/features/data-dict/detail/index.tsx` + `../dict-type-form.tsx`（数据字典分类详情）
- `src/features/menus/feature-detail.tsx` + `feature-form.tsx`（菜单节点详情）

三份都遵循同一契约；差异只在字段、校验与提交的接口。

## 1. 交互契约（8 条，缺一不可）

1. 表单**内嵌在详情页左列第一块**（不是弹窗），标题用 `LayerCard.Secondary`（如「基本信息」）；
2. 表单**不渲染保存 / 取消按钮**（`showActions={false}`），动作交给底部浮条；
3. 任何字段变化都上报草稿；**草稿与初始值不同** → 底部浮条出现（「有未保存的更改」+ 重置 / 保存）；
4. 状态开关**放页头**右侧（`showStatusSwitch={false}` + 受控 `status`），随表单一起提交；
5. **保存前必须跑一遍与表单相同的校验**：浮条保存**不经过 `<form>` 的 submit**，
   不补这一步就会绕过前端校验（清空必填项也能提交，只能等后端报错）；
6. 保存成功 → 清空草稿（浮条收起）+ 成功 toast + 失效相关缓存；
7. 重置 → 清空草稿 + 恢复页头开关 + 重建表单；
8. 切换实体（同路由不同 id）或后端数据刷新 → 重置全部本地编辑态。

## 2. 骨架

### 2.1 表单组件（**弹窗与详情页共用一份**）

```tsx
export interface XxxFormProps {
  /** 弹窗形态传（LayerDialog.Actions.Primary form={formId} 关联提交）；详情页不传 */
  formId?: string
  /** 初始值：接口返回的 number 字段在组件内归一化，调用方不用转类型 */
  initialValues?: Partial<XxxFormValues> | XxxEntity
  submitError?: string | null
  /** 详情页传 false：开关在页头 */
  showStatusSwitch?: boolean
  status?: XxxFormValues['status']
  onStatusChange?: (next: XxxFormValues['status']) => void
  /** 草稿上报：详情页据此判断「未保存更改」 */
  onValuesChange?: (values: XxxFormValues) => void
  onSubmit: (values: XxxFormValues) => void
}
```

要点：

- **`onValuesChange` 用 `useEffect` 上报**，依赖数组列全所有字段 + 回调本身：

  ```tsx
  const buildValues = useCallback((): XxxFormValues => ({ /* 来自各字段 state */ }), [/* 各字段 */])

  useEffect(() => {
    onValuesChange?.(buildValues())
  }, [buildValues, onValuesChange])
  ```

- **字段与校验只有这一份**：弹窗 `XxxFormDialog` 只留外壳（`formId` + `LayerDialog.Actions.Primary form={formId}`），
  详情页直接内嵌同一组件；
- **校验必须导出成 `validateXxxForm(values, t)`**（返回 `{ field, message } | null`），
  供**表单的 `handleSubmit` 与详情页浮条**共同调用：

  ```tsx
  export type XxxFormFieldError = { field: 'name' | 'code'; message: string }
  export function validateXxxForm(values: XxxFormValues, t: TFunction): XxxFormFieldError | null
  ```

  表单里把错误按 `field` 落到对应字段的 `error` 上（就地提示），浮条里把同一条 `message`
  交给 `errorMessage`；
- `autoFocus` 只在弹窗形态生效（`autoFocus={formId !== undefined}`），详情页不抢焦点；
- 字段控件写法遵循仓库约定：`label` / `error` 交给 Kumo `Input`，说明放 `labelTooltip`，
  开关文案随状态（见 `AGENTS.md` 第 5 节的表单控件约定）。

### 2.2 详情页接线（8 段样板）

```tsx
// ① 页头开关（受控）
const [status, setStatus] = useState<XxxFormValues['status']>(DEFAULT_STATUS)
// ② 草稿 ③ 重建序号 ④ 提交错误
const [draft, setDraft] = useState<XxxFormValues | null>(null)
const [resetSeq, setResetSeq] = useState(0)
const [formError, setFormError] = useState<string | null>(null)

// ⑤ 初始值（同时用于 dirty 比较）
const initialValues = useMemo<Partial<XxxFormValues>>(() => ({ /* 来自 entity */ }), [entity])

const isDirty = draft !== null && normalizeDraft(draft) !== normalizeDraft(initialValues)

// ⑥ 切换实体 / 后端刷新 → 重置本地编辑态
useEffect(() => {
  if (entity) setStatus(toStatus(entity.status))
  setDraft(null)
  setResetSeq(0)
  setFormError(null)
}, [entity?.id, entity?.status])

const handleValuesChange = useCallback((values: XxxFormValues) => setDraft(values), [])

// ⑦ 浮条的动作：保存**先校验**再提交，重置清空 + 重建
const handleSaveDraft = useCallback(() => {
  if (!draft) return
  // 浮条保存不经过 <form> 的 submit，校验要在这里补一次
  const invalid = validateXxxForm(draft, t)
  if (invalid) {
    setFormError(invalid.message)
    return
  }
  setFormError(null)
  void handleSubmit(draft)
}, [draft, handleSubmit, t])
const handleResetDraft = useCallback(() => {
  setDraft(null)
  if (entity) setStatus(toStatus(entity.status))
  setResetSeq((seq) => seq + 1)
  setFormError(null)
}, [entity])
```

```tsx
// ⑧ 渲染
<PageHeader title={entity.name} actions={<Switch checked={...} onCheckedChange={...} label={启用/禁用} />} />

<LayerCard className="p-0">
  <LayerCard.Secondary>基本信息</LayerCard.Secondary>
  <LayerCard.Primary className="p-4">
    <XxxForm
      key={`${entity.id}-${resetSeq}`}   {/* 重置 = 换 key 重建，回到初始值 */}
      initialValues={initialValues}
      showStatusSwitch={false}
      status={status}
      onStatusChange={setStatus}
      onValuesChange={handleValuesChange}
      submitError={formError}
      onSubmit={(values) => { void handleSubmit(values) }}
    />
  </LayerCard.Primary>
</LayerCard>

<UnsavedChangesBar
  open={isDirty}
  saving={mutation.isPending}
  errorMessage={formError}
  onReset={handleResetDraft}
  onSave={handleSaveDraft}
/>
```

保存成功后**务必** `setDraft(null)`，否则浮条不会收起。

### 2.3 容器外壳：`pageDetailWrapper="none"`

详情页自带 `PageHeader` 与状态开关，因此交给 `CrudViewport` 时要声明**不要**再包一层标准外壳：

```tsx
<CrudViewport crud={crud} pageDetailWrapper="none" renderDetail={(ctx) => <XxxDetail id={ctx.id} />}>
  {/* 列表内容 */}
</CrudViewport>
```

`pageDetailWrapper` 的语义（`#/components/crud` 的 `CrudViewportProps`）：
`'default'`（默认）由标准 `CrudViewContainer` 包裹（带 `PageHeader` + 返回按钮）；
`'none'` 直接渲染 `renderDetail` 的返回内容。角色管理用的就是这个 `'none'`。
`pageFormWrapper` 同理，用于「整页表单自带布局」的场合。

### 2.4 布局

- 左列（`lg:col-span-2`）：**基本信息表单 → 该实体的子列表（子分类 / 权限…）**，
  自上而下 `flex flex-col gap-4`；
- 右列：只读信息卡片，`lg:sticky lg:top-20` + `self-start`（缺 `self-start` 会被 grid 拉伸而吸顶失效）；
- 移动端用 `order-1` / `order-2` 把只读卡片提到表单**之前**（先看信息再改），桌面用 `lg:order-*` 还原；
- **右列卡片不要重复表单里的字段**（状态、排序、备注已在表单里），只放不可编辑的信息
  （上级 / 完整编码 / id / 时间）。

## 3. 接入清单

- [ ] 抽出 `XxxForm`：`initialValues` / `onValuesChange` / `onSubmit` / `showStatusSwitch` /
      `status` / `onStatusChange` / `submitError` / `formId`
- [ ] 导出 `validateXxxForm`，并让**表单 `handleSubmit` 与浮条 `handleSaveDraft` 都调用它**
- [ ] `XxxFormDialog` 只留弹窗外壳，字段与校验复用 `XxxForm`
- [ ] 详情页四件套：`status` / `draft` / `resetSeq` / `formError` + `normalizeDraft` + `isDirty` + 切换重置 effect
- [ ] 页头 `actions` 只放状态开关
- [ ] 挂 `<UnsavedChangesBar>`，保存成功后 `setDraft(null)`
- [ ] `CrudViewport` 传 `pageDetailWrapper="none"`
- [ ] 列表页行内「编辑」= **导航进详情页**（不要弹窗编辑）；弹窗只保留新建 / 新增子项
- [ ] 检查 `normalizeDraft` 覆盖了全部会被编辑的字段（见坑 2）

## 4. 常见坑

1. **浮条保存绕过校验**（**最高优先级，已经踩过一次**）：浮条保存直接用草稿提交，不经过
   `<form>` 的 `onSubmit`，于是「清空必填项 → 点保存」会直接发请求。
   - 判据：详情页的 `handleSaveDraft` 里是否调用了与表单同一个 `validateXxxForm`；
   - 两个参考实现都曾漏掉这一步（2026-09 已修），后接入的模块最容易照抄到旧写法。
2. **`normalizeDraft` 漏字段**：加字段却忘了同步它 → 改该字段时浮条不出现（或一直显示）。
   - 低成本改法：`normalizeDraft` 紧贴 `XxxFormValues` 定义写，字段名列表用
     `const FORM_FIELDS = [...] as const` 一处维护，两边都从它派生；
   - 参考实现用的是「把字段按固定顺序 join('|')」的字符串比较（见 `roles/detail` 的 `normalize`）。
3. **`onValuesChange` 引用必须稳定**：页面用 `useCallback(fn, [])`。否则表单的 `useEffect`
   每轮渲染都上报 → 反复 `setState`。
4. **切换实体要重置**：effect 依赖写成 `[entity?.id, entity?.status]`。只依赖 `id` 时，
   后端刷新（invalidate 后 refetch）会留着旧草稿与旧开关。
5. **开关只能有一个真值来源**：`status` 传进表单（`status={status}`）+ `showStatusSwitch={false}`，
   不要再让表单内部维护一份。
6. **提交要显式回传父级 id**（如 `parent_id`）：后端收到缺失的上级会把实体当成根层级搬走。
7. **详情页不放「删除」「新增子项」**：高危动作与树维护动作留在列表页的行内菜单
   （详见 [table.md](./table.md)）；详情页只编辑自身。
8. **弹窗与详情页共用表单时不要传动作开关冲突**：弹窗靠 `formId` 提交，详情页靠浮条；
   两条路径都不要在表单内再放按钮。
9. **一个浮条可以提交多份关联资源**：角色详情同时提交「基本信息」(`PUT /role`) 与
   「菜单授权」(`PUT /role/menus`)。做法是把两者的改动都算进 `isDirty`（`draft` + 授权 id 集合，
   用 `sameIds` 做顺序无关比较），保存时串行提交。新增这类页面时照抄这个结构。

## 5. 与其它规范的分工

| 内容 | 去处 |
| --- | --- |
| 列表页 / 表格 / 列编排 / 筛选 / CRUD 视窗 | [../SKILL.md](../SKILL.md)、[table.md](./table.md) |
| 可编辑详情页（本文件） | 这里 |
| 表单控件写法、Kumo 组件禁忌、危险确认弹窗 | `AGENTS.md` 第 5 节 · `.agents/skills/platform-development/references/ui-and-styling.md` |
| 表单三态自适应与 AI 表单桥的设计依据 | `.agents/skills/business-development/references/form-architecture.md` |
| 各模块的字段语义、接口映射、临时值 | 本目录下的 `<module>-module.md`（features / data-dict） |
