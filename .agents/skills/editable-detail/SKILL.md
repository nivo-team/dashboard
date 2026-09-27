---
name: editable-detail
description: 本仓库「可编辑详情页」的统一交互规范：详情页内嵌表单 + 底部「未保存更改」浮条 + 页头状态开关 + 草稿 / 重置 / 切换重置。新增或修改详情页里的可编辑表单、状态开关、保存浮条时使用；参考实现是 features 功能详情与数据字典分类详情。
---

# 可编辑详情页（Editable detail）

适用：**在详情页里直接编辑一个实体**（不是列表页弹窗）。
列表页弹窗只负责「**新建**」（以及树结构的「新增子项」），实体的**修改一律进详情页**。

参考实现（两份都读一遍再动手）：

- `src/routes/$appId/system/features/-components/feature-detail.tsx` + `feature-form.tsx`
- `src/routes/$appId/system/data-dict/$typeId.tsx` + `-components/dict-type-form.tsx`

## 1. 交互契约（8 条，缺一不可）

1. 表单**内嵌在详情页左列第一块**（不是弹窗），标题用 `LayerCard.Secondary`（如「基本信息」）；
2. 表单**不渲染保存 / 取消按钮**（`showActions={false}`），动作交给底部浮条；
3. 任何字段变化都上报草稿；**草稿与初始值不同** → 底部浮条出现（「有未保存的更改」+ 重置 / 保存）；
4. 状态开关**放页头**右侧（`showStatusSwitch={false}` + 受控 `status`），随表单一起提交；
5. **保存前必须跑一遍与表单相同的校验**：浮条保存**不经过 `<form>` 的 submit**，不补这一步就会绕过前端校验（清空必填项也能提交，只能等后端报错）；
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

- **字段与校验只有这一份**：弹窗 `XxxFormDialog` 只留外壳（`formId` + `LayerDialog.Actions.Primary form={formId}`），详情页直接内嵌同一组件；
- **校验必须导出成 `validateXxxForm(values, t)`**（返回 `{ field, message } | null`），供**表单的 `handleSubmit` 与详情页浮条**共同调用：

  ```tsx
  export type XxxFormFieldError = { field: 'name' | 'code'; message: string }
  export function validateXxxForm(values: XxxFormValues, t: TFunction): XxxFormFieldError | null
  ```

  表单里把错误按 `field` 落到对应字段的 `error` 上（就地提示），浮条里把同一条 `message` 交给 `errorMessage`；
- `autoFocus` 只在弹窗形态生效（`autoFocus={formId !== undefined}`），详情页不抢焦点；
- 字段控件写法遵循仓库约定：`label` / `error` 交给 Kumo `Input`，说明放 `labelTooltip`，开关文案随状态（见 AGENTS.md 第 5 节）。

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

### 2.3 布局

- 左列（`lg:col-span-2`）：**基本信息表单 → 该实体的子列表（子分类 / 权限…）**，自上而下 `flex flex-col gap-4`；
- 右列：只读信息卡片，`lg:sticky lg:top-20` + `self-start`（缺 `self-start` 会被 grid 拉伸而吸顶失效）；
- 移动端用 `order-1` / `order-2` 把只读卡片提到表单**之前**（先看信息再改），桌面用 `lg:order-*` 还原；
- **右列卡片不要重复表单里的字段**（状态、排序、备注已在表单里），只放不可编辑的信息（上级 / 完整编码 / id / 时间）。

## 3. 接入清单

- [ ] 抽出 `XxxForm`：`initialValues` / `onValuesChange` / `onSubmit` / `showStatusSwitch` / `status` / `onStatusChange` / `submitError` / `formId`
- [ ] 导出 `validateXxxForm`，并让**表单 `handleSubmit` 与浮条 `handleSaveDraft` 都调用它**
- [ ] `XxxFormDialog` 只留弹窗外壳，字段与校验复用 `XxxForm`
- [ ] 详情页四件套：`status` / `draft` / `resetSeq` / `formError` + `normalizeDraft` + `isDirty` + 切换重置 effect
- [ ] 页头 `actions` 只放状态开关
- [ ] 挂 `<UnsavedChangesBar>`
- [ ] 列表页行内「编辑」= **导航进详情页**（不要弹窗编辑）；弹窗只保留新建 / 新增子项
- [ ] 检查 `normalizeDraft` 覆盖了全部会被编辑的字段（见坑 2）

## 4. 常见坑

