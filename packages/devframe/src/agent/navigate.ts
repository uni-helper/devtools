/**
 * 小程序导航执行模块（探针内部模块）。
 *
 * 独立成模块的原因与 push.ts 相同：探针入口 index.ts 依赖
 * virtual:uni-devtools-agent（仅构建期可解析），无法被 vitest 直接导入；
 * 「同页导航改 redirect 防叠栈」是行为语义，必须有单测覆盖——语法检查与
 * e2e（stub 掉整个 navigate handler）都测不出这里写错。
 */
import { schedulePushComponentTree } from './push.ts'

export interface NavigateResult {
  ok: boolean
  error?: string
}

interface UniNavigationApi {
  navigateTo: (opts: any) => void
  redirectTo: (opts: any) => void
  switchTab?: (opts: any) => void
}

/** 归一化路由路径用于比较：去 query/hash、统一前导斜杠（mp 栈里的 route 无斜杠） */
export function normalizeRoutePath(path: string): string {
  let p = String(path || '')
  const qIndex = p.search(/[?#]/)
  if (qIndex >= 0) {
    p = p.slice(0, qIndex)
  }
  if (p && !p.startsWith('/')) {
    p = `/${p}`
  }
  return p
}

/**
 * 执行面板侧发起的导航。
 *
 * 关键语义：目标页与当前栈顶是同一页时用 redirectTo（替换当前页）而非
 * navigateTo（压栈）——否则在 Pages 面板反复导航当前页会把同一页面压 N 份
 * 副本（mp 页面栈上限 10 层），Components 面板随之出现 N 个重复页面树且
 * 只有逐层返回才会消解。同页带新 query 的跳转也走 redirect：新实例会拿到
 * 新参数，语义等价「刷新本页」。
 * tabBar 页 navigateTo/redirectTo 均会失败，保留 switchTab 兜底（同 tab
 * 重复 switchTab 是允许的，可视为成功）。
 */
export function navigateInMiniProgram(
  uniObj: UniNavigationApi,
  url: string,
  getPages?: () => any[],
): Promise<NavigateResult> {
  let pages: any[] = []
  try {
    const raw = getPages?.()
    if (Array.isArray(raw)) {
      pages = raw
    }
  }
  catch {
    // 栈不可读时不做同页判断，退化为普通压栈
  }

  const top = pages.length > 0 ? pages[pages.length - 1] : null
  const topRoute = top?.route || top?.__route__ || ''
  const isSameAsTop = !!topRoute && normalizeRoutePath(topRoute) === normalizeRoutePath(url)

  return new Promise((resolve) => {
    const primary = isSameAsTop ? uniObj.redirectTo : uniObj.navigateTo
    primary({
      url,
      success: () => {
        schedulePushComponentTree(200)
        resolve({ ok: true })
      },
      fail: (err: any) => {
        if (typeof uniObj.switchTab === 'function') {
          uniObj.switchTab({
            url,
            success: () => {
              schedulePushComponentTree(200)
              resolve({ ok: true })
            },
            fail: () => resolve({ ok: false, error: err?.errMsg || String(err) }),
          })
          return
        }
        resolve({ ok: false, error: err?.errMsg || String(err) })
      },
    })
  })
}
