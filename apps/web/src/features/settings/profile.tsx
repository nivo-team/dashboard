import { Badge, LayerCard, Loader } from '@cloudflare/kumo'
import { UserIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { getProfileQueryOptions } from '#/api'
import { CopyableValue } from '#/components/copyable-value'
import { PageHeader } from '#/components/page-header'
import { useAuth } from '#/lib/auth'

/**
 * 设置 → 个人资料（src/features/settings/profile.tsx -> "/settings/profile"）
 *
 * 与根路径 `/`（应用空间选择）共用 `_main` 通用外壳；
 * 进入 `/settings/**` 后侧边栏会切换为设置专属导航（见 components/main-layout.tsx）。
 *
 * 数据来自 `GET /profile`（当前登录用户的个人资料与区域权限，**只读**：后端没有更新接口）——
 * 接口路径与前端路由无关，仍复用同一支接口。
 * 接口不可用时回落到本地登录态（`useAuth().user`），并显式提示，
 * 避免把兜底数据当成后端真实值展示。
 */
const STATUS_ENABLED = 1
const STATUS_DISABLED = 2

export function ProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, isPending, isError } = useQuery(getProfileQueryOptions())

  // 后端字段为空时逐项回落到本地登录态，任一来源有值即可展示
  const profile = data?.result
  const username = profile?.username || user?.username
  const nickName = profile?.nick_name || user?.name
  const email = profile?.email || user?.email
  const uid = profile?.uid ?? user?.uid
  const role = profile?.role || user?.role
  const status = profile?.status
  const currentRegion = profile?.current_region
  const regions = profile?.regions ?? []

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('profileNav.myProfile', '个人资料')} />

      {isError ? (
        <p className="text-sm text-kumo-subtle">
          {t('profile.loadError', '资料接口暂不可用，当前展示本地登录信息')}
        </p>
      ) : null}

      <div className="flex w-full flex-col gap-4">
        {/* 基本信息 */}
        <LayerCard className="p-0">
          <LayerCard.Secondary>{t('profile.sections.basic', '基本信息')}</LayerCard.Secondary>
          <LayerCard.Primary className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-kumo-tint text-kumo-subtle">
                <UserIcon size={20} weight="fill" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-kumo-default">{username || '-'}</p>
                {role ? <p className="truncate text-sm text-kumo-subtle">{role}</p> : null}
              </div>
              {isPending ? (
                <span className="ms-auto">
                  <Loader size={16} />
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <InfoRow label={t('profile.fields.username', '用户名')}>
                <span className="text-sm text-kumo-default">{username || '-'}</span>
              </InfoRow>

              <InfoRow label={t('profile.fields.nickName', '昵称')}>
                <span className="text-sm text-kumo-default">{nickName || '-'}</span>
              </InfoRow>

              <InfoRow label={t('profile.fields.email', '邮箱')}>
                {email ? (
                  <CopyableValue text={email} />
                ) : (
                  <span className="text-sm text-kumo-subtle">-</span>
                )}
              </InfoRow>

              <InfoRow label={t('profile.fields.uid', 'UID')}>
                {uid === undefined || uid === null ? (
                  <span className="text-sm text-kumo-subtle">-</span>
                ) : (
                  <CopyableValue text={String(uid)} />
                )}
              </InfoRow>

              <InfoRow label={t('profile.fields.role', '角色')}>
                <span className="text-sm text-kumo-default">{role || '-'}</span>
              </InfoRow>

              <InfoRow label={t('profile.fields.status', '状态')}>{statusBadge(status, t)}</InfoRow>
            </div>
          </LayerCard.Primary>
        </LayerCard>

        {/* 区域权限：单列纵向排列，跟着基本信息一路往下 */}
        <LayerCard className="p-0">
          <LayerCard.Secondary>{t('profile.sections.regions', '区域权限')}</LayerCard.Secondary>
          <LayerCard.Primary className="flex flex-col gap-3 p-4">
            <InfoRow label={t('profile.fields.currentRegion', '当前区域')}>
              <span className="text-sm text-kumo-default">
                {currentRegion === undefined || currentRegion === null
                  ? '-'
                  : String(currentRegion)}
              </span>
            </InfoRow>

            {regions.length === 0 ? (
              <p className="text-sm text-kumo-subtle">
                {t('profile.regions.empty', '暂无区域权限')}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {regions.map((item, index) => {
                  const isCurrent =
                    currentRegion !== undefined &&
                    currentRegion !== null &&
                    item.value === currentRegion
                  return (
                    <li key={`${item.value ?? item.region ?? index}`}>
                      <Badge variant={isCurrent ? 'success' : 'secondary'} appearance="dot">
                        {item.label || item.region || String(item.value ?? '-')}
                        {item.disabled ? ` · ${t('profile.status.disabled', '禁用')}` : ''}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </LayerCard.Primary>
        </LayerCard>
      </div>
    </div>
  )
}

/** 账号状态徽章：1 启用 / 2 禁用（与 data-dict / features 的 status 口径一致），其余原样展示。 */
function statusBadge(status: number | undefined, t: TFunction) {
  if (status === undefined || status === null) {
    return <span className="text-sm text-kumo-subtle">-</span>
  }

  if (status === STATUS_ENABLED) {
    return (
      <Badge variant="success" appearance="dot">
        {t('profile.status.enabled', '启用')}
      </Badge>
    )
  }

  if (status === STATUS_DISABLED) {
    return (
      <Badge variant="secondary" appearance="dot">
        {t('profile.status.disabled', '禁用')}
      </Badge>
    )
  }

  return <span className="text-sm text-kumo-default tabular-nums">{status}</span>
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-kumo-subtle">{label}</span>
      <span className="min-w-0 text-end">{children}</span>
    </div>
  )
}
