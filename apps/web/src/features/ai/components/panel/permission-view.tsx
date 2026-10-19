import { Button } from '@cloudflare/kumo'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiPermissionConfig } from '#/features/ai/components/permission-config'
import { usePreferencesStore } from '#/lib/store'
import type { AiPermissionMode } from '#/features/ai/core'
import type { AiCapabilityGrant } from '#/features/ai/core/capabilities'
import { isPermissionDraftDirty } from './permission-draft'

/**
 * 面板里的**权限配置视图**：对话内容被它整块替换，头行与骨架沿用同一套
 * （见 `header.tsx` 的权限分支）。
 *
 * 草稿语义（与设置页的即时生效刻意不同）：进来先拷一份当前设置，改的都是本地副本，
 * 点「保存」才写回偏好 store；点返回 / 关闭直接丢弃。权限是会影响**之后每一次对话**的
 * 全局项，「误点一下就悄悄生效」比「多点一下保存」糟得多。
 *
 * 配置体与设置页共用 `AiPermissionConfig`（见 `#/features/ai/components/permission-config`）——
 * 两处的档位定义、继承逻辑、工具清单与文案因此不可能分叉。
 */
export function AiPermissionView({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('ai')
  const aiPermission = usePreferencesStore((state) => state.aiPermission)
  const aiCapabilities = usePreferencesStore((state) => state.aiCapabilities)
  const setAiPermission = usePreferencesStore((state) => state.setAiPermission)
  const setAiCapabilities = usePreferencesStore((state) => state.setAiCapabilities)

  /*
    副本只在**挂载时**拷一次（每次进入权限视图本组件都重新挂载），之后与 store 解耦 ——
    所以它是初值，而不是「每次 store 变就同步」，否则用户在别处改了设置会把草稿顶掉。
  */
  const [permission, setPermission] = useState<AiPermissionMode>(aiPermission)
  const [capabilities, setCapabilities] = useState<AiCapabilityGrant[]>([...aiCapabilities])

  const dirty = isPermissionDraftDirty(
    { permission, capabilities },
    { permission: aiPermission, capabilities: aiCapabilities },
  )

  const save = () => {
    setAiPermission(permission)
    setAiCapabilities(capabilities)
    onDone()
  }

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      {/*
        内容区自己滚：`custom` 档的清单在窄浮窗里会比面板高，
        而保存栏必须一直贴在底上（与对话区「输入框固定」同一个理由）。
        形态与设置页区分开（variant="panel"）：Tabs 居中、三组工具各包独立 LayerCard。
      */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <AiPermissionConfig
          permission={permission}
          capabilities={capabilities}
          onPermissionChange={setPermission}
          onCapabilitiesChange={(next) => setCapabilities(next)}
          variant="panel"
        />
      </div>

      <div className="shrink-0 p-3 pt-0">
        <Button
          variant="primary"
          disabled={!dirty}
          onClick={save}
          // 按钮 100% 宽度充满底部操作栏；未修改时保持禁用，有修改才允许保存
          className="w-full justify-center not-disabled:cursor-pointer"
        >
          {t('permissionsSave', '保存')}
        </Button>
      </div>
    </div>
  )
}
