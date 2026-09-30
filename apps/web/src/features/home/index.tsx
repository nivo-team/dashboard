import { Button, Empty, useKumoToastManager } from '@cloudflare/kumo'
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  PencilSimpleIcon,
  PlusIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '#/components/page-header'
import {
  createDefaultLayout,
  createWidgetId,
  DASHBOARD_LAYOUT_VERSION,
  isEmptyLayout,
  type DashboardWidget,
} from '#/lib/dashboard-layout'
import { useDashboardStore } from '#/lib/store/dashboard-store'
import { AddWidgetDialog } from './add-widget-dialog'
import { DashboardGrid } from './dashboard-grid'
import { DASHBOARD_WIDGETS, getWidgetDefinition } from './widget-registry'
import { useFeature } from '#/lib/features'
import { createDashboardFeature } from './feature'

/**
 * 仪表盘（`/$appId/home`）—— 用户可自定义的卡片工作台。
 *
 * ### 自定义能力是「放开」的，不做权限裁剪
 *
 * 页面上能放什么由**卡片注册表**（`-data/widget-registry`）决定，而不是由账号权限决定：
 * 后端目前还说不清「每个人能用多少内容」，与其先写一套必然要改的权限映射，
 * 不如让用户自己挑卡片 —— 看不到的内容他自然不会加。等权限模型明确后，
 * 收敛点也很清楚：在注册表上加 `requiredPermission`，在「添加卡片」面板里过滤。
 *
 * ### 编辑模式是「即时保存」，没有保存按钮
 *
 * 进入自定义后，每一次拖动 / 添加 / 移除都立即写进 store（`admin.dashboard:<appId>`），
 * 点「完成」只是退出编辑模式。这与仓库里其他 per-app UI 状态（表格列设置、筛选）一致：
 * 都是「用户调完就希望留住」的状态，再加一层草稿 + 保存会让「我拖了但忘了点保存」
 * 变成一个没有意义的失误。代价是**误删无法撤销**，因此：
 * - 编辑模式给了显眼的「恢复默认布局」；
 * - 移除是「再添加一次」就能找回来的操作（卡片不会丢数据，只是从页面上拿掉）。
 *
 * ### 默认布局不写盘
 *
 * `layout === null` 表示「从未自定义」，此时用 `createDefaultLayout()` 现算 ——
 * 而不是在 store 初始化时写一份默认值。否则用户一进页面就会产生一份存档，
 * 以后想调整「默认长什么样」，所有老用户都还停在旧的那份上。
 */
export function HomePage() {
  const { t } = useTranslation('dashboard')
  const toast = useKumoToastManager()

  const storedLayout = useDashboardStore((state) => state.layout)
  const setLayout = useDashboardStore((state) => state.setLayout)
  const resetLayout = useDashboardStore((state) => state.resetLayout)

  const [editing, setEditing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // `storedLayout` 为 null（从未自定义）时现算默认布局；用 useMemo 固定引用，
  // 否则每次渲染都是新数组，栅格的拖动逻辑会反复重建。
  const layout = useMemo(() => storedLayout ?? createDefaultLayout(), [storedLayout])

  /** 提交一份布局（store 内部会再做一次规范化与压缩）。 */
  const commit = useCallback(
    (widgets: DashboardWidget[]) => {
      setLayout({ version: DASHBOARD_LAYOUT_VERSION, widgets })
    },
    [setLayout],
  )

  const handleRemove = useCallback(
    (id: string) => {
      commit(layout.widgets.filter((widget) => widget.id !== id))
    },
    [commit, layout.widgets],
  )

  const handleAdd = useCallback(
    (type: string) => {
      const definition = getWidgetDefinition(type)
      if (!definition) return
      // 先放在最底部，随后由 `commit` 的垂直压缩把它推到第一个放得下的位置 ——
      // 页面不需要自己算「哪里有空洞」，那是布局层的职责。
      const bottom = layout.widgets.reduce(
        (max, widget) => Math.max(max, widget.y + widget.h),
        0,
      )
      commit([
        ...layout.widgets,
        {
          id: createWidgetId(),
          type,
          x: 0,
          y: bottom,
          w: definition.defaultSize.w,
          h: definition.defaultSize.h,
        },
      ])
      setAddOpen(false)
    },
    [commit, layout.widgets],
  )

  const handleReset = useCallback(() => {
    resetLayout()
    toast.add({
      title: t('edit.resetDone', '已恢复默认布局'),
      variant: 'success',
    })
  }, [resetLayout, toast, t])

  /** 卡片标题按 `dashboard` 命名空间解析后再交给 AI —— 它不必知道 i18n 的存在。 */
  const widgetTitle = useCallback(
    (type: string) => {
      const definition = getWidgetDefinition(type)
      return definition ? t(definition.titleKey) : type
    },
    [t],
  )

  /*
    这一页对 AI 暴露的全部能力，**只在这一处登记**（原先什么都没接）：
    卡片清单 + 编排指令，详见 ./feature.ts。
    可添加清单从**注册表**派生（铁律 3 的唯一真值），页面里不另抄一份。
  */
  useFeature(
    createDashboardFeature({
      widgets: layout.widgets.map((widget) => ({
        id: widget.id,
        type: widget.type,
        title: widgetTitle(widget.type),
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
      })),
      available: DASHBOARD_WIDGETS.map((definition) => ({
        type: definition.type,
        title: t(definition.titleKey),
        ...(definition.descriptionKey
          ? { description: t(definition.descriptionKey) }
          : {}),
        added: layout.widgets.some((widget) => widget.type === definition.type),
        allowMultiple: definition.allowMultiple ?? true,
      })),
      editing,
      isDefault: storedLayout === null,
      addWidget: handleAdd,
      removeWidget: handleRemove,
      resetLayout: handleReset,
    }),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title', '仪表盘')}
        description={
          editing
            ? t('edit.hint', '拖动卡片可调整位置与大小')
            : t('description', '自由编排卡片，只看你关心的内容')
        }
        actions={
          editing ? (
            <>
              <Button
                variant="ghost"
                icon={<ArrowCounterClockwiseIcon size={16} />}
                onClick={handleReset}
              >
                {t('edit.reset', '恢复默认布局')}
              </Button>
              <Button
                variant="secondary"
                icon={<PlusIcon size={16} />}
                onClick={() => {
                  setAddOpen(true)
                }}
              >
                {t('edit.addCard', '添加卡片')}
              </Button>
              <Button
                variant="primary"
                icon={<CheckIcon size={16} />}
                onClick={() => {
                  setEditing(false)
                }}
              >
                {t('edit.exit', '完成')}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              icon={<PencilSimpleIcon size={16} />}
              onClick={() => {
                setEditing(true)
              }}
            >
              {t('edit.enter', '自定义')}
            </Button>
          )
        }
      />

      {isEmptyLayout(layout) ? (
        <Empty
          icon={<SquaresFourIcon size={44} className="text-kumo-inactive" />}
          title={t('edit.empty', '你的仪表盘还是空的')}
          description={t('edit.emptyHint', '点击右上角「自定义」，再添加卡片')}
          contents={
            editing ? undefined : (
              <Button
                variant="secondary"
                icon={<PencilSimpleIcon size={16} />}
                onClick={() => {
                  setEditing(true)
                }}
              >
                {t('edit.enter', '自定义')}
              </Button>
            )
          }
        />
      ) : (
        <DashboardGrid
          widgets={layout.widgets}
          editing={editing}
          onChange={commit}
          onRemove={handleRemove}
        />
      )}

      <AddWidgetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        widgets={layout.widgets}
        onAdd={handleAdd}
      />
    </div>
  )
}
