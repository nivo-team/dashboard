import { Button, Loader } from '@cloudflare/kumo'
import { UserIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { UserItem } from '#/api'
import { useFormatTimestamp } from './display'
import { fetchTableExampleDetail } from './detail-loader'

export interface TableExampleDetailViewProps {
  /** 记录 UID（来自路由参数或表格行） */
  id: string
  /**
   * 取数完成后的回调（含 `null` = 没查到 / 出错）。
   * 供页面把这个“已经加载好的记录”接进 AI 数据源用。
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
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-kumo-line bg-kumo-base p-4">
      <h2 className="mb-3 text-sm font-semibold text-kumo-default">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  )
}

/**
 * 表格示例详情视图 —— 纯业务视图组件。
 * 标题、描述与“返回列表”按钮一律由承载它的外壳（CrudViewContainer 或 CrudFloatingContainer）统一渲染。
 */
export function TableExampleDetailView({ id, onData }: TableExampleDetailViewProps) {
  const { t } = useTranslation('example', { keyPrefix: 'table' })
  const formatTimestamp = useFormatTimestamp()

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

  const onDataRef = useRef(onData)
  onDataRef.current = onData
  useEffect(() => {
    onDataRef.current?.(user, { loading, demoMode: isDemo })
  }, [user, loading, isDemo])

  if (loading) {
    return (
      <div className="flex min-h-[30svh] items-center justify-center">
        <Loader />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[30svh] flex-col items-center justify-center gap-4 text-center">
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
        <Button variant="secondary" onClick={loadDetail}>
          {t('detail.retry', '重试')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
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

      <DetailSection title={t('detail.sections.basic', '基础信息')}>
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
    </div>
  )
}
