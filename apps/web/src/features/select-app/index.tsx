import { LayerCard, Loader, Table } from '@cloudflare/kumo'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_APP_ID,
  fetchAvailableApps,
  isMultiAppEnabled,
  selectAppAndComplete,
  setAvailableApps,
  useAuth,
  type AppItem,
} from '#/lib/auth'

/**
 * 根路径应用空间选择页面（src/features/select-app/index.tsx -> "/"）
 */
export function SelectAppPage({ redirect: redirectUrl }: { redirect?: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const navigate = useNavigate()
  const { user, availableApps } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [appsList, setAppsList] = useState<AppItem[]>(availableApps)

  // 选中应用并进入系统（动态同步此应用的 apiBaseUrl，并导航至带有 [appId] 前缀的业务路由 /$appId/home）
  const handleSelectApp = (appId: string) => {
    selectAppAndComplete(appId)
    router.invalidate()
    const target =
      redirectUrl &&
      redirectUrl.startsWith('/') &&
      redirectUrl !== '/select-app' &&
      redirectUrl !== '/'
        ? redirectUrl
        : `/${appId}/home`
    navigate({ to: target as any })
  }

  useEffect(() => {
    if (!isMultiAppEnabled()) {
      handleSelectApp(DEFAULT_APP_ID)
      return
    }

    let isMounted = true

    async function loadApps() {
      try {
        setIsLoading(true)
        // 模拟请求获取应用列表（预留未来多服务器/域名接口空间）
        const fetchedApps = await fetchAvailableApps()
        if (!isMounted) return

        setAppsList(fetchedApps)
        setAvailableApps(fetchedApps)
      } catch (error) {
        console.error('Failed to load apps:', error)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadApps()

    return () => {
      isMounted = false
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader size={24} />
        <p className="text-sm text-kumo-subtle">
          {t('selectApp.loading', '正在加载应用列表…')}
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* 顶部账号 */}
      <p className="text-xs text-kumo-subtle">
        {user?.username || 'Admin'}
      </p>

      {/* 大标题：应用 */}
      <h1 className="mt-1.5 text-2xl font-semibold text-kumo-default sm:text-3xl">
        {t('selectApp.title', '应用')}
      </h1>

      {/* 副标题：选择一个应用。 */}
      <p className="mt-1 text-sm text-kumo-subtle">
        {t('selectApp.subtitle', '选择一个应用。')}
      </p>

      {/* Kumo UI 原生默认表格：LayerCard 包裹，无多余自定义样式，表头左对齐无排序 */}
      <LayerCard className="mt-6 p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>{t('selectApp.tableApp', '应用')}</Table.Head>
              <Table.Head>{t('selectApp.tableDesc', '描述')}</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {appsList.map((app) => {
              const localizedName = t(`apps.${app.id}.name`, app.name)
              const localizedDesc = t(`apps.${app.id}.description`, app.description || '—')

              return (
                <Table.Row
                  key={app.id}
                  onClick={() => handleSelectApp(app.id)}
                  className="cursor-pointer"
                >
                  <Table.Cell>
                    <span className="font-medium underline underline-offset-4 hover:text-kumo-brand">
                      {localizedName}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="text-kumo-subtle">
                    {localizedDesc}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      </LayerCard>
    </div>
  )
}
