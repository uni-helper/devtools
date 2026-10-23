import process from 'node:process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineDevframe, defineRpcFunction } from 'devframe'
import { launchEditor } from 'devframe/utils/launch-editor'
import type { DevframeDockDefaults } from 'devframe/types'
import {
  DEVFRAME_INTERNAL_RPC,
  DEVFRAME_RPC,
  AGENT_RPC_VUE2,
} from '@uni-helper/devtools-shared'
import { mergeNetworkRecords } from '@uni-helper/devtools-shared/utils/network-merge'
import type {
  ClearNetworkRecordsResult,
  ComponentTreeResult,
  GetInspectStatusResult,
  GetNetworkRecordsParams,
  GetNetworkRecordsResult,
  GetRegisteredRoutesResult,
  NetworkSharedState,
  NotifyComponentRenderedParams,
  OpenInEditorParams,
  OpenInEditorResult,
  PingResult,
  PushComponentTreeResult,
  PushNetworkRecordsParams,
  PushNetworkRecordsResult,
  RegisteredRouteRecord,
  RenderedComponentsSharedState,
} from '@uni-helper/devtools-shared'
import type { AgentRegistry, AgentSessionLike } from './relay.ts'
import { isInspectAvailable } from './inspect-serve.ts'
import { getProjectRoot, isInsideProjectRoot } from './project-root.ts'
import { AGENT_RPC } from './rpc-names.ts'
import { type Schema, s } from './schema.ts'
import {
  createGetStorageEntriesHandler,
  createGetStorageInfoHandler,
  createNotifyStorageChangedHandler,
  storageInfoCache,
} from './storage.ts'

/** 与探针 MAX_NETWORK_RING、adapter 的合并上限保持一致 */
const MAX_NETWORK_RECORDS = 500

export { getProjectRoot, isInsideProjectRoot }

export interface CreateUniDevtoolsDevframeOptions {
  /**
   * Override panel SPA directory.
   * Defaults to `packages/client/dist` if it exists, otherwise falls back to the vendored stub.
   */
  clientAssets?: string
  /**
   * Custom dock defaults (category, order, badge, etc.).
   */
  dock?: DevframeDockDefaults
}

/**
 * core 包的安装目录。
 *
 * 本模块会被 esbuild 内联进 vite / webpack / mcp / 门面包的 dist，`import.meta.url`
 * 落在哪个包里不确定，按相对路径找 core 在 npm 安装后必然落空；改走包解析——
 * 这些宿主包都把 core 列为依赖，从任意落点都解析得到。
 */
function resolveCorePackageDir(): string | undefined {
  try {
    return dirname(
      createRequire(import.meta.url).resolve(
        '@uni-helper/devtools-core/package.json',
      ),
    )
  } catch {
    return undefined
  }
}

export function resolveClientAssets(explicitAssets?: string): string {
  if (explicitAssets) return explicitAssets

  if (
    process.env.UNI_DEVTOOLS_PANEL_DIR &&
    existsSync(process.env.UNI_DEVTOOLS_PANEL_DIR)
  )
    return process.env.UNI_DEVTOOLS_PANEL_DIR

  const coreDir =
    resolveCorePackageDir() ??
    resolve(fileURLToPath(new URL('.', import.meta.url)), '../../core')
  const candidates = [
    // monorepo 开发：client 的 watch 构建产物最新，优先于 core 里上次构建拷进去的副本
    resolve(coreDir, '../client/dist'),
    // npm 安装：core 构建时拷入的面板
    resolve(coreDir, 'dist/panel'),
    // 都没有（未构建 client）：占位面板
    resolve(coreDir, 'assets/panel'),
  ]
  return (
    candidates.find((dir) => existsSync(resolve(dir, 'index.html'))) ??
    candidates[1]!
  )
}

