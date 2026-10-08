import process from 'node:process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineDevframe, defineRpcFunction } from 'devframe'
import { launchEditor } from 'devframe/utils/launch-editor'
import type { DevframeDockDefaults } from 'devframe/types'
import {
  DEVFRAME_INTERNAL_RPC,
  DEVFRAME_RPC,
} from '@uni-helper/devtools-shared'
import { mergeNetworkRecords } from '@uni-helper/devtools-shared/utils/network-merge'
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
  NotifyComponentRenderedParams,
  OpenInEditorParams,
  OpenInEditorResult,
  PingResult,
  PiniaStateResult,
  PushNetworkRecordsParams,
  PushNetworkRecordsResult,
  RecomputeComponentStateParams,
  RecomputeComponentStateResult,
  RegisteredRouteRecord,
  RenderedComponentsSharedState,
  RouterInfoResult,
  UpdateComponentStateParams,
  UpdateComponentStateResult,
  UpdatePiniaStateParams,
  UpdatePiniaStateResult,
} from '@uni-helper/devtools-shared'
import type { AgentRegistry } from './relay.ts'
import { isInspectAvailable } from './inspect-serve.ts'
import { AGENT_RPC } from './rpc-names.ts'

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

export function resolveClientAssets(explicitAssets?: string): string {
  if (explicitAssets) return explicitAssets

  if (
    process.env.UNI_DEVTOOLS_PANEL_DIR &&
    existsSync(process.env.UNI_DEVTOOLS_PANEL_DIR)
  )
    return process.env.UNI_DEVTOOLS_PANEL_DIR

  const here = fileURLToPath(new URL('.', import.meta.url))
  // 本模块会被 esbuild 内联进 vite/dist 与 webpack/dist，`import.meta.url` 的落点
  // 因此可能是 core/src、core/dist、vite/dist 或 webpack/dist —— 四者都在
  // packages/ 下两层，所以这两条相对路径对任意落点都指向同一个包。
  const realPanelDist = resolve(here, '../../client/dist')
  if (existsSync(realPanelDist)) return realPanelDist

  const fallbackAssets = resolve(here, '../../core/assets/panel')
  if (existsSync(fallbackAssets)) return fallbackAssets

  return realPanelDist
}

