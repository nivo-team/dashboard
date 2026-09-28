import { AiComposer } from '#/components/ai-composer'
import { AiConversationScroller } from '#/components/ai-conversation-scroller'
import { aiChatWidthClass, isAiChatBoxed } from '#/lib/page-width'
import { usePreferencesStore } from '#/lib/store'

/**
 * 全屏对话页的**内容本体**：会话区 + 输入区（头行在布局里，见 `sphere-header.tsx`）。
 *
 * 「新会话」（`sphere/`）与「指定会话」（`sphere/chat/$chatId`）两个路由共用这一个组件 ——
 * 差别只在**会话怎么选中**（见各自的路由文件），界面完全一致。
 *
 * 两段都是 `shrink-0` / `flex-1` 的标准列布局：输入区固定在底、会话区在中间滚动 ——
 * 对话再长也不会把输入框顶出视口（**不要**把输入区放进滚动容器里）。
 * 输入区上沿**不画分隔线**：会话区自带留白，那条线只会把整块面板切碎。
 *
 * ## 宽度与滚动条
 *
 * 档位来自 设置 → AI → 页面宽度（跟随外观 / 全宽 / 限宽居中，见 `#/lib/page-width`
 * 的 `aiChatWidthClass`）；限宽用的是聊天自己的 `max-w-4xl`（比页面的 1440px 窄）。
 *
 * 关键在于**约束挂在哪里**：会话区与输入区用**同一份宽度类**，但都挂在「内容」这一层 ——
 * 滚动容器本身仍然铺满整个面板。
 *
 * - 如果收窄的是滚动容器（早先的写法），滚动条会跟着跑到收窄后的那条边上：
 *   限宽居中时它就孤零零地悬在面板中间，两边留白还不对称；
 * - 现在滚动容器铺满 → **滚动条始终贴在面板边缘**（限宽模式下也是），收窄的只是里面的内容；
 * - 代价是滚动条出现时内容会左右挪一下，所以给滚动容器开 `stableScrollbarGutter`
 *   （`scrollbar-gutter: stable both-edges`）：槽位固定在两边，内容既不跳动、
 *   中心也和下方不滚动的输入区始终对在同一根中轴上。
 *
 * 头行由布局持有，不受这一档影响。
 *
 * ## 会话加载
 *
 * `AiConversationScroller` 传 `manageHistory={false}`（会话区与面板共用同一份滚动行为）：
 * 这一页的会话由**路由**决定、历史列表由**布局**（`route.tsx`）统一加载。
 * 两处都加载会互相覆盖。
 */
export function SphereChat() {
  const aiPageWidth = usePreferencesStore((state) => state.aiPageWidth)
  // 「跟随外观」要解析成外观那一档，所以这里也得读它
  const pageWidth = usePreferencesStore((state) => state.pageWidth)
  const widthClass = aiChatWidthClass(aiPageWidth, pageWidth)
  // 只有限宽居中档需要给滚动条两边留固定槽位（铺满档留了只是凭空多两道空白）
  const boxed = isAiChatBoxed(aiPageWidth, pageWidth)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 与 AI 面板共用同一份滚动行为（跟随滚动 / 上翻暂停 / 回到底部按钮） */}
      <AiConversationScroller
        manageHistory={false}
        stableScrollbarGutter={boxed}
        // 宽度约束挂在**滚动内容**上：滚动容器铺满，滚动条才留在面板边缘
        contentClassName={widthClass}
      />

      {/*
        上沿不画分隔线（见文件头注释）。
        输入区是「被显示的一部分」，所以跟着同一档宽度走：外层 `p-3` 铺满负责下边距，
        内层用同一份宽度类与上方内容对齐。
      */}
      <div className="shrink-0 p-3">
        <div className={widthClass}>
          <AiComposer />
        </div>
      </div>
    </div>
  )
}
