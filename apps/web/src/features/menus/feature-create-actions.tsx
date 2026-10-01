import { Button, ButtonGroup, DropdownMenu } from '@cloudflare/kumo'
import { CaretDownIcon, FolderPlusIcon, PlusIcon } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_APP_ID, useAuth } from '#/lib/auth'
import { useHasPermission } from '#/lib/permissions'
import { MENU_ROOT_ID } from './feature-options'

interface FeatureCreateActionsProps {
  /** 新节点的父 id（即当前容器 id）。 */
  parentId?: number
}

/**
 * 容器视图的创建入口：Kumo `ButtonGroup` 分裂按钮。
 *
 * - 主按钮「添加功能」→ `menu_type=2`；
 * - 下拉「添加功能组」→ `menu_type=1`。
 *
 * 功能详情里的权限创建不走这里（它是弹窗，见 `feature-permission-dialogs.tsx`）。
 */
export function FeatureCreateActions({
  parentId = MENU_ROOT_ID,
}: FeatureCreateActionsProps) {
  const { t } = useTranslation('menus')
  const navigate = useNavigate()
  const { currentApp } = useAuth()
  const appId = currentApp?.id || DEFAULT_APP_ID
  const canCreate = useHasPermission('feature:create')

  const goCreate = useCallback(
    (type?: 'group') => {
      navigate({
        to: '/$appId/system/menus/new',
        params: { appId },
        search: { pid: parentId, type },
      })
    },
    [appId, navigate, parentId],
  )

  if (!canCreate) {
    return null
  }

  return (
    <ButtonGroup
      aria-label={t('create.label', '创建')}
      /**
       * Kumo 的 ButtonGroup 靠「`*:not(:last-child)` → `rounded-e-none`」抹平内侧圆角来拼分裂按钮。
       * 下拉展开时触发器不再是最后一个兄弟节点，那条规则就会连它的**右圆角**一起抹掉。
       * 这里按元素类型（只认 button）显式钉住两端圆角，不再依赖兄弟节点数量；
       * `!` 用于压过 Kumo 的 `rounded-e-none`（同优先级，谁后生成不确定）。
       */
      className="[&>button:first-of-type]:rounded-s-lg! [&>button:last-of-type]:rounded-e-lg!"
    >
      <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => goCreate()}>
        {t('createFeature', '添加功能')}
      </Button>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              variant="primary"
              shape="square"
              aria-label={t('createGroup', '添加功能组')}
            >
              <CaretDownIcon size={16} />
            </Button>
          }
        />
        <DropdownMenu.Content align="end">
          {/*
            刻意不用 Item 的 icon 属性：Kumo 内部给图标写死了 `mr-2`（物理方向），
            RTL 下间距会留在错误的一侧。改用 flex 的 gap，由浏览器按书写方向自动镜像。
          */}
          <DropdownMenu.Item className="gap-2" onClick={() => goCreate('group')}>
            <FolderPlusIcon size={16} />
            <span>{t('createGroup', '添加功能组')}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </ButtonGroup>
  )
}