function getPackageMeta(): { name: string; version: string } {
  try {
    // 同 resolveClientAssets：锚定 core 自己的 package.json，避免内联到
    // vite/webpack 的 dist 后把宿主包的 name/version 报进 DevframeDefinition。
    const pkgPath = fileURLToPath(
      new URL('../../core/package.json', import.meta.url),
    )
    const raw = readFileSync(pkgPath, 'utf-8')
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

export function getProjectRoot(): string {
  if (process.env.UNI_CLI_CONTEXT) {
    return resolve(process.env.UNI_CLI_CONTEXT)
  }
  if (process.env.UNI_INPUT_DIR) {
    const inputDir = resolve(process.env.UNI_INPUT_DIR)
    const parent = resolve(inputDir, '..')
    if (
      existsSync(resolve(parent, 'package.json')) ||
      resolve(parent, 'src') === inputDir
    ) {
      return parent
    }
    return inputDir
  }
  return process.cwd()
}

export function isInsideProjectRoot(
  targetPath: string,
  root = getProjectRoot(),
): boolean {
  const rel = relative(root, targetPath)
  return !rel.startsWith('..') && !isAbsolute(rel)
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
      registry.bind(() => (ctx.rpc as any)?._rpcGroup)

      const uni = ctx.scope('uni-helper-devtools')

      const initialTree: ComponentTreeResult = { fetchedAt: 0, pages: [] }
      const treeSharedState = await uni.rpc.sharedState('component-tree', {
        initialValue: initialTree,
      })

      // 探针增量推送的网络记录（面板 Network tab 订阅渲染；
      // Coding Agent 后续经 get-network-records 拉取同一份数据）
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

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_INTERNAL_RPC.pushComponentTree,
          type: 'action',
          jsonSerializable: true,
          agent: {
            description:
              'Receive and update component tree snapshot pushed by mini-program agent probe.',
          },
          setup: () => ({
            handler: async (
              snapshot: ComponentTreeResult,
            ): Promise<{ ok: boolean }> => {
              if (snapshot && Array.isArray(snapshot.pages)) {
                treeSharedState.mutate((draft) => {
                  draft.fetchedAt = snapshot.fetchedAt || Date.now()
                  draft.pages = snapshot.pages
                  if (snapshot.vueVersion)
                    draft.vueVersion = snapshot.vueVersion
                })
                registry.setCachedTree(snapshot)
              }
              return { ok: true }
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_INTERNAL_RPC.ping,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Health check. Returns node-side pong and whether a uni-app agent is connected.',
          },
          setup: () => ({
            handler: async (): Promise<PingResult> => ({
              pong: Date.now(),
              agentConnected: registry.connected,
            }),
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getComponentTree,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Get the component tree of the running uni-app mini-program pages.',
          },
          setup: () => ({
            handler: async (): Promise<ComponentTreeResult> => {
              try {
                const tree = await registry.callAgent<any>(
                  AGENT_RPC.getComponentTree,
                )
                const result: ComponentTreeResult = {
                  fetchedAt: Date.now(),
                  pages: tree?.pages ?? tree ?? [],
                  ...(typeof tree?.vueVersion === 'string'
                    ? { vueVersion: tree.vueVersion }
                    : {}),
                }
                treeSharedState.mutate((draft) => {
                  draft.fetchedAt = result.fetchedAt
                  draft.pages = result.pages
                  if (result.vueVersion) draft.vueVersion = result.vueVersion
                })
                registry.setCachedTree(result)
                return result
              } catch (err) {
                const cached =
                  registry.getCachedTree() || treeSharedState.value()
                if (
                  cached &&
                  Array.isArray(cached.pages) &&
                  cached.pages.length > 0
                ) {
                  // sharedState 读回的 ImmutableObject（readonly pages）展平为
                  // 可变 ComponentTreeResult（wire 契约为普通数组）
                  return { ...cached, pages: [...cached.pages] }
                }
                throw err
              }
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getComponentState,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Get the editable state (data and setup bindings) of one component by id.',
          },
          setup: () => ({
            handler: async (args: {
              id: string
            }): Promise<ComponentStateResult> => {
              return await registry.callAgent<ComponentStateResult>(
                AGENT_RPC.getComponentState,
                args,
              )
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_INTERNAL_RPC.notifyComponentRendered,
          type: 'action',
          jsonSerializable: true,
          agent: {
            description:
              'Receive component ids that re-rendered in the mini-program (relayed to the panel, which decides whether the inspected component changed).',
          },
          setup: () => ({
            handler: async (
              args: NotifyComponentRenderedParams,
            ): Promise<{ ok: boolean }> => {
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
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.recomputeComponentState,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Trigger recomputation of a computed ref in component setup state.',
          },
          setup: () => ({
            handler: async (
              args: RecomputeComponentStateParams,
            ): Promise<RecomputeComponentStateResult> => {
              return await registry.callAgent<RecomputeComponentStateResult>(
                AGENT_RPC.recomputeComponentState,
                args,
              )
            },
          }),
        }),
      )

      // 官方 components:getRenderCode 桥（探针取运行时
      // render 函数源码并解插桩包装层，见 probes 的 runtime/render-code.ts）
      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getComponentRenderCode,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Get the runtime render function source of one component by id.',
          },
          setup: () => ({
            handler: async (
              args: GetComponentRenderCodeParams,
            ): Promise<GetComponentRenderCodeResult> => {
              return await registry.callAgent<GetComponentRenderCodeResult>(
                AGENT_RPC.getComponentRenderCode,
                args,
              )
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.updateComponentState,
          type: 'action',
          jsonSerializable: true,
          agent: {
            description: 'Update one top-level state binding of a component.',
          },
          setup: () => ({
            handler: async (
              args: UpdateComponentStateParams,
            ): Promise<UpdateComponentStateResult> => {
              return await registry.callAgent<UpdateComponentStateResult>(
                AGENT_RPC.updateComponentState,
                args,
              )
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.openInEditor,
          type: 'action',
          jsonSerializable: true,
          agent: {
            description: 'Open a component source file in local editor.',
          },
          setup: () => ({
            handler: async (
              args: OpenInEditorParams,
            ): Promise<OpenInEditorResult> => {
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

              // 使用回调捕获编辑器启动错误，提供友好的错误提示
              return await new Promise<OpenInEditorResult>((resolve) => {
                ;(
                  launchEditor as (
                    target: string,
                    editor?: string,
                    cb?: (fileName: string, errorMsg?: string) => void,
                  ) => void
                )(
                  resolvedFile + suffix,
                  undefined,
                  (fileName: string, errorMsg?: string) => {
                    if (errorMsg) {
                      // 检测是否是编辑器未找到的错误
                      if (
                        errorMsg.includes('ENOENT') ||
                        errorMsg.includes('not found')
                      ) {
                        resolve({
                          ok: false,
                          error:
                            'Editor not configured. To use "Open in Editor":\n\n' +
                            '• VS Code: Run "Shell Command: Install \'code\' command in PATH"\n' +
                            '• Or set LAUNCH_EDITOR environment variable (e.g., export LAUNCH_EDITOR=code)\n' +
                            '• Supported editors: code, cursor, webstorm, subl, atom, etc.\n\n' +
                            'Learn more: https://github.com/yyx990803/launch-editor#usage',
                        })
                      } else {
                        resolve({ ok: false, error: errorMsg })
                      }
                    } else {
                      resolve({ ok: true })
                    }
                  },
                )
              })
            },
          }),
        }),
      )

      // Vite Inspect：node 本地读盘判断报告是否产出（不经探针——
      // 这是构建管线数据，不是运行时数据），面板据此门控 Inspect tab
      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getInspectStatus,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Whether vite-plugin-inspect reports have been generated.',
          },
          setup: () => ({
            handler: async (): Promise<GetInspectStatusResult> => ({
              available: isInspectAvailable(),
            }),
          }),
        }),
      )

      // 探针 → node 增量推送（防抖批量；同 id 二次到达按
      // shared/network-merge.ts 合并——pending 快照先出、完成态补推、重连全环
      // 重推都收敛到「未知插入 / 未完成→已完成才覆盖」；500 容量与探针
      // MAX_NETWORK_RING 字面量两端冻结同步）
      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_INTERNAL_RPC.pushNetworkRecords,
          type: 'action',
          jsonSerializable: true,
          agent: {
            description:
              'Receive network records batch pushed by mini-program agent probe.',
          },
          setup: () => ({
            handler: async (
              params: PushNetworkRecordsParams,
            ): Promise<PushNetworkRecordsResult> => {
              const incoming = Array.isArray(params?.records)
                ? params.records
                : []
              if (incoming.length > 0) {
                networkSharedState.mutate((draft) => {
                  draft.records = mergeNetworkRecords(draft.records, incoming)
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
        }),
      )

      // 拉取（面板兜底 + Coding Agent 消费入口）。探针在线走
      // 探针环形缓冲（真源），离线回落 sharedState 历史
      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getNetworkRecords,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Get captured network records (incremental by sinceId, newest tail window).',
          },
          setup: () => ({
            handler: async (
              args: GetNetworkRecordsParams,
            ): Promise<GetNetworkRecordsResult> => {
              const sinceId =
                typeof args?.sinceId === 'number' ? args.sinceId : 0
              const limit = Math.min(
                Math.max(typeof args?.limit === 'number' ? args.limit : 200, 1),
                500,
              )
              try {
                return await registry.callAgent<GetNetworkRecordsResult>(
                  AGENT_RPC.getNetworkRecords,
                  { sinceId, limit },
                )
              } catch {
                const snapshot = networkSharedState.value()
                const records = snapshot.records
                  .filter((rec) => rec.id > sinceId)
                  .slice(-limit)
                // sharedState 读回的是 immer 冻结对象，浅拷贝成普通对象再出 wire
                return {
                  records: records.map((rec) => ({ ...rec })),
                  latestId: snapshot.latestId,
                }
              }
            },
          }),
        }),
      )

      // 清空（面板按钮）。node 清 sharedState + 尽力透传探针
      // （探针离线时仅清 node 侧历史，同样算成功）
      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.clearNetworkRecords,
          type: 'action',
          jsonSerializable: true,
          agent: {
            description:
              'Clear captured network records on both node and agent probe.',
          },
          setup: () => ({
            handler: async (): Promise<ClearNetworkRecordsResult> => {
              networkSharedState.mutate((draft) => {
                draft.records = []
                draft.updatedAt = Date.now()
              })
              try {
                await registry.callAgent(AGENT_RPC.clearNetworkRecords)
              } catch {}
              return { ok: true }
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getRegisteredRoutes,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Get all registered page routes parsed from pages.json.',
          },
          setup: () => ({
            handler: async (): Promise<GetRegisteredRoutesResult> => {
              const routes = getRegisteredRoutesFromFs()
              return { routes }
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getRouterInfo,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Get current active mini-program page route and navigation stack from probe.',
          },
          setup: () => ({
            handler: async (): Promise<RouterInfoResult> => {
              try {
                return await registry.callAgent<RouterInfoResult>(
                  AGENT_RPC.getRouterInfo,
                )
              } catch {
                return {
                  currentRoute: null,
                  stack: [],
                }
              }
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getPiniaStores,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'List Pinia stores registered on the running mini-program app.',
          },
          setup: () => ({
            handler: async (): Promise<GetPiniaStoresResult> => {
              try {
                return await registry.callAgent<GetPiniaStoresResult>(
                  AGENT_RPC.getPiniaStores,
                )
              } catch {
                return { stores: [] }
              }
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.getPiniaState,
          type: 'query',
          jsonSerializable: true,
          agent: {
            description:
              'Get state and getters snapshot of one Pinia store by id.',
          },
          setup: () => ({
            handler: async (args: {
              id: string
            }): Promise<PiniaStateResult> => {
              return await registry.callAgent<PiniaStateResult>(
                AGENT_RPC.getPiniaState,
                args,
              )
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.updatePiniaState,
          type: 'action',
          jsonSerializable: true,
          agent: {
            description:
              'Edit one Pinia store state key (deep path supported).',
          },
          setup: () => ({
            handler: async (
              args: UpdatePiniaStateParams,
            ): Promise<UpdatePiniaStateResult> => {
              return await registry.callAgent<UpdatePiniaStateResult>(
                AGENT_RPC.updatePiniaState,
                args,
              )
            },
          }),
        }),
      )

      uni.rpc.register(
        defineRpcFunction({
          name: DEVFRAME_RPC.navigateTo,
          type: 'action',
          jsonSerializable: true,
          agent: {
            description:
              'Navigate to a mini-program page route via agent probe.',
          },
          setup: () => ({
            handler: async (args: NavigateParams): Promise<NavigateResult> => {
              if (!args?.path || typeof args.path !== 'string') {
                throw new Error('Path is required')
              }
              if (!registry.connected) {
                return {
                  ok: false,
                  error: 'Uni-app agent probe is not connected',
                }
              }
              try {
                return await registry.callAgent<NavigateResult>(
                  AGENT_RPC.navigate,
                  args,
                )
              } catch (err) {
                return {
                  ok: false,
                  error: err instanceof Error ? err.message : String(err),
                }
              }
            },
          }),
        }),
      )
    },
  })
}
