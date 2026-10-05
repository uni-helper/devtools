import nodeCrypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { AGENT_CLIENT_MARKER, AgentRegistry } from './relay.ts'
import { createUniDevtoolsDevframe, resolveClientAssets } from './devframe.ts'
import { createInspectApp } from './inspect-serve.ts'

// 延迟加载 devframe ESM 依赖（支持 CJS 环境动态 import）
let devframeModules: {
  createDevServer: typeof import('devframe/adapters/dev').createDevServer
  createInteractiveAuth: typeof import('devframe/recipes/interactive-auth').createInteractiveAuth
  randomToken: typeof import('devframe/utils/crypto-token').randomToken
} | null = null

async function loadDevframeModules() {
  if (devframeModules)
    return devframeModules

  const [devAdapter, auth, cryptoToken] = await Promise.all([
    import('devframe/adapters/dev'),
    import('devframe/recipes/interactive-auth'),
    import('devframe/utils/crypto-token'),
  ])

  devframeModules = {
    createDevServer: devAdapter.createDevServer,
    createInteractiveAuth: auth.createInteractiveAuth,
    randomToken: cryptoToken.randomToken,
  }
  return devframeModules
}

// Node 16 兼容性补丁：webpack 4 / vue-cli 4 工程常运行于 Node 16，
// 而 devframe / srvx / h3 运行时依赖 Web Crypto 与 Web Standards API。
if (!globalThis.crypto?.getRandomValues) {
  const g = globalThis as any
  g.crypto = (nodeCrypto as any).webcrypto || {
    getRandomValues: (arr: ArrayBufferView) => (nodeCrypto as any).randomFillSync(arr),
    randomUUID: () => (nodeCrypto as any).randomUUID(),
  }
}
if (!(globalThis as any).Headers) {
  class Headers {
    private _map = new Map<string, string>()
    constructor(init?: any) {
      if (init) {
        if (Array.isArray(init)) {
          for (const [k, v] of init) this._map.set(String(k).toLowerCase(), String(v))
        }
        else if (typeof init === 'object') {
          for (const [k, v] of Object.entries(init)) this._map.set(k.toLowerCase(), String(v))
        }
      }
    }

    get(k: string) { return this._map.get(k.toLowerCase()) ?? null }
    set(k: string, v: string) { this._map.set(k.toLowerCase(), String(v)) }
    has(k: string) { return this._map.has(k.toLowerCase()) }
    delete(k: string) { this._map.delete(k.toLowerCase()) }
    forEach(fn: (v: string, k: string) => void) { this._map.forEach(fn) }
    entries() { return this._map.entries() }
    keys() { return this._map.keys() }
    values() { return this._map.values() }
  }
  ;(globalThis as any).Headers = Headers
}
if (!(globalThis as any).Request) {
  class Request {
    constructor() {
      Object.defineProperty(this, Symbol.toStringTag, { value: 'Request' })
    }
  }
  Object.defineProperty(Request.prototype, Symbol.toStringTag, { value: 'Request' })
  ;(globalThis as any).Request = Request
}
if (!(globalThis as any).Response) {
  class Response {
    constructor() {
      Object.defineProperty(this, Symbol.toStringTag, { value: 'Response' })
    }
  }
  Object.defineProperty(Response.prototype, Symbol.toStringTag, { value: 'Response' })
  ;(globalThis as any).Response = Response
}

const BASE = '/__uni-devtools/'

/**
 * 确保 UNI_CLI_CONTEXT 尽早使用 realpath 设好。
 * 原因：
 * 1. uni 自身时序 bug：@dcloudio/vue-cli-plugin-uni/lib/env.js:90 调 plugin.init()
 *    读它，却在同文件 :194 才赋值。不提前设会报 ERR_INVALID_ARG_TYPE。
 * 2. macOS /tmp 是 /private/tmp 的符号链接，uni 用 require.resolve 比对 module.resource，
 *    非 realpath 会导致比对失败。
 */
export function ensureCliContext(): string {
  const rawContext = process.env.UNI_CLI_CONTEXT || process.cwd()
  let realContext = rawContext
  try {
    realContext = fs.realpathSync(rawContext)
  }
  catch {
    realContext = rawContext
  }
  process.env.UNI_CLI_CONTEXT = realContext
  return realContext
}

// 模块加载时立即初始化一次
ensureCliContext()

function resolveHost(): string {
  const fromEnv = process.env.UNI_DEVTOOLS_HOST
  if (fromEnv)
    return fromEnv
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal && /^(?:192\.168|10\.|172\.(?:1[6-9]|2\d|3[01]))\./.test(info.address))
        return info.address
    }
  }
  return 'localhost'
}

function resolveEntryLoader(): string {
  const here = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

  // dist/webpack.cjs 或 src/webpack.ts 下，上一层的 webpack 目录
  const candidate = path.resolve(here, '../webpack/entry-loader.cjs')
  if (fs.existsSync(candidate))
    return candidate
  return path.resolve(here, './entry-loader.cjs')
}

function resolveAgentVue2(): string {
  const here = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

  const candidate = path.resolve(here, '../dist/agent-vue2.mjs')
  if (fs.existsSync(candidate))
    return candidate
  return path.resolve(here, './agent-vue2.mjs')
}

export interface UniDevtoolsWebpackOptions {
  host?: string
  port?: number
  clientAssets?: string
}

