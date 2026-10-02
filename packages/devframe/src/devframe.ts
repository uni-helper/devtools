import process from 'node:process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineDevframe, defineRpcFunction } from 'devframe'
import { launchEditor } from 'devframe/utils/launch-editor'
import type { DevframeDockDefaults } from 'devframe/types'
import type { AgentRegistry } from './relay.ts'
import { isInspectAvailable } from './inspect-serve.ts'
import type {
  ClearNetworkRecordsResult,
  ComponentStateResult,
  ComponentTreeResult,
  GetComponentRenderCodeParams,
  GetComponentRenderCodeResult,
  GetInspectStatusResult,
  GetNetworkRecordsParams,
  GetNetworkRecordsResult,
  GetPiniaStoresResult,
  GetRegisteredRoutesResult,
  NavigateParams,
  NavigateResult,
  NetworkSharedState,
  OpenInEditorParams,
  OpenInEditorResult,
  PingResult,
  PiniaStateResult,
  PushNetworkRecordsParams,
  PushNetworkRecordsResult,
  RecomputeComponentStateParams,
  RecomputeComponentStateResult,
  RegisteredRouteRecord,
  RouterInfoResult,
  UpdateComponentStateParams,
  UpdateComponentStateResult,
  UpdatePiniaStateParams,
  UpdatePiniaStateResult,
} from './types.ts'

export interface CreateUniDevtoolsDevframeOptions {
  /**
   * Override panel SPA directory.
   * Defaults to `packages/panel/dist` if it exists, otherwise falls back to `stub-panel`.
   */
  clientAssets?: string
  /**
   * Custom dock defaults (category, order, badge, etc.).
   */
  dock?: DevframeDockDefaults
}

export function resolveClientAssets(explicitAssets?: string): string {
  if (explicitAssets)
    return explicitAssets

  if (process.env.UNI_DEVTOOLS_PANEL_DIR && existsSync(process.env.UNI_DEVTOOLS_PANEL_DIR))
    return process.env.UNI_DEVTOOLS_PANEL_DIR

  const here = fileURLToPath(new URL('.', import.meta.url))
  const realPanelDist = resolve(here, '../../panel/dist')
  if (existsSync(realPanelDist))
    return realPanelDist

  const fallbackAssets = resolve(here, '../assets/panel')
  if (existsSync(fallbackAssets))
    return fallbackAssets

  return realPanelDist
}

function getPackageMeta(): { name: string, version: string } {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
    const raw = readFileSync(pkgPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      name: parsed.name || '@uni-helper/devtools-devframe',
      version: parsed.version || '0.0.1',
    }
  }
  catch {
    return {
      name: '@uni-helper/devtools-devframe',
      version: '0.0.1',
    }
  }
}

export function getProjectRoot(): string {
  if (process.env.UNI_CLI_CONTEXT) {
    return resolve(process.env.UNI_CLI_CONTEXT)
  }
  if (process.env.UNI_INPUT_DIR) {
    const inputDir = resolve(process.env.UNI_INPUT_DIR)
    const parent = resolve(inputDir, '..')
    if (existsSync(resolve(parent, 'package.json')) || resolve(parent, 'src') === inputDir) {
      return parent
    }
    return inputDir
  }
  return process.cwd()
}

export function isInsideProjectRoot(targetPath: string, root = getProjectRoot()): boolean {
  const rel = relative(root, targetPath)
  return !rel.startsWith('..') && !isAbsolute(rel)
}

export function parsePagesJsonRoutes(pagesJsonContent: string): RegisteredRouteRecord[] {
  try {
    const stripped = pagesJsonContent
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .replace(/,\s*([}\]])/g, '$1')
    const data = JSON.parse(stripped)
    const routes: RegisteredRouteRecord[] = []

    if (Array.isArray(data?.pages)) {
      for (const page of data.pages) {
        if (page?.path && typeof page.path === 'string') {
          const clean = page.path.replace(/^\//, '')
          routes.push({
            path: `/${clean}`,
            name: clean,
            meta: {
              ...(page.style || {}),
              type: page.type,
              layout: page.layout,
            },
          })
        }
      }
    }

    const subPackages = data?.subPackages || data?.subpackages
    if (Array.isArray(subPackages)) {
      for (const sub of subPackages) {
        const root = typeof sub?.root === 'string' ? sub.root.replace(/^\/|\/$/g, '') : ''
        if (Array.isArray(sub?.pages)) {
          for (const subPage of sub.pages) {
            if (subPage?.path && typeof subPage.path === 'string') {
              const subClean = subPage.path.replace(/^\//, '')
              const clean = root ? `${root}/${subClean}` : subClean
              routes.push({
                path: `/${clean}`,
                name: clean,
                meta: {
                  ...(subPage.style || {}),
                  subPackage: root || undefined,
                },
              })
            }
          }
        }
      }
    }

    return routes
  }
  catch {
    return []
  }
}

