import { Switch } from '@cloudflare/kumo'
import { useTranslation } from 'react-i18next'
import { SettingRow } from '#/components/settings-card'
import { useShellUiStore } from '#/lib/store'
import { getDesktopBlurSupport, isDesktop } from './bridge'

/**
 * 设置 → 外观 的「窗口背景模糊」开关（**桌面壳专属**，所以放在 `#/desktop`）。
 *
 * 行为：
 * - 浏览器里整行不渲染（返回 `null`）；
 * - 平台支持模糊：用户可自由开关，开关写进外壳偏好 store 的 `desktopBlurEnabled`；
 * - 平台不支持：开关置灰禁用，并在提示里给出原因（`getDesktopBlurSupport().reason`）。
 *
 * 布局沿用设置页的 `SettingRow`（左 label 右控件），与相邻的开关行一致。
 */
export function DesktopBlurSetting() {
  const { t } = useTranslation()
  const desktopBlurEnabled = useShellUiStore((state) => state.desktopBlurEnabled)
  const setDesktopBlurEnabled = useShellUiStore((state) => state.setDesktopBlurEnabled)

  // 纯读窗口标记，不需要订阅；浏览器里直接不渲染这一行
  if (!isDesktop()) return null

  const blurSupport = getDesktopBlurSupport()

  return (
    <SettingRow
      label={t('profile.settings.desktopBlur', '窗口背景模糊')}
      hint={
        blurSupport.supported
          ? t(
              'profile.settings.desktopBlurHint',
              '开启桌面窗口毛玻璃背景与透明标题栏穿透；关闭后恢复纯色底色',
            )
          : t(
              'profile.settings.desktopBlurUnsupportedHint',
              '当前桌面环境不支持背景模糊：{{reason}}',
              { reason: blurSupport.reason },
            )
      }
    >
      <Switch
        checked={blurSupport.supported && desktopBlurEnabled}
        disabled={!blurSupport.supported}
        onCheckedChange={setDesktopBlurEnabled}
        aria-label={t('profile.settings.desktopBlur', '窗口背景模糊')}
      />
    </SettingRow>
  )
}
