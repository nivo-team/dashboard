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

  // URL Query 状态托管（nuqs 驱动，统一固定为 id=xx&type=xxx&view=xxx 规范，替换模式，清空时自动从 URL 中消除）
  const [queryParams, setQueryParams] = useQueryStates(
    {
      id: parseAsString,
      type: parseAsString,
      view: parseAsString,
      // 向下兼容历史参数
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
    () => matchCrudSplat(splat, { enableDetail, type: queryParams.type }),
    [splat, enableDetail, queryParams.type],
  )

  // 2. 状态推导：决议当前活动视图（纯 Query 优先，所有表单与详情状态均在 URL 中保存）
  const activeView: CrudActiveView = useMemo(() => {
    // 归一化 Query 核心参数
    const rawType = (
      queryParams.type ??
      queryParams.form ??
      (queryParams.detailId ? 'detail' : null)
    )?.toLowerCase()
    const rawIdCandidate = queryParams.id ?? queryParams.formId ?? queryParams.detailId ?? null
    const rawId = rawIdCandidate ? rawIdCandidate.replace(/^["']|["']$/g, '') : null
    const explicitView = queryParams.view?.toLowerCase()

    // 1. 若存在 Splat 路由匹配（作为存量路径兼容层）
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

    // 2. 纯 Query 驱动模式（主干约定：就两个核心状态 detail 与 edit/editor）
    // (a) 详情模式：type=detail（且有 id 与 enableDetail）
    if ((rawType === 'detail' || (!rawType && rawId && enableDetail)) && enableDetail && rawId) {
      const meta = getDetailMetadata ? getDetailMetadata(rawId) : { title: '', description: '' }

      // 决定是以整页单独页面显示还是以浮层抽屉/分屏显示
      const isPage =
        explicitView === 'page' ||
        isMobile ||
        (detailOpenMode === 'page' && explicitView !== 'sheet' && explicitView !== 'split')

      if (isPage) {
        return {
          type: 'page-detail',
          id: rawId,
          title: meta.title,
          description: meta.description,
        }
      }

      const floatingType =
        explicitView === 'split'
          ? 'split'
          : explicitView === 'sheet'
            ? 'sheet'
            : detailOpenMode === 'split'
              ? 'split'
              : 'sheet'

      return {
        type: 'floating-detail',
        id: rawId,
        floatingType,
        title: meta.title,
        description: meta.description,
      }
    }

    // (b) 表单模式：type 为 edit、editor 或 create
    const isEditMode = rawType === 'edit' || rawType === 'editor'
    const isCreateMode = rawType === 'create' || (!rawId && isEditMode)

    if (isEditMode || isCreateMode) {
      const mode = isCreateMode && !rawId ? 'create' : 'edit'
      const meta = getFormMetadata(mode, rawId ?? undefined)

      // 决定是以整页单独页面显示还是以浮层弹窗/分屏显示
      const isPage =
        explicitView === 'page' ||
        isMobile ||
        (formOpenMode === 'page' &&
          explicitView !== 'dialog' &&
          explicitView !== 'split' &&
          explicitView !== 'maximized')

      if (isPage) {
        return {
          type: 'page-form',
          mode,
          id: rawId ?? undefined,
          title: meta.title,
          description: meta.description,
        }
      }

      const floatingType =
        explicitView === 'split'
          ? 'split'
          : formOpenMode === 'split' &&
              explicitView !== 'dialog' &&
              explicitView !== 'maximized'
            ? 'split'
            : 'dialog'
      const isMaximized = explicitView === 'maximized'

      return {
        type: 'floating-form',
        mode,
        id: rawId ?? undefined,
        floatingType,
        isMaximized,
        title: meta.title,
        description: meta.description,
      }
    }

    // (c) 显式 view 驱动的兼容调度
    if (explicitView === 'split' && rawId) {
      if (enableDetail) {
        const meta = getDetailMetadata ? getDetailMetadata(rawId) : { title: '', description: '' }
        return {
          type: 'floating-detail',
          id: rawId,
          floatingType: 'split',
          title: meta.title,
          description: meta.description,
        }
      }
      const meta = getFormMetadata('edit', rawId)
      return {
        type: 'floating-form',
        mode: 'edit',
        id: rawId,
        floatingType: 'split',
        isMaximized: false,
        title: meta.title,
        description: meta.description,
      }
    }

    return { type: 'list' }
  }, [
    splatMatch,
    queryParams.id,
    queryParams.type,
    queryParams.view,
    queryParams.form,
    queryParams.formId,
    queryParams.detailId,
    formOpenMode,
    detailOpenMode,
    enableDetail,
    isMobile,
    getFormMetadata,
    getDetailMetadata,
  ])

  const isPageMode = activeView.type === 'page-form' || activeView.type === 'page-detail'
  const isFloatingMode =
    activeView.type === 'floating-form' || activeView.type === 'floating-detail'

  // 主动触发动作：纯 Query 驱动，所有表单状态均在 URL 保存
  const openCreate = useCallback(
    (initialValues?: Partial<TFormItem> | null) => {
      if (initialValues) {
        setFormInitialData(initialValues as TFormItem)
      }
      const preferredView = isMobile || formOpenMode === 'page' ? 'page' : formOpenMode === 'split' ? 'split' : null
      void setQueryParams({
        type: 'edit',
        id: null,
        view: preferredView,
        form: null,
        formId: null,
        detailId: null,
      })
    },
    [isMobile, formOpenMode, setQueryParams],
  )

  const openEdit = useCallback(
    (id: string | number, initialValues?: Partial<TFormItem> | null) => {
      if (initialValues) {
        setFormInitialData(initialValues as TFormItem)
      }
      const idStr = String(id)
      const preferredView = isMobile || formOpenMode === 'page' ? 'page' : formOpenMode === 'split' ? 'split' : null
      void setQueryParams({
        id: idStr,
        type: 'edit',
        view: preferredView,
        form: null,
        formId: null,
        detailId: null,
      })
    },
    [isMobile, formOpenMode, setQueryParams],
  )

  const openDetail = useCallback(
    (id: string | number) => {
      if (!enableDetail) return
      const idStr = String(id)
      const preferredView = isMobile || detailOpenMode === 'page' ? 'page' : detailOpenMode === 'split' ? 'split' : null
      void setQueryParams({
        id: idStr,
        type: 'detail',
        view: preferredView,
        form: null,
        formId: null,
        detailId: null,
      })
    },
    [enableDetail, isMobile, detailOpenMode, setQueryParams],
  )

  const setMaximized = useCallback(
    (maximized: boolean) => {
      void setQueryParams({
        view: maximized ? 'maximized' : null,
      })
    },
    [setQueryParams],
  )

  // 关闭 / 返回列表：只需清空 Query 参数，秒回列表根视图，杜绝跳转残留
  const close = useCallback(() => {
    setFormInitialData(null)
    if (splatMatch) {
      void navigate({ to: basePath as any })
    }
    void setQueryParams({
      id: null,
      type: null,
      view: null,
      form: null,
      formId: null,
      detailId: null,
    })
  }, [splatMatch, navigate, basePath, setQueryParams])

  // 从浮层放大为独立整页：纯 Query 叠加 view=page，就地全屏，不跨路由跳转
  const expandToPage = useCallback(() => {
    void setQueryParams({
      view: 'page',
    })
  }, [setQueryParams])

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
    setMaximized,
    close,
    expandToPage,
  }
}
