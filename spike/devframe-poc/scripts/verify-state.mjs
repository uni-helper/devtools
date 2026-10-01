/**
 * 真机状态编辑验收（需要微信开发者工具中的小程序在运行）：
 * 拉组件树 → 定位 CompositionScript / OptionsScript → 读状态 → 改 count → 回读验证。
 *
 * 用法: node scripts/verify-state.mjs <httpOrigin> <token>
 */

import { createRpcClient, createWsRpcChannel } from '../src/panel/df-client.mjs'

const [origin, token] = process.argv.slice(2)
if (!origin || !token) {
  console.error('usage: node scripts/verify-state.mjs <httpOrigin> <token>')
  process.exit(1)
}

const channel = createWsRpcChannel({
  url: `${origin.replace(/\/$/, '')}/__uni-devtools/__ws`,
  authToken: token,
})

const rpc = createRpcClient({}, { channel })
const ready = new Promise((resolve, reject) => {
  channel.onConnected ? null : resolve()
  setTimeout(resolve, 1500)
  channel.onError = (e) => { console.error('ws error:', e); process.exit(1) }
})
await ready

// ---- 1. 组件树 ----
const tree = await rpc.$call('uni-helper-devtools:get-component-tree')
const flat = []
function walk(node, route) {
  if (!node) return
  flat.push({ ...node, _route: route })
  ;(node.children ?? []).forEach(c => walk(c, route))
}
;(tree.pages ?? []).forEach(p => walk(p.components, p.route))
console.log(`组件树共 ${flat.length} 个节点:`)
flat.forEach(n => console.log(`  - [${n._route}] ${n.name} (#${n.id})`))

function findByName(name) {
  return flat.find(n => n.name && n.name.includes(name))
}

// ---- 2&3. Composition API（setup ref）----
const comp = findByName('CompositionScript')
if (!comp) {
  console.error('\n✗ 树中未找到 CompositionScript（子组件遍历仍有问题）')
  process.exit(1)
}
const before1 = await rpc.$call('uni-helper-devtools:get-component-state', { id: comp.id })
console.log(`\nCompositionScript #${comp.id} 修改前状态:`, JSON.stringify(before1))
const target1 = before1.setup?.count ?? before1.data?.count
const bucket1 = before1.setup?.count ? 'setup' : 'data'
const upd1 = await rpc.$call('uni-helper-devtools:update-component-state', { id: comp.id, key: 'count', value: 999 })
console.log('update 返回:', JSON.stringify(upd1))
const after1 = await rpc.$call('uni-helper-devtools:get-component-state', { id: comp.id })
const readBack1 = after1.setup?.count?.value ?? after1.data?.count
console.log(`修改后回读 count = ${JSON.stringify(readBack1)}（${bucket1}）`)
if (JSON.stringify(readBack1) !== '999')
  throw new Error(`CompositionScript 回读不一致: ${JSON.stringify(readBack1)}`)
console.log('✓ Composition API 状态编辑通过（ref.value = 999）')

// ---- 4&5. Options API（$data）----
const opt = findByName('OptionsScript')
if (opt) {
  const before2 = await rpc.$call('uni-helper-devtools:get-component-state', { id: opt.id })
  console.log(`\nOptionsScript #${opt.id} 修改前状态:`, JSON.stringify(before2))
  await rpc.$call('uni-helper-devtools:update-component-state', { id: opt.id, key: 'count', value: 555 })
  const after2 = await rpc.$call('uni-helper-devtools:get-component-state', { id: opt.id })
  const readBack2 = after2.data?.count ?? after2.setup?.count?.value
  console.log(`修改后回读 count = ${JSON.stringify(readBack2)}`)
  if (JSON.stringify(readBack2) !== '555')
    throw new Error(`OptionsScript 回读不一致: ${JSON.stringify(readBack2)}`)
  console.log('✓ Options API 状态编辑通过（$data.count = 555）')
}
else {
  console.log('\n（未找到 OptionsScript，跳过 Options API 验证）')
}

console.log('\n=== 真机状态编辑验收通过。请在微信开发者工具模拟器确认：')
console.log('=== CompositionScript 显示 999、OptionsScript 显示 555（模板若渲染 count）===')
process.exit(0)
