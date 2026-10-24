import { createRequire } from 'node:module'
import os from 'node:os'
import process from 'node:process'
import {
  createDevServer,
  type CreateDevServerOptions,
} from 'devframe/adapters/dev'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { randomToken } from 'devframe/utils/crypto-token'
import { isAllowedOrigin, isLoopbackAddress } from 'devframe/utils/origin'
import { AgentRegistry } from './relay.ts'
import { createUniDevtoolsDevframe, resolveClientAssets } from './devframe.ts'
import { createInspectApp } from './inspect-serve.ts'

export const BASE = '/__uni-devtools/'

/**
 * 对外地址的选取依据：微信开发者工具模拟器与 node 同机（localhost 够用），
 * 真机跑在小程序沙箱里（必须真机可达的 LAN IP）；环境变量优先，便于隧道/自定义网络。
 */
export function resolveAdvertisedHost(): string {
  const fromEnv = process.env.UNI_DEVTOOLS_HOST
  if (fromEnv) return fromEnv
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (
        info.family === 'IPv4' &&
        !info.internal &&
        /^(?:192\.168|10\.|172\.(?:1[6-9]|2\d|3[01]))\./.test(info.address)
      )
        return info.address
    }
  }
  return 'localhost'
}

/**
 * MCP 路由的准入：只认本机进程。
 *
 * MCP 官方 SDK 的 HTTP 客户端（Claude Code、Cursor 等）跑在 node 里、默认不发
 * Origin，这里关掉默认门禁自己判：对端必须是 loopback（srvx 的 `ip` 取自 socket，
 * 客户端伪造不了）；带 Origin 的是浏览器，Origin 还必须是本机源，挡住 DNS rebinding。
 *
 * 判定用 devframe 的 `isAllowedOrigin` / `isLoopbackAddress`，不要自写前缀匹配：
 * `startsWith('127.')` 会放行 `127.attacker.example` 这类可 rebinding 到本机的域名。
 */
export function isLocalMcpRequest(request: Request): boolean {
  const origin = request.headers.get('origin') ?? undefined
  if (!isAllowedOrigin(origin, [])) return false
  const ip = (request as { ip?: string }).ip
  return ip !== undefined && isLoopbackAddress(ip)
}

/**
 * 装了 @devframes/agentic 才挂 MCP 路由并换上本机准入；没装时退回 'auto'
 * （devframe 打一次 DF0078 提示后不挂），不把可选能力变成启动失败。
 */
function resolveMcpSetting() {
  try {
    createRequire(import.meta.url).resolve('@devframes/agentic')
  } catch {
    return 'auto' as const
  }
  return { allowedOrigins: false as const, authorization: isLocalMcpRequest }
}

/**
 * standalone dev server 的公共选项（sidecar 与 harness 共用，保证冒烟路径与
 * 真实插件一致）。
 */
// 返回类型必须显式标注：字面量推断会经 createInspectApp 牵出 h3 的深层类型
// 路径，dts 发射报 TS2742（推断类型不可移植）
export function createDevServerOptions(
  registry: AgentRegistry,
  token: string,
): CreateDevServerOptions {
  return {
    // Vite Inspect 静态托管：挂到 sidecar 的 inspect 路径下供面板 iframe，
    // 凭面板 token 访问（门禁见 createInspectApp）
    app: createInspectApp({ token }),
    mcp: resolveMcpSetting(),
    openBrowser: false,
    // 不按 Origin 拦 WebSocket 升级：各家小程序运行时（开发者工具模拟器、真机、
    // 浏览器内模拟器）的 connectSocket 带什么 Origin 不统一，白名单维护不住。
    // 守门的是 token：没带 token 的会话连得上，但调不了任何 RPC，也不会被
    // AgentRegistry 认作探针（见 relay.ts 的 connect / discoverByPing）
    allowedOrigins: false as const,
    // auth 的函数形态（(ctx) => handler）在类型上未声明，但 dev 适配器与
    // instance-shell 的 resolveAuth 运行时均支持，用 as any 绕过类型
    auth: ((ctx: any) =>
      createInteractiveAuth(ctx, {
        clientAuthTokens: [token],
        banner: () => {},
      })) as any,
    onPeerConnect: registry.connect,
    onPeerDisconnect: registry.disconnect,
  }
}

