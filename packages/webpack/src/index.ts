import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { AGENT_CLIENT_MARKER } from '@uni-helper/devtools-core/relay'
import { warnIfStaleAgentDist } from './stale-agent.ts'

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
  } catch {
    realContext = rawContext
  }
  process.env.UNI_CLI_CONTEXT = realContext
  return realContext
}

// 模块加载时立即初始化一次
ensureCliContext()

function resolveEntryLoader(): string {
  const here =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url))

  const candidates = [
    path.resolve(here, '../entry-loader.cjs'),
    path.resolve(here, './entry-loader.cjs'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]
}

function resolveAgentVue2(): string {
  const req =
    typeof require !== 'undefined' ? require : createRequire(import.meta.url)

  try {
    const resolved = req.resolve('@uni-helper/devtools-probes/vue2')
    warnIfStaleAgentDist(resolved)
    return resolved
  } catch {
    // 兼容 exports 仅声明 import 条件或包尚未构建的情况
    const pkgJson = req.resolve('@uni-helper/devtools-probes/package.json')
    const pkgDir = path.dirname(pkgJson)
    // 尝试 .js 然后 .mjs
    const targetJs = path.resolve(pkgDir, 'dist/agent-vue2.js')
    if (fs.existsSync(targetJs)) {
      warnIfStaleAgentDist(targetJs)
      return targetJs
    }
    const targetMjs = path.resolve(pkgDir, 'dist/agent-vue2.mjs')
    if (fs.existsSync(targetMjs)) {
      warnIfStaleAgentDist(targetMjs)
      return targetMjs
    }
    return path.resolve(pkgDir, 'src/vue2/index.ts')
  }
}

export interface UniDevtoolsWebpackOptions {
  host?: string
  port?: number
  clientAssets?: string
}

interface PluginState {
  ready: Promise<{ panelUrl: string; wsUrl: string } | null>
  devToken: string
  started: boolean
}

let globalState: PluginState | null = null

function writeAgentConfig(
  cliContext: string,
  config: {
    wsUrl: string
    token: string
    clientMarker: string
    inputDir?: string
  },
): string {
  const dir = path.resolve(cliContext, 'node_modules/.uni-devtools')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'agent-config.json')
  const content = JSON.stringify(config, null, 2)
  fs.writeFileSync(file, content, 'utf-8')
  return file
}

async function startSidecar(
  options: UniDevtoolsWebpackOptions = {},
  cliContext: string,
): Promise<PluginState> {
  if (globalState) return globalState

  const { startUniDevtoolsServer, resolveAdvertisedHost, BASE } =
    await import('@uni-helper/devtools-core/sidecar')

  const advertisedHost = options.host ?? resolveAdvertisedHost()
  const port =
    options.port ??
    (process.env.UNI_DEVTOOLS_PORT
      ? Number(process.env.UNI_DEVTOOLS_PORT)
      : undefined)

  const server = startUniDevtoolsServer({
    ...options,
    host: advertisedHost,
    port,
    onStarted: ({ wsUrl, devToken }) => {
      // 用真实分配的端口重写配置模块
      writeAgentConfig(cliContext, {
        wsUrl,
        token: devToken,
        clientMarker: AGENT_CLIENT_MARKER,
        inputDir: process.env.UNI_INPUT_DIR,
      })
    },
  })

  // 预写初始配置模块，防止构建过早读取
  const initialPort = port ?? 9999
  const initialWsUrl = `ws://${advertisedHost}:${initialPort}${BASE}__ws`
  writeAgentConfig(cliContext, {
    wsUrl: initialWsUrl,
    token: server.devToken,
    clientMarker: AGENT_CLIENT_MARKER,
    inputDir: process.env.UNI_INPUT_DIR,
  })

  globalState = {
    ready: server.ready,
    devToken: server.devToken,
    started: true,
  }
  return globalState
}

/**
 * uni-app Vue 2 webpack 插件配置函数（vue.config.js chainWebpack 接入点）
 *
 * 注意：此函数必须同步返回 chainableConfig，sidecar 在后台异步启动
 */
export function uniDevtoolsWebpack(
  chainableConfig: any,
  options: UniDevtoolsWebpackOptions = {},
): any {
  try {
    // 生产构建零注入、零挂载
    if (process.env.NODE_ENV === 'production') return chainableConfig

    const cliContext = ensureCliContext()

    // 后台启动 sidecar（不阻塞配置返回）
    const statePromise = startSidecar(options, cliContext)

    // 1. 生成/定位配置模块真实文件，并通过 alias 映射 virtual:uni-devtools-agent 与 agent/vue2
    const agentConfigFile = path.resolve(
      cliContext,
      'node_modules/.uni-devtools/agent-config.json',
    )
    const agentVue2Dist = resolveAgentVue2()

    chainableConfig.resolve.alias
      .set('virtual:uni-devtools-agent', agentConfigFile)
      .set('@uni-helper/devtools-probes/vue2', agentVue2Dist)

    // 2. 注入入口探针初始化 loader（main.js 或 TS 工程的 main.ts）
    const inputDir = process.env.UNI_INPUT_DIR
      ? path.resolve(process.env.UNI_INPUT_DIR)
      : path.resolve(cliContext, 'src')
    const entryFiles = new Set(
      ['main.js', 'main.ts'].map((name) => path.resolve(inputDir, name)),
    )

    chainableConfig.module
      .rule('uni-devtools-entry')
      .test((file: string) => entryFiles.has(path.resolve(file)))
      .use('uni-devtools-entry-loader')
      .loader(resolveEntryLoader())
      .end()

    // 3. Webpack 4 插件：等待 sidecar 就绪后再进入编译，确保真实 wsUrl 写入配置
    chainableConfig.plugin('uni-devtools-wait-ready').use(
      class UniDevtoolsWaitReadyPlugin {
        apply(compiler: any) {
          if (compiler.hooks?.beforeCompile?.tapPromise) {
            compiler.hooks.beforeCompile.tapPromise(
              'UniDevtoolsWebpack',
              async () => {
                const state = await statePromise
                await state.ready
              },
            )
          }
        }
      },
    )

    return chainableConfig
  } catch (err: any) {
    console.warn(
      '[uni-devtools] Failed to load uni-devtools:',
      err?.message || err,
    )
    console.warn('[uni-devtools] Stack:', err?.stack)
    return chainableConfig
  }
}

export const UniDevtoolsWebpack = uniDevtoolsWebpack
export default uniDevtoolsWebpack
