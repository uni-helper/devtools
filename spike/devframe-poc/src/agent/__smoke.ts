/**
 * Runtime Agent 冒烟测试脚本 (Node 直接运行)
 * 测试内容：
 * 1. 模拟 Vue 3 subTree / component 嵌套结构
 * 2. 模拟包含循环引用的 vm 实例
 * 3. 验证 collectComponentTree 采集、层级深度及纯 JSON 序列化
 */

import assert from 'node:assert'
import { collectComponentTree, extractComponentNode } from './tree.ts'
import { getComponentState, updateComponentState } from './state.ts'

console.log('[Smoke Test] Starting Runtime Agent Component Tree Smoke Test...')

// 1. 构造具有三层嵌套和循环引用的假 Vue 3 组件结构
const childComponent3 = {
  uid: 103,
  type: {
    name: 'AvatarBadge',
    __file: 'src/components/AvatarBadge.vue',
  },
  subTree: {
    type: 'span',
    children: ['Active'],
  },
}

const childComponent2 = {
  uid: 102,
  type: {
    name: 'UserProfile',
    __file: 'src/components/UserProfile.vue',
  },
  subTree: {
    type: 'view',
    children: [
      {
        type: 'text',
        children: ['User Name'],
      },
      {
        // 嵌套子组件 VNode
        component: {
          proxy: childComponent3,
          uid: 103,
        },
      },
    ],
  },
}

// 模拟 page vm，挂载 subTree 并构造循环引用
const pageVm1: any = {
  uid: 101,
  type: {
    name: 'IndexPage',
    __file: 'src/pages/index/index.vue',
  },
  subTree: {
    type: 'view',
    children: [
      {
        type: 'header',
        children: ['Header Title'],
      },
      {
        // 子组件 VNode
        component: {
          proxy: childComponent2,
          uid: 102,
        },
      },
    ],
  },
  setupState: {
    count: { __v_isRef: true, value: 42 },
    user: { name: 'Alice', role: 'admin' },
    rawTitle: 'Static Title',
    ignoredFunc: () => {},
    _privateVal: 'hidden',
  },
  $data: {
    legacyStatus: 'online',
    legacyScore: 100,
  },
}

// 故意制造循环引用，验证树采集不会进入死循环且不拖垮序列化
pageVm1.self = pageVm1
childComponent2.parent = pageVm1
childComponent3.root = pageVm1

// 2. 构造使用 $children 的老式 / 备用结构
const childLegacy = {
  uid: 202,
  type: {
    name: 'LegacyCard',
    __file: 'src/components/LegacyCard.vue',
  },
}

const pageVm2: any = {
  uid: 201,
  type: {
    name: 'DetailPage',
    __file: 'src/pages/detail/detail.vue',
  },
  $children: [childLegacy],
}
childLegacy.parent = pageVm2

// 3. 构造 mock pages
const mockPages = [
  {
    route: 'pages/index/index',
    $vm: pageVm1,
  },
  {
    route: 'pages/detail/detail',
    $vm: pageVm2,
  },
]

// 4. 执行采集测试
const treeList = collectComponentTree(mockPages)

console.log('[Smoke Test] Tree extracted successfully. Page count:', treeList.length)

// 断言 1: 页面数量
assert.strictEqual(treeList.length, 2, 'Should extract 2 pages')

// 断言 2: 第一页 route 与根组件
const page1 = treeList[0]
assert.strictEqual(page1.route, 'pages/index/index')
assert.ok(page1.components, 'Page 1 components root should exist')
assert.strictEqual(page1.components?.name, 'IndexPage')
assert.strictEqual(page1.components?.type, 'page')
assert.strictEqual(page1.components?.file, 'src/pages/index/index.vue')

// 断言 3: 第二层子组件
assert.strictEqual(page1.components?.children?.length, 1, 'IndexPage should have 1 child component')
const comp2 = page1.components?.children?.[0]
assert.strictEqual(comp2?.name, 'UserProfile')
assert.strictEqual(comp2?.type, 'component')

// 断言 4: 第三层子组件
assert.strictEqual(comp2?.children?.length, 1, 'UserProfile should have 1 child component')
const comp3 = comp2?.children?.[0]
assert.strictEqual(comp3?.name, 'AvatarBadge')
assert.strictEqual(comp3?.type, 'component')

