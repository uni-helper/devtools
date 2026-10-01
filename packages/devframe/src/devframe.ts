import process from 'node:process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineDevframe, defineRpcFunction } from 'devframe'
import type { DevframeDockDefaults } from 'devframe/types'
import type { AgentRegistry } from './relay.ts'
import type {
  ComponentStateResult,
  ComponentTreeResult,
  PingResult,
  UpdateComponentStateParams,
  UpdateComponentStateResult,
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
  // 1. Primary path: real panel build output in packages/panel/dist
  const realPanelDist = resolve(here, '../../panel/dist')
  if (existsSync(realPanelDist))
    return realPanelDist

  // 2. Stand-in fallback: packages/devframe/assets/panel
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
      // Auto-bind group if not bound yet
      registry.bind(() => (ctx.rpc as any)?._rpcGroup)

      const uni = ctx.scope('uni-helper-devtools')

      const treeSharedState = await uni.rpc.sharedState('component-tree', {
        initialValue: {
          fetchedAt: 0,
          pages: [],
        },
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
              }
              treeSharedState.mutate((draft) => {
                draft.fetchedAt = result.fetchedAt
                draft.pages = result.pages
              })
              registry.setCachedTree(result)
              return result
            }
            catch (err) {
              const cached = registry.getCachedTree() || treeSharedState.value()
              if (cached && Array.isArray(cached.pages) && cached.pages.length > 0) {
                return cached
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
    },
  })
}
