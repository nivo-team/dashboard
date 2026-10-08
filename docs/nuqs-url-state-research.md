# nuqs × TanStack Router URL 状态调研（2026-09）

**采集时间**：2026-09-29（本机 CST）。本文件里的版本号 / peer / 许可 / 体积 / npm exports / 类型签名 / 运行时行为，**全部取自一次性的 primary source 实测**：`registry.npmjs.org` 原始 JSON、`npm pack nuqs@2.10.1` 下来的发布包 tarball（含包内 sourcemap 还原出的原始 TS）、GitHub 对应 tag 的源码、nuqs 官方文档的 mdx 源文件（`packages/docs/content/docs/*.mdx`）、以及本机安装的 `@tanstack/react-router` / `@tanstack/router-core` 源码。**类型行为用真实 `tsc --strict` 跑过**（见 §6.3）。凡没能确认的一律进 §10，不猜。

**评估前提（项目硬约束）**：React 19.2 + Vite 8 + TS（`moduleResolution: bundler`、`verbatimModuleSyntax`、`strict`）纯客户端 SPA（**无 SSR**）；TanStack Router file-based；本机实测安装 `@tanstack/react-router@1.170.40`（其 `dependencies` 指向 `@tanstack/router-core@1.171.33`；任务描述里的 1.170.39 属同一条 1.170.x 线，本文件引用的 `router-core` 源码在 1.171.32 / 1.171.33 上逐文件比对一致）；**所有路由都挂在动态段 `$appId` 下**；pnpm；**nuqs 尚未安装**。

---

## 一、结论先说（TL;DR）

