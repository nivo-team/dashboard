import {
  Button,
  DropdownMenu,
  Textarea,
  Tooltip,
  useKumoToastManager,
} from '@cloudflare/kumo'
import {
  ArrowUpIcon,
  AtIcon,
  CaretDoubleRightIcon,
  ChatCircleDotsIcon,
  CheckIcon,
  FileIcon,
  GearSixIcon,
  ImageIcon,
  PencilLineIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  StopIcon,
  XIcon,
  type Icon,
} from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteComposerDraft,
  getComposerDraft,
  listRouteRefItems,
  saveComposerDraft,
  sendAiMessage,
  stopAiMessage,
  useAiSessionStore,
} from '#/lib/ai'
import type {
  AiAttachment,
  AiImageFile,
  AiRouteRefItem,
  AiRouteRefKind,
  AiSurface,
  AiTextFile,
} from '#/lib/ai'
import { cn } from '#/lib/cn'
import {
  isAiComposerMode,
  usePreferencesStore,
  type AiComposerMode,
} from '#/lib/store'
import { getAppScope } from '#/lib/store/app-scope'
import {
  AiTaskBackplate,
  getActiveTaskData,
  type TaskItemData,
} from '#/components/ai-task-card'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'

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
 * 输入模式的菜单项：`labelKey` / `hintKey` 是 `ai` 命名空间下的文案键，`fallback` 是兜底。
 *
 * **模式名与说明都是本地化的**（中文「询问 / 自动」）—— 与 设置 → AI 的两种形态名同一条
 * 约定：代码里叫 ask / auto，但界面上不该把英文术语直接丢给各语言用户。
 *
 * **两项的差别落在「填写表单」这件事上**（工具层也是这么实现的）：
 * - `ask`：`fill_form` / `submit_form` 每次都要用户点确认；
 * - `auto`：`fill_form` 直接写、`submit_form` 在 `canSubmit()` 通过时直接提交
 *   （`call_write_api` 是例外，两种模式下都要确认）。
 * 菜单里那句说明就是把这条差别讲清楚 —— 只说「询问 / 自动」，用户猜不到它管什么。
 *
 * 图标同时用在**触发按钮**（跟着当前模式变）与**菜单项**（每项各一个）上：
 * 询问 = 铅笔（要动笔、但先给你看），自动 = 右向双箭头（放行、让它自己往下走）。
 */
const COMPOSER_MODE_OPTIONS: ReadonlyArray<{
  value: AiComposerMode
  labelKey: string
  fallback: string
  /** 菜单项第二行的说明（见上：说明它到底管哪一步） */
  hintKey: string
  hintFallback: string
  icon: Icon
  /** 图标是否随书写方向镜像：右向箭头要（RTL 的「前进」朝左），铅笔不要 */
  flipIcon?: boolean
}> = [
  {
    value: 'ask',
    labelKey: 'modeAsk',
    fallback: '询问',
    hintKey: 'modeAskHint',
    hintFallback: '每次填写表单都会请你确认',
    icon: PencilLineIcon,
  },
  {
    value: 'auto',
    labelKey: 'modeAuto',
    fallback: '自动',
    hintKey: 'modeAutoHint',
    hintFallback: '自动填写并提交表单',
    icon: CaretDoubleRightIcon,
    flipIcon: true,
  },
]

/** 一次能带几个附件：再多请求体（以及拼进消息的文本）就过大了，正常提问也用不到 */
export const AI_MAX_ATTACHMENTS = 4

/**
 * 图片单个上限。图片会以 **data URL** 同时进请求体与会话存档（base64 还会放大 ~1/3）。
 */
export const AI_MAX_IMAGE_BYTES = 4 * 1024 * 1024

/**
 * 文本文件（md / txt）单个上限。内容会被**解析出来拼进这一轮的 user 消息**、直接吃上下文，
 * 所以比图片严得多：256 KB 已经能装下一份不短的文档了。
 */
export const AI_MAX_TEXT_FILE_BYTES = 256 * 1024

/** 只收这几类文本文件：扩展名与 MIME **双认**（有些系统给不出 markdown 的 MIME） */
const TEXT_FILE_EXTENSIONS = /\.(md|markdown|txt)$/i

function isTextFile(file: File): boolean {
  return (
    file.type === 'text/markdown' ||
    file.type === 'text/plain' ||
    TEXT_FILE_EXTENSIONS.test(file.name)
  )
}

