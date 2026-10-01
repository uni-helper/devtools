import { defineDevframe, defineRpcFunction } from 'devframe'
import type { AgentRegistry } from './relay'

/**
 * Uni DevTools 的 DevframeDefinition（spike 版）。
 *
 * 所有 RPC 都是 relay 型：面板/AI → node 侧 → 转发给已连接的小程序探针执行。
 * 探针侧函数名见 src/agent/index.ts（'uni-devtools:agent:*'）。
 */
export function createUniDevtoolsDevframe(registry: AgentRegistry) {
  return defineDevframe({
    id: 'uni-helper-devtools',
    name: 'Uni DevTools (PoC)',
    version: '0.0.0',
    packageName: '@spike/devframe-poc',
    // 正式实现应从 package.json 读取；配置打包器对 import attributes 支持不稳，spike 写死
    importMetaUrl: import.meta.url,
    description: 'Uni-Helper DevTools Devframe PoC: component tree from a live uni-app mini-program.',
    icon: 'ph:device-mobile-duotone',

    setup(ctx) {
      const uni = ctx.scope('uni-helper-devtools')

      uni.rpc.register(defineRpcFunction({
        name: 'ping',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Health check. Returns node-side pong and whether a uni-app agent is connected.' },
        setup: () => ({
          handler: async () => ({
            pong: Date.now(),
            agentConnected: registry.connected,
          }),
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'get-component-tree',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get the component tree of the running uni-app mini-program pages. Safe to call freely.' },
        setup: () => ({
          handler: async () => {
            const tree = await registry.callAgent<any>('uni-devtools:agent:getComponentTree')
            return { fetchedAt: Date.now(), pages: tree?.pages ?? tree }
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'get-component-state',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'Get the editable state (data / setup bindings) of one component by id. Safe to call freely.' },
        setup: () => ({
          handler: async (args: { id: string }) => {
            return await registry.callAgent<any>('uni-devtools:agent:getComponentState', args)
          },
        }),
      }))

      uni.rpc.register(defineRpcFunction({
        name: 'update-component-state',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'Update one top-level state binding (data key or setup ref) of a component. Mutates the running app state.' },
        setup: () => ({
          handler: async (args: { id: string, key: string, value: unknown }) => {
            return await registry.callAgent<any>('uni-devtools:agent:updateComponentState', args)
          },
        }),
      }))
    },
  })
}
