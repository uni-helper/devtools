import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { HubInstance } from '@devframes/hub/initiate'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createDevServer } from 'devframe/adapters/dev'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { createUniDevtoolsDevframe } from './devframe.ts'
import { createInspectApp } from './inspect-serve.ts'
import { AgentRegistry } from './relay.ts'

export interface HarnessOptions {
  host?: string
  port?: number
  basePath?: string
  token?: string
  clientAssets?: string
  mode?: 'standalone' | 'hub'
}

export function generateToken(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Starts a standalone DevServer harness for Uni DevTools.
 * Satisfies FINDINGS §2.1: uni-app mini-program dev requires a dedicated HTTP+WS server.
 */
export async function startDevServerHarness(options: HarnessOptions = {}) {
  const host = options.host ?? 'localhost'
  const port = options.port ?? 9999
  const basePath = options.basePath ?? '/__uni-devtools/'
  const token = options.token ?? generateToken()
  const registry = new AgentRegistry()
  const def = createUniDevtoolsDevframe(registry, {
    clientAssets: options.clientAssets,
  })

  const started = await createDevServer(def, {
    host,
    port,
    basePath,
    app: createInspectApp(),
    mcp: false,
    openBrowser: false,
    // Mini-program connectSocket does not set Origin header; disable loopback origin check
    allowedOrigins: false,
    auth: ((ctx: any) => createInteractiveAuth(ctx, {
      clientAuthTokens: [token],
      banner: () => {},
    })) as any,
    onPeerConnect: registry.connect,
    onPeerDisconnect: registry.disconnect,
  })

  registry.bind(started.rpcGroup as any)

  const origin = started.origin
  const panelUrl = `${origin}${basePath}?devframe_auth_token=${token}`
  const wsUrl = `${origin.replace(/^http/, 'ws')}${basePath}__ws`
  const connectionJsonUrl = `${origin}${basePath}__connection.json`

  return {
    mode: 'standalone' as const,
    started,
    registry,
    origin,
    port: started.port,
    token,
    panelUrl,
    wsUrl,
    connectionJsonUrl,
    close: async () => {
      await started.close()
    },
  }
}

/**
 * Starts a multi-devframe Hub harness mounting Uni DevTools as an iframe dock entry.
 */
export async function startHubHarness(options: HarnessOptions = {}) {
  const host = options.host ?? 'localhost'
  const port = options.port ?? 58018
  const base = DEVFRAMES_HUB_BASE
  const token = options.token ?? generateToken()
  const registry = new AgentRegistry()
  const def = createUniDevtoolsDevframe(registry, {
    clientAssets: options.clientAssets,
  })

  let ui: any
  try {
    // @ts-expect-error optional hub-ui package
    const hubUi = await import('@devframes/hub-ui')
    if (typeof hubUi.createUi === 'function')
      ui = hubUi.createUi()
  }
  catch {
    // Headless fallback
  }

  // server 的请求回调引用 hub，而 initHub 又需要 server —— 运行期回调触发时
  // hub 必已赋值，这里用前置声明满足「先定义后使用」。
  let hub: HubInstance
  const server = createServer((req, res) => {
    hub.nodeMiddleware(req, res, () => {
      res.statusCode = 404
      res.end('Not Found')
    })
  })

  let hubContext: any
  hub = initHub({
    base,
    server,
    ui,
    auth: false,
    mcp: false,
    allowedOrigins: false,
    devframes: [
      { devframe: def, dock: { category: 'devtools' } },
    ],
    configure: (ctx) => {
      hubContext = ctx
      registry.bind(() => (ctx.rpc as any)?._rpcGroup)
    },
    origin: () => `http://${host}:${port}`,
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  await hub.ready

  const origin = `http://${host}:${port}`
  const panelUrl = `${origin}${base}__uni-helper-devtools/`
  const wsUrl = `ws://${host}:${port}${base}__ws`
  const connectionJsonUrl = `${origin}${base}__connection.json`

  return {
    mode: 'hub' as const,
    hub,
    context: hubContext,
    server,
    registry,
    origin,
    port,
    token,
    panelUrl,
    wsUrl,
    connectionJsonUrl,
    close: async () => {
      await hub.close().catch(() => {})
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

/**
 * Main harness starter. Default mode is 'standalone' (Vite build --watch model),
 * or 'hub' when requested.
 */
export async function startHarness(options: HarnessOptions = {}) {
  if (options.mode === 'hub')
    return startHubHarness(options)
  return startDevServerHarness(options)
}
