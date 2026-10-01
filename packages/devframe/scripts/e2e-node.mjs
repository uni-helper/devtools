/**
 * E2E Node Verification for @uni-helper/devtools-devframe
 *
 * Verifies:
 * 1. Harness startup (createDevServer / devframe instance)
 * 2. __connection.json accessibility and metadata integrity
 * 3. Agent probe WebSocket connection with client=uni-agent registration
 * 4. Panel RPC client connection and relay of all 4 frozen RPCs:
 *    - ping (health check + agentConnected)
 *    - get-component-tree (directed agent invocation)
 *    - get-component-state
 *    - update-component-state
 *
 * Usage:
 *   node packages/devframe/scripts/e2e-node.mjs [origin] [token]
 * (When arguments are omitted, spins up an isolated in-process harness automatically).
 */

import process from 'node:process'
import { startDevServerHarness } from '../src/harness.ts'
import { createRpcClient, createWsRpcChannel } from '../assets/panel/df-client.mjs'

const [cliOrigin, cliToken] = process.argv.slice(2)

let harness
let origin = cliOrigin
let token = cliToken
let wsUrl

if (!origin || !token) {
  // Use a dynamic/isolated port for automated test runs
  const testPort = 29000 + Math.floor(Math.random() * 1000)
  harness = await startDevServerHarness({
    port: testPort,
    basePath: '/__uni-devtools/',
  })
  origin = harness.origin
  token = harness.token
  wsUrl = harness.wsUrl
}
else {
  wsUrl = `${origin.replace(/\/$/, '')}/__uni-devtools/__ws`
}

console.log(`[E2E] Testing devframe at ${origin} (token: ${token})`)

function connectClient(name, functions, extraQuery = '') {
  return new Promise((resolve, reject) => {
    // 注意：不能把 authToken 交给 createWsRpcChannel 的 option——它无条件用 `?`
    // 拼接，URL 已有 query 时会把 token 变成前一个参数的值（DF0036 陷阱）。
    // 因此这里统一手工拼好完整 URL（分隔符正确），option 只留传输配置。
    const sep = extraQuery.includes('?') ? '&' : '?'
    const fullUrl = `${wsUrl}${extraQuery}${sep}devframe_auth_token=${encodeURIComponent(token)}`
    const channel = createWsRpcChannel({
      url: fullUrl,
      onConnected: () => {
        const rpc = createRpcClient(functions, { channel })
        resolve(rpc)
      },
      onError: e => reject(new Error(`${name} ws error: ${e?.message ?? e}`)),
    })
    setTimeout(() => reject(new Error(`${name} connect timeout`)), 6000)
  })
}

try {
  // 1. Verify __connection.json endpoint
  const connectionUrl = `${origin.replace(/\/$/, '')}/__uni-devtools/__connection.json`
  const res = await fetch(connectionUrl)
  if (!res.ok) {
    throw new Error(`__connection.json returned HTTP ${res.status}`)
  }
  const meta = await res.json()
  if (!meta || typeof meta !== 'object') {
    throw new Error('__connection.json is not valid JSON object')
  }
  console.log('✓ [1/5] __connection.json 可访问且返回有效元数据')

  // Mock mini-program agent data
  const FAKE_TREE = {
    pages: [{
      route: 'pages/index',
      components: {
        id: 'node-1',
        name: 'FakeIndexPage',
        type: 'page',
        children: [{ id: 'node-2', name: 'FakeChild', type: 'component' }],
      },
    }],
  }

  const FAKE_STATE = {
    id: 'node-2',
    name: 'FakeChild',
    data: { count: 0 },
    setup: {
      title: { type: 'ref', value: 'Hello' },
    },
  }

  // 2. Connect simulated agent probe with client=uni-agent marker
  const agent = await connectClient('agent', {
    'uni-devtools:agent:ping': () => 424242,
    'uni-devtools:agent:getComponentTree': () => FAKE_TREE,
    'uni-devtools:agent:getComponentState': (args) => {
      if (args?.id === 'node-2')
        return FAKE_STATE
      throw new Error(`Component not found: ${args?.id}`)
    },
    'uni-devtools:agent:updateComponentState': (args) => {
      return { ok: true, key: args.key, value: args.value }
    },
  }, '?client=uni-agent')
  console.log('✓ [2/5] 探针已连接并注册（token 鉴权与 wire 编解码通过）')

  // 3.5 探针自身作为推送调用方（P6 push 链路的真实形态）必须可信
  const agentPush = await agent.$call('uni-helper-devtools:push-component-tree', { fetchedAt: Date.now(), pages: [] })
  if (!agentPush || agentPush.ok !== true) {
    throw new Error(`探针 push-component-tree 期望 { ok: true }，实际: ${JSON.stringify(agentPush)}`)
  }
  console.log('✓ [3.5/5] 探针推送调用方可信，push-component-tree 入口可用')

  // Allow registration event to settle
  await new Promise(r => setTimeout(r, 600))

  // 3. Connect simulated panel client
  const panel = await connectClient('panel', {})
  console.log('✓ [3/5] 面板客户端已连接')

  // 4. Test relay ping
  const pingRes = await panel.$call('uni-helper-devtools:ping')
  if (!pingRes || pingRes.agentConnected !== true) {
    throw new Error(`uni-helper-devtools:ping agentConnected 期望 true，实际: ${pingRes?.agentConnected}`)
  }
  console.log('✓ [4/5] ping 调用成功，agentConnected === true')

  // 4.5 push-component-tree（探针 → node 写 sharedState 的入口）可调用
  const pushRes = await panel.$call('uni-helper-devtools:push-component-tree', {
    fetchedAt: Date.now(),
    pages: [],
  })
  if (!pushRes || pushRes.ok !== true) {
    throw new Error(`push-component-tree 期望 { ok: true }，实际: ${JSON.stringify(pushRes)}`)
  }
  console.log('✓ [4.5/5] push-component-tree 推送入口可用（经 panel 调用）')

  // 5. Test relay get-component-tree
  const treeRes = await panel.$call('uni-helper-devtools:get-component-tree')
  const rootCompName = treeRes?.pages?.[0]?.components?.name
  if (rootCompName !== 'FakeIndexPage') {
    throw new Error(`get-component-tree 组件树往返失败，期望 FakeIndexPage，实际: ${rootCompName}`)
  }

  // Also verify state RPCs
  const stateRes = await panel.$call('uni-helper-devtools:get-component-state', { id: 'node-2' })
  if (stateRes?.name !== 'FakeChild' || stateRes?.setup?.title?.value !== 'Hello') {
    throw new Error(`get-component-state 状态读取失败: ${JSON.stringify(stateRes)}`)
  }

  const updateRes = await panel.$call('uni-helper-devtools:update-component-state', {
    id: 'node-2',
    key: 'count',
    value: 99,
  })
  if (updateRes?.ok !== true || updateRes?.value !== 99) {
    throw new Error(`update-component-state 状态写入失败: ${JSON.stringify(updateRes)}`)
  }

  console.log('✓ [5/5] relay 4 大冻结 RPC 全量定向往返验证通过')
  console.log('\n======================================================')
  console.log('  E2E 验收通过：packages/devframe 全链路端到端正常！')
  console.log('======================================================\n')

  if (harness) {
    await harness.close()
  }
  process.exit(0)
}
catch (err) {
  console.error('\n❌ E2E 验证失败:', err)
  if (harness) {
    await harness.close().catch(() => {})
  }
  process.exit(1)
}
