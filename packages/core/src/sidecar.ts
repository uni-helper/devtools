import os from 'node:os'
import process from 'node:process'
import { createDevServer } from 'devframe/adapters/dev'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { randomToken } from 'devframe/utils/crypto-token'
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
 * standalone dev server 的公共选项（sidecar 与 harness 共用，保证冒烟路径与
 * 真实插件一致）。
 */
export function createDevServerOptions(registry: AgentRegistry, token: string) {
  return {
    // Vite Inspect 静态托管：挂到 sidecar 的 inspect 路径下供面板 iframe。经预配置
    // app 挂载的中间件先于 devframe 自身 handler（含 auth）执行——静态报告无 token
    // 门禁，dev 工具可接受；目录不可枚举（仅能按文件名取）
    app: createInspectApp(),
    // 'auto'：agent surface 非空（公开 RPC 都带 agent 元数据），装上可选 peer
    // @devframes/agentic 后 MCP 路由自动挂到 `<base>__mcp`
    mcp: 'auto' as const,
    openBrowser: false,
    // 小程序 connectSocket 不发 Origin 头，默认 loopback-only 检查会拒绝升级；
    // token 鉴权仍守门
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
      if (serverHandle?.close) await serverHandle.close()
    },
  }
}