export interface UniDevtoolsServerOptions {
  host?: string
  port?: number
  clientAssets?: string
  onStarted?: (info: {
    port: number
    panelUrl: string
    wsUrl: string
    devToken: string
  }) => void | Promise<void>
}

export interface UniDevtoolsServerInstance {
  devToken: string
  ready: Promise<{ panelUrl: string; wsUrl: string } | null>
  close?: () => Promise<void>
}

/**
 * uni-app 小程序 dev 的真实运行模型是 `vite build --watch`（没有 vite dev
 * server，configureServer 不会执行），因此 devframe 采用 sidecar 模式自建
 * HTTP+WS 端口，与旧插件在 configResolved 自建 Polka 服务器的做法同构。
 */
export function startUniDevtoolsServer(
  options: UniDevtoolsServerOptions = {},
): UniDevtoolsServerInstance {
  const devToken = randomToken()
  const registry = new AgentRegistry()
  const panelDir = resolveClientAssets(options.clientAssets)
  const def = createUniDevtoolsDevframe(registry, { clientAssets: panelDir })

  const advertisedHost = options.host ?? resolveAdvertisedHost()
  const port =
    options.port ??
    (process.env.UNI_DEVTOOLS_PORT
      ? Number(process.env.UNI_DEVTOOLS_PORT)
      : undefined)

  /* eslint-disable no-console */
  let serverHandle: { close: () => Promise<void> } | null = null
  let closeRequested = false

  // 「绑定地址」与「对外地址」必须分开：
  // - 绑定必须覆盖全部接口（0.0.0.0）。只绑 LAN IP 时，MCP 路由的
  //   loopback peer 检查永远失败——server 收不到 loopback 对端，任何
  //   MCP 请求都 403。绑 0.0.0.0 后本机 agent 走 127.0.0.1 即通过。
  // - 对外必须用真机可达的 LAN IP（见 resolveAdvertisedHost）。devframe 会把
  //   0.0.0.0 规范成 localhost，所以下面的 URL 自己拼，不取 started.origin。
  const ready = createDevServer(def, {
    ...createDevServerOptions(registry, devToken),
    host: '0.0.0.0',
    port,
    basePath: BASE,
    distDir: panelDir,
  })
    .then(async (started) => {
      serverHandle = started
      // 启动途中已被 close：端口刚监听上就关掉，不再对外宣告地址
      if (closeRequested) {
        await started.close()
        return null
      }
      registry.bind(started.rpcGroup as any)
      const advertisedOrigin = `http://${advertisedHost}:${started.port}`
      const wsUrl = `${advertisedOrigin.replace(/^http/, 'ws')}${BASE}__ws`
      const panelUrl = `${advertisedOrigin}${BASE}?devframe_auth_token=${devToken}`
      console.log(`\n  Uni DevTools 面板 (带鉴权 token，浏览器打开):`)
      console.log(`  ${panelUrl}`)
      console.log(`  探针 WebSocket:            ${wsUrl}\n`)

      if (options.onStarted) {
        await options.onStarted({
          port: started.port,
          panelUrl,
          wsUrl,
          devToken,
        })
      }

      return { panelUrl, wsUrl }
    })
    .catch((err) => {
      console.error('[uni-devtools] devframe init failed:', err)
      return null
    })
  /* eslint-enable no-console */

  return {
    devToken,
    ready,
    close: async () => {
      closeRequested = true
      // 还在启动：等它起来后由 ready 链负责关闭，否则监听中的端口泄漏
      if (!serverHandle) {
        await ready
        return
      }
      await serverHandle.close()
    },
  }
}