// 断言 5: 第二页 $children 提取
const page2 = treeList[1]
assert.strictEqual(page2.route, 'pages/detail/detail')
assert.strictEqual(page2.components?.name, 'DetailPage')
assert.strictEqual(page2.components?.children?.length, 1)
assert.strictEqual(page2.components?.children?.[0].name, 'LegacyCard')

// 断言 6: JSON 序列化绝不报错，且能正确反序列化
let jsonStr = ''
assert.doesNotThrow(() => {
  jsonStr = JSON.stringify(treeList, null, 2)
}, 'JSON.stringify must not throw on extracted tree')

const parsed = JSON.parse(jsonStr)
assert.strictEqual(parsed.length, 2)
assert.strictEqual(parsed[0].components.children[0].children[0].name, 'AvatarBadge')

console.log('[Smoke Test] JSON.stringify passed! Serialized length:', jsonStr.length)

// ================= 状态读写冒烟断言 =================
console.log('\n[Smoke Test] Testing Component State Inspection & Mutation...')

// 断言 7: getComponentState 提取 setupState (ref / object / value) 与 $data
const state1 = getComponentState('101')
assert.strictEqual(state1.id, '101')
assert.strictEqual(state1.name, 'IndexPage')

// ref 分支
assert.strictEqual(state1.setup?.count?.type, 'ref')
assert.strictEqual(state1.setup?.count?.value, 42)

// object / reactive 分支
assert.strictEqual(state1.setup?.user?.type, 'object')
assert.deepStrictEqual(state1.setup?.user?.value, { name: 'Alice', role: 'admin' })

// 纯值绑定分支
assert.strictEqual(state1.setup?.rawTitle?.type, 'value')
assert.strictEqual(state1.setup?.rawTitle?.value, 'Static Title')

// 过滤规则（跳过函数与 _/$ 私有属性）
assert.strictEqual(state1.setup?.ignoredFunc, undefined)
assert.strictEqual(state1.setup?._privateVal, undefined)

// Options API $data 分支
assert.strictEqual(state1.data?.legacyStatus, 'online')
assert.strictEqual(state1.data?.legacyScore, 100)
console.log('[Smoke Test] State inspection passed:', JSON.stringify(state1, null, 2))

// 断言 8: updateComponentState 写回 ref
const refRes = updateComponentState({ id: '101', key: 'count', value: 99 })
assert.strictEqual(refRes.ok, true)
assert.strictEqual(refRes.value, 99)
assert.strictEqual(pageVm1.setupState.count.value, 99, 'Ref .value must be updated to 99')
const stateAfterRef = getComponentState('101')
assert.strictEqual(stateAfterRef.setup?.count?.value, 99)

// 断言 9: updateComponentState 写回 $data
const dataRes = updateComponentState({ id: '101', key: 'legacyStatus', value: 'offline' })
assert.strictEqual(dataRes.ok, true)
assert.strictEqual(pageVm1.$data.legacyStatus, 'offline')
const stateAfterData = getComponentState('101')
assert.strictEqual(stateAfterData.data?.legacyStatus, 'offline')

// 断言 10: updateComponentState 写回 reactive / object (Object.assign 合并)
const objRes = updateComponentState({ id: '101', key: 'user', value: { role: 'superadmin' } })
assert.strictEqual(objRes.ok, true)
assert.strictEqual(pageVm1.setupState.user.role, 'superadmin')
assert.strictEqual(pageVm1.setupState.user.name, 'Alice') // 保持原属性

// 断言 11: 异常情况阻断测试
// (1) 纯值绑定不可写抛错
assert.throws(
  () => updateComponentState({ id: '101', key: 'rawTitle', value: 'New' }),
  /not writable/,
  'Primitive value in setupState must not be writable',
)
// (2) 不存在的 key 抛错
assert.throws(
  () => updateComponentState({ id: '101', key: 'notExist', value: 1 }),
  /not found/,
  'Non-existent key must throw',
)
// (3) 不存在的 component id 抛错
assert.throws(
  () => updateComponentState({ id: '9999', key: 'count', value: 1 }),
  /not found in registry/,
  'Non-existent component id must throw',
)

console.log('[Smoke Test] State mutation assertions all passed!')
console.log('--- ALL SMOKE ASSERTIONS PASSED ---')