1. **nuqs 2.10.1 可用**：MIT、ESM-only、**明确声明 React 19**（peer `react: ">=18.2.0 || ^19.0.0-0"`），`@tanstack/react-router: "^1"` 是 *optional* peer。体积实测：主入口 **min 17.3 KB / gzip 6.28 KB**，加上 TSR adapter 再多 **+1.38 KB min / +0.53 KB gzip**。
2. **官方 TanStack Router adapter 确实存在**：入口 `nuqs/adapters/tanstack-router`，**只导出一个 `NuqsAdapter`**，挂在 root route 的 `component` 里包住 `<Outlet />`（必须在 `RouterProvider` 之内）。官方把它定性为 **experimental，且不支持 TanStack Start**。
3. **解析权是「读归 TSR、per-key 归 nuqs」**：adapter 直接读 `router.state.location.search`（TSR `parseSearch` 出来的对象，**未经 `validateSearch`**），再摊平成 `URLSearchParams` 交给 nuqs 的 per-key parser；写回时走 `router.navigate({ to: pathname + querystring })`，**因此写回会经过 TSR 的 `validateSearch` 与 search middlewares**。→ **读=未校验，写=经过校验**，这是后面所有冲突的根源。
4. **最大风险：动态段路由 + `validateSearch` 会让 URL 出现两段 query string** —— upstream issue [#1590](https://github.com/47ng/nuqs/issues/1590)（nuqs 2.10.1 + TSR 1.170.35 已复现，**至今 open**，修复 PR [#1596](https://github.com/47ng/nuqs/pull/1596) / [#1598](https://github.com/47ng/nuqs/pull/1598) 未合并）。**本仓库所有列表页都在 `$appId` 动态段下**，正好命中触发条件（见 §5.4 / §9）。
5. **`shallow` 对本项目无意义**：官方明确「it has no effect in React SPA」，且 adapter 源码只读 `options.history` 与 `options.scroll`，**完全忽略 `options.shallow`**。`history` / `scroll` 则被正确映射为 `navigate({ replace, resetScroll })`。
6. **类型安全可以做到「缺键 / 多键 / 值类型不符」全部编译期拦截，但必须换一种写法**：`useQueryStates` 的参数是 `KeyMap extends UseQueryStatesKeysMap`，**接受映射类型**；然而把 parser 标注成 `SingleParserBuilder<Q[K]>` 会**抹掉 `.withDefault()` 的非空推断**（`tsc` 实测：状态全变 `T | null`）。**这会直接打到 `.agents/docs/table-query-and-crud.md` 里 `defineFilterParsers` 的现设计**（见 §6.5）。

---

## 二、版本 / 许可 / peer / 体积（实测）

### 2.1 registry 原始数据

```bash
npm view nuqs version peerDependencies dist-tags --json
# => version 2.10.1 ; dist-tags: latest=2.10.1, beta=2.10.2-beta.1,
#    snapshot=0.0.0-snapshot.2025-10-10.7b3a5b
```

| 项目 | 实测值 | 来源 |
| --- | --- | --- |
| 最新版 | **2.10.1**，发布于 **2026-08-25T10:59:58Z** | [registry `/nuqs`](https://registry.npmjs.org/nuqs) `time['2.10.1']` |
| 发布节奏 | 2026-08-20 → 2.10.0，2026-08-25 → 2.10.1；beta 2.10.2-beta.1（2026-08-28）。历史共 130 个版本 | 同上 `time` / `versions` |
| 许可 | **MIT**（包内 `LICENSE` + registry `license`） | [registry latest](https://registry.npmjs.org/nuqs/latest) |
| 模块形态 | `"type": "module"`，exports 只有 `types` / `import` / `default`，**全包无任何 `require` 条件** → **ESM-only，无 CJS 构建** | `npm pack` 后读 `package.json`（[tag v2.10.1](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/package.json)） |
| peerDependencies | `react: ">=18.2.0 \|\| ^19.0.0-0"`、`@tanstack/react-router: "^1"`、`next: ">=14.2.0"`、`react-router: "^5\|^6\|^7\|^8"`、`@remix-run/react: ">=2"`、`react-router-dom: "^5\|^6\|^7"` | [registry latest](https://registry.npmjs.org/nuqs/latest) |
| peerDependenciesMeta | 除 `react` 外**全部 `optional: true`**（含 `@tanstack/react-router`）→ 不装 TSR 也能装 nuqs，反之亦然 | 同上 |
| 运行时依赖 | **只有 1 个**：`@standard-schema/spec@1.1.0`（纯类型，实际不进 bundle） | 同上；Bundlephobia `dependencyCount: 1` |
| `sideEffects` | `["./dist/debug.js"]` | 同上 |
| unpackedSize / 文件数 | **472,544 B / 101 files**（含 `.js.map`、README 31.8 KB、根目录 `adapters/*.d.ts` 兼容垫片） | `dist.unpackedSize` |
| 供应链 | `dist.attestations.provenance.predicateType = https://slsa.dev/provenance/v1`（有 npm provenance） | 同上 |
| 仓库 | [47ng/nuqs](https://github.com/47ng/nuqs)，10,861★，45 open issues，默认分支 **`next`**（不是 `main`），最近 push 2026-09-28 | [GitHub API](https://api.github.com/repos/47ng/nuqs) |

> ⚠️ **默认分支是 `next`**。引用源码时要么用 tag `v2.10.1`，要么用 `/blob/next/...`；`main` 在这个仓库里不存在（`raw.githubusercontent.com/47ng/nuqs/main/...` 实测 404）。

### 2.2 体积（本地 rolldown 实测 + Bundlephobia 对照）

用本机 `rolldown@1.2.9`（Vite 8 自带的那套）对 `nuqs@2.10.1` 的发布包做 `minify: true` 打包，external 掉 `react`、`react/jsx-runtime`、`@tanstack/react-router`：

| 入口 | min | gzip |
| --- | --- | --- |
| `export * from 'nuqs'` | 17,274 B | **6,275 B** |
| 同上 + `export { NuqsAdapter } from 'nuqs/adapters/tanstack-router'` | 18,653 B | **6,803 B** |
| **adapter 增量** | **+1,379 B** | **+528 B** |

Bundlephobia 对同一版本给的是 `size 17,559 / gzip 6,285`（[bundlephobia](https://bundlephobia.com/package/nuqs@2.10.1)），与本地实测差 1.6%（构建配置不同），可互相印证。**结论：全量引入 nuqs 的成本约 6.3 KB gzip，TSR adapter 再 +0.5 KB，对后台管理台可忽略。**

### 2.3 ESM / SSR

- **ESM-only**：`"type": "module"`，exports 映射里没有任何 `require` 条件（`JSON.stringify(exports).includes('"require"') === false`）。本项目 Vite + `moduleResolution: bundler`，无影响。
- **没有 SSR 要求**。nuqs 支持 SSR/RSC（有 `nuqs/server`、`createLoader`、`createSearchParamsCache`），**但纯客户端 SPA 是官方一等公民**：文档里专列一节 React SPA（Vite）示例，并说明 SPA 场景下 `shallow: false` 无效果（[adapters.mdx#L101-L119](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/adapters.mdx#L101-L119)）。
- 所有入口文件首行都是 `"use client"`（Next.js RSC 指令），在 Vite 下是普通字符串，无副作用。

---

## 三、adapter 入口清单（npm exports 实测）

`npm pack nuqs@2.10.1` 后读 `exports` 字段（与 [registry latest](https://registry.npmjs.org/nuqs/latest) 一致）：

**根入口**
- `nuqs` → `dist/index.js`（hooks / parsers / 类型）
- `nuqs/server` → `dist/server.js`（`createLoader`、`createSearchParamsCache`、`createSerializer`…）
- `nuqs/debug` → `dist/debug.js`
- `nuqs/testing` → `dist/testing.js`（**注意与 `nuqs/adapters/testing` 是两个不同的入口**，见 §7.5）
- `nuqs/package.json`

**`nuqs/adapters/...`**

| 入口 | 说明 |
| --- | --- |
| `nuqs/adapters/next`、`nuqs/adapters/next/app`、`nuqs/adapters/next/pages` | Next.js |
| `nuqs/adapters/react` | **纯 React SPA**（History API + `popstate`，导出 `NuqsAdapter` / `enableHistorySync`） |
| `nuqs/adapters/remix` | Remix |
| `nuqs/adapters/react-router`、`.../v6`、`.../v7`、`.../v8` | React Router |
| `nuqs/adapters/custom` | 自建 adapter（`createAdapterProvider`） |
| `nuqs/adapters/testing` | `NuqsTestingAdapter` / `withNuqsTestingAdapter` |
| **`nuqs/adapters/tanstack-router`** | **✅ 存在**，产物 `dist/adapters/tanstack-router.js` |

> 包根目录还带一组 `adapters/*.d.ts` 垫片（如 [`adapters/tanstack-router.d.ts`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/adapters/tanstack-router.d.ts)），文件头注释写明：这是给 `moduleResolution: "node"` 的老 tsconfig 用的转发声明。本项目是 `bundler`，走 exports map，不受影响。

### 3.1 TSR adapter 的导入路径与导出名（精确）

```ts
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router'
```

- **导出名只有一个**：`NuqsAdapter`（`dist/adapters/tanstack-router.d.ts` 全文只有 `declare const NuqsAdapter: AdapterProvider; export { NuqsAdapter }`）。
- 类型是 `AdapterProvider`，形如 `(props: AdapterProps & { children: ReactNode }) => ReactElement`（[context.ts](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/lib/context.ts)）。
- ⚠️ 官方**没有**为 TSR 提供 `useOptimisticSearchParams`（那是 React Router / Remix adapter 才有的）。

### 3.2 官方文档原文（adapters 页面 TSR 一节）

> ```tsx title="src/routes/__root.tsx"
> import { NuqsAdapter } from 'nuqs/adapters/tanstack-router'
> import { Outlet, createRootRoute } from '@tanstack/react-router'
>
> export const Route = createRootRoute({
>   component: () => (
>     <>
>       <NuqsAdapter>
>         <Outlet />
>       </NuqsAdapter>
>     </>
>   ),
> })
> ```
>
> **TanStack Router support is experimental and does not yet cover TanStack Start.**

来源：[adapters.mdx#L318-L340](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/adapters.mdx#L318-L340)（线上：[nuqs.dev/docs/adapters#tanstack-router](https://nuqs.dev/docs/adapters#tanstack-router)）。README 里同一段还多一句「Supported TanStack Router versions: `@tanstack/react-router@^1`」（[README#L219-L238](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/README.md)）。

### 3.3 setup 要求与限制

| 问题 | 答案 | 证据 |
| --- | --- | --- |
| 要包裹 app 吗？ | 要。挂在 **root route 的 `component`** 里包住 `<Outlet />`，不是 `main.tsx` 里包 `RouterProvider` | [adapters.mdx#L320-L334](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/adapters.mdx#L320-L334) |
| 需要 RouterProvider context 吗？ | **需要**。adapter 内部调用 `useLocation` / `useRouterState` / `useRouter`，必须在 router 的 React 树内 | [tanstack-router.ts#L1, L26, L31, L49](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts#L26) |
| 需要 route 定义 `validateSearch` 吗？ | **不需要**。读取走 `location.search`，与 `validateSearch` 无关（见 §4.2） | 同上 + [router.ts#L1456-L1477](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L1456) |
| TanStack Start | **不支持**（官方原话） | [adapters.mdx#L338](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/adapters.mdx#L338) |
| `urlKeys`（URL 短键名） | 官方标注 **TanStack Router 不支持** | [batching.mdx#L139-L150](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/batching.mdx#L139-L150) |
| 参与 TSR 类型安全链接的类型 | 只有「trivial」类型：字符串族（string / enum / literal）、数字族（integer / float / number literal）、boolean、JSON。**数组不在名单里** | [adapters.mdx#L394-L404](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/adapters.mdx#L394-L404) |
| `shallow` | **被忽略**（源码只读 `history` / `scroll`；SPA 下本来也无意义） | [tanstack-router.ts#L93-L119](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts#L93-L119) + [options.mdx#L79-L80](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L79-L80) |
| 源码里的 self-caveat | adapter 注释自陈：用 `to: pathname + querystring` 而不是 TSR 的 `search` 选项，是因为后者要求用户把 nuqs 定义与路由声明缝在一起；作者自己写了「**TBC if it causes issues with consuming those search params in other parts of the app**」 | [tanstack-router.ts#L99-L108](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts#L99-L108) |

---

## 四、TanStack Router adapter 的实现（逐行）

源码：[`packages/nuqs/src/adapters/tanstack-router.ts` @ v2.10.1](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts)（155 行）。已核对：**发布包 `dist/adapters/tanstack-router.js.map` 里 `sourcesContent` 还原出的原始 TS 与该 tag 文件 `diff` 完全一致**，所以下面的行号对 2.10.1 的发布产物同样成立。`next` 分支同名文件当前也是 155 行、内容相同（未修，见 §5.4）。

### 4.1 用到的 router API

| 调用 | 位置 | 用途 |
| --- | --- | --- |
| `useLocation({ select: s => s.pathname })` | L26 | 当前 pathname |
| `useRouterState({ select: s => Object.fromEntries(Object.entries(s.location.search).filter(([k]) => watchKeys.includes(k))), structuralSharing: true })` | L31-L39 | **核心读路径**：拿 TSR 已解析的 search 对象，只保留 nuqs 关心的 key。注释说明用 `useRouterState` 而非 `useLocation` 是为了把 `structuralSharing` 传下去，避免 viewport preload 下的无限重渲染（[issue #1363](https://github.com/47ng/nuqs/issues/1363)） |
| `useRouterState({ select: s => s.resolvedLocation?.pathname ?? s.location.pathname })` | L46-L48 | 跨页 pending 期间区分「已提交路由」与「目标路由」，避免旧页面读到新页面参数（[issue #1433](https://github.com/47ng/nuqs/issues/1433)） |
| `useRouter().navigate` | L49-L50, L98-L115 | 写 URL |
| `router.history.subscribe(({action}) => …)` | L130-L146 | `HistorySpy`：只在 `BACK` / `FORWARD` / `GO` 时 `resetQueues()`，清掉挂起的更新队列（[PR #1547](https://github.com/47ng/nuqs/pull/1547)） |

**没有**用到 `router.subscribe`、`router.buildLocation`、`location.searchStr` 或 `router.parseLocation`。

### 4.2 读路径：TSR 解析 → 摊平 → nuqs 再解析

```ts
const searchParams = useMemo(
  () => new URLSearchParams(
    Object.entries(activeSearch).flatMap(([key, value]) => {
      if (Array.isArray(value)) return value.map(v => [key, v])          // 数组 → 重复 key
      else if (typeof value === 'object' && value !== null)
        return [[key, JSON.stringify(value)]]                            // 对象 → JSON 字符串
      else return [[key, value]]                                         // 标量 → 原样
    })
  ),
  [activeSearch, watchKeys.join(',')]
)
```
（[L69-L91](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts#L69-L91)）

链路结论：

1. **`state.location.search` 是 TSR `parseSearch` 的产物，不是 `validateSearch` 的产物。** `location` 由 `router.updateLatestLocation()` → `parseLocation(history.location, …)` 生成，内部是 `const parsedSearch = this.options.parseSearch(search)`；而 `validateSearch` 的结果落在 **match** 上（`const strictSearch = validateSearch(route.options.validateSearch, { ...parentSearch })`，之后 `match.search = { ...parentSearch, ...strictSearch }`）。`useSearch()` 读的是 `match.search`。（[router.ts `updateLatestLocation` L1383](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L1383)、[`parseLocation` L1456-L1477](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L1456)、[match 校验 L1614-L1625](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L1614)、[react-router `useSearch.tsx#L97-L105`](https://github.com/TanStack/router/blob/main/packages/react-router/src/useSearch.tsx)）
2. 因为 TSR 的默认解析是 **JSON-first**（`defaultParseSearch = parseSearchWith(JSON.parse)`），第一层标量已经被转成 number / boolean / null，嵌套结构已经是对象/数组；adapter 再把它们**逆变换回字符串**，然后交给 nuqs 的 per-key parser。（[searchParams.ts#L9-L14](https://github.com/TanStack/router/blob/main/packages/router-core/src/searchParams.ts#L9)、[search-params.md「JSON-first Search Params」](https://github.com/TanStack/router/blob/main/docs/router/guide/search-params.md)）
3. 所以 **`validateSearch` 里做的 clamp / 归一化，nuqs 读不到**：冷启动时 `useQueryState` 可能返回 999，而 `useSearch()` 已经是 100（若 validateSearch 把 999 夹到 100）。第一次 nuqs 写入之后，URL 会被 buildLocation 重写成校验后的值，两者才收敛。

### 4.3 写路径：绕过 TSR 的 typed `search`，走 `to: pathname + "?…"`

```ts
const updateUrl: UpdateUrlFunction = useCallback((search, options) => {
  startTransition(() => {
    navigate({
      from: '/',
      to: pathname + renderQueryString(search),
      replace: options.history === 'replace',
      resetScroll: options.scroll,
      hash: prevHash => prevHash ?? '',
      state: state => state
    })
  })
}, [navigate, pathname])
```
（[L93-L119](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts#L93-L119)）

- `search` 参数的底稿来自 `getSearchParamsSnapshot()` 的回退实现 `new URLSearchParams(location.search)`（adapter 没提供 `getSearchParamsSnapshot`），所以**非 nuqs 管理的 query 参数会被保留**。
- `shallow` **没有被读**：`AdapterOptions = Pick<Options, 'history' | 'scroll' | 'shallow'>` 传进来了，但函数体只用了 `history` 和 `scroll`（[adapters/lib/defs.ts](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/lib/defs.ts)）。
- `to` 是**字符串路径 + 查询串**，而 TSR 的 `buildLocation` **只从 `href` 里拆查询串、从不从 `to` 里拆**（`if (dest.href) { const parsed = parseHref(parsed.search) … }`），这正是 §5.4 那个 bug 的机制。
- 每次 `navigate()` 都会带 `_includeValidateSearch: true` → `getSearchMiddlewares(destRoutes, true)` → 目标路由的 **search middlewares + `validateSearch` 全都会跑**，结果再 `stringifySearch` 成新的查询串。（[router.ts navigate L2348](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L2348)、[`nextSearch` / `stringifySearch` L2103-L2112](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L2103)、[`getSearchMiddlewares` L2920-L2975](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L2920)）

### 4.4 多个参数的批处理（batching）

**不是** adapter 做的，是 nuqs 自己的全局队列：

- 同一事件循环 tick 内的多次 `setState`（跨 hook 也行）被合并进 `globalThrottleQueue` 的 `updateMap`，只 flush 一次 URL 更新；默认 **throttle**，时长按浏览器自适应：Chrome/Firefox 50ms，Safari 17+ 120ms，更老的 Safari 320ms。setState 返回的 Promise 会被缓存到下一次 flush，所以同 tick 的多次调用拿到**同一个 Promise 引用**。（[batching.mdx#L9-L76](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/batching.mdx#L9-L76)、[`defaultRateLimit` / `getDefaultThrottle`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/lib/queues/rate-limiting.ts)）
- TSR adapter 设了 **`rateLimitFactor: 1`**（测试 adapter 用它做倍率，生产 adapter 都是 1）。（[L121-L125](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts#L121-L125)）
- 队列在 `navigate` 的 `startTransition` 里提交，配合 React 19 的 async transition：setter 返回的 Promise 若被 await，`useTransition` 的 `isPending` 会一直 true 到 transition 结束。（[adapters/lib/defs.ts `UpdateUrlFunction` 注释](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/lib/defs.ts)、[options.mdx#L299-L346](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L299-L346)）
- 与 React Router adapter 的差别：RR adapter 设 `autoResetQueueOnUpdate: false` 并 patch history；TSR adapter **不设**，用默认 `true`（flush 后立即清队列）。（[react-router adapter](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/lib/react-router.ts)、[throttle 队列 `applyPendingUpdates`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/lib/queues/throttle.ts)）

---

## 五、冲突分析：nuqs 与 TSR 自己的 search 体系共存

### 5.1 TSR 这一侧的事实（用于对照）

| 能力 | 事实 | 来源 |
| --- | --- | --- |
| 默认序列化 | `parseSearch: parseSearchWith(JSON.parse)` / `stringifySearch: stringifySearchWith(JSON.stringify, JSON.parse)`；第一层扁平、非字符串值保留 number/boolean、嵌套结构 JSON 化 | [searchParams.ts#L9-L14](https://github.com/TanStack/router/blob/main/packages/router-core/src/searchParams.ts#L9)、[custom-search-param-serialization.md](https://github.com/TanStack/router/blob/main/docs/router/guide/custom-search-param-serialization.md) |
| 重复 key | `decode` 把 `?a=1&a=2` 变成数组 `[1, 2]`；`toValue` 还会把 `"123"` 变 number、`"true"/"false"` 变 boolean | [qss.ts `toValue` / `decode`](https://github.com/TanStack/router/blob/main/packages/router-core/src/qss.ts) |
| `validateSearch` | 收到的是「JSON 解析后、但未校验」的 `Record<string, unknown>`，返回强类型对象；支持函数 / `{ parse }` / Standard Schema 三形态 | [search-params.md「Validating Search Params」](https://github.com/TanStack/router/blob/main/docs/router/guide/search-params.md)、[router.ts `validateSearch()` L2841-L2869](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L2841) |
| 不定义 `validateSearch` | 合法。`location.search` 照样有（来自 `parseSearch`），`useSearch()` 返回该 match 的 `fullSearchSchema`，即父路由 search 的并集 | [router.ts L1614-L1620](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L1614) |
| `useNavigate({ search })` | 支持对象或函数 `(prev) => next`（`ParamsReducerFn`）；`search: true` 表示「保持当前」；另有 `replace` / `resetScroll` / `viewTransition` / `state` | [link.ts `NavigateOptionProps` / `ParamsReducerFn` / `ToOptions.search`](https://github.com/TanStack/router/blob/main/packages/router-core/src/link.ts)、[search-params.md#L536-L567](https://github.com/TanStack/router/blob/main/docs/router/guide/search-params.md) |
| search middlewares | route 选项 `search: { middlewares: [...] }`；文档原话「They are also executed upon navigation **after search validation**」 | [search-params.md「Transforming search with search middlewares」](https://github.com/TanStack/router/blob/main/docs/router/guide/search-params.md) |
| `retainSearchParams` / `stripSearchParams` | 从 `@tanstack/react-router` 导出（实现与类型在 router-core）；`stripSearchParams(true \| keyArray \| defaultsObject)`，传对象时**与默认值深比较后删除** | [`searchMiddleware.ts#L25-L89 / #L101-L141`](https://github.com/TanStack/router/blob/main/packages/router-core/src/searchMiddleware.ts)、API 文档 [retainSearchParams](https://tanstack.com/router/latest/docs/framework/react/api/router/retainSearchParamsFunction) / [stripSearchParams](https://tanstack.com/router/latest/docs/framework/react/api/router/stripSearchParamsFunction) |
| 执行顺序（源码） | `getSearchMiddlewares` 按 destRoutes 顺序，每个路由**先 push 该路由的 `search.middlewares`，再 push 由 `validateSearch` 包成的 middleware**；`stripSearchParams` 内部先 `next(search)`（即先跑校验）再删默认值 —— 与文档口径一致 | [router.ts L2920-L2975](https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts#L2920) |
| 原始查询串在哪 | `location.searchStr` 是**未经解读的字符串**；`location.search` 是解析后的对象 | [location.ts](https://github.com/TanStack/router/blob/main/packages/router-core/src/location.ts) |

### 5.2 谁拥有解析权（本调研最关键的一条）

```
URL 字符串
  │  TSR: parseSearch = parseSearchWith(JSON.parse)          ← TSR 拥有「全局、per-URL」解析
  ▼
router.state.location.search  ──── nuqs adapter 读这里（未经 validateSearch）
  │  adapter: flatMap → URLSearchParams（数组→重复key、对象→JSON.stringify）
  │  nuqs: parser.parse(searchParams.get(urlKey))            ← nuqs 拥有「per-key」解析
  ▼
useQueryState / useQueryStates 的状态

写：
useQueryStates 的 setter
  │  nuqs: parser.serialize → URLSearchParams（clearOnDefault 时删除 key）
  │  adapter: navigate({ to: pathname + "?" + querystring })  ← 只带 history / scroll
  ▼
TSR buildLocation（_includeValidateSearch: true）
  │  search.middlewares → validateSearch → stringifySearch
  ▼
history.push(publicHref) → parseLocation → 新的 location.search
```

**一句话：读路径上 nuqs 看到的是「TSR 粗解析 + nuqs 细解析」两次解析的叠加；写路径上 nuqs 的意图会被 TSR 的 `validateSearch` / middlewares 再加工一次。** 两边对同一 key 的解释只要有任何不一致（数组、对象、日期），就会出现「写进去 A、读出来 B」。

### 5.3 官方推荐的共存姿势（不是二选一）

官方文档专门给了「`validateSearch` 接入 nuqs」的写法 —— 把 nuqs 的 parser map 变成 Standard Schema 塞给路由：

```tsx
import { createStandardSchemaV1, parseAsIndex, parseAsString, useQueryStates } from 'nuqs'

const searchParams = {
  searchQuery: parseAsString.withDefault(''),
  pageIndex: parseAsIndex.withDefault(0),
}

export const Route = createFileRoute('/search')({
  component: RouteComponent,
  validateSearch: createStandardSchemaV1(searchParams, { partialOutput: true }),
})

function RouteComponent() {
  const [{ searchQuery, pageIndex }] = useQueryStates(searchParams)
  return <Link to="/search" search={{ searchQuery: 'foo' }} />  // pageIndex 可省
}
```
（[adapters.mdx#L342-L392](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/adapters.mdx#L342-L392)、线上 [nuqs.dev/docs/utilities#tanstack-router--validatesearch](https://nuqs.dev/docs/utilities#tanstack-router--validatesearch)）

- `partialOutput: true` 的源码注释原话：「This is useful for TanStack Router, to avoid reflecting default values (or null) in the URL, and to make search params optional in Links, as default values are handled by nuqs.」（[standard-schema.ts#L10-L21](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/standard-schema.ts#L10-L21)）
- 实现是 `serialize → load(strict) → 删掉 input 里没有的 key`，所以「空输入 → 空输出」（[standard-schema.ts#L27-L67](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/standard-schema.ts#L27-L67)）—— **这一点恰好是 §5.4 坑 #1 的天然解药**，但需实测确认（见 §10）。
- 官方同时给了 Caveats：只有 trivial 类型能参与 TSR 类型安全链接；`urlKeys` 不支持（[adapters.mdx#L394-L404](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/adapters.mdx#L394-L404)）。

### 5.4 已知坑（全部来自 upstream，附链接）

| # | 现象 | 状态 / 影响 | 来源 |
| --- | --- | --- | --- |
| **1** | **动态段路由下，nuqs 的一次写入会让 URL 出现两段 query string**，`validateSearch` 读到第二段，刚设的值被丢弃。复现条件：nuqs 2.10.1 + TSR 1.170.35，路由含动态段（如 `/database/$table`），该路由有**带默认值的 `validateSearch`**，`NuqsAdapter` 包在 root route。实测 URL：`/database/customers?schema=public&limit=25&view=structure?schema=public&limit=50&view=data`（后一段是 validateSearch 补的默认值）。同一复现里**没有动态段的路由正常**。 | **open**（2026-09-12 提，2026-09-15 最后更新）。修复 PR [#1596](https://github.com/47ng/nuqs/pull/1596) / [#1598](https://github.com/47ng/nuqs/pull/1598) 均 **未合并**；`next` 分支 adapter 仍与 2.10.1 相同 | [issue #1590](https://github.com/47ng/nuqs/issues/1590) + [公开复现仓库](https://github.com/selemondev/nuqs-tanstack-double-query-repro) |
| **2** | 对象 / 对象数组参数被序列化成 `[object Object]`，`parseAsJson` 读不回自己写的东西。根因：TSR 会把单个 JSON 数组也解析成真数组，adapter 分不清「JSON 数组」与「重复 key 数组」，`Array.isArray` 分支把对象也摊平了。 | **open**（2025-09-10 提，2026-08-03 仍更新）。修复 PR [#1128](https://github.com/47ng/nuqs/pull/1128)（2025-09 至今 open，卡在自定义 `stringifySearch` 支持）、[#1597](https://github.com/47ng/nuqs/pull/1597)（2026-09-24，最小方案）均未合并 | [issue #1127](https://github.com/47ng/nuqs/issues/1127)、[PR #1128](https://github.com/47ng/nuqs/pull/1128)、[PR #1597](https://github.com/47ng/nuqs/pull/1597) |
| **3** | `parseAsTimestamp` 在**配了 `validateSearch`** 时，刷新 / 新开标签页会把默认值解析成 `1970-01-01T00:00:02.025Z` 并把 URL 重写坏；去掉 `validateSearch` 就正常 | **open**（2025-10-19 提） | [issue #1177](https://github.com/47ng/nuqs/issues/1177) |
| **4** | 跨页 pending 导航时，即将卸载的旧页面会读到目标页的 search params（已修，但说明这个 adapter 的状态同步一直是难点） | closed，修复 PR [#1318](https://github.com/47ng/nuqs/pull/1318) | [issue #1433](https://github.com/47ng/nuqs/issues/1433) |
| **5** | viewport preload + 路由参数导致无限重渲染（已修：改用 `useRouterState` + `structuralSharing`） | closed | [issue #1363](https://github.com/47ng/nuqs/issues/1363) |
| **6** | `to: pathname + "?…"` 曾导致 TSR 给 pathname 补尾斜杠（已用 `from: '/'` + 完整 `to` 绕过） | closed | [issue #1215](https://github.com/47ng/nuqs/issues/1215) |

### 5.5 `shallow` 与 `history` 在 TSR adapter 上到底管不管用

- **`history`：管用。** `replace: options.history === 'replace'`，直接映射到 TSR 的 `navigate({ replace })`。默认 `'replace'`（[defs.ts `Options.history`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/defs.ts)、[useQueryStates.ts 默认值](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/useQueryStates.ts)）。
- **`scroll`：管用。** `resetScroll: options.scroll`。默认 `false`（注意与 TSR 自身 `resetScroll` 默认 `true` 相反，[NavigateOptionProps.resetScroll](https://github.com/TanStack/router/blob/main/packages/router-core/src/link.ts)）。
- **`shallow`：被忽略。** adapter 函数体从未读 `options.shallow`；且官方文档写明 SPA 下 `shallow: false` 本来就没效果。→ **本项目可以把 `shallow` 从设计里删掉**。
- **`limitUrlUpdates` / `throttleMs` / `startTransition` / `clearOnDefault`：在 nuqs 层生效**，与 adapter 无关。

---

## 六、类型安全机制（含 `tsc` 实测）

### 6.1 `useQueryStates` 的真实签名（发布包 d.ts 原文）

```ts
type KeyMapValue<Type> = GenericParser<Type> & Options & { defaultValue?: Type }
type UseQueryStatesKeysMap<Map = any> = { [Key in keyof Map]: KeyMapValue<Map[Key]> } & {}
type UseQueryStatesOptions<KeyMap extends UseQueryStatesKeysMap> = Options & { urlKeys: UrlKeys<KeyMap> }
type Values<T extends UseQueryStatesKeysMap> = {
  [K in keyof T]: T[K]["defaultValue"] extends NonNullable<ReturnType<T[K]["parse"]>>
    ? NonNullable<ReturnType<T[K]["parse"]>>
    : ReturnType<T[K]["parse"]> | null
}
type UpdaterFn<T extends UseQueryStatesKeysMap> = (old: Values<T>) => Partial<Nullable<Values<T>>> | null
type SetValues<T extends UseQueryStatesKeysMap> =
  (values: Partial<Nullable<Values<T>>> | UpdaterFn<T> | null, options?: Options) => Promise<URLSearchParams>
type UseQueryStatesReturn<T extends UseQueryStatesKeysMap> = [Values<T>, SetValues<T>]

declare function useQueryStates<KeyMap extends UseQueryStatesKeysMap>(
  keyMap: KeyMap,
  options?: Partial<UseQueryStatesOptions<KeyMap>>
): UseQueryStatesReturn<KeyMap>
```
（[`src/useQueryStates.ts` @v2.10.1](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/useQueryStates.ts)；同名类型也在 `nuqs/server` 侧复用）

**三个关键推论：**

1. 泛型参数是 `KeyMap extends UseQueryStatesKeysMap`，**没有「必须是内联字面量」的限制** —— 映射类型、`as const satisfies` 的变量、`declare const x: FilterParsers<Q>` 都能传（§6.3 实测确认）。
2. 约束 `UseQueryStatesKeysMap` 因为 `Map = any` 的默认值退化成「索引签名」级别，**值类型是 `any`**：约束本身**不会**校验「parser 的值类型是否匹配后端字段类型」。要拦，必须自己写 `satisfies` / 泛型约束。
3. 状态类型由 `Values<T>` 算出，而它依赖 `T[K]["defaultValue"]` —— **parser 类型一旦被「擦除」成 `SingleParserBuilder<Q[K]>`，`defaultValue` 就不在类型里了**，条件类型走 false 分支 → 全变 `T | null`。

### 6.2 相关类型（精确到导出名）

```ts
type SingleParser<T> = {
  type?: 'single'
  parse: (value: string) => T | null
  serialize?: (value: T) => string
  eq?: (a: T, b: T) => boolean
}
type MultiParser<T> = { type: 'multi'; parse: (v: ReadonlyArray<string>) => T | null; serialize?: (v: T) => Array<string>; eq?: … }
type GenericParser<T> = SingleParser<T> | MultiParser<T>

type SingleParserBuilder<T> = Required<SingleParser<T>> & Options & {
  withOptions<This>(this: This, options: Options): This
  withDefault(this: …, defaultValue: NonNullable<T>): Omit<SingleParserBuilder<T>, 'parseServerSide'> & {
    readonly defaultValue: NonNullable<T>
    parseServerSide(value: string | string[] | undefined): NonNullable<T>
  }
  parseServerSide(value: string | string[] | undefined): T | null
}
type ParserMap = Record<string, ParserWithOptionalDefault<any>>
type UrlKeys<Parsers extends Record<string, any>> = Partial<Record<keyof Parsers, string>>
type Options = {
  history?: 'replace' | 'push'; scroll?: boolean; shallow?: boolean
  throttleMs?: number /* @deprecated */
  limitUrlUpdates?: { method: 'debounce' | 'throttle'; timeMs: number }
  startTransition?: React.TransitionStartFunction
  clearOnDefault?: boolean
}
type Nullable<T> = { [K in keyof T]: T[K] | null } & {}
```
（[`src/parsers.ts`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/parsers.ts)、[`src/defs.ts`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/defs.ts)）

**命名纠正（针对调研任务里的问法）：**

| 任务里提到的名字 | 2.10.1 的真实情况 |
| --- | --- |
| `Parser<T>` | 存在，但**已 `@deprecated`**：`/** @deprecated use SingleParser instead */` |
| `ParserBuilder<T>` | 存在，但**已 `@deprecated`**（`use SingleParserBuilder instead`）；**只有一个泛型参数**（`.agents/docs/table-query-and-crud.md` 里写的 `ParserBuilder<any, boolean>` **不存在**，会直接编译失败） |
| `singleParser` | **不存在**。没有这个名字的函数或类型；对应物是类型 `SingleParser<T>` 与 builder 类型 `SingleParserBuilder<T>` |
| `inferParserMapType` | **不存在**。只有 `inferParserType`（内部另有 `inferParserRecordType`，未导出） |
| `parseAsNumberLiteral` | ✅ 存在 |
| `parseAsIsoDateTime` | ✅ 存在（另有 `parseAsIsoDate`、`parseAsTimestamp`） |
| `parseAsString` 的 `eq` | **没有 `.eq()` builder 方法**。`eq` 是 parser 的字段，通过 `createParser({ parse, serialize, eq })` 传入；`parseAsString` 自身带 `eq: (a, b) => a === b`（`createParser` 的默认值） |

### 6.3 `tsc --strict` 实测矩阵

测试环境：`nuqs@2.10.1` + `typescript@5.9.3` + `@types/react@19.2.0`，`strict: true`、`skipLibCheck: true`、`moduleResolution: bundler`。被测类型：

```ts
type TableQuery = { page: number; size: number; keyword: string; tags: string[] }
type FilterParsers<Q> = { [K in keyof Q]-?: SingleParserBuilder<Q[K]> }
```

| 写法 | 状态类型是否保留 `withDefault` 的非空 | 缺键报错 | 值类型不符报错 | 多余键报错 |
| --- | --- | --- | --- | --- |
| **A.** `declare function w<Q>(p: FilterParsers<Q>): UseQueryStatesReturn<FilterParsers<Q>>` | ❌ **全变 `T \| null`**（实测 `{ page: number \| null; size: number \| null; keyword: string \| null }`） | ✅ | ✅ | ✅ |
| **B.** `const P = {…} as const satisfies FilterParsers<TableQuery>` 然后 `useQueryStates(P)` | ✅ 精确（`page: number`、`tags: string[]`、`keyword: string`） | ✅ | ✅ | ✅ |
| **C.** `declare function w<Q, P extends FilterParsers<Q>>(p: P): UseQueryStatesReturn<P>`（显式传 `P`） | ✅ | ✅ | ✅ | ✅（`P` 被固定时触发 excess property check） |
| **D.** `function define<Q>() { return <P extends FilterParsers<Q>>(p: P) => … }` 工厂（只推 `P`） | ✅ | ✅ | ✅ | ❌ **不报错**（`P` 从字面量推出，参数类型就是 `P`，没有可对照的多余属性检查） |
| **E.** `parsers: P & Record<Exclude<keyof P, keyof Q>, never>`（工厂 + 该交集） | ✅ | ✅ | ✅ | ✅ **报错 `Type 'SingleParserBuilder<string>' is not assignable to type 'never'`** |
| **F.** 变量声明为映射类型：`declare const x: FilterParsers<TableQuery>; useQueryStates(x)` | ❌ 回到 `T \| null` | ✅（构造时） | — | — |

代表性命中记录（写法 A 的状态类型展开）：

```
error TS2322: Type 'Values<FilterParsers<TableQuery>>' is not assignable to type '0'.
// 展开后：Type '{ page: number | null; size: number | null; keyword: string | null; }' is not assignable to type '0'
```

`inferParserType<FilterParsers<TableQuery>>` 同样是 `{ page: number | null; … }`。

### 6.4 结论：怎么设计泛型包装

**「`satisfies` 能不能同时做到四件事」的答案是：取决于写法。**

- ❌ **不要**把 parser 的**返回类型**标注 / 声明成 `SingleParserBuilder<Q[K]>` / `ParserBuilder<…>` 再交给 `useQueryStates` —— 这类「擦除式」标注会把 `withDefault` 的非空性丢掉，状态全变可空，最后 API 查询类型（`NonNullable<TQuery>`）对不上，代码里到处 `??`。
- ✅ **推荐（工厂 + 交集约束）**：

```ts
import { useQueryStates, type SingleParserBuilder, type UseQueryStatesReturn } from 'nuqs'

/** 纯类型的「每字段一个 parser」映射 */
type FilterParsers<Q> = { [K in keyof Q]-?: SingleParserBuilder<Q[K]> }

/**
 * 工厂：先把 Q 钉住，再在调用点推断 P（保留 .withDefault() 的非空性）。
 * `Record<Exclude<keyof P, keyof Q>, never>` 负责拦多余键。
 */
export function defineTableQueryState<Q>() {
  return function useTableQueryState<P extends FilterParsers<Q>>(
    parsers: P & Record<Exclude<keyof P, keyof Q>, never>
  ): UseQueryStatesReturn<P> {
    return useQueryStates(parsers)
  }
}

// 用法
type UserListQuery = { page: number; page_size: number; kw: string; status: 'active' | 'banned' }
export const useUserListQuery = defineTableQueryState<UserListQuery>()

const [state, setState] = useUserListQuery({
  page: parseAsInteger.withDefault(1),
  page_size: parseAsInteger.withDefault(20),
  kw: parseAsString.withDefault(''),
  status: parseAsStringLiteral(['active', 'banned'] as const).withDefault('active'),
})
// state: { page: number; page_size: number; kw: string; status: 'active' | 'banned' }  ← 实测无 null
```

- ✅ **同样推荐的等价写法**：`as const satisfies FilterParsers<Q>` 定义静态 parser map，再直接 `useQueryStates(P)`（写法 B）。代价是 map 得是模块级常量，动态默认值不灵活。
- ⚠️ `useQueryStates(parsers)` 里那个 `parsers` **不要**先声明成 `FilterParsers<Q>` 类型（写法 F），否则同样退化。

### 6.5 对 `.agents/docs/table-query-and-crud.md` 现设计的直接反馈

该文档里的 `FilterParserConfig` / `defineFilterParsers` 有两个会真的挂掉的问题：

1. **`ParserBuilder<any, boolean>` 的第二个泛型参数不存在** —— 2.10.1 的 `ParserBuilder<T> = SingleParserBuilder<T>`，单参数，且已被 `@deprecated`（[parsers.ts](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/parsers.ts)）。应换成 `SingleParserBuilder<…>`。
2. **`defineFilterParsers(parsers): FilterParserConfig<TQuery, Keys>` 的返回类型标注会擦除 `defaultValue`** —— 正是 §6.3 的写法 A / F。用它喂 `useQueryStates` 之后，所有状态字段都会带上 `| null`，而 API 查询类型是 `NonNullable<TQuery>`，最后要么编译报错要么被迫 `?? default`。**改法**：签名改成 `<P extends FilterParserConfig<TQuery>>(parsers: P): P`（保留 `P`），或直接用 §6.4 的工厂写法。
3. 另外 `SingleParser<T>` 作为约束**不包含 `.withDefault()` 的能力**（`SingleParser` 是运行时结构，`withDefault` 在 `SingleParserBuilder` 上），所以 `QueryFieldParser<V>` 若用 `SingleParser` 做联合，也会丢掉默认值推导。建议约束的一端统一用 `SingleParserBuilder`。

---

## 七、API 面（本项目设计需要的全部）

### 7.1 parsers（内置，全部从 `nuqs` 导出）

| 导出名 | 类型 | URL 形态 | parse / serialize（源码） |
| --- | --- | --- | --- |
| `parseAsString` | `SingleParserBuilder<string>` | 原样 | `parse: v => v`；`serialize: String`；无校验（空串保持 `''`） |
| `parseAsInteger` | `SingleParserBuilder<number>` | 十进制整数 | `parseInt(v)`，`NaN` → `null`；`serialize: v => '' + Math.round(v)` |
| `parseAsIndex` | `SingleParserBuilder<number>` | **URL 里 1-based，state 里 0-based** | `parse: parseInt(v) - 1`；`serialize: v => '' + Math.round(v + 1)` |
| `parseAsFloat` | `SingleParserBuilder<number>` | 浮点 | `parseFloat` / `String` |
| `parseAsHex` | `SingleParserBuilder<number>` | 十六进制 | `parseInt(v, 16)` / `Math.round(v).toString(16)`（奇数位补 `0`） |
| `parseAsBoolean` | `SingleParserBuilder<boolean>` | `true` / `false` | `parse: v => v.toLowerCase() === 'true'`；`serialize: String`（**任何非 `"true"` 都得到 `false`，包括 `"1"`**） |
| `parseAsStringLiteral(validValues)` | `SingleParserBuilder<Literal>` | 原值 | `validValues.includes(q) ? q : null` |
| `parseAsStringEnum(validValues)` | `SingleParserBuilder<Enum>` | 原值（enum 的 **value**，不是 name） | 内部就是 `parseAsStringLiteral`；**参数是「允许值数组」，不是 enum 对象** |
| `parseAsNumberLiteral(validValues)` | `SingleParserBuilder<Literal>` | 原值 | `parseFloat` 后 `includes` |
| `parseAsTimestamp` | `SingleParserBuilder<Date>` | epoch 毫秒 | `new Date(parseInt(v))` / `v.valueOf()`；`eq` 按时间戳 |
| `parseAsIsoDateTime` | `SingleParserBuilder<Date>` | ISO-8601 字符串 | `toISOString()`；非法 / 缺精度 / 不存在的日期 → `null` |
| `parseAsIsoDate` | `SingleParserBuilder<Date>` | `YYYY-MM-DD` | `toISOString().slice(0,10)` |
| `parseAsJson(validator)` | `SingleParserBuilder<T>` | JSON 字符串 | `JSON.parse` + 校验函数（返回 `null` / 抛错即非法）或 **Standard Schema**（仅同步）；校验后再 `JSON.stringify` 回写；`eq` 用 `JSON.stringify` 比较 |
| `parseAsArrayOf(itemParser, separator = ',')` | `SingleParserBuilder<T[]>` | **逗号分隔的单 key**（分隔符可换） | 元素内部的 `separator` 会被转义成 `%2C`；空串 → `[]` |
| `parseAsNativeArrayOf(itemParser)` | `MultiParserBuilder<T[]>`，**自带 `.withDefault([])`** | **重复 key**：`?tag=a&tag=b` | 读用 `URLSearchParams.getAll`，写用 `append` 多次；空数组写成 `?key=` |

（源码：[`src/parsers.ts`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/parsers.ts)；文档：[parsers/built-in.mdx](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/parsers/built-in.mdx) / [nuqs.dev/docs/parsers/built-in](https://nuqs.dev/docs/parsers/built-in)）

### 7.2 自定义 parser

```ts
declare function createParser<T>(parser: Require<SingleParser<T>, 'parse' | 'serialize'>): SingleParserBuilder<T>
declare function createMultiParser<T>(parser: Omit<Require<MultiParser<T>, 'parse' | 'serialize'>, 'type'>): MultiParserBuilder<T>
declare function createSerializer<Parsers extends ParserMap, BaseType extends Base = Base, Return = string>(
  parsers: Parsers, { clearOnDefault, urlKeys, processUrlSearchParams }?: CreateSerializerOptions<Parsers>
): SerializeFunction<Parsers, BaseType, Return>
declare function createLoader<Parsers extends ParserMap>(parsers: Parsers, { urlKeys }?: CreateLoaderOptions<Parsers>): LoaderFunction<Parsers>
declare function createStandardSchemaV1<Parsers extends ParserMap, PartialOutput extends boolean = false>(
  parsers: Parsers, { urlKeys, partialOutput }?: CreateStandardSchemaV1Options<Parsers, PartialOutput>
): StandardSchemaV1<MaybePartial<PartialOutput, inferParserType<Parsers>>>
```

`createSerializer` 的两种调用形态：`serialize(values)` 生成查询串；`serialize(base, values)` 在既有 URL 上增删（`null` 删除该 key）。`createLoader` 支持 `URL / Request / URLSearchParams / Record<string, string | string[] | undefined> / string`，第二参数 `{ strict }`。（[utilities.mdx](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/utilities.mdx)、[server-side.mdx](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/server-side.mdx)）

### 7.3 hooks

```ts
// 单 key（4 个重载）
declare function useQueryState<T>(key: string, options: UseQueryStateOptions<T> & { defaultValue: T }): UseQueryStateReturn<NonNullable<ReturnType<typeof options.parse>>, typeof options.defaultValue>
declare function useQueryState<T>(key: string, options: UseQueryStateOptions<T>): UseQueryStateReturn<NonNullable<ReturnType<typeof options.parse>>, undefined>
declare function useQueryState(key: string, options: Options & { defaultValue: string } & { [K in keyof GenericParser<unknown>]?: never }): UseQueryStateReturn<string, typeof options.defaultValue>
declare function useQueryState(key: string): UseQueryStateReturn<string, undefined>

type UseQueryStateReturn<Parsed, Default> = [
  Default extends undefined ? Parsed | null : Parsed,
  (value: null | Parsed | ((old: Parsed | null) => Parsed | null), options?: Options) => Promise<URLSearchParams>
]

// 多 key
declare function useQueryStates<KeyMap extends UseQueryStatesKeysMap>(
  keyMap: KeyMap, options?: Partial<UseQueryStatesOptions<KeyMap>>
): UseQueryStatesReturn<KeyMap>
```

**setter 的返回与 `isPending`（重要纠正）**：2.10.1 的 setter 返回 **`Promise<URLSearchParams>`**，**没有 `isPending` 成员**（全包 grep `isPending` 只命中注释）。要 loading 态是官方另一套写法：自己 `useTransition()` 拿 `isLoading`，通过 `startTransition` 选项传进去（[options.mdx#L299-L346](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L299-L346)）：

```ts
const [isLoading, startTransition] = React.useTransition()
useQueryState('q', parseAsString.withOptions({ startTransition, shallow: false }))

// 或者直接 await 一次写入
const search: URLSearchParams = await setPage(2)
```

**options 优先级**：调用级 > parser 级（`.withOptions()`）> hook / 全局 `defaultOptions`（[batching.mdx#L103-L121](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/batching.mdx#L103-L121)）。可用 options：`history`、`scroll`、`shallow`、`clearOnDefault`、`limitUrlUpdates`（`throttle(ms)` / `debounce(ms)` / `defaultRateLimit`）、`startTransition`、已废弃的 `throttleMs`，以及 hook 级的 `urlKeys`。

**清空语义**：`setX(null)` 清掉该 key（有默认值时状态回落默认值）；`useQueryStates` 的 setter 传 `null` 清掉它管理的**所有** key，不动其他参数（[batching.mdx#L114-L124](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/batching.mdx#L114-L124)）。

### 7.4 类型工具

`inferParserType<T>`（值或 parser map → 数据类型的映射，见 §6.3 实测）、`Values<T>`、`SetValues<T>`、`UseQueryStatesKeysMap`、`UseQueryStatesOptions`、`UseQueryStatesReturn`、`UseQueryStateOptions`、`UseQueryStateReturn`、`UrlKeys<T>`、`Options`、`HistoryOptions`、`Nullable<T>`、`LimitUrlUpdates`、`ParserMap`、`ParserWithOptionalDefault<T>`、`SingleParser<T>`、`SingleParserBuilder<T>`、`MultiParser<T>`、`MultiParserBuilder<T>`、`GenericParser<T>`、`Parser` / `ParserBuilder`（deprecated）、`SearchParams`、`defaultRateLimit`、`throttle`、`debounce`。（[`src/index.ts` 导出清单](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/index.ts)）

### 7.5 测试 adapter

两个不同入口，别混：

- **`nuqs/adapters/testing`（React 组件用）**：`NuqsTestingAdapter`、`withNuqsTestingAdapter(props?)`、类型 `UrlUpdateEvent`、`OnUrlUpdateFunction`。props：`searchParams`（`string | Record<string, string> | URLSearchParams`）、`onUrlUpdate`、`hasMemory`（默认 `false`，开了才模拟真实 URL 变化）、`rateLimitFactor`（默认 0）、`resetUrlUpdateQueueOnMount`（默认 true）、`defaultOptions`、`processUrlSearchParams`。（[adapters/testing.tsx](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/testing.tsx)）

  ```tsx
  import { withNuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing'
  const onUrlUpdate = vi.fn<[UrlUpdateEvent]>()
  render(<MyComponent />, { wrapper: withNuqsTestingAdapter({ searchParams: '?count=42', onUrlUpdate }) })
  expect(onUrlUpdate).toHaveBeenCalledOnce()
  ```
  （[testing.mdx#L34-L70](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/testing.mdx#L34-L70)、线上 [nuqs.dev/docs/testing](https://nuqs.dev/docs/testing)）

- **`nuqs/testing`（纯函数，测 parser 用）**：`isParserBijective`、`testSerializeThenParse`、`testParseThenSerialize`。

> ⚠️ **本仓库当前没有单测**（`AGENTS.md` 写明「暂无单测」），所以 testing adapter 只能等
> 「将来加测试」时用。**Vitest 本身已经随 Vite+ 进来了**（`pnpm exec vp test`，仓库里还没有测试文件，
> 会报 `No test files found`），所以要用它只需要再补 RTL + jsdom 与测试配置，不必再单独引 Vitest。

### 7.6 Adapter 级 props（`NuqsAdapter` 能收什么）

```ts
type AdapterProps = {
  defaultOptions?: Partial<Pick<Options, 'history' | 'shallow' | 'clearOnDefault' | 'scroll' | 'limitUrlUpdates'>>
  processUrlSearchParams?: (search: URLSearchParams) => URLSearchParams
}
```

即：`defaultOptions` 全局兜底（2.5.0 起）、`processUrlSearchParams` 在合并完待写参数、交给 adapter 之前做一次「中间件」（2.6.0 起，官方示例是 `search.sort()` 与加时间戳）。（[adapters/lib/defs.ts](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/lib/defs.ts)、[options.mdx#L391-L499](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L391-L499)）

---

## 八、URL 序列化默认值（Q7）

### 8.1 各类型的 URL 形态

| 值 | URL |
| --- | --- |
| `'abc'` / `''` | `?q=abc` / `?q=` |
| `123` | `?page=123` |
| 0-based `0`（`parseAsIndex`） | `?pageIndex=1` |
| `true` / `false` | `?flag=true` / `?flag=false` |
| `['a','b']`（`parseAsArrayOf`，默认 `,`） | `?tags=a,b`（元素里出现的 `,` 会被转义成 `%2C`） |
| `['a','b']`（`parseAsNativeArrayOf`） | `?tag=a&tag=b`（**重复 key**）；`[]` → `?tag=` |
| `{ a: 1 }`（`parseAsJson`） | `?obj=%7B%22a%22%3A1%7D` |
| `Date`（`parseAsTimestamp` / `parseAsIsoDateTime` / `parseAsIsoDate`） | epoch ms / ISO 串 / `YYYY-MM-DD` |

（全部来自 [`src/parsers.ts`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/parsers.ts) 的 `parse` / `serialize` 实现；空数组写成 `?key=` 来自 `write()` 的「append 后仍无值则 `set(key, '')`」逻辑，见 [lib/search-params.ts](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/lib/search-params.ts)）

### 8.2 默认值什么时候从 URL 消失

- **`clearOnDefault` 默认 `true`**（nuqs 2.0 起；1.x 是 `false`）。状态被设成「与默认值相等」时，该 key 直接从 URL 删除；写 `null` 一定删除。（[options.mdx#L348-L389](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L348-L389)）
- 相等判断用 `parser.eq ?? 引用相等`；对象 / 数组 / 日期这种自定义 parser **必须自带 `eq`**（内置的都有：数组用 `compareArrays`，日期用 `compareDates`，JSON 用 `JSON.stringify` 比较）。（[options.mdx#L378-L389](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L378-L389)、[src/parsers.ts](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/parsers.ts)）
- 想要「默认值也留在 URL 里」（URL 语义稳定、默认值以后变了也不影响老链接）：`clearOnDefault: false`。
- ⚠️ 与 TSR 的交互：`clearOnDefault: true` 意味着「默认值不进 URL」，而 TSR 的 `validateSearch`（若不用 `partialOutput`）**会把默认值补进 URL** —— 两种策略相反，这正是 §5.4 坑 #1 的具体表现形式。

### 8.3 push vs replace（每次更新可控）

| 层级 | 写法 |
| --- | --- |
| 全局 | `<NuqsAdapter defaultOptions={{ history: 'push' }}>`（官方警告：会把整个 app 的每次搜索参数更新都塞进历史，**不建议**） |
| hook 级 | `useQueryState('tab', parseAsString.withOptions({ history: 'push' }))` / `useQueryStates({…}, { history: 'push' })` |
| 调用级 | `setTab('b', { history: 'push' })` / `setFilters({…}, { history: 'push' })` |

默认 `'replace'`（squash 成一条历史记录）。映射到 TSR 就是 `navigate({ replace: history === 'replace' })`。（[options.mdx#L38-L63](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L38-L63)、[tanstack-router.ts#L111](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts#L111)）

### 8.4 频率限制

URL 写入默认被 **throttle**，时长按浏览器自适应（50ms / Safari 17+ 120ms / 更老 320ms），因为浏览器对 History API 有频率限制。可用 `limitUrlUpdates: throttle(ms)` 或 `debounce(ms)` 覆盖（**低于 50ms 不生效**）；返回的 React 状态永远立刻更新，只有 URL 写入被限流。（[defs.ts `Options.limitUrlUpdates`](https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/defs.ts)、[options.mdx#L134-L290](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L134-L290)）

---

## 九、结论与建议

### 9.1 判断

1. **nuqs 本身质量与契合度没问题**：版本新（2026-08-25 发布）、MIT、React 19 明确支持、体积 6.3 KB gzip、类型系统强、官方文档把 TSR 当一等 adapter 对待。
2. **风险不在 nuqs，在 TSR adapter 的「读写不对称」**：它用 `to: pathname + querystring` 绕过 TSR 的 typed `search`，导致写入必须再穿过 `validateSearch` / middlewares；而本仓库所有路由都在 `$appId` 动态段下，**正好命中 upstream 未修复的 #1590**。引入前必须实地验证这一步。

### 9.2 若采用 nuqs（推荐路线）

- **P0｜先验证，再落地**：在 `$appId` 下的一个列表路由上，挂 `NuqsAdapter` + `useQueryState`，实测「点一次筛选 → URL 只有一段 query string」。若出现两段，立即执行下面的缓解。
- **P0｜`validateSearch` 只用 `createStandardSchemaV1(parsers, { partialOutput: true })`**，不要写返回默认值的裸函数式 `validateSearch`。理由：`partialOutput` 在空输入时返回 `{}` → `buildLocation` 的 `nextSearch` 为空 → `searchStr` 为空 → **不会追加第二段 query string**。这是对 #1590 的定向缓解（机制见 §4.3 / §5.3）。
- **P0｜列出「不定义 `validateSearch`」的备选**：若不做 TSR 类型安全链接，列表路由**完全不写 `validateSearch`** 即可同时避开 #1590 与坑 #3（#1177）。代价是 `Link search={{…}}` 失去类型检查。
- **P1｜类型安全按 §6.4 的工厂写法**，并修掉 `.agents/docs/table-query-and-crud.md` 里的 `ParserBuilder<any, X>` 与 `defineFilterParsers` 返回类型擦除（§6.5）。
- **P1｜不要用 `urlKeys`**：官方标 TSR 不支持，别把 URL 短键名设计压在这上面。
- **P1｜不要用 `parseAsJson` / 对象数组参数**（坑 #2，`[object Object]`）；复杂筛选值拆成扁平标量或逗号数组。
- **P1｜不要用 `parseAsTimestamp`**（坑 #3）；要用日期就 `parseAsIsoDateTime`，并在导入时实地验证。
- **P2｜`shallow` 从设计里删掉**；分页 / 搜索用默认 `history: 'replace'`，只有「tab 切换」「打开详情弹窗」这类导航语义才用 `history: 'push'`。
- **P2｜搜索框输入限流**：URL 更新交给默认 throttle；对 TanStack Query 的请求另外 debounce（官方也是这么建议的，[options.mdx#L214-L218](https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/options.mdx#L214-L218)）。
- **P2｜分页语义先定清楚**：后端 `page` 若 1-based，用 `parseAsInteger`；若 UI 列模型是 0-based（TanStack Table 的 `pageIndex`），用 `parseAsIndex` 做转换，别自己 `+1/-1`。

### 9.3 若不采用 nuqs（对照路线）

不用 nuqs 也能满足「搜索 / 分页 / 筛选进 URL」：TSR 自带 `useSearch` / `useNavigate({ search })` / `search.middlewares`（`stripSearchParams({...defaults})` 正好负责「默认值不落 URL」）。这条路零新依赖、无读写不对称、无 #1590 风险，代价是：

- 要自己写一层「parser ↔ 类型」的映射（nuqs 的 `parseAsArrayOf` / `parseAsStringLiteral` / `eq` / `clearOnDefault` 都得手搓）；
- 失去 nuqs 的批量更新队列与 Promise 化写入；
- 类型安全靠 `validateSearch` 返回值自己保证。

**取舍建议**：本仓库列表页的查询状态是「中量级」（关键词 + 分页 + 若干筛选 + 排序），nuqs 的收益主要在「per-key parser + 默认值剥离 + 批量更新」这三件事上；如果 §9.2 的 P0 验证发现 #1590 无法用 `partialOutput` 绕开，那么**直接走 TSR 原生方案**比在上游 bug 上做兼容更划算。

### 9.4 与仓库里既有草案的差异（如果那份草案还在）

本文件落盘前，`docs/nuqs-url-state-research.md` 已存在一份草案。其结论方向（建议引入 nuqs、挂 `__root.tsx`、沉淀 `useTableQuery`）与本文一致，但以下事实需要以本文为准：

| 草案说法 | 实测事实 |
| --- | --- |
| 「2.10.1 发布于 2025 年初」 | **2026-08-25** |
| 「核心 ~7.1 KB + adapter ~1.0 KB，gzip 共约 8.2 KB」 | 主入口 **17,274 B min / 6,275 B gzip**；+adapter 后 **18,653 B / 6,803 B**；adapter 增量 **+1,379 B min / +528 B gzip** |
| 「`shallow: false // 通知路由更新`」 | TSR adapter **完全忽略 `shallow`**；SPA 下官方明说无效果 |
| 「`navigate` 能保证与 Router 内部状态、导航拦截器、历史堆栈完全一致」 | 恰恰是**不一致**的来源：`to: pathname + "?…"` 绕过了 typed `search`，并触发 #1590 |
| `ParserBuilder<any, boolean>` | **该泛型形式不存在**，`ParserBuilder<T>` 单参数且已 deprecated |
| 「`parseAsStringEnum(enumObj)`」 | 参数是**允许值数组**（`parseAsStringEnum<Enum>(Object.values(Enum))`） |
| 「`validateSearch` 默认值填充可能与 `withDefault` 产生竞态覆盖」 | 具体机制是 #1590：`validateSearch` 的默认值被追加成**第二段 query string** |
| 未提及 | #1590 / #1127 / #1177、`urlKeys` 不支持、`withDefault` 类型擦除 |

---

## 十、未验证 / 不确定（**不要当已确认**）

1. **#1590 未在本仓库实地复现。** 结论来自 upstream issue 描述 + 公开复现仓库 + 对 `buildLocation` 读源码推出的触发条件（`middlewares.length > 0` 且中间件输出非空）。「`partialOutput: true` 能规避」也是**源码推理**（`validate({}) → {}`），**没有跑过浏览器**。必须在实测环境里验证。
2. **`urlKeys` 在 TSR 上的具体失效路径没定位到。** 文档标「不支持」，但 adapter 源码看它对 `urlKeys` 无感（`watchKeys` 就是解析后的 URL key，hook 层用 `resolvedUrlKeys` 读 `searchParams.get(urlKey)`）。可能是文档口径滞后，或指的是 Standard Schema 链接那一层。**未确认**。
3. **「`location.search` 未经 `validateSearch`」是源码级推断**：`commitLocation` 推的是 `publicHref` 字符串、`updateLatestLocation()` 调 `parseLocation()`。我没有在运行时打印 `router.state.location.search` 与 `match.search` 做对照。
4. **字符串值经 TSR 全局 JSON 化再被 adapter 字符串化后的几个边界**（源码推理，未跑）：
   - `?q=null` → TSR 解析出 `null` → adapter `[[key, null]]` → `URLSearchParams` 得到字符串 `"q=null"` → `parseAsString` 返回**字面量 `"null"`**；
   - `?q=%22abc%22`（带引号的字符串）→ TSR `JSON.parse` 掉引号 → adapter 写回 `q=abc`；
   - 这两条都会让「URL 上的字面值」与「读出来的字符串」不完全一致。
5. **`nuqs/adapters/react`（SPA adapter）能不能与 TSR 混用**（用 History API 直写，绕过 `navigate`）：未验证。理论上 TSR 的 location 状态可能失同步，但 TSR 是否监听被 patch 的 `pushState` 我没查。
6. **没有跑真实浏览器**：本文所有运行时行为来自源码与文档；本仓库也尚未配置 Vitest，testing adapter 的用法只转述官方文档。
7. **Bundlephobia 与本地 rolldown 实测有 1.6% 差异**（17,559 / 6,285 vs 17,274 / 6,275），口径不同所致，不影响结论。
8. **TSR 源码行号来自本机安装的 `@tanstack/router-core@1.171.33`**；我同时比对了 1.171.32（`searchMiddleware.ts` / `searchParams.ts` / `qss.ts` / `link.ts` / `route.ts` 完全一致，`router.ts` 仅一处注释级差异且行数不变）。GitHub `main` 会漂移，链接里的行号仅供参考。
9. **本仓库的 `@tanstack/react-router` 在本次调研过程中从 1.170.39 变成了 1.170.40**（`node_modules` 被重装过），两者同属 1.170.x；本文引用的 `router-core` 行为不受影响。
10. **GitHub 数据（star / issue 数 / PR 状态）是 2026-09-29 的快照**，#1590 等 issue 之后可能被修复；落地前应重新确认 issue 状态与是否有新版发布。

---

## 十一、来源清单

**nuqs —— 元数据与发布包**

- npm registry 原始 JSON：<https://registry.npmjs.org/nuqs>（版本 / 时间 / peer / exports / unpackedSize / provenance）
- `npm view nuqs version peerDependencies dist-tags --json` 输出（本机实测，2026-09-29）
- Bundlephobia：<https://bundlephobia.com/package/nuqs@2.10.1>
- 发布包 tarball：`npm pack nuqs@2.10.1`（125,156 B），解包后 101 个文件 / 472,544 B

**nuqs —— 源码（tag `v2.10.1`，已与发布包 sourcemap 内容 diff 一致）**

- TSR adapter：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/tanstack-router.ts>
- Adapter 契约与 provider：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/lib/defs.ts> · <https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/lib/context.ts>
- 测试 adapter：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/adapters/testing.tsx>
- hooks：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/useQueryStates.ts> · <https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/useQueryState.ts>
- parsers / 类型：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/parsers.ts> · <https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/defs.ts>
- Standard Schema：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/standard-schema.ts>
- 队列与限流：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/lib/queues/throttle.ts> · <https://github.com/47ng/nuqs/blob/v2.10.1/packages/nuqs/src/lib/queues/rate-limiting.ts>

**nuqs —— 官方文档（仓库 mdx 源 = 线上页面内容）**

- Adapters（含 TSR 一节与 Caveats）：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/adapters.mdx#L318-L404> · <https://nuqs.dev/docs/adapters#tanstack-router>
- Options（History / Shallow / Scroll / 限流 / clearOnDefault / adapter props）：<https://nuqs.dev/docs/options>
- useQueryStates（batching、urlKeys 支持矩阵）：<https://nuqs.dev/docs/batching> · <https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/batching.mdx#L139-L150>
- Utilities（Standard Schema、TSR `validateSearch`）：<https://nuqs.dev/docs/utilities#tanstack-router--validatesearch> · <https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/utilities.mdx#L205-L231>
- Testing：<https://nuqs.dev/docs/testing>
- Parsers：<https://nuqs.dev/docs/parsers/built-in> · <https://nuqs.dev/docs/parsers/making-your-own>
- 安装与版本兼容：<https://github.com/47ng/nuqs/blob/v2.10.1/packages/docs/content/docs/installation.mdx#L41-L51>

**nuqs —— upstream issue / PR**

- [#1590 动态段路由双 query string](https://github.com/47ng/nuqs/issues/1590)（open）· 复现仓库 <https://github.com/selemondev/nuqs-tanstack-double-query-repro>
- [#1127 对象数组 `[object Object]`](https://github.com/47ng/nuqs/issues/1127)（open）· [PR #1128](https://github.com/47ng/nuqs/pull/1128)（open）· [PR #1597](https://github.com/47ng/nuqs/pull/1597)（open）
- [#1177 `parseAsTimestamp` + validateSearch](https://github.com/47ng/nuqs/issues/1177)（open）
- [#1433 跨页 pending 读到目标页参数](https://github.com/47ng/nuqs/issues/1433)（closed）· [#1363 viewport preload 无限循环](https://github.com/47ng/nuqs/issues/1363)（closed）· [#1215 尾斜杠](https://github.com/47ng/nuqs/issues/1215)（closed）
- 仓库状态：<https://api.github.com/repos/47ng/nuqs>（默认分支 `next`）

**TanStack Router（文档 + 源码）**

- Search Params 指南（JSON-first / validateSearch / useNavigate / search middlewares）：<https://tanstack.com/router/latest/docs/framework/react/guide/search-params> · 源文件 <https://github.com/TanStack/router/blob/main/docs/router/guide/search-params.md>
- 自定义序列化：<https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization> · <https://github.com/TanStack/router/blob/main/docs/router/guide/custom-search-param-serialization.md>
- `retainSearchParams` / `stripSearchParams` API：<https://tanstack.com/router/latest/docs/framework/react/api/router/retainSearchParamsFunction> · <https://tanstack.com/router/latest/docs/framework/react/api/router/stripSearchParamsFunction> · 实现 <https://github.com/TanStack/router/blob/main/packages/router-core/src/searchMiddleware.ts>
- `useSearch` API：<https://tanstack.com/router/latest/docs/framework/react/api/router/useSearchHook> · <https://github.com/TanStack/router/blob/main/packages/react-router/src/useSearch.tsx>
- `RouterType`：<https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType>
- 源码：<https://github.com/TanStack/router/blob/main/packages/router-core/src/searchParams.ts> · <https://github.com/TanStack/router/blob/main/packages/router-core/src/qss.ts> · <https://github.com/TanStack/router/blob/main/packages/router-core/src/router.ts> · <https://github.com/TanStack/router/blob/main/packages/router-core/src/link.ts> · <https://github.com/TanStack/router/blob/main/packages/router-core/src/location.ts>
- 本机安装版本：`@tanstack/react-router@1.170.40` → `@tanstack/router-core@1.171.33`（行号引用以此为准）

**类型实测环境**

- `nuqs@2.10.1` + `typescript@5.9.3` + `react@19.2.0` + `@types/react@19.2.0`，`strict: true` / `skipLibCheck: true` / `moduleResolution: bundler`，用例与 `tsc` 输出见 §6.3（临时目录，未入库）