function getPackageMeta(): { name: string; version: string } {
  try {
    // 锚定 core 自己的 package.json，避免内联到宿主包的 dist 后把宿主包的
    // name/version 报进 DevframeDefinition
    const coreDir = resolveCorePackageDir()
    if (!coreDir) throw new Error('@uni-helper/devtools-core not resolvable')
    const raw = readFileSync(resolve(coreDir, 'package.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      name: parsed.name || '@uni-helper/devtools-core',
      version: parsed.version || '0.0.1',
    }
  } catch {
    return {
      name: '@uni-helper/devtools-core',
      version: '0.0.1',
    }
  }
}

export function parsePagesJsonRoutes(
  pagesJsonContent: string,
): RegisteredRouteRecord[] {
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
              ...page.style,
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
        const root =
          typeof sub?.root === 'string' ? sub.root.replace(/^\/|\/$/g, '') : ''
        if (Array.isArray(sub?.pages)) {
          for (const subPage of sub.pages) {
            if (subPage?.path && typeof subPage.path === 'string') {
              const subClean = subPage.path.replace(/^\//, '')
              const clean = root ? `${root}/${subClean}` : subClean
              routes.push({
                path: `/${clean}`,
                name: clean,
                meta: {
                  ...subPage.style,
                  subPackage: root || undefined,
                },
              })
            }
          }
        }
      }
    }

    return routes
  } catch {
    return []
  }
}

export function getRegisteredRoutesFromFs(): RegisteredRouteRecord[] {
  const baseDir = process.env.UNI_INPUT_DIR
    ? resolve(process.env.UNI_INPUT_DIR)
    : process.cwd()
  const candidatePaths = [
    resolve(baseDir, 'pages.json'),
    resolve(baseDir, 'src/pages.json'),
  ]
  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, 'utf-8')
        return parsePagesJsonRoutes(raw)
      } catch {}
    }
  }
  return []
}

const componentId = s.string(
  'Component id in the form "<page route>#<uid>", as returned by get-component-tree',
)
const statePath = s.array(
  s.string(),
  'Key path inside the state object, e.g. ["form", "items", "0", "name"]',
)

/**
 * 纯转发 RPC：参数原样交给活跃探针，返回值原样带回。
 *
 * 错误语义统一为「抛错」：探针离线或方法本身失败都如实报错，不再各自吞成空值——
 * 面板与 Coding Agent 需要区分「确实没有 store」和「探针没连上」。
 */
interface ForwardSpec {
  name: string
  agentMethod: string
  type: 'query' | 'action'
  description: string
  args?: Schema[]
  safety?: 'read' | 'action' | 'destructive'
}

const FORWARDED_RPCS: ForwardSpec[] = [
  {
    name: DEVFRAME_RPC.getComponentState,
    agentMethod: AGENT_RPC.getComponentState,
    type: 'query',
    description:
      'Get the inspectable state (props / data / setup / computed / attrs) of one component.',
    args: [s.object({ id: componentId })],
  },
  {
    name: DEVFRAME_RPC.updateComponentState,
    agentMethod: AGENT_RPC.updateComponentState,
    type: 'action',
    description:
      'Edit (or delete with remove: true) one state value of a component; deep paths supported.',
    args: [
      s.object({
        id: componentId,
        section: s.optional(
          s.picklist(['props', 'setup', 'data', 'computed'] as const),
        ),
        path: s.optional(statePath),
        key: s.optional(s.string('Top-level key (legacy form of path[0])')),
        value: s.optional(s.unknown('New value (JSON)')),
        remove: s.optional(s.boolean()),
      }),
    ],
  },
  {
    name: DEVFRAME_RPC.recomputeComponentState,
    agentMethod: AGENT_RPC.recomputeComponentState,
    type: 'action',
    description: 'Force re-evaluation of one computed value of a component.',
    args: [s.object({ id: componentId, section: s.string(), path: statePath })],
  },
  {
    name: DEVFRAME_RPC.getComponentRenderCode,
    agentMethod: AGENT_RPC.getComponentRenderCode,
    type: 'query',
    description: 'Get the runtime render function source of one component.',
    args: [s.object({ id: componentId })],
  },
  {
    name: DEVFRAME_RPC.getRouterInfo,
    agentMethod: AGENT_RPC.getRouterInfo,
    type: 'query',
    description:
      'Get the current mini-program page route and the page stack (getCurrentPages).',
  },
  {
    name: DEVFRAME_RPC.navigateTo,
    agentMethod: AGENT_RPC.navigate,
    type: 'action',
    description:
      'Navigate the mini-program to a page (navigating to the current page redirects instead of stacking).',
    args: [
      s.object({ path: s.string('Page path, e.g. "/pages/index/index"') }),
    ],
  },
  {
    name: DEVFRAME_RPC.getPiniaStores,
    agentMethod: AGENT_RPC.getPiniaStores,
    type: 'query',
    description: 'List Pinia stores of the running app (Vue 3 only).',
  },
  {
    name: DEVFRAME_RPC.getPiniaState,
    agentMethod: AGENT_RPC.getPiniaState,
    type: 'query',
    description: 'Get state and getters of one Pinia store.',
    args: [s.object({ id: s.string('Pinia store id') })],
  },
  {
    name: DEVFRAME_RPC.updatePiniaState,
    agentMethod: AGENT_RPC.updatePiniaState,
    type: 'action',
    description:
      'Edit (or delete with remove: true) one Pinia store state value; deep paths supported.',
    args: [
      s.object({
        id: s.string('Pinia store id'),
        key: s.string('Top-level state key'),
        path: s.optional(statePath),
        value: s.optional(s.unknown('New value (JSON)')),
        remove: s.optional(s.boolean()),
      }),
    ],
  },
  {
    name: DEVFRAME_RPC.getVuexStores,
    agentMethod: AGENT_RPC_VUE2.getVuexStores,
    type: 'query',
    description: 'List the Vuex root store and its modules (Vue 2 only).',
  },
  {
    name: DEVFRAME_RPC.getVuexState,
    agentMethod: AGENT_RPC_VUE2.getVuexState,
    type: 'query',
    description:
      'Get state and getters of the Vuex root ("_root") or one module.',
    args: [s.object({ id: s.string('"_root" or a module path like "cart"') })],
  },
  {
    name: DEVFRAME_RPC.updateVuexState,
    agentMethod: AGENT_RPC_VUE2.updateVuexState,
    type: 'action',
    description:
      'Edit (or delete with remove: true) one Vuex state value; deep paths supported.',
    args: [
      s.object({
        id: s.string('"_root" or a module path like "cart"'),
        path: statePath,
        value: s.optional(s.unknown('New value (JSON)')),
        remove: s.optional(s.boolean()),
      }),
    ],
  },
]

