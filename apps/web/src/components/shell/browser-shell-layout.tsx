import { LayoutSidebarProvider } from '#/layouts/provider'
import { ShellContentColumn } from '#/layouts/common/content-column'
import type { LayoutSlots } from '#/layouts/types'

/** 兼容旧引用的通用浏览器骨架 */
export function BrowserShellLayout({ sidebar, header, mainClassName, ai, children }: LayoutSlots) {
  return (
    <LayoutSidebarProvider>
      {sidebar}
      <ShellContentColumn header={header} mainClassName={mainClassName} desktop={false}>
        {children}
      </ShellContentColumn>
      {ai}
    </LayoutSidebarProvider>
  )
}