/** `File` → `AiImageFile`（data URL）。读失败就抛，由调用方兜成一条提示 */
function fileToImageFile(file: File): Promise<AiImageFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        kind: 'image',
        url: String(reader.result),
        // 少数文件系统回来的 `file.type` 是空串 —— 回落成通用图片类型
        mediaType: file.type || 'image/png',
        // 粘贴来的截图没有文件名，那就只靠媒体类型
        ...(file.name ? { name: file.name } : {}),
        size: file.size,
      })
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * `File` → `AiTextFile`：**在客户端**就把内容读出来（`File.text()`）。
 * 之后随消息当文本发出去，不做二进制上传 —— 这样任何厂商都能读，不依赖它对文档格式的支持。
 */
async function fileToTextFile(file: File): Promise<AiTextFile> {
  return {
    kind: 'text',
    name: file.name,
    size: file.size,
    text: await file.text(),
  }
}

/** 附件卡片上的体积文案（1024 进制，保留一位小数就够读了） */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 输入里**正在打的**那个 `@…`（`@` 必须是行首或空白之后的第一个字符 —— 否则
 * `zhang@example.com` 里的 `@example` 也会被当成引用）。
 *
 * 返回的 `start` 指向 `@` 本身：选中菜单项时用它把这段替换掉。
 * `query` 允许中文与 `:`（`@示例` / `@table-example:li` 都能搜）。
 */
function parseMentionQuery(draft: string): { query: string; start: number } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(draft)
  if (!match) return null
  return { query: match[2], start: match.index + match[1].length }
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
 * （滑杆：里面只有面板才有的「配置权限」，见 `#/components/ai-panel` 的权限视图）
 * 与发送按钮。面板与全屏对话页共用这一个组件，差别只在传不传 `onConfigurePermissions`。
 *
 * 两块浮层都**贴着整块输入区的上沿**浮出来（`anchor={composerRef}` + `w-[var(--anchor-width)]`）：
 * 触发按钮只是触发点，不是锚点（挂在颗小圆钮下面的浮层看着像另一个东西的附属品）。
 *
 * 其一：**`@` 引用面板**（命令面板的形态）—— 打 `@`、或点「+ → 引用位置」就浮出来，可以引用
 * 「哪个模块 / 哪个页面 / 哪一条记录」（`@table-example` / `@table-example:list` / `@table-example:1234`），
 * 另有一段「添加」放附件入口。行按 `kind` 分段，行内是「名字 + 灰色语法 + 右侧说明」。
 * 行的内容来自 `#/lib/ai/route-refs` —— 名字、图标、匹配词都取自导航清单，**这里不另加名单**；
 * 展开成路径那一步在发给模型时（`runtime.toModelMessages`）做，所以用户看到的还是自己打的那串字。
 *
 * 这块面板用 Kumo `DropdownMenu` 拼（弹出层、进出场、点外关闭都白拿），但**焦点全程留在输入框里**：
 * 面板是「输入框里的文字驱动」的，所以内容上挂了 `onFocus` 把 Base UI 送进菜单的焦点按回来。
 * 改这里的交互时先看那段注释 —— 三个参数（`modal` / `highlightItemOnHover` / `onFocus`）缺一不可。
 *
 * 其二：**「+」动作菜单** —— 刻意只有三行。会长的那份清单（模块 / 页面 / 记录）走 `@`，
 * 模块再多也不会把这个菜单撑爆。
 */