/** devframe 的定义泛型在 args/returns 两种形态间分叉，这里统一按宽松形状注册 */
type LooseRpcDefinition = {
  name: string
  type: 'query' | 'action'
  description?: string
  args?: Schema[]
  agent?: { description: string; safety?: ForwardSpec['safety'] }
  handler: (...args: any[]) => unknown
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
    description:
      'Uni-Helper DevTools: live uni-app component inspection and state mutation.',
    icon: 'ph:device-mobile-duotone',
    clientAssets,
    dock: {
      category: 'devtools',
      defaultOrder: 10,
      ...options.dock,
    },

    async setup(ctx) {
      // hub 模式没有 onPeerConnect 钩子，registry 靠 rpcGroup 做在线比对与 ping 发现；
      // standalone 下 sidecar 会再用 createDevServer 返回的 rpcGroup 覆盖绑定
      registry.bind(() => (ctx.rpc as any)?._rpcGroup)

      const uni = ctx.scope('uni-helper-devtools')
      const register = (definition: LooseRpcDefinition) =>
        uni.rpc.register(
          defineRpcFunction({ ...definition, jsonSerializable: true } as any),
        )

      /** 探针推送入口的准入：只收活跃探针（最新连上的那个）的数据 */
      const isFromActiveAgent = (): boolean => {
        let session: AgentSessionLike | undefined
        try {
          session = (uni.rpc as any).getCurrentRpcSession?.()
        } catch {
          session = undefined
        }
        return registry.acceptPushFrom(session)
      }

      const treeSharedState = await uni.rpc.sharedState('component-tree', {
        initialValue: { fetchedAt: 0, pages: [] } as ComponentTreeResult,
      })

      // 探针增量推送的网络记录（面板 Network tab 订阅渲染；
      // Coding Agent 经 get-network-records 拉取同一份数据）
      const networkSharedState = await uni.rpc.sharedState('network-records', {
        initialValue: {
          records: [],
          latestId: 0,
          updatedAt: 0,
        } as NetworkSharedState,
      })

      // 「端上改值 → 面板刷新」的中转站：探针上报重渲染的组件 id，这里**原样转发**，
      // 不做过滤——`get-component-state` 是面板与 MCP agent 共用的入口，拿它当
      // 「面板选中态」会被 agent 调用污染。过滤交给 adapter 的
      // components:stateSnapshot（面板专有入口）。
      const renderedComponentsSharedState = await uni.rpc.sharedState(
        'rendered-components',
        {
          initialValue: {
            ids: [],
            seq: 0,
            updatedAt: 0,
          } as RenderedComponentsSharedState,
        },
      )
      let renderedSeq = 0

      function writeTree(tree: ComponentTreeResult): void {
        treeSharedState.mutate((draft) => {
          draft.fetchedAt = tree.fetchedAt || Date.now()
          draft.pages = tree.pages
          draft.vueVersion = tree.vueVersion
        })
      }

      function writeNetworkRecords(
        incoming: PushNetworkRecordsParams['records'],
      ): void {
        networkSharedState.mutate((draft) => {
          draft.records = mergeNetworkRecords(draft.records, incoming)
          if (draft.records.length > MAX_NETWORK_RECORDS) {
            draft.records.splice(0, draft.records.length - MAX_NETWORK_RECORDS)
          }
          const last = draft.records[draft.records.length - 1]
          if (last && last.id > draft.latestId) draft.latestId = last.id
          draft.updatedAt = Date.now()
        })
      }

      async function pullTreeFromAgent(): Promise<ComponentTreeResult> {
        const tree = await registry.callAgent<ComponentTreeResult>(
          AGENT_RPC.getComponentTree,
        )
        const result: ComponentTreeResult = {
          fetchedAt: Date.now(),
          pages: Array.isArray(tree?.pages) ? tree.pages : [],
          ...(typeof tree?.vueVersion === 'string'
            ? { vueVersion: tree.vueVersion }
            : {}),
        }
        writeTree(result)
        return result
      }

      // 活跃探针切换（新设备连上 / 当前设备断开后回落到次新设备）：node 侧缓存的是
      // 上一台设备的数据，必须作废，再主动从新探针拉一次——探针的推送内容门
      // 只认「自己推过什么」，不会因为 node 换了数据源而重推。
      // 全部离线（next 为空）时保留最后一份快照，供离线查看（读取时标 stale）。
      registry.onActiveChange((next) => {
        if (!next) return
        storageInfoCache.invalidate()
        treeSharedState.mutate((draft) => {
          draft.fetchedAt = 0
          draft.pages = []
          draft.vueVersion = undefined
        })
        networkSharedState.mutate((draft) => {
          draft.records = []
          draft.latestId = 0
          draft.updatedAt = Date.now()
        })
        void pullTreeFromAgent().catch(() => {})
        void registry
          .callAgent<GetNetworkRecordsResult>(AGENT_RPC.getNetworkRecords, {
            sinceId: 0,
            limit: MAX_NETWORK_RECORDS,
          })
          .then((res) => {
            if (Array.isArray(res?.records) && res.records.length > 0)
              writeNetworkRecords(res.records)
          })
          .catch(() => {})
      })

      for (const spec of FORWARDED_RPCS) {
        register({
          name: spec.name,
          type: spec.type,
          ...(spec.args ? { args: spec.args } : {}),
          agent: {
            description: spec.description,
            ...(spec.safety ? { safety: spec.safety } : {}),
          },
          handler: (...args: unknown[]) =>
            registry.callAgent(spec.agentMethod, ...args),
        })
      }

      // ---- 探针 → node 推送入口（内部通道：不带 agent 元数据，不暴露给 MCP） ----

      register({
        name: DEVFRAME_INTERNAL_RPC.pushComponentTree,
        type: 'action',
        handler: async (
          snapshot: ComponentTreeResult,
        ): Promise<PushComponentTreeResult> => {
          if (!isFromActiveAgent()) return { ok: true, ignored: true }
          if (snapshot && Array.isArray(snapshot.pages)) writeTree(snapshot)
          return { ok: true }
        },
      })

      register({
        name: DEVFRAME_INTERNAL_RPC.pushNetworkRecords,
        type: 'action',
        handler: async (
          params: PushNetworkRecordsParams,
        ): Promise<PushNetworkRecordsResult> => {
          if (!isFromActiveAgent()) return { ok: true, ignored: true }
          // 同 id 二次到达按 shared/network-merge.ts 合并（pending 先出、完成态补推、
          // 重连全环重推都收敛到「未知插入 / 未完成→已完成才覆盖」）
          const incoming = Array.isArray(params?.records) ? params.records : []
          if (incoming.length > 0) writeNetworkRecords(incoming)
          return { ok: true }
        },
      })

      register({
        name: DEVFRAME_INTERNAL_RPC.notifyComponentRendered,
        type: 'action',
        handler: async (
          args: NotifyComponentRenderedParams,
        ): Promise<{ ok: boolean; ignored?: boolean }> => {
          if (!isFromActiveAgent()) return { ok: true, ignored: true }
          const ids = args?.ids
          if (Array.isArray(ids) && ids.length > 0) {
            renderedComponentsSharedState.mutate((draft) => {
              draft.ids = ids
              draft.seq = ++renderedSeq
              draft.updatedAt = Date.now()
            })
          }
          return { ok: true }
        },
      })

      const invalidateStorage = createNotifyStorageChangedHandler()
      register({
        name: DEVFRAME_INTERNAL_RPC.notifyStorageChanged,
        type: 'action',
        handler: async (params?: unknown) => {
          if (!isFromActiveAgent()) return { ok: true, ignored: true }
          return invalidateStorage(params as any)
        },
      })

      // ---- 带 node 侧逻辑的 RPC ----

      register({
        name: DEVFRAME_INTERNAL_RPC.ping,
        type: 'query',
        agent: {
          description:
            'Health check: node-side timestamp and whether a mini-program probe is connected.',
        },
        handler: async (): Promise<PingResult> => ({
          pong: Date.now(),
          agentConnected: registry.connected,
        }),
      })

      register({
        name: DEVFRAME_RPC.getComponentTree,
        type: 'query',
        agent: {
          description:
            'Get the component tree of every page in the mini-program page stack. Component ids from here are used by the other component tools. `stale: true` means the probe is offline and this is the last known snapshot.',
        },
        handler: async (): Promise<ComponentTreeResult> => {
          try {
            return await pullTreeFromAgent()
          } catch (err) {
            // sharedState 读回的是 immer 冻结对象（只读类型）；wire 上就是普通 JSON
            const cached = treeSharedState.value() as ComponentTreeResult
            if (cached.pages.length === 0) throw err
            return { ...cached, pages: [...cached.pages], stale: true }
          }
        },
      })

      // 拉取（面板兜底 + Coding Agent 消费入口）。探针在线走探针环形缓冲（真源），
      // 离线回落 sharedState 历史并标 stale
      register({
        name: DEVFRAME_RPC.getNetworkRecords,
        type: 'query',
        args: [
          s.optional(
            s.object({
              sinceId: s.optional(
                s.number('Only records with id > sinceId (incremental fetch)'),
              ),
              limit: s.optional(s.number('Max records, default 200, max 500')),
            }),
          ),
        ],
        agent: {
          description:
            'Get captured uni.request / uploadFile / downloadFile records (newest window, incremental by sinceId).',
        },
        handler: async (
          args?: GetNetworkRecordsParams,
        ): Promise<GetNetworkRecordsResult> => {
          const sinceId = typeof args?.sinceId === 'number' ? args.sinceId : 0
          const limit = Math.min(
            Math.max(typeof args?.limit === 'number' ? args.limit : 200, 1),
            MAX_NETWORK_RECORDS,
          )
          try {
            return await registry.callAgent<GetNetworkRecordsResult>(
              AGENT_RPC.getNetworkRecords,
              { sinceId, limit },
            )
          } catch {
            const snapshot = networkSharedState.value()
            return {
              records: snapshot.records
                .filter((rec) => rec.id > sinceId)
                .slice(-limit)
                .map((rec) => ({ ...rec })),
              latestId: snapshot.latestId,
              stale: true,
            }
          }
        },
      })

      // 清空：node 侧历史必清，探针侧尽力而为（离线时只清 node 侧，如实回报）
      register({
        name: DEVFRAME_RPC.clearNetworkRecords,
        type: 'action',
        agent: {
          description:
            'Clear captured network records on both the node side and the probe.',
          safety: 'destructive',
        },
        handler: async (): Promise<ClearNetworkRecordsResult> => {
          networkSharedState.mutate((draft) => {
            draft.records = []
            draft.updatedAt = Date.now()
          })
          try {
            await registry.callAgent(AGENT_RPC.clearNetworkRecords)
            return { ok: true, agentCleared: true }
          } catch {
            return { ok: true, agentCleared: false }
          }
        },
      })

      register({
        name: DEVFRAME_RPC.getRegisteredRoutes,
        type: 'query',
        agent: {
          description:
            'Get all page routes declared in pages.json (including subPackages). Works without a connected probe.',
        },
        handler: async (): Promise<GetRegisteredRoutesResult> => ({
          routes: getRegisteredRoutesFromFs(),
        }),
      })

      // Vite Inspect：node 本地读盘判断报告是否产出（构建管线数据，不经探针）
      register({
        name: DEVFRAME_RPC.getInspectStatus,
        type: 'query',
        agent: {
          description:
            'Whether vite-plugin-inspect reports have been generated. Works without a connected probe.',
        },
        handler: async (): Promise<GetInspectStatusResult> => ({
          available: isInspectAvailable(),
        }),
      })

      register({
        name: DEVFRAME_RPC.openInEditor,
        type: 'action',
        args: [
          s.object({
            file: s.string(
              'Source file path (relative to the uni-app source dir, absolute, or file:// URL), optionally suffixed with :line:column',
            ),
          }),
        ],
        agent: {
          description:
            'Open a project source file in the local editor. Paths outside the project root are rejected.',
        },
        handler: openInEditor,
      })

      // Storage 收集（按需拉取）：元数据短 TTL 缓存，键值永远实时（见 storage.ts）
      register({
        name: DEVFRAME_RPC.getStorageInfo,
        type: 'query',
        agent: {
          description:
            'Get mini-program Storage metadata: key list, used size and capacity (short-TTL cached, invalidated on writes).',
        },
        handler: createGetStorageInfoHandler(registry),
      })

      register({
        name: DEVFRAME_RPC.getStorageEntries,
        type: 'query',
        args: [
          s.optional(
            s.object({
              keys: s.optional(s.array(s.string(), 'Exact keys to read')),
              matchPattern: s.optional(
                s.string('RegExp source to filter keys, e.g. "^user_"'),
              ),
              offset: s.optional(s.number()),
              limit: s.optional(s.number('Default 50, max 200')),
              maxValueChars: s.optional(
                s.number(
                  'Truncate each value beyond this many chars (default 32768)',
                ),
              ),
              includeSize: s.optional(s.boolean()),
            }),
          ),
        ],
        agent: {
          description:
            'Read mini-program Storage key/value pairs with key or pattern filtering, pagination and per-value truncation (always live, never cached).',
        },
        handler: createGetStorageEntriesHandler(registry),
      })
    },
  })
}

