/**
 * 端到端中继链路测试（不需要微信开发者工具）：
 * 用 node 原生 WebSocket + 官方 devframe 客户端构件模拟「探针」与「面板」，
 * 验证 token 鉴权 → peer 注册 → node 侧 relay 定向调用 → 结果回传。
 *
 * 用法: node scripts/e2e-node.mjs <httpOrigin> <token>
 * 例:   node scripts/e2e-node.mjs http://192.168.1.2:9999 abc123
 */

import { createRpcClient, createWsRpcChannel } from '../src/panel/df-client.mjs'

const [origin, token] = process.argv.slice(2)
if (!origin || !token) {
  console.error('usage: node scripts/e2e-node.mjs <httpOrigin> <token>')
  process.exit(1)
}

const WS_URL = `${origin.replace(/\/$/, '')}/__uni-devtools/__ws`

function connectClient(name, functions, extraQuery = '') {
  return new Promise((resolve, reject) => {
    const channel = createWsRpcChannel({
      url: `${WS_URL}${extraQuery}`,
      authToken: token,
      onConnected: () => {
        const rpc = createRpcClient(functions, { channel })
        // 官方 channel 无内置重连，spike 测试用不到
        resolve(rpc)
      },
      onError: e => reject(new Error(`${name} ws error: ${e?.message ?? e}`)),
    })
    setTimeout(() => reject(new Error(`${name} connect timeout`)), 6000)
  })
}

const FAKE_TREE = {
  pages: [{
    route: 'pages/index',
    components: { id: '1', name: 'FakeIndexPage', type: 'page', children: [{ id: '2', name: 'FakeChild', type: 'component' }] },
  }],
}

// ---- 1. 模拟探针（带 client=uni-agent 标记）----
const agent = await connectClient('agent', {
  'uni-devtools:agent:getComponentTree': () => FAKE_TREE,
  'uni-devtools:agent:ping': () => 424242,
}, '?client=uni-agent')
console.log('✓ 探针已连接（token 鉴权 + s: 编解码通过）')

// 等 node 侧 onPeerConnect 注册完成
await new Promise(r => setTimeout(r, 800))

// ---- 2. 模拟面板（无标记，走 relay RPC）----
const panel = await connectClient('panel', {})
console.log('✓ 面板已连接')

// ---- 3. 面板 → node 侧 relay RPC → 定向转发探针 ----
const pingRes = await panel.$call('uni-helper-devtools:ping')
console.log('✓ node 侧 ping:', JSON.stringify(pingRes))
if (pingRes?.agentConnected !== true)
  throw new Error(`agentConnected 应为 true，实际: ${pingRes?.agentConnected}`)

const treeRes = await panel.$call('uni-helper-devtools:get-component-tree')
console.log('✓ relay get-component-tree:', JSON.stringify(treeRes))
const name = treeRes?.pages?.[0]?.components?.name
if (name !== 'FakeIndexPage')
  throw new Error(`组件树往返失败，期望 FakeIndexPage 实际: ${name}`)

console.log('\n=== 中继链路端到端验证通过：面板 → devframe node 侧 → 探针 → 回传 ===')
process.exit(0)
