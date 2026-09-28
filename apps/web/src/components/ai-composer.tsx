import { Button, DropdownMenu, Textarea, Tooltip } from '@cloudflare/kumo'
import {
  ArrowUpIcon,
  BrainIcon,
  CaretDoubleRightIcon,
  CheckIcon,
  CpuIcon,
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
import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { sendAiMessage, stopAiMessage, useAiSessionStore } from '#/lib/ai'
import type { AiAttachment, AiImageFile, AiTextFile } from '#/lib/ai'
import { cn } from '#/lib/cn'
import {
  isAiComposerMode,
  useAiConfigStore,
  usePreferencesStore,
  type AiComposerMode,
  type AiReasoningLevel,
} from '#/lib/store'
import { useIsMobileViewport } from '#/lib/use-mobile-viewport'

export interface AiComposerProps {
  className?: string
  /**
   * 「配置权限」入口：**传了才在设置菜单里放这一项**（与头行的折叠按钮同一个约定 ——
   * 用回调的有无表达「这个形态有没有入口」，不再另加一个布尔 prop）。
   *
   * 它与「选择模型」共享行尾同一颗设置按钮、同一个下拉（模型是子菜单，见组件注释）。
   * 全屏对话页不传：那一页没有可替换的面板内容，权限仍走设置页 ——
   * 于是那里的下拉只剩「选择模型」一项。
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
 * 工具行分两段：行首是**「+」菜单**（`DropdownMenu`，目前只有「添加照片和文件」，
 * 后续的新能力也往这里放），行尾是**设置按钮**（滑杆：选择模型 + 思考程度 + 只有面板才有的
 * 配置权限，见 `#/components/ai-panel` 的权限视图）与发送按钮。
 * 面板与全屏对话页共用这一个组件，差别只在传不传 `onConfigurePermissions`。
 */
export function AiComposer({ className, onConfigurePermissions }: AiComposerProps) {
  const { t } = useTranslation('ai')
  const router = useRouter()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isMobile = useIsMobileViewport()

  const isStreaming = useAiSessionStore((state) => state.status === 'streaming')
  const composerMode = usePreferencesStore((state) => state.aiComposerMode)
  const setComposerMode = usePreferencesStore((state) => state.setAiComposerMode)

  /*
    模型是**全局配置**（`admin.ai`，不按应用隔离 —— 见 `#/lib/store/ai-store`）：
    这里只读当前模型列表 / 选中项与切换动作，配置本身仍归 设置 → AI。
  */
  const models = useAiConfigStore((state) => state.models)
  const providers = useAiConfigStore((state) => state.providers)
  const activeModelId = useAiConfigStore((state) => state.activeModelId)
  const setActiveModel = useAiConfigStore((state) => state.setActiveModel)
  const updateModel = useAiConfigStore((state) => state.updateModel)

  /*
    待发送的**附件**（图片与普通文件同一条路：data URL）。只活在输入区里：
    发出去那一刻交给会话 store，这里立刻清空 —— 与输入框的文本同一条规矩
    （发出去了才清，否则等于把用户选好的东西丢掉）。
  */
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  /** 当前模型。`activeModelId` 可能悬空（模型刚被删），store 的 `merge` 会兜，这里再兜一次 */
  const activeModel = models.find((model) => model.id === activeModelId) ?? null

  /** 模型条目第二行里的厂商标注；厂商名取不到就只留模型名 */
  const providerName = (providerId: string) =>
    providers.find((provider) => provider.id === providerId)?.name ?? ''

  /** 图片入口只在模型声明支持视觉时才给：发给不支持的模型会被厂商直接拒掉 */
  const supportsVision = activeModel?.supportsVision === true
  /** 可切换的思考程度档位；空数组 = 这个模型没声明支持推理，菜单里不出现这一项 */
  const reasoningLevels = activeModel?.reasoningLevels ?? []

  /*
    行尾那颗**设置按钮**什么时候渲染、里面有什么 —— 面板与全屏对话页共用这一个输入区，
    只靠参数区分：
    - 两处都给「选择模型」（没配模型时换成一条「去设置」的引导）；
    - 只有面板给「配置权限」（`onConfigurePermissions`）—— 权限视图是「整块替换面板内容」
      的，全屏对话页没有承载它的地方。
    一个模型都没配、又没有权限入口时整颗不渲染（没有可选项的空菜单不如不给）。
  */
  const showSettingsMenu = models.length > 0 || onConfigurePermissions !== undefined
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
    setAttachmentError(null)
    void sendAiMessage(next, composerMode, outgoing)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
   * 被拦下的原因写进 `attachmentError` 贴着输入框显示，不静默丢掉。
   */
  const addAttachments = async (files: readonly File[]) => {
    const accepted: AiAttachment[] = []
    let error: string | null = null

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        if (file.size > AI_MAX_IMAGE_BYTES) {
          error = t('attachmentTooLarge', {
            size: '4 MB',
            defaultValue: '文件太大了（单个上限 {{size}}）',
          })
          continue
        }
        try {
          accepted.push(await fileToImageFile(file))
        } catch {
          error = t('attachmentReadFailed', '这个文件读不出来，换一个试试')
        }
        continue
      }

      if (isTextFile(file)) {
        if (file.size > AI_MAX_TEXT_FILE_BYTES) {
          error = t('attachmentTooLarge', {
            size: '256 KB',
            defaultValue: '文件太大了（单个上限 {{size}}）',
          })
          continue
        }
        try {
          accepted.push(await fileToTextFile(file))
        } catch {
          error = t('attachmentReadFailed', '这个文件读不出来，换一个试试')
        }
        continue
      }

      error = t(
        'attachmentUnsupported',
        '只支持图片、Markdown（.md）和文本（.txt）文件',
      )
    }

    if (accepted.length === 0) {
      if (error) setAttachmentError(error)
      return
    }
    setAttachments((prev) => {
      const merged = [...prev, ...accepted]
      if (merged.length > AI_MAX_ATTACHMENTS) {
        setAttachmentError(t('attachmentLimit', '一次最多带 4 个附件'))
        return merged.slice(0, AI_MAX_ATTACHMENTS)
      }
      return merged
    })
    setAttachmentError(error)
  }

  /** 粘贴收附件：管理后台里截图后 ⌘/Ctrl+V 直接问，是最顺手的路径 */
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length === 0) return
    event.preventDefault()
    /*
      模型没声明视觉时，**粘贴进来的图片不收**（与菜单里那条命令被禁用是同一条规矩）；
      文本文件不受影响 —— 它走的是文本，跟模型能不能看图无关。
    */
    const accepted = supportsVision
      ? files
      : files.filter((file) => !file.type.startsWith('image/'))
    if (accepted.length === 0) return
    void addAttachments(accepted)
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
    setAttachmentError(null)
  }

  /** 切思考程度：写回**该模型**的配置（按模型记住），与设置页声明的是同一份数据 */
  const selectReasoning = (level: AiReasoningLevel) => {
    if (!activeModel) return
    updateModel(activeModel.id, { reasoning: level })
  }

  return (
    <div
      // 粘贴收图挂在外层：事件从 textarea 冒泡上来，不必给 Kumo 的 Textarea 透传 onPaste
      onPaste={handlePaste}
      className={cn(
        // `relative` 是「+」命令面板的定位基准（面板贴在输入框上沿浮出来）
        'relative flex flex-col rounded-2xl bg-kumo-control ring-1 ring-kumo-line transition-all',
        // 焦点态：整块外框换成品牌色细环（`ring-1` 无变体、`has-[…]` 带变体，后者在后、能覆盖）
        'has-[textarea:focus]:ring-[1.5px] has-[textarea:focus]:ring-kumo-brand/50',
        className,
      )}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onValueChange={setValue}
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
        <ul className="flex flex-wrap gap-2 px-4 pt-3">
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

      {/* 被拦下的附件（太大 / 超数量 / 读不出来）在这里说明，而不是静默丢掉 */}
      {attachmentError ? (
        <p className="px-4 pt-2 text-xs text-kumo-danger">{attachmentError}</p>
      ) : null}

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

        <DropdownMenu>
          <Tooltip
            content={t('compose', '添加内容')}
            className="cursor-pointer"
            render={
              <DropdownMenu.Trigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    shape="circle"
                    size="sm"
                    aria-label={t('compose', '添加内容')}
                    className="!text-kumo-subtle not-disabled:hover:!text-kumo-default"
                  />
                }
              />
            }
          >
            <PlusIcon size={14} />
          </Tooltip>

          <DropdownMenu.Content side="top" align="start" className="w-64">

            {/*
              菜单项**只有标题**（一行一条，与后续要加的其它能力一致）；
              模型没声明视觉时这条**禁用**，原因走原生 `title` —— 鼠标停一下能看到，
              不占版面。入口本身不藏：突然消失比灰着更让人困惑。
            */}
            <DropdownMenu.Item
              disabled={!supportsVision}
              onClick={() => fileInputRef.current?.click()}
              title={
                supportsVision
                  ? undefined
                  : t('visionUnsupported', '当前模型未声明支持图像识别')
              }
              className="items-center gap-2.5 text-sm"
            >
              <ImageIcon size={16} className="shrink-0 text-kumo-subtle" />
              <span className="min-w-0 flex-1 truncate">
                {t('addPhotoAndFiles', '添加照片和文件')}
              </span>
            </DropdownMenu.Item>
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
          - **选择模型**（子菜单）：两处都给；一个模型都没配时换成一条「去设置」的引导；
          - **配置权限**（齿轮 `GearSixIcon`）：只有面板给（`onConfigurePermissions`）——
            权限视图是「整块替换面板内容」的，全屏对话页没有承载它的地方。
          图标分工按 Cloudflare 那张参照图来：触发按钮是**滑杆**（`SlidersHorizontalIcon`），
          齿轮只出现在「配置权限」那一项上，别调换。尺寸取 `sm`（`size-6.5` = 26px），
          与提交位同档才齐平。行尾的 `ms-auto` 归**最左边**那颗：两处都挂会把剩余空隙平分、
          按钮跑到中间去（全屏页踩过一次）。
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
              {/*
                选择模型：列表来自 `#/lib/store/ai-store` 的 `models`，点一项 `setActiveModel`。
                触发项是**一行**（左边标签、右边当前模型名，`flex-1 text-end` 顶到箭头前），
                与「设置项 = 标题 + 当前值」的写法一致。
                Kumo 的 `SubTrigger` 自带行尾右向箭头，不要再自绘；图标也别用 `icon` prop。
              */}
              {models.length > 0 ? (
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="gap-2 text-sm">
                    <CpuIcon size={15} className="shrink-0 text-kumo-subtle" />
                    <span className="shrink-0 truncate">{t('selectModel', '选择模型')}</span>
                    <span className="min-w-0 flex-1 truncate text-end text-kumo-subtle">
                      {activeModel?.displayName ?? t('modelNone', '未选择')}
                    </span>
                  </DropdownMenu.SubTrigger>

                  <DropdownMenu.SubContent className="w-64">
                    {models.map((model) => {
                      const isActive = model.id === activeModelId
                      return (
                        <DropdownMenu.Item
                          key={model.id}
                          onClick={() => setActiveModel(model.id)}
                          className="items-start gap-2 py-2 text-sm"
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate">{model.displayName}</span>
                            <span className="truncate text-xs leading-snug text-kumo-subtle">
                              {[providerName(model.providerId), model.modelId]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                          {isActive ? (
                            <CheckIcon
                              size={14}
                              className="ms-auto mt-0.5 shrink-0 text-kumo-brand"
                            />
                          ) : null}
                        </DropdownMenu.Item>
                      )
                    })}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Sub>
              ) : (
                /*
                  一个模型都没配：给一条**去设置**的引导，而不是留一个空菜单 ——
                  去处与 `AiConversation` 未配置时的空态一致（设置 → AI）。
                */
                <DropdownMenu.Item
                  onClick={() => router.navigate({ to: '/settings/AI' })}
                  className="items-start gap-2 py-2 text-sm"
                >
                  <CpuIcon size={15} className="mt-0.5 shrink-0 text-kumo-subtle" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">{t('modelEmpty', '还没有配置模型')}</span>
                    <span className="truncate text-xs leading-snug text-kumo-subtle">
                      {t('goToSettings', '去设置')}
                    </span>
                  </span>
                </DropdownMenu.Item>
              )}

              {/*
                思考程度：档位来自**这个模型声明的 `reasoningLevels`**（设置 → AI → 模型里勾的），
                这里只负责选当前用哪一档；选择写回模型配置本身（按模型记住）。
                运行时把它当作 AI SDK v7 的顶层 `reasoning` 参数发出去。
                档位名复用设置页那一份（`common:profile.settings.aiReasoningLevels`），不另抄一份。
              */}
              {reasoningLevels.length > 0 ? (
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="gap-2 text-sm">
                    <BrainIcon size={15} className="shrink-0 text-kumo-subtle" />
                    <span className="shrink-0 truncate">{t('reasoning', '思考程度')}</span>
                    <span className="min-w-0 flex-1 truncate text-end text-kumo-subtle">
                      {t(
                        `common:profile.settings.aiReasoningLevels.${
                          activeModel?.reasoning ?? 'provider-default'
                        }`,
                        activeModel?.reasoning ?? 'provider-default',
                      )}
                    </span>
                  </DropdownMenu.SubTrigger>

                  <DropdownMenu.SubContent className="w-64">
                    {reasoningLevels.map((level) => {
                      const isActive =
                        (activeModel?.reasoning ?? 'provider-default') === level
                      return (
                        <DropdownMenu.Item
                          key={level}
                          onClick={() => selectReasoning(level)}
                          className="gap-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {t(`common:profile.settings.aiReasoningLevels.${level}`, level)}
                          </span>
                          {isActive ? (
                            <CheckIcon
                              size={14}
                              className="ms-auto shrink-0 text-kumo-brand"
                            />
                          ) : null}
                        </DropdownMenu.Item>
                      )
                    })}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Sub>
              ) : null}

              {models.length > 0 && onConfigurePermissions ? <DropdownMenu.Separator /> : null}

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
                // 设置按钮在时 `ms-auto` 归它；没有设置按钮（全屏页且没配模型）才归提交位
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
  )
}