1. **浮条保存绕过校验**（**最高优先级，已经踩过一次**）：浮条保存直接用草稿提交，不经过 `<form>` 的 `onSubmit`，于是「清空必填项 → 点保存」会直接发请求。
   - 判据：详情页的 `handleSaveDraft` 里是否调用了与表单同一个 `validateXxxForm`；
   - 两个参考实现都曾漏掉这一步（2026-09 已修），第三个模块接入时最容易照抄到旧写法。
2. **`normalizeDraft` 漏字段**：加字段却忘了同步它 → 改该字段时浮条不出现（或一直显示）。
   - 低成本改法：`normalizeDraft` 紧贴 `XxxFormValues` 定义写，字段名列表用 `const FORM_FIELDS = [...] as const` 一处维护，两边都从它派生；
   - 彻底改法：让**表单上报规范化后的字符串**（内部 `JSON.stringify`），页面只比较字符串，页面侧不再需要 `normalizeDraft`。
3. **`onValuesChange` 引用必须稳定**：页面用 `useCallback(fn, [])`。否则表单的 `useEffect` 每轮渲染都上报 → 反复 `setState`。
4. **切换实体要重置**：effect 依赖写成 `[entity?.id, entity?.status]`。只依赖 `id` 时，后端刷新（invalidate 后 refetch）会留着旧草稿与旧开关。
5. **开关只能有一个真值来源**：`status` 传进表单（`status={status}`）+ `showStatusSwitch={false}`，不要再让表单内部维护一份。
6. **提交要显式回传父级 id**（如 `parent_id`）：后端收到缺失的上级会把实体当成根层级搬走。
7. **详情页不放「删除」「新增子项」**：高危动作与树维护动作留在列表页的行内菜单（详见 table-development 与本模块文档）；详情页只编辑自身。
8. **弹窗与详情页共用表单时不要传动作开关冲突**：弹窗靠 `formId` 提交，详情页靠浮条；两条路径都不要在表单内再放按钮。

## 5. 与其它规范的分工

| 内容 | 去处 |
| --- | --- |
| 列表页 / 表格 / 列编排 / 筛选 | skill `table-development` |
| 可编辑详情页（本文件） | skill `editable-detail` |
| 表单控件写法、Kumo 组件禁忌、危险确认弹窗 | `AGENTS.md` 第 5 节 |
| 各模块的字段语义、接口映射、临时值 | `docs/<module>-module.md` |

## 6. 现状与演化（2026-09）

**实现一致性**：features 与 data-dict 两处接线逐行同构（4 个 state + `normalizeDraft` + `isDirty` + 切换重置 effect + 浮条 + 页头开关），差异只在字段与文案 —— 契约已经稳定，第三个模块可以照抄。

**已收敛的点**（2026-09 审计）：

- 校验抽成 `validateFeatureForm` / `validateDictTypeForm`，被「表单 submit」与「浮条保存」两条路径共用；
  这是审计时发现的真实缺陷 —— 两处浮条保存都曾**绕过前端校验**（清空必填项也能提交）；
- 弹窗与详情页共用同一个表单组件，字段与校验只有一份。

**仍然重复的部分**：每个模块约 30–40 行样板（草稿四件套 + dirty + 重置 + 浮条接线），**第二次重复已经出现**，第三个模块接入前建议先抽公共层：

```tsx
// 建议新增（#/lib/use-detail-draft 或 #/components/editable-detail）
const { draft, isDirty, resetSeq, handleValuesChange, resetDraft, clearDraft } =
  useDetailDraft({ initialValues, normalize: normalizeDraft, resetKey: entity?.id, onResetExtra: () => setStatus(...) })
```

抽完每个模块只剩「字段定义 + 校验 + 提交请求」三件真正业务的事。

**风险清单**（按发生概率）：

1. `normalizeDraft` 与表单字段不同步（无类型保护，最容易漏）；
2. 新模块照抄旧代码，把「浮条保存不校验」的老写法一起抄走（见坑 1）；
3. `onValuesChange` 未包 `useCallback` → 渲染抖动；
4. 切换实体只依赖 `id`，漏了 `status` 等外部受控值；
5. 保存成功后忘记 `setDraft(null)`，浮条不收起。

**不要做的事**：不要为了「统一」去抽象表单本体 —— 字段、校验、布局差异很大（features 有 `variant` 三态，data-dict 只有状态开关差异），共享的是**交互契约**而不是表单实现。
