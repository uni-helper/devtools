import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'

// 插件启动日志（面板 URL / 探针地址）是 CLI 场景的核心输出，属合理 console 使用
/* eslint-disable no-console */
import type { Plugin, ResolvedConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'
import { createDevServer } from 'devframe/adapters/dev'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { randomToken } from 'devframe/utils/crypto-token'
import { AGENT_CLIENT_MARKER, AgentRegistry } from '@uni-helper/devtools-core/relay'
import { createUniDevtoolsDevframe, resolveClientAssets } from '@uni-helper/devtools-core'
import { INSPECT_OUTPUT_DIR, createInspectApp } from '@uni-helper/devtools-core/inspect-serve'
import { injectEntryFileGuard, injectPlainRenderHook, injectSetupBindings, resolveVirtualEntryFile } from './instrument.ts'

const BASE = '/__uni-devtools/'
const VIRTUAL_AGENT_MODULE = 'virtual:uni-devtools-agent'
const AGENT_IMPORT_MARKER = '__UNI_DEVTOOLS_AGENT_INJECTED__'

/**
 * 解析 uni-app H5 运行时链（uni-h5 → vue-router → @vue/devtools-api）实际需要的
 * @vue/devtools-kit 版本目录。
 *
 * 背景：宿主工程若与本 monorepo 同源（workspace/shamefully-hoist），根部可能被
 * hoist 出一个更高版本的 kit（如 9.x beta）；而 vue-router 的 devtools-api@8 声明
 * ^8.x 且按具名导入新版 API。被依赖预构建收编时 kit 从 .vite/deps 目录向上解析会
 * 命中根部错误版本，页面直接黑屏（"does not provide an export named
 * 'addCustomCommand'"）。这里沿 node 自身解析链（vue-router → devtools-api → kit，
 * node 解析会 realpath 穿透 pnpm 符号链接）找到 api 真正想要的 kit 落点并 alias，
 * 任何一步解析失败（如 mp 工程没有 vue-router）都不加 alias。
 */
function resolveHostKitAlias(root: string): { find: string, replacement: string } | undefined {
  try {
    const req = createRequire(path.join(root, 'package.json'))
    const routerPkg = req.resolve('vue-router/package.json')
    // 注意不能 resolve('<pkg>/package.json')：部分包（@vue/devtools-api）的
    // exports 不暴露 ./package.json 子路径。解析主入口再取包根目录，
    // node 的解析自带 realpath，能穿透 pnpm 的符号链接落到位。
    const apiEntry = createRequire(routerPkg).resolve('@vue/devtools-api')
    const kitEntry = createRequire(apiEntry).resolve('@vue/devtools-kit')
    const kitRoot = path.dirname(path.dirname(kitEntry))
    return { find: /^@vue\/devtools-kit$/, replacement: kitRoot }
  }
  catch {
    return undefined
  }
}

/**
 * 地址解析顺序：环境变量 → 局域网 IP → localhost。
 * 微信开发者工具模拟器在本机，localhost 即可；真机/App（未来）需要 LAN IP。
 */
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

export interface UniDevtoolsPluginOptions {
  host?: string
  port?: number
  clientAssets?: string
}

interface PluginState {
  ready: Promise<{ panelUrl: string, wsUrl: string } | null>
  devToken: string
  started: boolean
}

/**
 * uni-app 小程序 dev 的真实运行模型是 `vite build --watch`（没有 vite dev
 * server，configureServer 不会执行），因此 devframe 采用 sidecar 模式自建
 * HTTP+WS 端口，与旧插件在 configResolved 自建 Polka 服务器的做法同构。
 */
export function UniDevtoolsPlugin(options: UniDevtoolsPluginOptions = {}): Plugin[] {
  // 生产构建（build --watch 之外的正式打包）零注入、零挂载
  const isDev = process.env.NODE_ENV === 'development'

  const state: PluginState = {
    ready: Promise.resolve(null),
    devToken: '',
    started: false,
  }

  function start(_config: ResolvedConfig) {
    if (state.started)
      return
    state.started = true

    const devToken = randomToken()
    state.devToken = devToken
    const registry = new AgentRegistry()
    const panelDir = resolveClientAssets(options.clientAssets)
    const def = createUniDevtoolsDevframe(registry, { clientAssets: panelDir })

    // 「绑定地址」与「对外地址」必须分开：
    // - 绑定必须覆盖全部接口（0.0.0.0）。只绑 LAN IP 时，MCP 路由的
    //   loopback peer 检查永远失败——server 收不到 loopback 对端，任何
    //   MCP 请求都 403（实测：非 loopback Origin / loopback Origin / 无 Origin
    //   三种全拒）。绑 0.0.0.0 后本机 agent 走 127.0.0.1 即通过。
    // - 对外必须用真机可达的 LAN IP：探针跑在手机上的小程序沙箱里，
    //   `ws://localhost` 指向设备自身。devframe 会把 0.0.0.0 规范成 localhost，
    //   所以这里的 URL 自己拼，不取 started.origin。
    const advertisedHost = options.host ?? resolveHost()
    const port = options.port ?? (process.env.UNI_DEVTOOLS_PORT ? Number(process.env.UNI_DEVTOOLS_PORT) : undefined)

    // Vite Inspect 静态托管：把 vite-plugin-inspect 的 build 产物目录（自包含
    // client UI + reports）挂到 sidecar 的 inspect 路径下供面板 iframe（官方
    // v7 Inspect tab 同款方案）。注意：经预配置 app 挂载的中间件先于 devframe
    // 自身 handler（含 auth）执行——静态报告无 token 门禁，dev 工具可接受；
    // 目录不可枚举（仅能按文件名取）
    // auth 的函数形态（(ctx) => handler）在类型上未声明，但 dev 适配器与
    // instance-shell 的 resolveAuth 运行时均支持，用 as any 绕过类型
    state.ready = createDevServer(def, {
      host: '0.0.0.0',
      port,
      basePath: BASE,
      distDir: panelDir,
      app: createInspectApp(),
      // 'auto'：agent surface 恒非空（18 个 RPC 都带 agent 元数据），装上可选 peer
      // @devframes/agentic 后 MCP 路由自动挂到 `${BASE}__mcp`
      mcp: 'auto',
      openBrowser: false,
      // 小程序 connectSocket 不发 Origin 头，默认 loopback-only 检查会拒绝升级；
      // token 鉴权仍守门
      allowedOrigins: false,
      auth: ((ctx: any) => createInteractiveAuth(ctx, {
        clientAuthTokens: [devToken],
        banner: () => {},
      })) as any,
      onPeerConnect: registry.connect,
      onPeerDisconnect: registry.disconnect,
    }).then((started) => {
      registry.bind(started.rpcGroup as any)
      const advertisedOrigin = `http://${advertisedHost}:${started.port}`
      const wsUrl = `${advertisedOrigin.replace(/^http/, 'ws')}${BASE}__ws`
      const panelUrl = `${advertisedOrigin}${BASE}?devframe_auth_token=${devToken}`
      console.log(`\n  Uni DevTools 面板 (带鉴权 token，浏览器打开):`)
      console.log(`  ${panelUrl}`)
      console.log(`  探针 WebSocket:            ${wsUrl}\n`)
      return { panelUrl, wsUrl }
    }).catch((err) => {
      console.error('[uni-devtools] devframe init failed:', err)
      return null
    })
  }

  const corePlugin: Plugin = {
    name: 'uni-devtools-vite',

    config(config) {
      if (!isDev)
        return
      // 探针包以源码形式被宿主工程引用，且内部 import 了本插件的虚拟模块
      // virtual:uni-devtools-agent——一旦被 esbuild 依赖预构建收进 bundle，
      // 虚拟模块无法解析直接编译失败，必须排除走插件管线。
      // vite 的 exclude 按完整导入说明符精确匹配（pkgId 含子路径），包名与
      // 子路径都要列。
      // vue-router/@vue/devtools-api 也必须排除：预构建产物从 .vite/deps 目录
      // 向上解析裸导入，会命中 monorepo 根部被 shamefully-hoist 的高版本
      // @vue/devtools-kit，与 vue-router 的 devtools-api@8 声明的 ^8.x 不匹配
      // （缺 addCustomCommand 等导出）——排除后走正常解析，命中它自己的嵌套版本。
      return {
        optimizeDeps: {
          exclude: [
            '@uni-helper/devtools-probes',
            '@uni-helper/devtools-probes/vue3',
            '@uni-helper/devtools-probes/vue2',
            'vue-router',
            '@vue/devtools-api',
          ],
        },
        resolve: {
          alias: [resolveHostKitAlias(config.root ?? process.cwd())].filter(Boolean),
        },
      }
    },

    configResolved(config) {
      if (!isDev)
        return
      start(config)
    },

    resolveId(id) {
      if (id === VIRTUAL_AGENT_MODULE)
        return `\0${VIRTUAL_AGENT_MODULE}`
      return null
    },

    async load(id) {
      if (id !== `\0${VIRTUAL_AGENT_MODULE}`)
        return null
      if (!isDev) {
        return `export const config = { wsUrl: '', token: '' }`
      }
      // 等待 sidecar 就绪，拿到真实 wsUrl（load 支持异步，不阻塞其余模块）
      const info = await state.ready
      const wsUrl = info?.wsUrl ?? ''
      return [
        `// generated by uni-devtools vite plugin`,
        `export const config = ${JSON.stringify({
          wsUrl,
          token: wsUrl ? state.devToken : '',
          clientMarker: AGENT_CLIENT_MARKER,
        }, null, 2)}`,
      ].join('\n')
    },

    transform(code, id) {
      if (!isDev)
        return null
      if (!/\/src\/main\.[jt]s$/.test(id) || code.includes(AGENT_IMPORT_MARKER))
        return null
      return {
        code: `/* ${AGENT_IMPORT_MARKER} */\nimport { initAgent } from '@uni-helper/devtools-probes/vue3';\ninitAgent();\n${code}`,
        map: null,
      }
    },
  }

  /**
   * 编译期插桩（解决 mp 产物信息丢失，见 instrument.ts 模块头）：
   * - `__file` 注入：uni 虚拟入口（uniComponent:// / uniPage://）锚定
   *   createComponent/createPage 调用 → 探针树匿名节点改用文件名命名
   * - script setup 绑定捕获：改写「setup 返回 render 函数」的编译形态，
   *   把闭包绑定挂上 render 函数 → 探针可读可编辑 Composition API 状态
   *
   * enforce post：必须排在 uni:vue 把 SFC 编译成 mp 产物之后。
   */
  const instrumentPlugin: Plugin = {
    name: 'uni-devtools-instrument',
    enforce: 'post',
    transform(code, id) {
      if (!isDev)
        return null

      const bareId = id.split('?')[0]!

      if (bareId.startsWith('uniComponent://') || bareId.startsWith('uniPage://')) {
        const file = resolveVirtualEntryFile(bareId)
        if (!file)
          return null
        const next = injectEntryFileGuard(code, file)
        return next ? { code: next, map: null } : null
      }

      // 组件模块：script setup 闭包绑定捕获 + 渲染钩子
      if (/\.(?:vue|js|ts|jsx|tsx)$/.test(bareId)) {
        if (code.includes('setup')) {
          const next = injectSetupBindings(code, source => this.parse(source))
          if (next)
            return { code: next, map: null }
        }
        // plain <script>：render 经 _export_sfc 挂在模块层
        if (code.includes('_export_sfc')) {
          const next = injectPlainRenderHook(code)
          if (next)
            return { code: next, map: null }
        }
      }

      return null
    },
  }

  return [
    corePlugin,
    instrumentPlugin,
    // Vite Inspect：build 模式（mp dev = vite build --watch 没有 dev server，
    // 中间件模式不可用）——每个 watch rebuild 在 buildEnd 全量重写报告 +
    // 自带 client UI 到 INSPECT_OUTPUT_DIR，sidecar 静态托管给面板 iframe
    ...(isDev ? [Inspect({ build: true, outputDir: INSPECT_OUTPUT_DIR }) as Plugin] : []),
  ]
}

export const UniDevtoolsVite = UniDevtoolsPlugin
export default UniDevtoolsPlugin