interface PluginState {
  ready: Promise<{ panelUrl: string, wsUrl: string } | null>
  devToken: string
  started: boolean
}

let globalState: PluginState | null = null

function writeAgentConfig(
  cliContext: string,
  config: { wsUrl: string, token: string, clientMarker: string, inputDir?: string },
): string {
  const dir = path.resolve(cliContext, 'node_modules/.uni-devtools')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'agent-config.js')
  const content = `// generated by uni-devtools webpack plugin\nexport const config = ${JSON.stringify(config, null, 2)};\n`
  fs.writeFileSync(file, content, 'utf-8')
  return file
}

async function startSidecar(options: UniDevtoolsWebpackOptions = {}, cliContext: string): Promise<PluginState> {
  if (globalState)
    return globalState

  const { createDevServer, createInteractiveAuth, randomToken } = await loadDevframeModules()

  const devToken = randomToken()
  const registry = new AgentRegistry()
  const panelDir = resolveClientAssets(options.clientAssets)
  const def = createUniDevtoolsDevframe(registry, { clientAssets: panelDir })

  const host = options.host ?? resolveHost()
  const port = options.port ?? (process.env.UNI_DEVTOOLS_PORT ? Number(process.env.UNI_DEVTOOLS_PORT) : undefined)

  // 预写初始配置模块，防止构建过早读取
  const initialPort = port ?? 9999
  const initialWsUrl = `ws://${host}:${initialPort}${BASE}__ws`
  writeAgentConfig(cliContext, {
    wsUrl: initialWsUrl,
    token: devToken,
    clientMarker: AGENT_CLIENT_MARKER,
    inputDir: process.env.UNI_INPUT_DIR,
  })

  /* eslint-disable no-console */
  const ready = createDevServer(def, {
    host,
    port,
    basePath: BASE,
    distDir: panelDir,
    app: createInspectApp(),
    mcp: false,
    openBrowser: false,
    allowedOrigins: false,
    auth: ((ctx: any) => createInteractiveAuth(ctx, {
      clientAuthTokens: [devToken],
      banner: () => {},
    })) as any,
    onPeerConnect: registry.connect,
    onPeerDisconnect: registry.disconnect,
  }).then((started) => {
    registry.bind(started.rpcGroup as any)
    const wsUrl = `${started.origin.replace(/^http/, 'ws')}${BASE}__ws`
    const panelUrl = `${started.origin}${BASE}?devframe_auth_token=${devToken}`
    console.log(`\n  Uni DevTools 面板 (带鉴权 token，浏览器打开):`)
    console.log(`  ${panelUrl}`)
    console.log(`  探针 WebSocket:            ${wsUrl}\n`)

    // 用真实分配的端口重写配置模块
    writeAgentConfig(cliContext, {
      wsUrl,
      token: devToken,
      clientMarker: AGENT_CLIENT_MARKER,
      inputDir: process.env.UNI_INPUT_DIR,
    })

    return { panelUrl, wsUrl }
  }).catch((err) => {
    console.error('[uni-devtools] devframe init failed:', err)
    return null
  })
  /* eslint-enable no-console */

  globalState = {
    ready,
    devToken,
    started: true,
  }
  return globalState
}

/**
 * uni-app Vue 2 webpack 插件配置函数（vue.config.js chainWebpack 接入点）
 *
 * 注意：此函数必须同步返回 chainableConfig，sidecar 在后台异步启动
 */
export function uniDevtoolsWebpack(chainableConfig: any, options: UniDevtoolsWebpackOptions = {}): any {
  // 生产构建零注入、零挂载
  if (process.env.NODE_ENV === 'production')
    return chainableConfig

  const cliContext = ensureCliContext()

  // 后台启动 sidecar（不阻塞配置返回）
  const statePromise = startSidecar(options, cliContext)

  // 1. 生成/定位配置模块真实文件，并通过 alias 映射 virtual:uni-devtools-agent 与 agent/vue2
  const agentConfigFile = path.resolve(cliContext, 'node_modules/.uni-devtools/agent-config.js')
  const agentVue2Dist = resolveAgentVue2()

  chainableConfig.resolve.alias
    .set('virtual:uni-devtools-agent', agentConfigFile)
    .set('@uni-helper/devtools-devframe/agent/vue2', agentVue2Dist)

  // 2. 注入 main.js 探针初始化 loader
  const inputDir = process.env.UNI_INPUT_DIR
    ? path.resolve(process.env.UNI_INPUT_DIR)
    : path.resolve(cliContext, 'src')
  const mainJsPath = path.resolve(inputDir, 'main.js')

  chainableConfig.module
    .rule('uni-devtools-entry')
    .test(mainJsPath)
    .use('uni-devtools-entry-loader')
    .loader(resolveEntryLoader())
    .end()

  // 3. Webpack 4 插件：等待 sidecar 就绪后再进入编译，确保真实 wsUrl 写入配置
  chainableConfig.plugin('uni-devtools-wait-ready').use(
    class UniDevtoolsWaitReadyPlugin {
      apply(compiler: any) {
        if (compiler.hooks?.beforeCompile?.tapPromise) {
          compiler.hooks.beforeCompile.tapPromise('UniDevtoolsDevframe', async () => {
            const state = await statePromise
            await state.ready
          })
        }
      }
    },
  )

  return chainableConfig
}

export const UniDevtoolsWebpack = uniDevtoolsWebpack
export default uniDevtoolsWebpack