export function AiComposer({
  className,
  surface = 'panel',
  onConfigurePermissions,
}: AiComposerProps) {
  const { t } = useTranslation('ai')
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isMobile = useIsMobileViewport()

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
  const draftText = useAiSessionStore((state) => state.draftText)
  const draftAttachments = useAiSessionStore((state) => state.draftAttachments)
  const setDraft = useAiSessionStore((state) => state.setDraft)
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
    待发送的**附件**（图片与普通文件同一条路：data URL）。只活在输入区里：
    发出去那一刻交给会话 store，这里立刻清空 —— 与输入框的文本同一条规矩
    （发出去了才清，否则等于把用户选好的东西丢掉）。
  */
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isLoadedRef = useRef(false)
  const draftTimerRef = useRef<number | null>(null)

  // 消费来自 store 的草稿（回退修改或切换会话时装载到输入框中）
  useEffect(() => {
    if (draftText !== null) {
      setValue(draftText)
      setAttachments([...draftAttachments])
      setDraft(null, [])
      isLoadedRef.current = true
      textareaRef.current?.focus({ preventScroll: true })
    }
  }, [draftText, draftAttachments, setDraft])

  // 切换会话或初次挂载时：若当前输入框未被编辑，从 IndexedDB 读取对应会话的草稿
  useEffect(() => {
    let cancelled = false
    void getComposerDraft(getAppScope(), activeSessionId).then((draft) => {
      if (cancelled) return
      if (draft) {
        setValue(draft.text)
        setAttachments([...draft.attachments])
      }
      isLoadedRef.current = true
    })
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  // 用户打字或修改附件时：防抖 300ms 缓存到 IndexedDB（按 appId 与 sessionId 隔离，new session 使用独立 key）
  useEffect(() => {
    if (!isLoadedRef.current || isStreaming) return

    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current)
    }

    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null
      void saveComposerDraft(getAppScope(), activeSessionId, value, attachments)
    }, 300)

    return () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current)
      }
    }
  }, [value, attachments, activeSessionId, isStreaming])

  const toast = useKumoToastManager()

  /*
    附件提醒**统一走 toast** —— 输入区上方不再常驻一行提示文字（那行旧提示还占着附件区
    与工具行之间的位置）。**只在真被拦下时弹**：读不出来是 `error`，
    「收不下」（太大 / 类型不支持 / 超过 4 个被截掉）是 `warning`；
    刚好加到满、什么都没丢，就不弹 —— 别拿一条提醒去打扰一次成功的操作。
  */
  const notifyAttachment = (title: string, variant: 'warning' | 'error') => {
    toast.add({ title, variant })
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

  /**
   * `@` 面板的行：**附件入口**（沿用原来的能力，只是多了 `@` 这个入口）+ `route-refs` 里的模块。
   *
   * 每次都现算：菜单只在打 `@` 时打开，这点开销可以忽略；换成缓存反而要处理
   * 「切了应用 / 换了语言之后菜单没跟着变」的问题。
   */
  const buildMentionRows = (): AiRouteRefItem[] => {
    const attach: AiRouteRefItem = {
      id: 'attach',
      kind: 'add',
      token: '',
      syntax: '',
      name: t('addPhotoAndFiles', '添加照片和文件'),
      description: t('promptMentionAttachDesc', '从本机添加图片或 Markdown / 文本文件'),
      icon: ImageIcon,
      keywords: ['file', 'files', 'image', 'attachment', '附件', '文件', '图片'],
    }
    return [attach, ...listRouteRefItems()]
  }

  /**
   * 面板按 `kind` 分段的顺序 —— 与命令面板一样「名字在左、灰键在中、说明在右」，
   * 段标题把「添加到对话」和「引用某个位置」分开。**顺序只在这一个数组里**，
   * 段名走 `ai` 命名空间（7 语言）。
   */
  const MENTION_SECTIONS: ReadonlyArray<{ kind: AiRouteRefKind; labelKey: string; fallback: string }> = [
    { kind: 'add', labelKey: 'mentionSectionAdd', fallback: '添加' },
    { kind: 'module', labelKey: 'mentionSectionModule', fallback: '模块' },
    { kind: 'page', labelKey: 'mentionSectionPage', fallback: '页面' },
    { kind: 'record', labelKey: 'mentionSectionRecord', fallback: '记录' },
  ]

  /** 一行的匹配规则：名字 / 语法 / 说明 / 导航关键词四处都能命中（所以 `@示例` 与 `@table-example` 一样好使） */
  const mentionRowMatches = (row: AiRouteRefItem) => {
    const query = mentionToken?.query.trim().toLowerCase()
    if (!query) return true
    return (
      row.name.toLowerCase().includes(query) ||
      row.syntax.toLowerCase().includes(query) ||
      row.description.toLowerCase().includes(query) ||
      row.keywords.some((keyword) => keyword.toLowerCase().includes(query))
    )
  }

  /**
   * 面板的行。一处特别的兜底：`@table-example:1234` 是**合法的记录引用**，但没有任何一行的文案里
   * 含 `1234` —— 照普通规则它只会落到「没有匹配」。所以一条都没匹配上、而查询里又带着冒号时，
   * 把该模块的**记录行**留着（用户看到的是「表格示例详情」那一行），面板不闪、也不误报「没匹配上」。
   */
  const mentionRows = (() => {
    if (!mentionOpen) return []
    const rows = buildMentionRows()
    const matched = rows.filter(mentionRowMatches)
    if (matched.length > 0) return matched
    const query = mentionToken?.query.trim().toLowerCase() ?? ''
    if (query.indexOf(':') <= 0) return matched
    return rows.filter((row) => row.record && query.startsWith(row.token.toLowerCase()))
  })()

  /*
    面板按段渲染（段标题 + 行），但**键盘游标只有一个**：↑↓ / Enter / Tab 走的是
    `mentionRows` 的扁平序号，段标题不是可选项。所以给每行算一个扁平下标。
  */
  const mentionRowIndex = new Map(mentionRows.map((row, index) => [row.id, index]))
  const mentionSections = MENTION_SECTIONS.map((section) => ({
    ...section,
    rows: mentionRows.filter((row) => row.kind === section.kind),
  })).filter((section) => section.rows.length > 0)

  /*
    面板一打开就把焦点**按回输入框**。

    为什么：Base UI 的菜单遵循 ARIA 惯例，打开时会把焦点送进第一项 —— 而这块面板是
    「输入框里的文字驱动」的，焦点一走用户就没法接着打字过滤了（`@use` 里的 `use` 会打到菜单项上）。
    按回来之后键盘交互（↑↓ / Enter / Tab / Esc）统一由 `handleKeyDown` 处理，两种入口
    （点 `+` / 打 `@`）的行为因此完全一致。

    用 `useLayoutEffect` 先按住第一下：Base UI 那次聚焦是排到**下一帧**的（`enqueueFocus` 走 rAF），
    所以真正兜住它的是 `DropdownMenu.Content` 上的 `onFocus`（见那一段）；这里这一下是为了
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

  /** 存档里的值理论上已被 `merge` 校验过，这里再兜一次：查不到就按第一项显示。 */
  const activeMode =
    COMPOSER_MODE_OPTIONS.find((option) => option.value === composerMode) ??
    COMPOSER_MODE_OPTIONS[0]

  /** 触发按钮上的图标跟着当前模式走（询问 = 眼睛，自动 = 右向双箭头） */
  const ActiveIcon = activeMode.icon

  /*
    行尾那颗**设置按钮**什么时候渲染 —— 面板与全屏对话页共用这一个输入区，只靠参数区分：
    只有面板给「配置权限」（`onConfigurePermissions`）—— 权限视图是「整块替换面板内容」的，
    全屏对话页没有承载它的地方；没有入口时整颗不渲染（没有可选项的空菜单不如不给）。

    模型不在菜单里：真实模型与凭证都在 `apps/ai`，前端不选、也不需要知道。
  */
  const showSettingsMenu = onConfigurePermissions !== undefined
  // 正在跑一轮时禁用提交；文字与附件**有其一**就能发（截图直接问「这是什么」很常见）
  const canSubmit =
    (value.trim().length > 0 || attachments.length > 0) && !isStreaming

  const submit = () => {
    const next = value.trim()
    if ((!next && attachments.length === 0) || isStreaming) return
    // 真的发出去了才清空输入框与附件（否则等于把用户打的字、选好的东西丢掉）
    const outgoing = attachments
    setValue('')
    setAttachments([])
    setMentionOpen(false)
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    void deleteComposerDraft(getAppScope(), activeSessionId)
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
        点菜单项的这一刻正是「先关菜单、再打开系统文件选择器」（踩过这个坑，见组件头注释）。
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
   * 三道闸：单个超上限（图片 4 MB / 文本 256 KB）、总数超过 `AI_MAX_ATTACHMENTS`、读不出来；
   * 被拦下的原因**弹 toast**（不静默丢掉，也不在输入区里占一行文字）。
   *
   * **数量额度是图片与文本文件共用的**（`AI_MAX_ATTACHMENTS` 数的是「附件」这个总数，
   * 不给图片另开一份）—— 所以先看还有几个空位，只收得下的那几个。
   */
  const addAttachments = async (files: readonly File[]) => {
    if (files.length === 0) return

    /*
      已经满了：连文件都不用读，直接说「放不下了」。
      这条提示曾经是静默丢掉的（旧写法把它写在 `setAttachments` 的 updater 里，
      紧接着被外层那句「没有拦截原因」覆盖，于是用户只觉得多选的文件凭空少了几个）。
    */
    if (attachments.length >= AI_MAX_ATTACHMENTS) {
      notifyAttachment(t('attachmentLimit', '一次最多带 4 个附件'), 'warning')
      return
    }

    const accepted: AiAttachment[] = []
    /*
      被拦下的原因分两档，**一次手势只弹一条**：
      - `warning`「收不下」（太大 / 类型不支持 / 超额度）优先 —— 它通常意味着「这次选多了或
        选错了」，用户当场就能改；
      - `failure`「读不出来」只影响个别文件，换一个再选即可，所以让给上面那条。
    */
    let warning: string | null = null
    let failure: string | null = null

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        if (file.size > AI_MAX_IMAGE_BYTES) {
          warning = t('attachmentTooLarge', {
            size: '4 MB',
            defaultValue: '文件太大了（单个上限 {{size}}）',
          })
          continue
        }
        try {
          accepted.push(await fileToImageFile(file))
        } catch {
          failure = t('attachmentReadFailed', '这个文件读不出来，换一个试试')
        }
        continue
      }

      if (isTextFile(file)) {
        if (file.size > AI_MAX_TEXT_FILE_BYTES) {
          warning = t('attachmentTooLarge', {
            size: '256 KB',
            defaultValue: '文件太大了（单个上限 {{size}}）',
          })
          continue
        }
        try {
          accepted.push(await fileToTextFile(file))
        } catch {
          failure = t('attachmentReadFailed', '这个文件读不出来，换一个试试')
        }
        continue
      }

      warning = t(
        'attachmentUnsupported',
        '只支持图片、Markdown（.md）和文本（.txt）文件',
      )
    }

    /*
      数量闸：**在 setAttachments 之外**算出「收得下几个」——写在 updater 里会变成
      有副作用的 updater（StrictMode 下还会跑两遍），提示也就跟着不可靠了。
      数量超了时压过单文件那类原因：此刻用户最该先知道的是「放不下了」。
    */
    const room = Math.max(AI_MAX_ATTACHMENTS - attachments.length, 0)
    const kept = accepted.slice(0, room)
    if (accepted.length > kept.length) {
      warning = t('attachmentLimit', '一次最多带 4 个附件')
    }

    if (kept.length > 0) {
      // 双保险：并发/连点下也不越界（正常路径上 `room` 已经算好了）
      setAttachments((prev) => [...prev, ...kept].slice(0, AI_MAX_ATTACHMENTS))
    }

    /*
      提醒**只在真的被拦下时**弹（数量超了 / 太大 / 类型不支持 / 读不出来）——
      「刚好加到满」不弹：什么都没丢，弹一条只是打扰。
    */
    if (warning) notifyAttachment(warning, 'warning')
    else if (failure) notifyAttachment(failure, 'error')
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

      {/*
        待发送的附件：夹在输入区与工具行之间。**图片给缩略图，其余给文件卡片**
        （文件名 + 体积）—— 两者都是 data URL，不回读磁盘。
        每个附件右上角都有删除按钮，发出去之前随时能撤掉。
      */}
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2 px-4 py-3">
          {attachments.map((attachment, index) => (
            <li
              key={`${attachment.name ?? attachment.kind}-${index}`}
              className="relative"
            >
              {attachment.kind === 'image' ? (
                <img
                  src={attachment.url}
                  alt={attachment.name ?? t('attachmentPreview', '待发送的附件')}
                  className="size-16 rounded-lg object-cover ring-1 ring-kumo-line"
                />
              ) : (
                /*
                  文本文件（md / txt）给一张卡片：左边文件图标、右边文件名与体积。
                  内容不发到这里展示 —— 它随消息拼给模型，几百行文档堆在输入框上只会碍事。
                */
                <span className="flex h-16 w-44 items-center gap-2 rounded-lg bg-kumo-tint px-2.5 ring-1 ring-kumo-line">
                  <FileIcon size={18} className="shrink-0 text-kumo-subtle" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-xs text-kumo-default">
                      {attachment.name}
                    </span>
                    <span className="truncate text-xs text-kumo-subtle">
                      {formatFileSize(attachment.size)}
                    </span>
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                aria-label={t('attachmentRemove', '移除这个附件')}
                className="absolute -end-1.5 -top-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-kumo-base text-kumo-subtle ring-1 ring-kumo-line transition-colors hover:text-kumo-default"
              >
                <XIcon size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        这里**没有**「被拦下的原因」那一行：附件提醒（太大 / 类型不支持 / 读不出来 / 到上限）
        统一走 toast —— 见 `notifyAttachment`。输入区只留附件本身，不再被提示文字占一行。
      */}

      <div className="flex items-center gap-2 p-3 pt-0">
        {/*
          **「+」菜单**：目前只有「添加照片和文件」，**后续的新能力也往这里放** ——
          所以它从一开始就是 `DropdownMenu`，而不是为单项另写一个开关式的上传按钮；
          加一项就是加一个 `DropdownMenu.Item`，菜单内容与「怎么弹」都不用再改。

          样式用 `secondary`：与旁边的输入模式 pill 同族，一眼看出是「打开一个菜单」，
          而不是一颗纯图标的动作按钮（ghost 的那颗是设置按钮）。
        */}
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

        {/*
          **行首的「+」= 三件「跟这一轮对话直接有关」的小动作**（添加附件 / 引用位置 / 新对话）。

          长度刻意压住：真正会长的那份清单是「引用哪个模块 / 哪个页面 / 哪一条记录」，
          它走输入框里的 `@`（见下面那块面板）—— 模块一多，这里也不该被撑爆。

          菜单**锚在整块输入区上**（`anchor={composerRef}` + 宽 `var(--anchor-width)`）：
          看起来是贴着输入框上沿浮出来的一块，而不是挂在颗小圆钮下面。
        */}
        <DropdownMenu modal={false}>
          <Tooltip
            content={t('aiActions', 'AI 动作')}
            className="cursor-pointer"
            render={
              <DropdownMenu.Trigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    shape="circle"
                    size="sm"
                    aria-label={t('aiActions', 'AI 动作')}
                    className="!text-kumo-subtle not-disabled:hover:!text-kumo-default"
                  />
                }
              />
            }
          >
            <PlusIcon size={14} />
          </Tooltip>

          <DropdownMenu.Content
            side="top"
            align="start"
            anchor={composerRef}
            className="w-[var(--anchor-width)]"
          >
            <DropdownMenu.Item
              className="items-center gap-2.5 py-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon size={15} className="shrink-0 text-kumo-subtle" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm text-kumo-default">
                  {t('addPhotoAndFiles', '添加照片和文件')}
                </span>
                <span className="truncate text-xs text-kumo-subtle">
                  {t('promptMentionAttachDesc', '从本机添加图片或 Markdown / 文本文件')}
                </span>
              </span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className="items-center gap-2.5 py-2"
              onClick={startMention}
            >
              <AtIcon size={15} className="shrink-0 text-kumo-subtle" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm text-kumo-default">
                  {t('actionMention', '引用位置')}
                </span>
                <span className="truncate text-xs text-kumo-subtle">
                  {t('actionMentionDesc', '打一个 @ 引用模块、页面或某一条记录')}
                </span>
              </span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className="items-center gap-2.5 py-2"
              disabled={isStreaming}
              onClick={startNewSession}
            >
              <ChatCircleDotsIcon size={15} className="shrink-0 text-kumo-subtle" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm text-kumo-default">
                  {t('sessionNew', '新对话')}
                </span>
                <span className="truncate text-xs text-kumo-subtle">
                  {t('actionNewChatDesc', '从一段空白对话重新开始')}
                </span>
              </span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>

        {/*
          **`@` 引用面板**：在输入框里打 `@`（或点「+」里的「引用位置」）就浮出来，
          可以引用「哪个模块 / 哪个页面 / 哪一条记录」。样式照命令面板来：**段标题 + 行**，
          行里是「名字 + 灰色语法 + 右侧说明」—— 名字是主行，找东西比看语法快。

          弹出层用 Kumo `DropdownMenu`（底层 Base UI 的 Menu）：底色 / 圆角 / 阴影 / 进出场、
          点外面关闭、行的 hover / disabled 都白拿。

          **它没有 Trigger**：这块面板是「输入框里的文字驱动」的，没有哪颗按钮「属于」它；
          锚点显式给成整块输入区（`anchor={composerRef}`），所以不需要 Base UI 的触发元素。

          三处刻意的参数，都是为了把它从「菜单抢焦点」掰回「输入框驱动」：

          - `modal={false}`：菜单默认是模态的（铺一层遮罩、锁页面滚动），而这块面板必须一边开着
            一边让人在**输入框里继续打字过滤**，遮罩会把输入框挡在外面。
          - `highlightItemOnHover={false}`：Base UI 的菜单在鼠标扫过时会 focus 那一项，
            焦点一走输入框就收不到按键了；高亮改由我们自己的 `mentionActive` 标（见 Item 的 className）。
          - Content 上的 `onFocus`：见下面「焦点守卫」那一段。
        */}
        <DropdownMenu
          open={mentionOpen}
          onOpenChange={(next) => setMentionOpen(next)}
          modal={false}
          highlightItemOnHover={false}
        >
          <DropdownMenu.Content
            side="top"
            align="start"
            anchor={composerRef}
            /*
              宽度跟输入框一致；高度按住 Base UI 给的可用高度 —— 输入区贴在面板底部，
              万一上方放不下，Base UI 自己会翻到下面去（`--available-height` 保证它不溢出）。
            */
            className="w-[var(--anchor-width)] max-h-[min(24rem,var(--available-height))]"
            /*
              **焦点守卫**：Base UI 开菜单时会把焦点送进第一项（而且那一跳排在下一帧，
              所以只在 `useLayoutEffect` 里抢一次是不够的）。焦点一进面板就立刻还给输入框 ——
              它是「输入框里的文字驱动」的，焦点走了用户就没法接着打字过滤了，
              键盘交互（↑↓ / Enter / Tab / Esc）统一由 `handleKeyDown` 处理。
            */
            onFocus={() => textareaRef.current?.focus({ preventScroll: true })}
          >
            {mentionSections.map((section) => (
              <DropdownMenu.Group key={section.kind}>
                <DropdownMenu.Label className="px-2 pt-2 pb-1 text-xs font-medium text-kumo-subtle">
                  {t(section.labelKey, section.fallback)}
                </DropdownMenu.Label>
                {section.rows.map((row) => {
                  const RowIcon = row.icon
                  const index = mentionRowIndex.get(row.id) ?? 0
                  const active = index === mentionActive
                  return (
                    <DropdownMenu.Item
                      key={row.id}
                      /*
                        键盘选中的那一行由**我们自己**标（焦点始终留在输入框里，Base UI 内部那份高亮
                        跟不到我们的键盘游标），所以用 `bg-kumo-tint` 显式画出来 ——
                        与 Kumo 给 `data-highlighted` 用的 `bg-kumo-overlay` 是同色阶的近邻，
                        鼠标扫过与 ↑↓ 移动看起来没有差别。
                      */
                      className={cn(
                        'items-center gap-2 py-1.5',
                        active && 'bg-kumo-tint',
                      )}
                      // 选一行：附件行去开文件框，其余的 `@…` 写进输入框（见 `pickMentionRow`）
                      onClick={() => pickMentionRow(row)}
                      // 鼠标扫过也同步给键盘用的那份「当前行」，两种输入方式不会各记一份
                      onMouseMove={() => setMentionActive(index)}
                    >
                      <RowIcon size={15} className="shrink-0 text-kumo-subtle" />
                      {/* 主行是**名字**（表格示例）——语法在右边，灰一点、小一号 */}
                      <span className="shrink-0 truncate text-sm text-kumo-default">
                        {row.name}
                      </span>
                      {row.syntax ? (
                        <span className="shrink-0 font-mono text-xs text-kumo-subtle">
                          {row.syntax}
                        </span>
                      ) : null}
                      {/* 右侧说明：空间不够时先牺牲它（`min-w-0` + truncate） */}
                      <span className="ms-auto min-w-0 truncate text-xs text-kumo-subtle">
                        {row.description}
                      </span>
                      {/*
                        当前行给出「按 Tab 就能选中」的提示（命令面板里也是这个写法）。
                        只在当前行出现，所以面板整体不吵；`shrink-0` 保证它不被挤掉。
                      */}
                      {active ? (
                        <span className="ms-1 shrink-0 rounded border border-kumo-line px-1 text-[10px] text-kumo-subtle">
                          Tab
                        </span>
                      ) : null}
                    </DropdownMenu.Item>
                  )
                })}
              </DropdownMenu.Group>
            ))}

            {/* 认不出来的引用不静默：说清「没匹配上」，而不是把面板收掉让人以为坏了 */}
            {mentionRows.length === 0 ? (
              <p className="flex h-8 items-center px-2 text-xs text-kumo-subtle">
                {t('promptMentionNoMatch', {
                  query: mentionToken?.query ?? '',
                  defaultValue: '没有匹配“{{query}}”的引用',
                })}
              </p>
            ) : null}

            <p className="mt-1 border-t border-kumo-line px-2 pt-1.5 pb-1 text-[11px] text-kumo-subtle">
              {t('promptMentionHint', '输入以筛选；@模块:ID 可引用某一条记录')}
            </p>
          </DropdownMenu.Content>
        </DropdownMenu>

        <DropdownMenu>
          {/*
            Tooltip 一律走 `render={<Button/>}`（Kumo 的 Tooltip 自己就是 trigger，
            把按钮塞进 children 会得到嵌套 button）。`className="cursor-pointer"` 是必需的：
            Kumo 会给 trigger 补一个 `cursor-default`，按钮该是手型。
          */}
          <Tooltip
            content={t('modeTooltip', '切换输入模式')}
            className="cursor-pointer"
            render={
              <DropdownMenu.Trigger
                render={
                  // 截图里那颗 pill：`size="sm"` 的方形底 + `rounded-full`，文字比默认按钮淡一档
                  // （Kumo 的 secondary 把 `!text-kumo-default` 写成了 important，覆盖它也得带 `!`）。
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    // 可见文字只是当前模式名，读屏听不出这是「切换模式」的入口，所以把两者都报出来
                    aria-label={`${t('modeLabel', '输入模式')}: ${t(activeMode.labelKey, activeMode.fallback)}`}
                    className="rounded-full !text-kumo-subtle not-disabled:hover:!text-kumo-default"
                  />
                }
              />
            }
          >
            <ActiveIcon
              size={14}
              className={cn('shrink-0', activeMode.flipIcon && 'rtl-flip')}
            />
            <span>{t(activeMode.labelKey, activeMode.fallback)}</span>
          </Tooltip>

          {/*
            触发区在面板最底部：菜单必须**往上**弹，否则会顶出视口（`Content` 默认 sideOffset 8）。
            宽度要放得下第二行的说明，所以比普通菜单宽（`w-64`），说明允许折行、不做截断。
          */}
          <DropdownMenu.Content side="top" align="start" className="w-64">
            <DropdownMenu.RadioGroup
              value={composerMode}
              onValueChange={(value) => {
                if (isAiComposerMode(value)) setComposerMode(value)
              }}
            >
              {COMPOSER_MODE_OPTIONS.map((option) => {
                const OptionIcon = option.icon
                const selected = option.value === composerMode
                return (
                  /*
                    每一项是**两行**（标题 + 一句说明），与截图里那种「选项即解释」的写法
                    一致：只说「询问 / 自动」，没人知道它管的是表单要不要确认。

                    图标作为 children 的第一个节点 + `gap-2`，**不要**用 `icon` prop：
                    Kumo 那里写死了 `mr-2`（物理方向），RTL 下间距不会镜像。
                    基类是 `items-center`（单行菜单的居中）；这里两行文字，改成 `items-start`
                    让图标与勾跟**第一行**对齐（Kumo 的 `cn` 走 tailwind-merge，同类名会被顶掉）。
                  */
                  <DropdownMenu.RadioItem
                    key={option.value}
                    value={option.value}
                    className="items-start gap-2 py-2"
                  >
                    <OptionIcon
                      size={15}
                      className={cn(
                        'mt-0.5 shrink-0',
                        // 当前模式那颗用品牌色，一眼能看出选中的是哪个（勾在行尾，颜色在这里）
                        selected ? 'text-kumo-brand' : 'text-kumo-subtle',
                        option.flipIcon && 'rtl-flip',
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate">{t(option.labelKey, option.fallback)}</span>
                      <span className="text-xs leading-snug text-kumo-subtle">
                        {t(option.hintKey, option.hintFallback)}
                      </span>
                    </span>
                    {/*
                      选中标记自己画：Kumo 的 `RadioItemIndicator` 写死了 `ml-auto`（物理方向），
                      RTL 下会和 `ms-auto` 打架、把勾推到中间。这里只留 `ms-auto`。
                    */}
                    {selected ? (
                      <CheckIcon
                        size={14}
                        className="ms-auto mt-0.5 shrink-0 text-kumo-brand"
                      />
                    ) : null}
                  </DropdownMenu.RadioItem>
                )
              })}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu>

        {/*
          **行尾的设置按钮**：面板与全屏对话页共用这一个输入区，只靠参数区分 ——
          只有面板给「配置权限」（齿轮 `GearSixIcon`，`onConfigurePermissions`）——
          权限视图是「整块替换面板内容」的，全屏对话页没有承载它的地方。
          图标分工按 Cloudflare 那张参照图来：触发按钮是**滑杆**（`SlidersHorizontalIcon`），
          齿轮只出现在「配置权限」那一项上，别调换。尺寸取 `sm`（`size-6.5` = 26px），
          与提交位同档才齐平。行尾的 `ms-auto` 归**最左边**那颗：两处都挂会把剩余空隙平分、
          按钮跑到中间去（全屏页踩过一次）。

          模型相关项已从这里移除：真实模型与凭证都在 `apps/ai`（`AI_MODEL_ID` / AI Gateway），
          前端不再选模型、也不再声明模型能力。
        */}
        {showSettingsMenu ? (
          <DropdownMenu>
            <Tooltip
              content={t('aiSettings', 'AI 设置')}
              className="cursor-pointer"
              render={
                <DropdownMenu.Trigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      shape="circle"
                      size="sm"
                      aria-label={t('aiSettings', 'AI 设置')}
                      className="ms-auto !text-kumo-subtle not-disabled:hover:!text-kumo-default"
                    />
                  }
                />
              }
            >
              <SlidersHorizontalIcon size={14} />
            </Tooltip>

            {/* 与输入模式菜单同一个理由：贴底的行尾，菜单必须往上弹 */}
            <DropdownMenu.Content side="top" align="end" className="w-64">
              {onConfigurePermissions ? (
                <DropdownMenu.Item
                  onClick={onConfigurePermissions}
                  className="flex items-center gap-2.5"
                >
                  <GearSixIcon size={15} className="shrink-0 text-kumo-subtle" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-default">
                    {t('configurePermissions', '配置权限')}
                  </span>
                </DropdownMenu.Item>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu>
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
