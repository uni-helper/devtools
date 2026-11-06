/**
 * Vite Inspect 静态托管（node 侧）。
 *
 * vite-plugin-inspect 以 `build: true` 运行时，每个 watch rebuild（buildEnd）
 * 会把自带 client UI + reports 全量写入 outputDir——该目录即一个自包含的
 * 转换管线检查器网站。官方 Vue DevTools v7 的 Inspect tab 就是 iframe 内嵌
 * 这套 UI；我们把它托管在 sidecar 的 `${INSPECT_MOUNT_PATH}/` 下供面板 iframe。
 *
 * 静态服务用 devframe 官方 `mountStaticHandler`（h3 sub-app mount，段边界
 * 匹配 + base 剥离内建——不要自己 `app.use(path, h)`，h3 v2 是精确匹配）。
 * h3 仅为此处构造 app 实例（devDependencies）。
 */
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { H3, getCookie, setCookie } from 'h3'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getProjectRoot } from './project-root.ts'

/** 面板 iframe 与 sidecar 静态路由的挂载前缀（sidecar.ts 的 BASE 之下） */
export const INSPECT_MOUNT_PATH = '/inspect'

/**
 * vite-plugin-inspect 的落盘目录：放在当前工程的 node_modules 下。
 *
 * 不能放系统临时目录：那是全机共享的——同时开两个工程会互相覆盖报告，面板
 * 显示的是另一个工程转换后的源码；上一个工程留下的报告也会让 inspect tab
 * 误判为可用。Vite 插件写、sidecar 读，两边在同一进程里按同一套环境变量解析。
 */
export function resolveInspectOutputDir(root = getProjectRoot()): string {
  return join(root, 'node_modules', '.uni-devtools', 'inspect')
}

/**
 * inspect 报告是否已产出（首次 buildEnd 之前为 false，面板据此隐藏 tab）。
 */
export function isInspectAvailable(dir = resolveInspectOutputDir()): boolean {
  return existsSync(join(dir, 'index.html'))
}

/** 面板带 token 打开 inspect 后换发的 cookie，供 iframe 内后续的报告请求使用 */
const INSPECT_TOKEN_COOKIE = 'uni_devtools_inspect'

function tokenMatches(candidate: string | undefined, token: string): boolean {
  if (!candidate) return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface InspectAppOptions {
  /** 面板 token（devframe_auth_token）：传了则读 inspect 报告必须持有它，不传不设门禁 */
  token?: string
  /** 报告目录，默认 {@link resolveInspectOutputDir} */
  dir?: string
}

/**
 * 预配置的 sidecar h3 app：挂载 inspect 静态托管（plugin.ts 的 start 与
 * harness.ts 两模式共用，保持冒烟路径与真实 sidecar 一致）。
 *
 * 这里的中间件先于 devframe 自身的鉴权执行，所以 token 门禁要自己做：报告里是
 * 项目源码经各插件转换后的全文，而 sidecar 绑在 0.0.0.0，不设门禁同一局域网的
 * 任何人都能读。未开启鉴权（不传 token）时与面板一样对局域网开放。
 */
export function createInspectApp({
  token,
  dir = resolveInspectOutputDir(),
}: InspectAppOptions): H3 {
  const app = new H3()
  if (token)
    app.use((event) => {
      const path = event.url.pathname
      if (
        path !== INSPECT_MOUNT_PATH &&
        !path.startsWith(`${INSPECT_MOUNT_PATH}/`)
      )
        return
      const fromQuery =
        event.url.searchParams.get('devframe_auth_token') ?? undefined
      if (tokenMatches(fromQuery, token)) {
        setCookie(event, INSPECT_TOKEN_COOKIE, token, {
          path: INSPECT_MOUNT_PATH,
          httpOnly: true,
          sameSite: 'strict',
        })
        return
      }
      if (tokenMatches(getCookie(event, INSPECT_TOKEN_COOKIE), token)) return
      return new Response('Forbidden', { status: 403 })
    })
  // single: false —— miss 不回退 index.html（inspect UI 自带 trailing-slash
  // 跳转脚本，缺失资源按 404 如实返回）
  mountStaticHandler(app, INSPECT_MOUNT_PATH, dir, {
    indexNames: ['index.html'],
    single: false,
  })
  return app
}