export function getRegisteredRoutesFromFs(): RegisteredRouteRecord[] {
  const baseDir = process.env.UNI_INPUT_DIR ? resolve(process.env.UNI_INPUT_DIR) : process.cwd()
  const candidatePaths = [
    resolve(baseDir, 'pages.json'),
    resolve(baseDir, 'src/pages.json'),
  ]
  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, 'utf-8')
        return parsePagesJsonRoutes(raw)
      }
      catch {}
    }
  }
  return []
}

/**
 * Creates the official DevframeDefinition for Uni DevTools.
 * Mountable via `createDevServer(def)` or `initHub({ devframes: [{ devframe: def }] })`.
 */
export function createUniDevtoolsDevframe(
  registry: AgentRegistry,
  options: CreateUniDevtoolsDevframeOptions = {},
) {
  const pkg = getPackageMeta()
  const clientAssets = resolveClientAssets(options.clientAssets)

  return defineDevframe({
    id: 'uni-helper-devtools',
    name: 'Uni DevTools',
    version: pkg.version,
    packageName: pkg.name,
    importMetaUrl: import.meta.url,
    homepage: 'https://github.com/uni-helper/devtools',
    description: 'Uni-Helper DevTools: live uni-app component inspection and state mutation.',
    icon: 'ph:device-mobile-duotone',
    clientAssets,
    dock: {
      category: 'devtools',
      defaultOrder: 10,
      ...options.dock,
    },

    async setup(ctx) {
      registry.bind(() => (ctx.rpc as any)?._rpcGroup)

      const uni = ctx.scope('uni-helper-devtools')

      const initialTree: ComponentTreeResult = { fetchedAt: 0, pages: [] }
      const treeSharedState = await uni.rpc.sharedState('component-tree', {
        initialValue: initialTree,
      })

      // W13 Network：探针增量推送的网络记录（面板 Network tab 订阅渲染；
      // Coding Agent 后续经 get-network-records 拉取同一份数据）
      const networkSharedState = await uni.rpc.sharedState('network-records', {
        initialValue: { records: [], latestId: 0, updatedAt: 0 } as NetworkSharedState,
      })

      uni.rpc.register(defineRpcFunction({
        name: 'push-component-tree',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'Receive and update component tree snapshot pushed by mini-program agent probe.' },
        setup: () => ({
          handler: async (snapshot: ComponentTreeResult): Promise<{ ok: boolean }> => {
            if (snapshot && Array.isArray(snapshot.pages)) {
              treeSharedState.mutate((draft) => {
                draft.fetchedAt = snapshot.fetchedAt || Date.now()
                draft.pages = snapshot.pages
              })
              registry.setCachedTree(snapshot)
            }
            return { ok: true }
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'ping',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Health check. Returns node-side pong and whether a uni-app agent is connected.' },
        setup: () => ({
          handler: async (): Promise<PingResult> => ({
            pong: Date.now(),
            agentConnected: registry.connected,
          }),
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'get-component-tree',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get the component tree of the running uni-app mini-program pages.' },
        setup: () => ({
          handler: async (): Promise<ComponentTreeResult> => {
            try {
              const tree = await registry.callAgent<any>('uni-devtools:agent:getComponentTree')
              const result: ComponentTreeResult = {
                fetchedAt: Date.now(),
                pages: tree?.pages ?? tree ?? [],
                ...(typeof tree?.vueVersion === 'string' ? { vueVersion: tree.vueVersion } : {}),
              }
              treeSharedState.mutate((draft) => {
                draft.fetchedAt = result.fetchedAt
                draft.pages = result.pages
                if (result.vueVersion)
                  draft.vueVersion = result.vueVersion
              })
              registry.setCachedTree(result)
              return result
            }
            catch (err) {
              const cached = registry.getCachedTree() || treeSharedState.value()
              if (cached && Array.isArray(cached.pages) && cached.pages.length > 0) {
                // sharedState 读回的 ImmutableObject（readonly pages）展平为
                // 可变 ComponentTreeResult（wire 契约为普通数组）
                return { ...cached, pages: [...cached.pages] }
              }
              throw err
            }
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'get-component-state',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get the editable state (data and setup bindings) of one component by id.' },
        setup: () => ({
          handler: async (args: { id: string }): Promise<ComponentStateResult> => {
            return await registry.callAgent<ComponentStateResult>('uni-devtools:agent:getComponentState', args)
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'recompute-component-state',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Trigger recomputation of a computed ref in component setup state.' },
        setup: () => ({
          handler: async (args: RecomputeComponentStateParams): Promise<RecomputeComponentStateResult> => {
            return await registry.callAgent<RecomputeComponentStateResult>('uni-devtools:agent:recomputeComponentState', args)
          },
        }),
      }))

      // W12 Show render code：官方 components:getRenderCode 桥（探针取运行时
      // render 函数源码并解插桩包装层，见 agent/render-code.ts）
      uni.rpc.register(defineRpcFunction({
        name: 'get-component-render-code',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get the runtime render function source of one component by id.' },
        setup: () => ({
          handler: async (args: GetComponentRenderCodeParams): Promise<GetComponentRenderCodeResult> => {
            return await registry.callAgent<GetComponentRenderCodeResult>('uni-devtools:agent:getComponentRenderCode', args)
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'update-component-state',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'Update one top-level state binding of a component.' },
        setup: () => ({
          handler: async (args: UpdateComponentStateParams): Promise<UpdateComponentStateResult> => {
            return await registry.callAgent<UpdateComponentStateResult>('uni-devtools:agent:updateComponentState', args)
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'open-in-editor',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'Open a component source file in local editor.' },
        setup: () => ({
          handler: async (args: OpenInEditorParams): Promise<OpenInEditorResult> => {
            if (!args?.file || typeof args.file !== 'string') {
              throw new Error('File path is required')
            }

            let rawFile = args.file
            if (rawFile.startsWith('file://')) {
              rawFile = fileURLToPath(rawFile)
            }

            const positionRE = /:(\d+)(:(\d+))?$/
            const fileName = rawFile.replace(positionRE, '')
            const match = rawFile.match(positionRE)
            const suffix = match ? match[0] : ''

            const baseDir = process.env.UNI_INPUT_DIR ? resolve(process.env.UNI_INPUT_DIR) : process.cwd()
            const resolvedFile = resolve(baseDir, fileName)

            const projectRoot = getProjectRoot()
            if (!isInsideProjectRoot(resolvedFile, projectRoot)) {
              throw new Error(`Forbidden: file path "${args.file}" resolves outside of project root (${projectRoot})`)
            }

            launchEditor(resolvedFile + suffix)
            return { ok: true }
          },
        }),
      }))

      // Vite Inspect（W11）：node 本地读盘判断报告是否产出（不经探针——
      // 这是构建管线数据，不是运行时数据），面板据此门控 Inspect tab
      uni.rpc.register(defineRpcFunction({
        name: 'get-inspect-status',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Whether vite-plugin-inspect reports have been generated.' },
        setup: () => ({
          handler: async (): Promise<GetInspectStatusResult> => ({
            available: isInspectAvailable(),
          }),
        }),
      }))

      // W13 Network：探针 → node 增量推送（防抖批量，按 id 幂等 merge——
      // socket 重连后探针重推全环也无害；500 容量与探针 MAX_NETWORK_RING
      // 字面量两端冻结同步，见 types.ts W13 注释）
      uni.rpc.register(defineRpcFunction({
        name: 'push-network-records',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'Receive network records batch pushed by mini-program agent probe.' },
        setup: () => ({
          handler: async (params: PushNetworkRecordsParams): Promise<PushNetworkRecordsResult> => {
            const incoming = Array.isArray(params?.records) ? params.records : []
            if (incoming.length > 0) {
              networkSharedState.mutate((draft) => {
                const known = new Set(draft.records.map(rec => rec.id))
                for (const rec of incoming) {
                  if (rec && typeof rec.id === 'number' && Number.isFinite(rec.id) && !known.has(rec.id)) {
                    draft.records.push(rec)
                    known.add(rec.id)
                  }
                }
                // 增量乱序到达仍保持 id 升序（面板增量渲染与 sinceId 语义都依赖）
                draft.records.sort((a, b) => a.id - b.id)
                if (draft.records.length > 500) {
                  draft.records.splice(0, draft.records.length - 500)
                }
                const last = draft.records[draft.records.length - 1]
                if (last && last.id > draft.latestId) {
                  draft.latestId = last.id
                }
                draft.updatedAt = Date.now()
              })
            }
            return { ok: true }
          },
        }),
      }))

      // W13 Network：拉取（面板兜底 + Coding Agent 消费入口）。探针在线走
      // 探针环形缓冲（真源），离线回落 sharedState 历史
      uni.rpc.register(defineRpcFunction({
        name: 'get-network-records',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get captured network records (incremental by sinceId, newest tail window).' },
        setup: () => ({
          handler: async (args: GetNetworkRecordsParams): Promise<GetNetworkRecordsResult> => {
            const sinceId = typeof args?.sinceId === 'number' ? args.sinceId : 0
            const limit = Math.min(Math.max(typeof args?.limit === 'number' ? args.limit : 200, 1), 500)
            try {
              return await registry.callAgent<GetNetworkRecordsResult>('uni-devtools:agent:getNetworkRecords', { sinceId, limit })
            }
            catch {
              const snapshot = networkSharedState.value()
              const records = snapshot.records
                .filter(rec => rec.id > sinceId)
                .slice(-limit)
              // sharedState 读回的是 immer 冻结对象，浅拷贝成普通对象再出 wire
              return { records: records.map(rec => ({ ...rec })), latestId: snapshot.latestId }
            }
          },
        }),
      }))

      // W13 Network：清空（面板按钮）。node 清 sharedState + 尽力透传探针
      // （探针离线时仅清 node 侧历史，同样算成功）
      uni.rpc.register(defineRpcFunction({
        name: 'clear-network-records',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'Clear captured network records on both node and agent probe.' },
        setup: () => ({
          handler: async (): Promise<ClearNetworkRecordsResult> => {
            networkSharedState.mutate((draft) => {
              draft.records = []
              draft.updatedAt = Date.now()
            })
            try {
              await registry.callAgent('uni-devtools:agent:clearNetworkRecords')
            }
            catch {}
            return { ok: true }
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'get-registered-routes',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get all registered page routes parsed from pages.json.' },
        setup: () => ({
          handler: async (): Promise<GetRegisteredRoutesResult> => {
            const routes = getRegisteredRoutesFromFs()
            return { routes }
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'get-router-info',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get current active mini-program page route and navigation stack from probe.' },
        setup: () => ({
          handler: async (): Promise<RouterInfoResult> => {
            try {
              return await registry.callAgent<RouterInfoResult>('uni-devtools:agent:getRouterInfo')
            }
            catch {
              return {
                currentRoute: null,
                stack: [],
              }
            }
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'get-pinia-stores',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'List Pinia stores registered on the running mini-program app.' },
        setup: () => ({
          handler: async (): Promise<GetPiniaStoresResult> => {
            try {
              return await registry.callAgent<GetPiniaStoresResult>('uni-devtools:agent:getPiniaStores')
            }
            catch {
              return { stores: [] }
            }
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'get-pinia-state',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get state and getters snapshot of one Pinia store by id.' },
        setup: () => ({
          handler: async (args: { id: string }): Promise<PiniaStateResult> => {
            return await registry.callAgent<PiniaStateResult>('uni-devtools:agent:getPiniaState', args)
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'update-pinia-state',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'Edit one Pinia store state key (deep path supported).' },
        setup: () => ({
          handler: async (args: UpdatePiniaStateParams): Promise<UpdatePiniaStateResult> => {
            return await registry.callAgent<UpdatePiniaStateResult>('uni-devtools:agent:updatePiniaState', args)
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'navigate-to',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'Navigate to a mini-program page route via agent probe.' },
        setup: () => ({
          handler: async (args: NavigateParams): Promise<NavigateResult> => {
            if (!args?.path || typeof args.path !== 'string') {
              throw new Error('Path is required')
            }
            if (!registry.connected) {
              return { ok: false, error: 'Uni-app agent probe is not connected' }
            }
            try {
              return await registry.callAgent<NavigateResult>('uni-devtools:agent:navigate', args)
            }
            catch (err) {
              return { ok: false, error: err instanceof Error ? err.message : String(err) }
            }
          },
        }),
      }))
    },
  })
}
