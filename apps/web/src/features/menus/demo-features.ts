import type { MenuNode } from '#/api'

/**
 * 功能管理的演示兜底数据（仅当后端不可用或凭据失效时供界面预览）。
 *
 * 以 `-` 前缀命名目录，路由插件会忽略该目录，不会被扫描为路由文件。
 *
 * ⏳ **临时数据（接口稳定后本文件可整块删除）**
 * - 来源：测试环境实测数据，下面出现的 `482 / 484 / 483 / 485` 都是**真实存在的 id**，
 *   不是编造的占位数字：`482 new-adm`（根）→ `484 system` → `483 menus` → `485 menus.add`。
 * - 用途：接口不可用（未连后端 / 凭据失效）时，界面仍可预览与联调（各页面会显示「演示数据模式」标记）。
 * - 删除条件：接口稳定后删除本文件，并清理 `./use-features-tree.ts` 里的演示兜底分支，
 *   以及各页面的 `isDemoMode` / `demoBadge` 展示。
 *
 * 结构与测试环境真实数据保持一致（实测 `GET /system/menu/tree?menu_id=482` 的返回）：
 * `482 new-adm`（根，功能组）→ `484 system`（功能组）→ `483 menus`（功能）→ `485 menus.add`（操作）。
 * 这样接口不可用时看到的层级、类型徽章与真实环境一致，便于对照排查。
 */
export const DEMO_FEATURES: MenuNode[] = [
  {
    menu_id: 482,
    menu_name: 'new-adm',
    parent_id: 0,
    menu_type: 1,
    path: '/new-adm',
    component: 'new',
    route_name: '',
    permission: '',
    icon: '',
    sort: 0,
    status: 1,
    visible: 1,
    is_frame: 2,
    no_cache: 1,
    api_keys: [],
    id_path: '/0/',
    created_at: '2026-09-24 10:29:15',
    updated_at: '2026-09-24 10:31:46',
    children: [
      {
        menu_id: 484,
        menu_name: 'system',
        parent_id: 482,
        menu_type: 1,
        path: '/ignore',
        component: '/ignore',
        route_name: '',
        permission: '',
        icon: '',
        sort: 0,
        status: 1,
        visible: 1,
        is_frame: 2,
        no_cache: 1,
        api_keys: [],
        id_path: '/0/482/',
        created_at: '2026-09-24 10:43:10',
        updated_at: '2026-09-24 10:43:10',
        children: [
          {
            menu_id: 483,
            menu_name: 'menus',
            parent_id: 484,
            menu_type: 2,
            path: '/new-admin/menu-manager',
            component: '/ignore',
            route_name: '',
            permission: 'n:menus:list',
            icon: '',
            sort: 0,
            status: 1,
            visible: 1,
            is_frame: 2,
            no_cache: 1,
            api_keys: ['30cd4f597a030a1b9bad8ca9e571f7ef', '73a932377360a57c6f80180ab3b20e27'],
            id_path: '/0/482/484/',
            created_at: '2026-09-24 10:31:03',
            updated_at: '2026-09-24 10:54:41',
            children: [
              {
                menu_id: 485,
                menu_name: 'menus.add',
                parent_id: 483,
                menu_type: 3,
                path: '',
                component: '',
                route_name: '',
                permission: 'n:menus:add',
                icon: '',
                sort: 0,
                status: 1,
                visible: 1,
                is_frame: 2,
                no_cache: 1,
                api_keys: ['251d1a61cce9c63827908278a7b6064d'],
                id_path: '/0/482/484/483/',
                created_at: '2026-09-24 16:57:14',
                updated_at: '2026-09-24 16:57:14',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
]
