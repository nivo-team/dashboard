import {
  Button,
  Empty,
  LayerCard,
  Loader,
  Pagination,
  Table,
} from '@cloudflare/kumo'
import {
  CaretDownIcon,
  CaretRightIcon,
  PencilSimpleIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { flexRender } from '@tanstack/react-table'
import { Fragment, type MouseEvent, type ReactNode, useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { cn } from '#/lib/cn'
import { SUPPORTED_LOCALES } from '#/lib/i18n'

/** 统计文案中被 <Trans> 替换的高亮数值样式（覆盖 <b> 的默认字重） */
const COUNT_CLASS = 'font-medium text-kumo-default tabular-nums'
const EMPHASIS_CLASS = 'font-semibold text-kumo-default tabular-nums'

export interface DataTablePaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
}

export interface DataTableProps {
  /** TanStack Table 实例（接管表格全部状态、列模型与行模型） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any
  /** 数据加载中状态 */
  loading?: boolean
  /** 异常信息提示 */
  error?: string | null
  /** 错误重试回调 */
  onRetry?: () => void
  /** 空数据占位标题，缺省时取 i18n 的 table.dataTable.emptyTitle */
  emptyTitle?: string
  /** 空数据占位描述，缺省时取 i18n 的 table.dataTable.emptyDescription */
  emptyDescription?: string
  /** 自定义空数据图标 */
  emptyIcon?: ReactNode

  /** 模块名称，例如 '用户'、'订单' 等，用于组装统计文案（缺省取 i18n 的 table.dataTable.moduleFallback） */
  moduleName?: string
  /**
   * 自定义统计文案（渲染在 LayerCard.Secondary 中）
   * 默认使用 i18n 的 table.dataTable.quota
   */
  quotaText?: ReactNode
  /**
   * 卡片头部左侧标题（传入后**取代**统计文案的默认位置）。
   * 适用于「标题在头部、统计挪到尾部」的简洁表格，见 `footer`。
   */
  headerTitle?: ReactNode
  /**
   * 卡片尾部内容（渲染在表格下方、分页栏上方，与表格同级、不参与横向滚动）。
   * 常用来放统计信息，配合 `headerTitle` 把头部让给标题。
   */
  footer?: ReactNode
  /**
   * 卡片头部右侧的操作区（与统计文案同一行）。
   *
   * 用于「简洁表格」场景：不需要搜索/筛选/列设置，只想要一个「新增 XX」按钮时，
   * 直接把它放在统计信息右侧，比挂一整条 TableControls 更轻。
   * 选中行进入多选态后，多选控制器会另起一行，不会与这里挤在一起。
   */
  headerActions?: ReactNode
  /** 额外状态标记（如演示数据模式提示） */
  extraStatus?: ReactNode

  /**
   * 整行点击回调（传入即开启「行可点」，光标变手型、hover 有底色反馈）。
   *
   * 点击**行内交互元素**（复选框、按钮、链接、下拉菜单、输入控件等）不会触发 ——
   * 组件会在事件冒泡到行之前拦掉，避免「勾选一行 / 点开行内菜单 / 点名称链接」
   * 顺带把详情也打开一次。调用方因此不用再给每列单独做 stopPropagation。
   *
   * 无障碍：整行可点**不会**把行变成可聚焦控件（会破坏 table 语义），
   * 键盘用户请保留行内原有的详情入口（如名称按钮）—— 两者共存时行为一致即可。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRowClick?: (row: any) => void

  /** 批量编辑回调 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBatchEdit?: (selectedRows: any[]) => void
  /** 批量删除回调 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBatchDelete?: (selectedRows: any[]) => void
  /** 自定义右侧额外批量操作按钮 */
  batchActions?: ReactNode

  /** 分页配置（与 Kumo Pagination 桥接） */
  pagination?: DataTablePaginationProps
  /**
   * 是否树形表格：开启后由**第一个可见的数据列**（跳过多选列）承担层级缩进与
   * 展开/折叠控件 —— **不需要指定列 id**：列顺序、列显隐怎么变，展开控件永远在最左边，
   * 不会出现「ID 在第一列、箭头却挂在名称列」这种割裂。
   *
   * 配套要求（TanStack Table v9）：
   * - `useTable` 的 `features` 使用 `#/components/data-table` 的 `treeTableFeatures`
   *   （它注册了 `expandedRowModel`，v9 的行模型工厂必须走 features 槽）；
   * - 传 `getSubRows`（如 `(row) => row.children`）；
   * - 受控 `state.expanded` / `onExpandedChange`，行 id 用业务主键（`getRowId`）。
   *
   * 注意：缩进落在第一列，因此第一列要留够宽度（`meta.headerClassName`，建议 `min-w-[160px]`）。
   */
  tree?: boolean
  /** 每层级缩进像素（默认 16）。 */
  treeIndentSize?: number
  /**
   * 树形子行强调（默认开启，仅在 `tree` 时生效）：
   * - 子行（`depth > 0`）改用 `kumo-elevated` 背景，与根行拉开层次；
   * - 子行在第一列左侧绘制 primary 色（`kumo-brand`）竖线，指示它从属于上方父行。
   */
  treeRowAccent?: boolean
  /** 表格布局：auto（默认，全宽自适应）或 fixed */
  layout?: 'auto' | 'fixed'
  /** 外层容器自定义样式 */
  className?: string
}

/**
 * 基于 TanStack Table 与 @cloudflare/kumo 规范打造的数据表格组件
 * - 外层包裹 LayerCard 组件
 * - LayerCard.Secondary 统一承载左侧统计信息与行多选控制器
 * - 默认 layout="auto" 配合 w-full min-w-full，使首列自然占据所有剩余空间
 * - 支持列 `meta.sticky` 的浮动吸列与渐变遮罩：`'right'` 吸行尾（LTR 靠右、RTL 靠左）、
 *   `'left'` 吸行首，物理 side 由当前书写方向自动解析
 * - LayerCard.Primary 承载 Table 表格内容区与分页
 */
export function DataTable({
  table,
  loading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  moduleName,
  quotaText,
  headerTitle,
  footer,
  headerActions,
  extraStatus,
  onRowClick,
  onBatchEdit,
  onBatchDelete,
  batchActions,
  pagination,
  tree = false,
  treeIndentSize = 16,
  treeRowAccent = true,
  layout = 'auto',
  className = '',
}: DataTableProps) {
  const { t, i18n } = useTranslation()

  /**
   * Kumo 的 `sticky` 只接受物理方向（left / right），而封装层表达的是**逻辑侧**：
   * `sticky: 'right'` = 吸「行尾」（LTR 靠右、RTL 靠左），`'left'` = 吸「行首」。
   *
   * 这里按当前书写方向把它解析成物理侧，再交给 Kumo 生成定位、内侧渐变
   * （`before:-left-6` / `before:-right-6` 与渐变方向）与不透明背景 —— 三者都跟着
   * side 一起翻转，因此不需要另写一份 RTL 覆盖样式（写死 left/right 会漏掉渐变方向）。
   * 语言切换时 `useTranslation` 会触发重渲染，方向随之更新。
   */
  const isRtl =
    SUPPORTED_LOCALES.find((item) => item.key === i18n.language)?.dir === 'rtl'
  const resolveStickySide = (
    side?: 'left' | 'right',
  ): 'left' | 'right' | undefined => {
    if (!side) return undefined
    if (!isRtl) return side
    return side === 'right' ? 'left' : 'right'
  }

  const resolvedEmptyTitle = emptyTitle ?? t('table.dataTable.emptyTitle', '暂无数据')
  const resolvedEmptyDescription =
    emptyDescription ?? t('table.dataTable.emptyDescription', '未找到符合条件的记录')
  const resolvedModuleName = moduleName ?? t('table.dataTable.moduleFallback', '数据')

  // Kumo Pagination 的 aria-label 文案内置为英文，此处统一注入多语言版本
  const paginationLabels = useMemo(
    () => ({
      navigation: t('table.dataTable.pagination.navigation', '分页导航'),
      firstPage: t('table.dataTable.pagination.firstPage', '第一页'),
      previousPage: t('table.dataTable.pagination.previousPage', '上一页'),
      nextPage: t('table.dataTable.pagination.nextPage', '下一页'),
      lastPage: t('table.dataTable.pagination.lastPage', '最后一页'),
      pageNumber: t('table.dataTable.pagination.pageNumber', '页码'),
      pageSize: t('table.dataTable.pagination.pageSize', '每页条数'),
    }),
    [t],
  )

  const headerGroups = table.getHeaderGroups()
  const rows = table.getRowModel().rows
  const selectedRows = table.getSelectedRowModel().rows
  const selectedCount = selectedRows.length
  const totalCount = pagination?.total ?? rows.length
  const currentCount = rows.length
  const visibleLeafColumnCount = table.getVisibleLeafColumns().length || 1

  /**
   * 树表的层级列 = **第一个可见的数据列**（跳过多选列）。
   *
   * 刻意不从 props 指定：列顺序 / 列显隐变了，展开控件依然在最左边；
   * 调用方只管把层级列排在第一（见 table-development skill 的「ID 永远排第一列」）。
   */
  const treeColumnId = tree
    // 显式注解：`getVisibleLeafColumns()` 的元素类型在这里推不出来（TS7006），
    // 而层级列只需要 `id`，用一个最小结构类型即可
    ? table
        .getVisibleLeafColumns()
        .find((column: { id: string }) => column.id !== 'select')?.id
    : undefined

  const handleClearSelection = () => {
    table.resetRowSelection()
  }

  /**
   * 整行点击：行内交互元素（复选框 / 按钮 / 链接 / 菜单 / 输入控件）自己处理交互，
   * 事件冒泡到这里一律忽略；文本拖选（复制内容）同样不该打开详情。
   */
  const handleRowClick = (event: MouseEvent<HTMLElement>, row: unknown) => {
    if (!onRowClick) return

    const target = event.target as HTMLElement | null
    if (
      target?.closest(
        'button, a, input, select, textarea, label, [role="button"], [role="menuitem"], [role="checkbox"], [role="switch"], [data-row-click-ignore]',
      )
    ) {
      return
    }
    if (window.getSelection()?.toString()) return

    onRowClick(row)
  }

  const renderQuotaText = () => {
    if (quotaText) return quotaText

    return (
      <>
        <Trans
          i18nKey="table.dataTable.quota"
          defaults="你正在查看 <b>{{current}} of {{total}}</b> 条{{module}}数据"
          values={{ current: currentCount, total: totalCount, module: resolvedModuleName }}
          components={{ b: <b className={EMPHASIS_CLASS} /> }}
        />
        {extraStatus}
      </>
    )
  }

  return (
    <LayerCard className={`w-full overflow-hidden p-0 ${className}`}>
      {/* LayerCard.Secondary：统计总页数信息与多选控制器（不重写原生 padding） */}
      <LayerCard.Secondary>
        <div className="flex w-full flex-col gap-2">
          {/* 统计信息与卡片级操作：左侧统计、右侧操作（无操作时保持原来的单行排版） */}
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            {headerTitle ? (
              // 与统计文案同色（subtle），仅用字重区分标题层级
              <span className="text-kumo-subtle text-base/[inherit] m-0 font-medium">
                {headerTitle}
              </span>
            ) : (
              <p className="text-kumo-subtle text-base/[inherit] m-0">
                {renderQuotaText()}
              </p>
            )}

            {headerActions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {headerActions}
              </div>
            ) : null}
          </div>

          {/* 当选择了内容后出现多选控制器 */}
          {selectedCount > 0 ? (
            <div className="ml-1 flex min-h-9 w-full flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <p className="text-kumo-default text-base/[inherit] m-0">
                  <Trans
                    i18nKey="table.dataTable.selectedOf"
                    defaults="已选择 <b>{{selected}}</b> / {{total}} 项"
                    values={{ selected: selectedCount, total: rows.length }}
                    components={{ b: <b className={EMPHASIS_CLASS} /> }}
                  />
                </p>
                <Button
                  variant="ghost"
                  className="h-9 gap-1.5 rounded-lg px-3 text-base text-kumo-default hover:bg-kumo-tint shadow-none bg-inherit cursor-pointer"
                  onClick={handleClearSelection}
                >
                  {t('table.dataTable.clearSelection', '取消选择')}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {batchActions ? (
                  batchActions
                ) : (
                  <>
                    {onBatchEdit ? (
                      <Button
                        variant="outline"
                        icon={<PencilSimpleIcon size={14} />}
                        onClick={() =>
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          onBatchEdit(selectedRows.map((r: any) => r.original))
                        }
                      >
                        {t('table.dataTable.batchEdit', '编辑 {{num}} 项', {
                          num: selectedCount,
                        })}
                      </Button>
                    ) : null}
                    {onBatchDelete ? (
                      <Button
                        variant="destructive"
                        icon={<TrashIcon size={14} />}
                        onClick={() =>
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          onBatchDelete(selectedRows.map((r: any) => r.original))
                        }
                      >
                        {t('table.dataTable.batchDelete', '删除 {{num}} 项', {
                          num: selectedCount,
                        })}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </LayerCard.Secondary>

      {/* LayerCard.Primary：表格主体与底部分页 */}
      {/*
        圆角必须整套去掉（`rounded-none`），不能只盖上圆角：
        Kumo 的 LayerCard.Primary 自带 `rounded-lg`（LAYER_CARD_PRIMARY_CLASSES），
        同时又是 `overflow-x-auto` 的裁剪容器。这里装的是**贴边表格**，只要底部还留着
        圆角，它就会把表格最后一行裁出圆弧 —— 树表展开出的子行（背景 + 树列左侧的
        kumo-brand 强调线）正好落在最后一行时，强调线底端会被裁成圆角、看起来没铺满行高。
        表格内容一律直角，卡片外轮廓的圆角由外层 LayerCard 的 `overflow-hidden rounded-lg` 负责。
      */}
      <LayerCard.Primary className="overflow-x-auto p-0 rounded-none ring-0">
        {/* Kumo TableRoot 内置的是物理方向 text-left，RTL（阿拉伯语）下会把表头与单元格
            顶到左侧；此处用逻辑属性 text-start 覆盖，LTR 左对齐、RTL 右对齐。 */}
        <Table layout={layout} className="text-start">
          {/* 简洁自然的表头渲染 */}
          <Table.Header>
              {headerGroups.map((headerGroup: any) => (
                <Table.Row key={headerGroup.id}>
                  {headerGroup.headers.map((header: any) => {
                    const column = header.column
                    const meta = column.columnDef.meta as
                      | Record<string, any>
                      | undefined
                    const headClassName = meta?.headerClassName || ''
                    const sticky = resolveStickySide(meta?.sticky)
                    // 表头始终单行显示：配合 table-layout: auto 让列宽按标题自适应，
                    // 由 meta.headerClassName 提供的最小宽度约束列宽下限。
                    // 同时显式按书写方向对齐（text-start）：RTL 下与单元格一起靠右，
                    // 不依赖 <table> 的对齐继承；meta.headerClassName 中的 text-* 优先级更高。
                    const resolvedHeadClassName = `text-start whitespace-nowrap ${headClassName}`

                    if (header.isPlaceholder) {
                      return (
                        <Table.Head
                          key={header.id}
                          sticky={sticky}
                          className={resolvedHeadClassName}
                        />
                      )
                    }

                    const headerContent = flexRender(
                      column.columnDef.header,
                      header.getContext(),
                    )

                    // 如果是多选列或声明了 isDirectHead，内容本身就是 Table.CheckHead（它已自带 th）
                    if (column.id === 'select' || meta?.isDirectHead) {
                      return <Fragment key={header.id}>{headerContent}</Fragment>
                    }

                    return (
                      <Table.Head
                        key={header.id}
                        sticky={sticky}
                        className={resolvedHeadClassName}
                      >
                        {headerContent}
                      </Table.Head>
                    )
                  })}
                </Table.Row>
              ))}
            </Table.Header>

            {/*
              行分隔线：Kumo 的 Table 只在表头输出 border-b（[&_th]:border-b），
              body 行原本靠斑马纹（even:bg-kumo-elevated）区分；而本组件显式取消了斑马纹，
              因此必须在单元格上补出「行与行之间」的下边框，否则相邻行会糊成一片。
              - 用 tbody 的后代选择器一次性覆盖所有行，避免逐行重复类名；
              - 最后一行不加边框，防止与分页栏的 border-t 叠成双线；
              - 颜色与表头保持一致（border-kumo-fill）。
            */}
            <Table.Body className="[&>tr>td]:border-b [&>tr>td]:border-kumo-fill [&>tr:last-child>td]:border-b-0">
              {loading && rows.length === 0 ? (
                <Table.Row>
                  <Table.Cell
                    colSpan={visibleLeafColumnCount}
                    className="py-16 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader size="base" />
                      <span className="text-sm text-kumo-subtle">
                        {t('table.dataTable.loading', '正在加载表格数据…')}
                      </span>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ) : error && rows.length === 0 ? (
                <Table.Row>
                  <Table.Cell
                    colSpan={visibleLeafColumnCount}
                    className="py-12 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <p className="text-sm text-kumo-danger">{error}</p>
                      {onRetry ? (
                        <Button variant="secondary" size="sm" onClick={onRetry}>
                          {t('table.dataTable.retry', '重试加载')}
                        </Button>
                      ) : null}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ) : rows.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={visibleLeafColumnCount} className="py-12">
                    <Empty
                      icon={emptyIcon}
                      title={resolvedEmptyTitle}
                      description={resolvedEmptyDescription}
                    />
                  </Table.Cell>
                </Table.Row>
              ) : (
                rows.map((row: any) => {
                  const isSelected = row.getIsSelected()
                  // 树形子行（depth > 0）：改用 kumo-elevated 背景，与根行拉开层次。
                  // 选中态由 Kumo 的 selected 变体接管（kumo-tint），优先级更高。
                  const isNestedTreeRow =
                    treeRowAccent && tree && row.depth > 0
                  return (
                    <Table.Row
                      key={row.id}
                      variant={isSelected ? 'selected' : 'default'}
                      onClick={
                        onRowClick
                          ? (event) => handleRowClick(event, row.original)
                          : undefined
                      }
                      // 取消 Kumo 默认斑马纹（Table.Row 无“无底色”变体，
                      // 故用同属性类覆盖，由 Kumo 内部的 tailwind-merge 合并掉原 even:bg-kumo-elevated）；
                      // 行的视觉分隔改由 Table.Body 上的行分割线承担。
                      // 注意：--kumo-table-row-bg 必须与背景一起改，
                      // 否则 sticky 列（用它做背景色）会和整行背景错位。
                      className={cn(
                        // 整行可点时给出可点反馈；hover 底色同样要同步 --kumo-table-row-bg
                        onRowClick &&
                          'cursor-pointer hover:bg-kumo-tint hover:[--kumo-table-row-bg:var(--color-kumo-tint)]',
                        isSelected
                          ? undefined
                          : isNestedTreeRow
                            ? 'bg-kumo-elevated [--kumo-table-row-bg:var(--color-kumo-elevated)]'
                            : 'even:bg-kumo-base even:[--kumo-table-row-bg:var(--color-kumo-base)]',
                      )}
                    >
                      {row.getVisibleCells().map((cell: any) => {
                        const meta = cell.column.columnDef.meta as
                          | Record<string, any>
                          | undefined
                        const cellClassName = meta?.cellClassName || ''
                        const sticky = resolveStickySide(meta?.sticky)

                        const cellContent = flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )

                        // 如果是多选列或声明了 isDirectCell，内容本身就是 Table.CheckCell（它已自带 td）
                        if (cell.column.id === 'select' || meta?.isDirectCell) {
                          return <Fragment key={cell.id}>{cellContent}</Fragment>
                        }

                        // 树列：在内容前渲染层级缩进与展开/折叠控件；
                        // 无子节点的行用等宽占位，保证同层级文本左边界对齐。
                        const isTreeColumn =
                          cell.column.id === treeColumnId
                        const resolvedCellContent = isTreeColumn ? (
                          <div
                            className="flex items-center gap-1"
                            style={{
                              paddingInlineStart: row.depth * treeIndentSize,
                            }}
                          >
                            {row.getCanExpand?.() ? (
                              <Button
                                variant="ghost"
                                shape="square"
                                size="xs"
                                className="shrink-0"
                                aria-label={
                                  row.getIsExpanded()
                                    ? t('table.dataTable.collapseRow', '折叠')
                                    : t('table.dataTable.expandRow', '展开')
                                }
                                onClick={row.getToggleExpandedHandler()}
                              >
                                {row.getIsExpanded() ? (
                                  <CaretDownIcon size={12} weight="bold" />
                                ) : (
                                  // 折叠态是「指向展开方向」的箭头：RTL 下要指向左侧
                                  <CaretRightIcon size={12} weight="bold" className="rtl-flip" />
                                )}
                              </Button>
                            ) : (
                              <span className="w-3.5 shrink-0" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1">{cellContent}</span>
                          </div>
                        ) : (
                          cellContent
                        )

                        return (
                          <Table.Cell
                            key={cell.id}
                            sticky={sticky}
                            // 子行的强调线只画在树列上：border-inline-start 是逻辑属性，
                            // LTR 时贴左、RTL 时贴右，与缩进方向一致
                            className={
                              isTreeColumn && isNestedTreeRow
                                ? `border-s-2 border-kumo-brand ${cellClassName}`
                                : cellClassName
                            }
                          >
                            {resolvedCellContent}
                          </Table.Cell>
                        )
                      })}
                    </Table.Row>
                  )
                })
              )}
            </Table.Body>
          </Table>
      </LayerCard.Primary>

      {/* 卡片尾部（可选）：统计信息等，与表格同级、不参与横向滚动 */}
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kumo-line px-3 py-2 text-sm text-kumo-subtle">
          {footer}
        </div>
      ) : null}

      {/* 分页控制栏：作为 LayerCard 的独立尾部，与表格同级，不参与横向滚动 */}
      {pagination && pagination.total > 0 ? (
        /*
          命名容器：分页栏按**自身**宽度（而不是视口宽度）切换版式 ——
          卡片被侧栏 / 分屏挤窄时也能正确退化成「换行居中」。
        */
        <div className="@container/pagination flex items-center justify-between border-t border-kumo-line bg-kumo-elevated p-3">
          <Pagination
            page={pagination.page}
            setPage={pagination.onPageChange}
            perPage={pagination.pageSize}
            totalCount={pagination.total}
            labels={paginationLabels}
            // 空间不足时整条分页栏换行，避免统计信息与翻页控件互相挤压；
            // 换行后每行内容居中（容器过窄时翻页控件不再单独贴边）
            className="flex-wrap justify-center gap-y-3"
          >
            {/* 统计信息与每页条数视为左侧一组：窄容器下两者可各自换行并居中 */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Pagination.Info>
                {({ pageShowingRange, totalCount }) => (
                  // Trans 仅在传入 parent 时才会应用外层 className，故在此显式包一层 span
                  <span className="text-sm text-kumo-subtle">
                    <Trans
                      i18nKey="table.dataTable.paginationShowing"
                      defaults="显示 <b>{{range}}</b> 条，共 <b>{{total}}</b> 条"
                      values={{ range: pageShowingRange, total: totalCount }}
                      components={{ b: <b className={COUNT_CLASS} /> }}
                    />
                  </span>
                )}
              </Pagination.Info>
              {/* 每页条数紧随左侧统计信息，右侧仅保留翻页操作 */}
              <Pagination.PageSize
                value={pagination.pageSize}
                onChange={(size) => {
                  pagination.onPageSizeChange?.(size)
                  pagination.onPageChange(1)
                }}
                options={pagination.pageSizeOptions || [10, 15, 30, 50]}
                label={t('table.dataTable.pagination.perPage', '每页条数：')}
              />
            </div>
            {/*
              翻页控件组锁定为 LTR（不跟随文档方向反转）：
              Kumo InputGroup 的圆角与描边重叠使用物理方向类
              （first:rounded-l-[inherit] / last:rounded-r-[inherit] / not-first:-ml-px），
              RTL 下 flex 主轴镜像会让 first/last 换位而圆角不换位，导致首尾圆角错位。
              dir 只加在内层：外层保留 ms-auto 按文档方向解析，RTL 下控件组依旧贴左侧。

              ms-auto 只在容器 ≥720px（统计信息 + 每页条数 + 翻页控件最宽约 600px，
              足够单行排下）时生效；窄于该宽度时去掉外边距，
              让换行后的翻页控件与上面的统计信息一样居中。
            */}
            <div className="flex items-center @min-[720px]/pagination:ms-auto">
              <div className="flex items-center" dir="ltr">
                <Pagination.Controls />
              </div>
            </div>
          </Pagination>
        </div>
      ) : null}
    </LayerCard>
  )
}