async function openInEditor(
  args: OpenInEditorParams,
): Promise<OpenInEditorResult> {
  let rawFile = args.file
  if (rawFile.startsWith('file://')) rawFile = fileURLToPath(rawFile)

  const positionRE = /:(\d+)(:(\d+))?$/
  const fileName = rawFile.replace(positionRE, '')
  const suffix = rawFile.match(positionRE)?.[0] ?? ''

  const baseDir = process.env.UNI_INPUT_DIR
    ? resolve(process.env.UNI_INPUT_DIR)
    : process.cwd()
  const resolvedFile = resolve(baseDir, fileName)

  const projectRoot = getProjectRoot()
  if (!isInsideProjectRoot(resolvedFile, projectRoot)) {
    throw new Error(
      `Forbidden: file path "${args.file}" resolves outside of project root (${projectRoot})`,
    )
  }

  return await new Promise<OpenInEditorResult>((resolveResult) => {
    ;(
      launchEditor as (
        target: string,
        editor?: string,
        cb?: (fileName: string, errorMsg?: string) => void,
      ) => void
    )(resolvedFile + suffix, undefined, (_fileName, errorMsg) => {
      if (!errorMsg) {
        resolveResult({ ok: true })
        return
      }
      const editorMissing =
        errorMsg.includes('ENOENT') || errorMsg.includes('not found')
      resolveResult({
        ok: false,
        error: editorMissing
          ? 'Editor not configured. To use "Open in Editor":\n\n' +
            '• VS Code: Run "Shell Command: Install \'code\' command in PATH"\n' +
            '• Or set LAUNCH_EDITOR environment variable (e.g., export LAUNCH_EDITOR=code)\n' +
            '• Supported editors: code, cursor, webstorm, subl, atom, etc.\n\n' +
            'Learn more: https://github.com/yyx990803/launch-editor#usage'
          : errorMsg,
      })
    })
  })
}
