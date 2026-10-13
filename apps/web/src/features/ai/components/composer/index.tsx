import { Button, Textarea, Tooltip, useKumoToastManager } from '@cloudflare/kumo'
import { ArrowUpIcon, StopIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { sendAiMessage, stopAiMessage, useAiSessionStore } from '#/features/ai/core'
import type { AiAttachment, AiRouteRefItem, AiSurface } from '#/features/ai/core'
import {
  AiTaskBackplate,
  getActiveTaskData,
  type TaskItemData,
} from '#/features/ai/components/task-card'
import { cn } from '#/lib/cn'
import { usePreferencesStore } from '#/lib/store'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'
import { isDesktop } from '#/native/bridge'
import { ComposerActionsMenu } from './actions-menu'
import { ComposerAttachmentList } from './attachment-list'
import {
  AI_MAX_ATTACHMENTS,
  fileToImageFile,
  fileToTextFile,
  planAttachments,
  type AttachmentNotice,
} from './attachments'
import { matchMentionRows, parseMentionQuery, buildMentionRows } from './mention'
import { MentionPanel } from './mention-panel'
import { ComposerModeMenu } from './mode-menu'
import { ComposerSettingsMenu } from './settings-menu'
import { useComposerDraft } from './use-composer-draft'

export interface AiComposerProps {
  className?: string
  /**
   * 当前容器（面板 / 全屏）—— **由渲染处显式传入**，一路带到工具上下文与提示词。
   *
   * 为什么不让下层自己判断：容器的差异（跳转是"确认卡"还是"建议卡"、要不要发
   * `update_search_params`）都挂在 `surface` 这一个维度上，而**渲染处是唯一确知自己在哪的人**；
   * 用路由字符串反推会在某次重命名后静默失配（见 `AiSurface` 的注释）。
   *
   * 缺省 `panel`：面板是默认容器，只有全屏对话页需要显式声明。
   */
  surface?: AiSurface
  /**
   * 「配置权限」入口：**传了才在设置菜单里放这一项**（与头行的折叠按钮同一个约定 ——
   * 用回调的有无表达「这个形态有没有入口」，不再另加一个布尔 prop）。
   *
   * 全屏对话页不传：那一页没有可替换的面板内容，权限仍走设置页 ——
   * 于是那里的行尾不再有设置按钮。
   *
   * 模型不再由前端选择（真实模型与凭证都在 `apps/ai`），所以这颗按钮里
   * **只剩「配置权限」一项**。
   */
  onConfigurePermissions?: () => void
}

/**
 * AI 面板的输入区：一块圆角输入框 + 左下角的**输入模式切换** + 行尾的圆形提交按钮。
 *
 * 外观对齐 Cloudflare 控制台的输入区（`ring` 画在整块外框上、聚焦时整块换成品牌色细环），
 * 因此内层 `Textarea` 只负责排版与自动增高，Kumo 自带的输入框外观（底色 / 边框 / 圆角 /
 * 内边距 / 自身聚焦环）在这里被逐项清零 —— **改外观只动外框这一层**，不要把 ring 加回 textarea。
 *
 * 两个键盘约定：`Enter` 提交、`Shift + Enter` 换行（不拦截，交给 textarea 默认行为）；
 * 输入法组字中的回车是「选词」，靠 `isComposing` 让开，否则中文 / 日文用户选词就会误提交。
 *
 * 尺寸随容器走：`Textarea` 的 `autoResize` 从 2 行起、最多 8 行（再多就在框内滚动），
 * 面板被拖窄 / 拉宽时 `ResizeObserver` 会重算换行后的高度，不需要外部传宽度。
 *
 * 工具行分两段：行首是**「+」= 一小组 AI 动作**（添加附件 / 引用位置 / 新对话），行尾是**设置按钮**
 * （滑杆：里面只有面板才有的「配置权限」，见 `#/features/ai/components/panel` 的权限视图）
 * 与发送按钮。面板与全屏对话页共用这一个组件，差别只在传不传 `onConfigurePermissions`。
 *
 * 两块浮层都**贴着整块输入区的上沿**浮出来（`anchor={composerRef}` + `w-[var(--anchor-width)]`）：
 * 触发按钮只是触发点，不是锚点（挂在颗小圆钮下面的浮层看着像另一个东西的附属品）。
 *
 * 其一：**`@` 引用面板** —— 见 `./mention-panel` 与 `./mention`（语法解析、行匹配都是纯函数）。
 * 其二：**「+」动作菜单** —— 见 `./actions-menu`。会长的那份清单（模块 / 页面 / 记录）走 `@`。
 *
 * ## 这一层还剩什么
 *
 * 只留**状态、键盘与提交**：草稿读写去了 `./use-composer-draft`，附件准入去了
 * `./attachments`，四块浮层 / 卡片各自成文件。原来这里是 1253 行的一整块。
 */
export function AiComposer({
  className,
  surface = 'panel',
  onConfigurePermissions,
}: AiComposerProps) {
  const { t } = useTranslation('ai')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isMobile = !isDesktop() && useIsMobileViewport()

  /**
   * 两块浮层的**定位基准**：整块输入区。
   *
   * 都锚在这里、都用 `side="top"` + 宽 `var(--anchor-width)` —— 于是它们看起来是「贴着输入框
   * 上沿浮出来的一整块」，而不是挂在那颗小小的「+」按钮下面。按钮只是**触发点**，不是锚点。
   */
  const composerRef = useRef<HTMLDivElement | null>(null)

  const isStreaming = useAiSessionStore((state) => state.status === 'streaming')
  const startNewSession = useAiSessionStore((state) => state.startNewSession)
  const activeSessionId = useAiSessionStore((state) => state.activeSessionId)
  const rewindMessageId = useAiSessionStore((state) => state.rewindMessageId)
  const cancelRollback = useAiSessionStore((state) => state.cancelRollback)
  const composerMode = usePreferencesStore((state) => state.aiComposerMode)
  const setComposerMode = usePreferencesStore((state) => state.setAiComposerMode)

  const messages = useAiSessionStore((state) => state.messages)
  const sessionStatus = useAiSessionStore((state) => state.status)
  /*
    任务卡的数据源有两路，**liveTasks 优先**：
    - `liveTasks`：批量计划正在执行时由 `manage_tasks` 逐步上报（每一步的状态都是真的）；
    - 否则回退到从历史消息里提取的清单（纯进度清单 / 任务已结束的留档形态）。
    后者只看得到"上一次 manage_tasks 调用时的状态"，批量执行期间它是静止的 —— 所以前者优先。
  */
  const liveTasks = useAiSessionStore((state) => state.liveTasks)
  const activeTaskData = liveTasks
    ? { tasks: liveTasks as unknown as TaskItemData[] }
    : getActiveTaskData(messages, sessionStatus)
  const [taskCollapsed, setTaskCollapsed] = useState(true)

  /*
    待发送的**附件**（图片与普通文件同一条路：data URL）与输入文本都由草稿 hook 管：
    只活在输入区里，发出去那一刻清空 —— 与输入框的文本同一条规矩
    （发出去了才清，否则等于把用户选好的东西丢掉）。
  */
  const { value, setValue, attachments, setAttachments, clearPersistedDraft } = useComposerDraft(
    activeSessionId,
    isStreaming,
    textareaRef,
  )

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const toast = useKumoToastManager()

  /*
    附件提醒**统一走 toast** —— 输入区上方不再常驻一行提示文字（那行旧提示还占着附件区
    与工具行之间的位置）。**只在真被拦下时弹**：读不出来是 `error`，
    「收不下」（太大 / 类型不支持 / 超过 4 个被截掉）是 `warning`；
    刚好加到满、什么都没丢，就不弹 —— 别拿一条提醒去打扰一次成功的操作。
  */
  const notifyAttachment = (notice: AttachmentNotice) => {
    switch (notice.kind) {
      case 'limit':
        toast.add({
          title: t('attachmentLimit', '一次最多带 4 个附件'),
          variant: 'warning',
        })
        return
      case 'unsupported':
        toast.add({
          title: t(
            'attachmentUnsupported',
            '只支持图片、Markdown（.md）和文本（.txt）文件',
          ),
          variant: 'warning',
        })
        return
      case 'unreadable':
        toast.add({
          title: t('attachmentReadFailed', '这个文件读不出来，换一个试试'),
          variant: 'error',
        })
        return
      case 'tooLarge':
        toast.add({
          title: t('attachmentTooLarge', {
            size: notice.size,
            defaultValue: '文件太大了（单个上限 {{size}}）',
          }),
          variant: 'warning',
        })
    }
  }

  /*
    `@` 引用面板（命令面板形态）：在输入框里打 `@` 或在「+」菜单中点「引用位置」打开。
    内容按「添加 → 模块 → 页面 → 记录」分段展示。

    `open` 受控：打 `@` / 点「引用位置」打开，点面板外（Base UI 的 outside press）与
    `Esc`（焦点在输入框里，所以由 `handleKeyDown` 接）最后都落到 `mentionOpen` 上。
  */
  const [mentionOpen, setMentionOpen] = useState(false)
  /** 键盘与鼠标**共用**的那一份「当前行」（焦点留在输入框里，所以高亮得自己记，见 `handleKeyDown`） */
  const [mentionActive, setMentionActive] = useState(0)

  /*
    刚点了「记录」那一行（插入 `@table-example:`）：接下来用户是**在补 ID**，这期间不能再弹菜单 ——
    否则每敲一个数字，同一块面板就会弹回来一次。补到打了空格（或把冒号删了）就恢复正常。
  */
  const recordTypingRef = useRef(false)

  /** 输入里正在打的 `@…`；`null` = 当前不在打引用 */
  const mentionToken = parseMentionQuery(value)
  /** 面板当前该显示的行；关着就一行都不算（`matchMentionRows` 是纯函数，见 `./mention`） */
  const mentionRows = mentionOpen
    ? matchMentionRows(buildMentionRows(t), mentionToken?.query ?? '')
    : []

  /*
    面板一打开就把焦点**按回输入框**。

    为什么：Base UI 的菜单遵循 ARIA 惯例，打开时会把焦点送进第一项 —— 而这块面板是
    「输入框里的文字驱动」的，焦点一走用户就没法接着打字过滤了（`@use` 里的 `use` 会打到菜单项上）。
    按回来之后键盘交互（↑↓ / Enter / Tab / Esc）统一由 `handleKeyDown` 处理，两种入口
    （点 `+` / 打 `@`）的行为因此完全一致。

    用 `useLayoutEffect` 先按住第一下：Base UI 那次聚焦是排到**下一帧**的（`enqueueFocus` 走 rAF），
    所以真正兜住它的是 `MentionPanel` 里 `DropdownMenu.Content` 上的 `onFocus`；这里这一下是为了
    让焦点在**绘制之前**就回到输入框，不至于看到面板里的焦点环闪一下。
  */
  useLayoutEffect(() => {
    if (mentionOpen) textareaRef.current?.focus({ preventScroll: true })
  }, [mentionOpen])

  /*
    打开面板就能直接打字：输入区**每次挂载**都聚焦一次 —— 而面板打开、浮窗从折叠态
    展开都会让输入区重新挂载（关闭 / 折叠时整段会话区与输入区都不渲染），所以
    「每次打开 / 展开都聚焦」不需要额外的信号。

    两处讲究：
    - `preventScroll: true`：Split 进场时面板宽度还在从 0 长出来（此刻输入框被
      `overflow-hidden` 裁在外侧），默认的滚动补偿会把页面横向拽一下；
    - **移动端不抢焦点**：软键盘会立刻弹起来挡住刚打开的对话，想打字时点一下更合意。
      是否自动聚焦在**挂载时**定一次即可 —— 之后视口跨断点不该再抢一次焦点。
  */
  const autoFocus = useRef(!isMobile)
  useEffect(() => {
    if (!autoFocus.current) return
    textareaRef.current?.focus({ preventScroll: true })
  }, [])

  /*
    行尾那颗**设置按钮**什么时候渲染 —— 面板与全屏对话页共用这一个输入区，只靠参数区分：
    只有面板给「配置权限」（`onConfigurePermissions`）—— 权限视图是「整块替换面板内容」的，
    全屏对话页没有承载它的地方；没有入口时整颗不渲染（没有可选项的空菜单不如不给）。
  */
  const showSettingsMenu = onConfigurePermissions !== undefined
  // 正在跑一轮时禁用提交；文字与附件**有其一**就能发（截图直接问「这是什么」很常见）
  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !isStreaming

  const submit = () => {
    const next = value.trim()
    if ((!next && attachments.length === 0) || isStreaming) return
    // 真的发出去了才清空输入框与附件（否则等于把用户打的字、选好的东西丢掉）
    const outgoing = attachments
    setValue('')
    setAttachments([])
    setMentionOpen(false)
    clearPersistedDraft()
    void sendAiMessage(next, composerMode, outgoing, surface)
  }

  /**
   * 输入变化：顺手看一眼尾巴上是不是在打 `@…`，是就把引用面板打开、并按新内容过滤。
   *
   * 面板的两个入口都收敛到 `mentionOpen` 上：**点「+」**（Base UI 自己 toggle）与
   * **打 `@`**（这里）—— 所以「什么时候弹」这件事不需要第三份状态。
   */
  const handleValueChange = (next: string) => {
    setValue(next)
    if (useAiSessionStore.getState().error) {
      useAiSessionStore.setState({ error: null })
    }

    const token = parseMentionQuery(next)
    if (recordTypingRef.current) {
      // 还在补记录 ID（`@table-example:1234`）：继续压着菜单；冒号被删掉或整段没了就解除
      if (!token || !token.query.includes(':')) {
        recordTypingRef.current = false
      } else {
        setMentionOpen(false)
        return
      }
    }

    if (!token) {
      setMentionOpen(false)
      return
    }
    setMentionOpen(true)
    setMentionActive(0)
  }

  /** 选中一行：附件行去开系统文件框，其余把 `@…` 写进输入框 */
  const pickMentionRow = (row: AiRouteRefItem) => {
    // 把打了一半的那段（`@use`）整段换掉，而不是接在后面
    const head = mentionToken ? value.slice(0, mentionToken.start) : value

    if (row.kind === 'add') {
      setMentionOpen(false)
      setValue(head)
      /*
        文件选择器挂在**菜单外面**（根节点下常驻），所以这里关掉面板不会把 `<input>` 一起卸载 ——
        点菜单项的这一刻正是「先关菜单、再打开系统文件选择器」（踩过这个坑，见 `pickMentionRow` 上方）。
      */
      fileInputRef.current?.click()
      return
    }

    // 记录模板（`@table-example:`）**不留尾空格**：光标停在冒号后面，等用户补上 ID
    setValue(`${head}@${row.token}${row.record ? '' : ' '}`)
    recordTypingRef.current = row.record === true
    setMentionOpen(false)
    setMentionActive(0)
    textareaRef.current?.focus({ preventScroll: true })
  }

  /**
   * 「引用位置」这个动作 = **替用户打一个 `@`**：插进输入框、把面板打开、焦点留在输入框。
   *
   * 焦点用 `requestAnimationFrame` 抢：Base UI 关菜单时会把焦点还给那颗「+」（是一次 microtask），
   * rAF 一定晚于它、又早于下一次绘制 —— 所以看不到焦点在中途闪一下。
   */
  const startMention = () => {
    recordTypingRef.current = false
    // 前一个字符不是空白就补一个空格，别把 `@` 粘在词尾上（`看看@table-example` 解析不出来）
    setValue((prev) => (prev === '' || /\s$/.test(prev) ? `${prev}@` : `${prev} @`))
    setMentionOpen(true)
    setMentionActive(0)
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    /*
      引用面板开着时，键盘先让给它：↑↓ 换行、Enter / Tab 选中、Esc 收起。
      **必须排在「Enter 发送」前面** —— 否则选中的那一下会顺手把消息发出去。
    */
    if (mentionOpen && mentionRows.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionActive(
          (current) =>
            (current + (event.key === 'ArrowDown' ? 1 : mentionRows.length - 1)) %
            mentionRows.length,
        )
        return
      }
      if (
        event.key === 'Tab' ||
        (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing)
      ) {
        event.preventDefault()
        pickMentionRow(mentionRows[Math.min(mentionActive, mentionRows.length - 1)])
        return
      }
    }

    if (event.key === 'Escape' && mentionOpen) {
      // 先收面板：Esc 的语义是「把浮出来的东西按回去」，不是清空输入框
      event.preventDefault()
      setMentionOpen(false)
      return
    }

    // 两个键盘约定：Enter 提交、Shift + Enter 换行（不拦截，交给 textarea 默认行为）
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  /**
   * 收附件：文件选择与粘贴都走这里。
   *
   * **只收两类**：图片（以 `FilePart` 发给模型）与 md / txt 文本文件（**客户端解析**成文本、
   * 随消息拼进去）。其余类型**直接说清楚支持哪些**，而不是收下再让厂商报错。
   *
   * 三道闸（单个超上限 / 总数超过 `AI_MAX_ATTACHMENTS` / 类型不在白名单）与提示优先级
   * 都在 `./attachments` 的 `planAttachments` 里（纯函数、有单测）；这里只负责**读文件**
   * 与把结果灌进状态 —— 读不出来只影响个别文件，所以单独记一个标志。
   */
  const addAttachments = async (files: readonly File[]) => {
    if (files.length === 0) return

    const plan = planAttachments(files, attachments.length)
    const kept: AiAttachment[] = []
    let unreadable = false

    for (const { file, kind } of plan.accepted) {
      try {
        kept.push(kind === 'image' ? await fileToImageFile(file) : await fileToTextFile(file))
      } catch {
        unreadable = true
      }
    }

    if (kept.length > 0) {
      // 双保险：并发/连点下也不越界（正常路径上 `planAttachments` 已按剩余额度截过）
      setAttachments((prev) => [...prev, ...kept].slice(0, AI_MAX_ATTACHMENTS))
    }

    // 「收不下」压过「读不出来」；一条都没被拦下就不打扰（连个 toast 都不用）
    const notice: AttachmentNotice | undefined =
      plan.notice ?? (unreadable ? { kind: 'unreadable' } : undefined)
    if (notice) notifyAttachment(notice)
  }

  /** 粘贴收附件：管理后台里截图后 ⌘/Ctrl+V 直接问，是最顺手的路径 */
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length === 0) return
    event.preventDefault()
    void addAttachments(files)
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const hasBackplate = Boolean(rewindMessageId || activeTaskData)

  return (
    <div className="flex w-full flex-col gap-2">
      {/* 后置层叠卡片（回退修改或任务推进）：自适应高度流式布局，输入框始终紧密贴合在下方，彻底杜绝布局漂移 */}
      <div className="relative w-full">
        {rewindMessageId ? (
          <div className="flex items-start justify-between rounded-t-2xl border-t border-x border-kumo-line bg-kumo-tint px-3.5 pt-1.5 pb-4 text-xs text-kumo-subtle">
            <div className="flex items-center min-w-0">
              <span className="truncate text-[11px] text-kumo-subtle">
                {t('rollbackHint', '正在回退修改该消息，发送后将覆盖后续回答')}
              </span>
            </div>
            <button
              type="button"
              onClick={cancelRollback}
              title={t('cancelRollback', '取消回退')}
              className="ms-2 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-kumo-subtle transition-colors hover:bg-kumo-fill hover:text-kumo-default"
            >
              <XIcon size={12} />
            </button>
          </div>
        ) : activeTaskData ? (
          <AiTaskBackplate
            tasks={activeTaskData.tasks}
            collapsed={taskCollapsed}
            onToggleCollapsed={() => setTaskCollapsed((v) => !v)}
          />
        ) : null}

        <div
          // 两块浮层（「+」动作菜单与 `@` 面板）的锚点 —— 它们都贴在这一层的上沿浮出来
          ref={composerRef}
          // 粘贴收图挂在外层：事件从 textarea 冒泡上来，不必给 Kumo 的 Textarea 透传 onPaste
          onPaste={handlePaste}
          className={cn(
            // `relative` 只用于内部绝对定位（附件卡片的删除按钮）；浮层由 Kumo portal 出去、以本层为锚点
            'relative z-1 flex flex-col rounded-2xl bg-kumo-control ring-1 ring-kumo-line transition-all shadow-xs',
            // 焦点态：整块外框换成品牌色细环（`ring-1` 无变体、`has-[…]` 带变体，后者在后、能覆盖）
            'has-[textarea:focus]:ring-[1.5px] has-[textarea:focus]:ring-kumo-brand/50',
            hasBackplate && '-mt-2.5',
            className,
          )}
        >
          <Textarea
            ref={textareaRef}
            value={value}
            onValueChange={handleValueChange}
            onKeyDown={handleKeyDown}
            autoResize
            minRows={2}
            maxRows={8}
            aria-label={t('inputLabel', 'AI 输入框')}
            placeholder={t('inputPlaceholder', '输入你的问题…')}
            // 清零 Kumo 输入框的默认外观：底色 / 圆角 / padding / 自身 ring 全部让给外层框。
            // 用方向后缀（`px-4 pt-4 pb-0`）而不是 `p-4`，避免与 Kumo 的 `py-2` 拼出多余的上下留白。
            className="min-h-0 rounded-none border-0 bg-transparent px-4 pt-4 pb-0 ring-0 focus:ring-0"
          />

          <ComposerAttachmentList attachments={attachments} onRemove={removeAttachment} />

          {/*
            这里**没有**「被拦下的原因」那一行：附件提醒（太大 / 类型不支持 / 读不出来 / 到上限）
            统一走 toast —— 见 `notifyAttachment`。输入区只留附件本身，不再被提示文字占一行。
          */}

          <div className="flex items-center gap-2 p-3 pt-0">
            {/*
              文件选择器：**必须挂在菜单外面**（常驻在根节点下）。
              曾经把它放进 `DropdownMenu.Content`，而点击菜单项正是「先关菜单、再打开系统文件选择器」
              —— Content 一卸载，元素就没了，选完文件回来的 `change` 自然没人接（表现就是
              「选了一张图但附件区什么都没出现」）。
            */}
            <input
              ref={fileInputRef}
              type="file"
              // 与 `addAttachments` 支持的类型一致：图片 + Markdown / 纯文本
              accept="image/*,.md,.markdown,.txt"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                // 先清空 value：连着选同一个文件也要能再次触发 change
                event.target.value = ''
                void addAttachments(files)
              }}
            />

            <ComposerActionsMenu
              anchorRef={composerRef}
              disabled={isStreaming}
              onPickFiles={() => fileInputRef.current?.click()}
              onStartMention={startMention}
              onNewSession={startNewSession}
            />

            <MentionPanel
              open={mentionOpen}
              onOpenChange={setMentionOpen}
              rows={mentionRows}
              query={mentionToken?.query ?? ''}
              activeIndex={mentionActive}
              onActiveChange={setMentionActive}
              onPick={pickMentionRow}
              anchorRef={composerRef}
              textareaRef={textareaRef}
            />

            <ComposerModeMenu value={composerMode} onChange={setComposerMode} />

            {showSettingsMenu ? (
              <ComposerSettingsMenu
                onConfigurePermissions={() => onConfigurePermissions?.()}
              />
            ) : null}

            {isStreaming ? (
              /*
                跑一轮时把提交位换成「停止」：模型答到一半发现跑偏了，用户必须能打断。
                `abortSignal` 一路传到 `streamText`，中止后 `chat.ts` 会把 status 复位。
              */
              <Tooltip
                content={t('stopTooltip', '停止生成')}
                className="cursor-pointer"
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    shape="circle"
                    size="sm"
                    // 设置按钮在时 `ms-auto` 归它；没有设置按钮（全屏对话页没有权限入口）才归提交位
                    className={showSettingsMenu ? undefined : 'ms-auto'}
                    onClick={stopAiMessage}
                    aria-label={t('stop', '停止')}
                  />
                }
              >
                <StopIcon size={12} weight="fill" />
              </Tooltip>
            ) : (
              <Tooltip
                content={t('sendTooltip', '发送消息（Enter 发送，Shift + Enter 换行）')}
                className="cursor-pointer"
                render={
                  <Button
                    type="button"
                    variant="primary"
                    shape="circle"
                    size="sm"
                    // 同上：有设置按钮时由它顶到行尾；没有时提交位自己顶
                    className={showSettingsMenu ? undefined : 'ms-auto'}
                    disabled={!canSubmit}
                    onClick={submit}
                    aria-label={t('send', '发送')}
                  />
                }
              >
                {/* 上下向图标：跟随的是「提交」语义，不随书写方向翻转，不加 rtl-flip */}
                <ArrowUpIcon size={14} />
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
