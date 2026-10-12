import { useNavigate } from '@tanstack/react-router'
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
import { useCallback, useId, useMemo, useState } from 'react'
import { usePreferencesStore } from '#/lib/store'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { matchCrudSplat } from './splat'
import type { CrudActiveView, CrudController, UseCrudViewOptions } from './types'

export function useCrudView<TFormItem = unknown>({
  basePath,
  splat,
  enableDetail = true,
  getFormMetadata,
  getDetailMetadata,
}: UseCrudViewOptions): CrudController<TFormItem> {
  const navigate = useNavigate()
  const isMobile = useIsMobileViewport()
  const formOpenMode = usePreferencesStore((s) => s.formOpenMode)
  const detailOpenMode = usePreferencesStore((s) => s.detailOpenMode)
  const autoFormId = useId()

  const [formInitialData, setFormInitialData] = useState<TFormItem | null>(null)

  // URL Query 状态托管（nuqs 驱动，替换模式，清空时自动从 URL 中消除）
  const [queryParams, setQueryParams] = useQueryStates(
    {
      form: parseAsStringLiteral(['create', 'edit'] as const),
      formId: parseAsString,
      detailId: parseAsString,
    },
    {
      history: 'replace',
      shallow: false,
      clearOnDefault: true,
    },
  )

  // 1. 最高优先级：Path 路由匹配（Source of Truth Priority 1）
  const splatMatch = useMemo(
    () => matchCrudSplat(splat, { enableDetail }),
    [splat, enableDetail],
  )

  // 2. 状态推导：决议当前活动视图
  const activeView: CrudActiveView = useMemo(() => {
    // 命中独立整页 Path (如 /table/new, /table/123, /table/123/edit)
    if (splatMatch) {
      if (splatMatch.type === 'create') {
        const meta = getFormMetadata('create')
        return {
          type: 'page-form',
          mode: 'create',
          title: meta.title,
          description: meta.description,
        }
      }
      if (splatMatch.type === 'edit') {
        const meta = getFormMetadata('edit', splatMatch.id)
        return {
          type: 'page-form',
          mode: 'edit',
          id: splatMatch.id,
          title: meta.title,
          description: meta.description,
        }
      }
      if (splatMatch.type === 'detail') {
        const meta = getDetailMetadata
          ? getDetailMetadata(splatMatch.id)
          : { title: '', description: '' }
        return {
          type: 'page-detail',
          id: splatMatch.id,
          title: meta.title,
          description: meta.description,
        }
      }
    }

    // 第二优先级：Query 驱动浮层（即便偏好为 page，只要链接携带 query 依然强制以浮层打开）
    if (queryParams.form === 'create') {
      const meta = getFormMetadata('create')
      const floatingType = formOpenMode === 'split' ? 'split' : 'dialog'
      return {
        type: 'floating-form',
        mode: 'create',
        floatingType,
        title: meta.title,
        description: meta.description,
      }
    }

    if (queryParams.form === 'edit' && queryParams.formId) {
      const meta = getFormMetadata('edit', queryParams.formId)
      const floatingType = formOpenMode === 'split' ? 'split' : 'dialog'
      return {
        type: 'floating-form',
        mode: 'edit',
        id: queryParams.formId,
        floatingType,
        title: meta.title,
        description: meta.description,
      }
    }

    if (queryParams.detailId && enableDetail) {
      const meta = getDetailMetadata
        ? getDetailMetadata(queryParams.detailId)
        : { title: '', description: '' }
      const floatingType = detailOpenMode === 'split' ? 'split' : 'sheet'
      return {
        type: 'floating-detail',
        id: queryParams.detailId,
        floatingType,
        title: meta.title,
        description: meta.description,
      }
    }

    return { type: 'list' }
  }, [
    splatMatch,
    queryParams.form,
    queryParams.formId,
    queryParams.detailId,
    formOpenMode,
    detailOpenMode,
    enableDetail,
    getFormMetadata,
    getDetailMetadata,
  ])

  const isPageMode = activeView.type === 'page-form' || activeView.type === 'page-detail'
  const isFloatingMode =
    activeView.type === 'floating-form' || activeView.type === 'floating-detail'

  // 主动触发动作：此时偏好生效；移动端一律降级为跳转 Path
  const openCreate = useCallback(
    (initialValues?: Partial<TFormItem> | null) => {
      if (initialValues) {
        setFormInitialData(initialValues as TFormItem)
      }
      if (isMobile || formOpenMode === 'page') {
        void navigate({ href: `${basePath}/new` })
      } else {
        void setQueryParams({ form: 'create', formId: null, detailId: null })
      }
    },
    [isMobile, formOpenMode, navigate, basePath, setQueryParams],
  )

  const openEdit = useCallback(
    (id: string | number, initialValues?: Partial<TFormItem> | null) => {
      if (initialValues) {
        setFormInitialData(initialValues as TFormItem)
      }
      const idStr = String(id)
      if (isMobile || formOpenMode === 'page') {
        void navigate({ href: `${basePath}/${idStr}/edit` })
      } else {
        void setQueryParams({ form: 'edit', formId: idStr, detailId: null })
      }
    },
    [isMobile, formOpenMode, navigate, basePath, setQueryParams],
  )

  const openDetail = useCallback(
    (id: string | number) => {
      if (!enableDetail) return
      const idStr = String(id)
      if (isMobile || detailOpenMode === 'page') {
        void navigate({ href: `${basePath}/${idStr}` })
      } else {
        void setQueryParams({ detailId: idStr, form: null, formId: null })
      }
    },
    [enableDetail, isMobile, detailOpenMode, navigate, basePath, setQueryParams],
  )

  const close = useCallback(() => {
    setFormInitialData(null)
    if (splatMatch) {
      void navigate({ href: basePath })
    } else {
      void setQueryParams({ form: null, formId: null, detailId: null })
    }
  }, [splatMatch, navigate, basePath, setQueryParams])

  const expandToPage = useCallback(() => {
    if (activeView.type === 'floating-form') {
      const target =
        activeView.mode === 'create'
          ? `${basePath}/new`
          : `${basePath}/${activeView.id}/edit`
      void navigate({ href: target })
    } else if (activeView.type === 'floating-detail') {
      void navigate({ href: `${basePath}/${activeView.id}` })
    }
  }, [activeView, basePath, navigate])

  return {
    activeView,
    isPageMode,
    isFloatingMode,
    formId: `form-${autoFormId.replace(/:/g, '')}`,
    formInitialData,
    setFormInitialData,
    openCreate,
    openEdit,
    openDetail,
    close,
    expandToPage,
  }
}
