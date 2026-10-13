/**
 * 导航高亮判定 —— 纯路径计算，不依赖 React / 路由实例。
 *
 * 单独成模块的原因：这是**唯一一份**「当前 URL 算不算这一项」的判定，
 * 侧边栏、面包屑、标签页都可能要用；放在组件文件里既测不到、也容易被各写一份。
 */

/**
 * 应用内导航项是否高亮。
 *
 * @param pathname  当前路径（形如 `/nivo/system/roles`）
 * @param targetPath 导航项目标路径（形如 `/system/roles`，**不含**应用前缀）
 * @param appPrefix  应用前缀（形如 `/nivo`）
 *
 * 两条规则：
 * 1. **首页特例**：`/home` 与 `/` 都指应用首页，而首页有多种等价写法
 *    （`/nivo`、`/nivo/`、`/nivo/home`、`/nivo/home/`），必须一并算作高亮 ——
 *    否则从首页点走再点回来，高亮会丢；
 * 2. **其余按前缀匹配子路径**：`/nivo/system/roles/42` 命中的是 `/system/roles`。
 *    注意比较的是 `fullTarget + '/'`，所以 `/nivo/system/roles-other` **不会**误命中。
 */
export function isNavItemActive(pathname: string, targetPath: string, appPrefix: string): boolean {
  const fullTarget = `${appPrefix}${targetPath}`

  if (targetPath === '/home' || targetPath === '/') {
    return (
      pathname === `${appPrefix}/home` ||
      pathname === `${appPrefix}/home/` ||
      pathname === appPrefix ||
      pathname === `${appPrefix}/`
    )
  }

  return pathname === fullTarget || pathname.startsWith(`${fullTarget}/`)
}

/*
  与 `./nav-shared` 的 `normalizePath` 的分工（**不要在两处各写一份尾斜杠处理**）：
  外壳导航（`_main` 的「应用 / 个人资料」）用**精确匹配**一组 `matchPaths`，所以要先
  归一化尾斜杠；应用内导航走的是上面的前缀匹配，`/home` 的等价写法已在特例里列举，
  不需要归一化。
*/
