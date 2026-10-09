import { Button, Loader } from '@cloudflare/kumo'
import { ArrowLeftIcon, UserIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { UserItem } from '#/api'
import { PageHeader } from '#/components/page-header'
import { useFormatTimestamp } from './display'
import { fetchTableExampleDetail } from './detail-loader'

/**
 * 表格示例详情视图 —— **详情页与分屏预览共用同一份实现**。
 *
 * 这是「表格点开详情但不跳页」能成立的前提：详情不再绑在路由组件上，
 * 而是 props 驱动的普通组件，因此同一份 UI / 同一份取数逻辑可以同时出现在
 * - 详情路由 `/$appId/example/table/$id`（`variant="page"`）；
 * - 表格的详情预览浮层（`variant="preview"`，见 `#/components/detail-preview`）。
 *
 * 两种形态的差异**只有外壳**，主体内容完全一致：
 * - `page`：自带 `PageHeader`（标题 / 描述 / 「返回列表」）；
 * - `preview`：页头交给浮层容器（标题、展开、关闭都在那边），主体改用更紧凑的间距
 *   与更矮的加载 / 空态高度，避免 1/3 宽度里一屏放不下几行信息。
 *
 * 后续给表格示例详情补字段、补子模块（资产、设备、封禁…）时改这一处，两个入口同时生效。
 */

export interface TableExampleDetailViewProps {
  /** 记录 UID（来自路由参数或表格行） */
  id: string
  /** 渲染形态，默认 `page` */
  variant?: 'page' | 'preview'
  /**
   * `page` 形态下「返回列表」按钮的行为（由路由组件传入导航）。
   * **不传就不渲染该按钮** —— 预览形态本来也不需要，靠浮层的关闭 / 展开离开。
   *
   * 刻意不从路由文件反向 import `Route`：那样会让「详情视图 ↔ 路由」形成循环依赖，
   * 而详情视图本来就应该是一个不认识路由的普通组件。
   */
  onBack?: () => void
  /**
   * 取数完成后的回调（含 `null` = 没查到 / 出错）。
   *
   * 给页面把这个"已经加载好的记录"接进 AI 数据源用（`feature.ts` 的 `dataSources`）——
   * 于是面板模式的 AI 回答「这个记录什么时候注册的」时**不用再去查接口**。
   * 组件本身仍然不认识路由、也不认识 AI，只把结果交出去。
   */
  onData?: (user: UserItem | null, meta: { loading: boolean; demoMode: boolean }) => void
}

/** 详情字段单元：统一标签 + 值的排版。 */
function FieldItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded border border-kumo-line p-2.5">
      <div className="text-xs text-kumo-subtle">{label}</div>
      <div className="mt-1 text-sm font-medium text-kumo-default">{value}</div>
    </div>
  )
}

/** 详情分组卡片。 */
function DetailSection({
  title,
  compact,
  children,
}: {
  title: string
  /** 预览形态：单列排布（1/3 宽度下两三列会把字段名挤断行） */
  compact?: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-kumo-line bg-kumo-base p-4">
      <h2 className="mb-3 text-sm font-semibold text-kumo-default">{title}</h2>
      <div
        className={
          compact
            ? 'grid grid-cols-1 gap-3'
            : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {children}
      </div>
    </section>
  )
}

export function TableExampleDetailView({
  id,
  variant = 'page',
  onBack,
  onData,
}: TableExampleDetailViewProps) {
  const { t } = useTranslation('example', { keyPrefix: 'table' })
  const formatTimestamp = useFormatTimestamp()
  const isPreview = variant === 'preview'

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserItem | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    const result = await fetchTableExampleDetail(id)
    setUser(result.user)
    setIsDemo(result.isDemo)
    setErrorMsg(result.error)
    setLoading(false)
  }, [id])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  /*
    把「已经加载好的这个记录」交给页面（页面再交给 AI 数据源）。
    放在 effect 里而不是 `loadDetail` 里：state 更新后 `user` 才是新的，
    直接回调会慢一帧、也可能把上一次的旧值传出去。
    回调用 ref 取最新，避免把它写进依赖导致每轮重跑取数。
  */
  const onDataRef = useRef(onData)
  onDataRef.current = onData
  useEffect(() => {
    onDataRef.current?.(user, { loading, demoMode: isDemo })
  }, [user, loading, isDemo])

  const body = loading ? (
    <div
      className={
        isPreview
          ? 'flex min-h-[30svh] items-center justify-center'
          : 'flex min-h-[40svh] items-center justify-center'
      }
    >
      <Loader />
    </div>
  ) : !user ? (
    <div
      className={
        isPreview
          ? 'flex min-h-[30svh] flex-col items-center justify-center gap-4 text-center'
          : 'flex min-h-[40svh] flex-col items-center justify-center gap-4 text-center'
      }
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-kumo-danger-tint text-kumo-danger">
        <WarningCircleIcon size={22} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-kumo-default">
          {t('detail.notFoundTitle', '未找到该记录')}
        </h2>
        <p className="max-w-md text-sm text-kumo-subtle">
          {errorMsg || t('detail.notFoundDescription', '该记录可能已被删除，或 UID 不正确')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={loadDetail}>
          {t('detail.retry', '重试')}
        </Button>
        {/* 预览形态靠浮层的关闭 / 展开离开，不需要再放一个「返回列表」 */}
        {isPreview ? null : (
          <Button variant="ghost" onClick={loadDetail}>
            {t('detail.back', '返回列表')}
          </Button>
        )}
      </div>
    </div>
  ) : (
    <>
      {/* 概览卡片：头像 + 昵称 + 账号角色 */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-kumo-line bg-kumo-elevated p-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-kumo-base ring-1 ring-kumo-line">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.nickname || t('cell.avatarAlt', '头像')}
              className="h-full w-full object-cover"
            />
          ) : (
            <UserIcon size={28} className="text-kumo-subtle" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-kumo-default">
            {user.nickname || t('cell.unnamed', '未设置昵称')}
          </div>
          <div className="mt-1 font-mono text-xs text-kumo-subtle">ID {user.id ?? '-'}</div>
        </div>
      </div>

      <DetailSection title={t('detail.sections.basic', '基础信息')} compact={isPreview}>
        <FieldItem label={t('detail.fields.id', 'ID')} value={user.id ?? '-'} />
        <FieldItem
          label={t('detail.fields.email', '邮箱')}
          value={<span className="font-mono">{user.email || '-'}</span>}
        />
        <FieldItem
          label={t('detail.fields.createtime', '注册时间')}
          value={formatTimestamp(user.createtime)}
        />
        <FieldItem
          label={t('detail.fields.logintime', '最后登录')}
          value={formatTimestamp(user.logintime)}
        />
      </DetailSection>
    </>
  )

  if (isPreview) {
    // 预览形态：浮层容器已经给了标题与操作按钮，这里只排主体。
    // 用与列表页一致的垂直节奏（gap-4），内部不做额外页头。
    return <div className="flex flex-col gap-4">{body}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={user?.nickname || t('detail.title', '表格示例详情')}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {t('detail.fields.id', 'ID')}: {user?.id ?? id}
            </span>
            {isDemo ? (
              <span className="font-medium text-amber-500">
                {t('demoBadge', '（演示数据模式）')}
              </span>
            ) : null}
          </span>
        }
        actions={
          onBack ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowLeftIcon size={16} className="rtl-flip" />}
              onClick={onBack}
            >
              {t('detail.back', '返回列表')}
            </Button>
          ) : null
        }
      />
      {body}
    </div>
  )
}
