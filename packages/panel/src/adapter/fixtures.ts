import type { ComponentStateResult, ComponentTreeResult, GetPiniaStoresResult, PiniaStateResult } from '@uni-helper/devtools-devframe/types'

/**
 * 面板的假数据，只在显式 mock 模式（URL 带 `?mock`）下使用。
 *
 * 存在的理由：面板的布局、搜索、编辑交互都可以在没有小程序、没有 devframe
 * 服务端的情况下开发与回归，不必每次都起完整链路。**它绝不会自动接管**——
 * 只有显式 `?mock` 才生效，且界面上会常驻一条 mock 横幅，避免把假数据误认成
 * 真数据。
 */

const tree: ComponentTreeResult = {
  fetchedAt: 0,
  pages: [
    {
      route: 'pages/index/index',
      components: {
        id: 'pages/index/index#1',
        name: 'IndexPage',
        type: 'page',
        file: '/src/pages/index/index.vue',
        children: [
          {
            id: 'pages/index/index#2',
            name: 'AppHeader',
            type: 'component',
            file: '/src/components/AppHeader.vue',
            children: [
              { id: 'pages/index/index#3', name: 'UserAvatar', type: 'component', file: '/src/components/UserAvatar.vue' },
            ],
          },
          {
            id: 'pages/index/index#4',
            name: 'CounterCard',
            type: 'component',
            file: '/src/components/CounterCard.vue',
            children: [
              { id: 'pages/index/index#5', name: 'ActionButton', type: 'component', file: '/src/components/ActionButton.vue' },
              { id: 'pages/index/index#6', name: 'Anonymous', type: 'component' },
            ],
          },
        ],
      },
    },
    {
      route: 'pages/settings/settings',
      components: {
        id: 'pages/settings/settings#20',
        name: 'SettingsPage',
        type: 'page',
        file: '/src/pages/settings/settings.vue',
        children: [
          { id: 'pages/settings/settings#21', name: 'FormSwitch', type: 'component', file: '/src/components/FormSwitch.vue' },
        ],
      },
    },
  ],
}

const stateById: Record<string, ComponentStateResult> = {

  'pages/index/index#4': {
    id: 'pages/index/index#4',
    name: 'CounterCard',
    data: {
      title: '点击计数',
      initialCount: 0,
    },
    setup: {
      count: { type: 'ref', value: 3 },
      isRunning: { type: 'value', value: true },
      config: {
        type: 'object',
        value: { step: 2, max: 99, labels: ['少', '中', '多'], nested: { deep: { flag: false } } },
      },
      items: {
        type: 'ref',
        value: [
          { id: 1, label: '第一项', done: true },
          { id: 2, label: '第二项', done: false },
        ],
      },
      ratio: { type: 'value', value: 0.42 },
      empty: { type: 'value', value: null },
      updatedAt: { type: 'value', value: '2026-09-30T12:00:00.000Z' },
    },
  },
  'pages/index/index#1': {
    id: 'pages/index/index#1',
    name: 'IndexPage',
    data: {},
    setup: {
      pageTitle: { type: 'value', value: '首页' },
      loading: { type: 'ref', value: false },
      list: { type: 'ref', value: [] },
    },
  },
}

/**
 * 未知 id 时返回一个空状态，模拟探针的“组件存在但无状态”情形。
 *
 * **必须返回深拷贝**：真实传输层（birpc structured-clone）每次响应都会解码出
 * 全新对象，而面板的响应式链路依赖这一点——若两次调用返回同一引用，Vue 的
 * computed 会因 `Object.is` 相等而切断下游更新（写后回读不刷新）。mock 直接
 * 递内存对象会悄悄违背这个语义，导致只有 mock 环境才出现的假 bug。
 */
export function mockComponentState(id: string): ComponentStateResult {
  const state = stateById[id]
  return state
    ? JSON.parse(JSON.stringify(state)) as ComponentStateResult
    : { id, name: `Component#${id}`, data: {}, setup: {} }
}

/** mock 写回：改内存里的同一份状态，语义对齐探针（data 直写、setup 写 binding.value）。 */
export function mockUpdateComponentState(params: { id: string, key: string, value: unknown }): { ok: true, key: string, value: unknown } {
  const state = stateById[params.id]
  if (state) {
    if (params.key in state.data)
      state.data[params.key] = params.value
    else if (params.key in state.setup)
      state.setup[params.key]!.value = params.value
  }
  return { ok: true, key: params.key, value: params.value }
}

export function mockComponentTree(): ComponentTreeResult {
  return { ...tree, fetchedAt: Date.now() }
}

// ---------------------------------------------------------------------------
// Pinia（W4）：mock 两个 store，语义对齐探针（state 顶层键 + getters 只读）
// ---------------------------------------------------------------------------

const piniaStores = [
  { id: 'counter' },
  { id: 'user' },
]

const piniaStateById: Record<string, { state: Record<string, unknown>, getters: Record<string, unknown> }> = {
  counter: {
    state: { count: 0, step: 1, history: [] as unknown[] },
    getters: { double: 0, isZero: true },
  },
  user: {
    state: { name: 'uni-helper', tags: ['devtools', 'mp'], profile: { city: 'Shanghai' } },
    getters: { greeting: 'Hello, uni-helper' },
  },
}

export function mockPiniaStores(): GetPiniaStoresResult {
  return { stores: piniaStores.map(store => ({ id: store.id })) }
}

export function mockPiniaState(id: string): PiniaStateResult {
  const data = piniaStateById[id]
  if (!data)
    return { id, state: {}, getters: {} }
  // 深拷贝语义同 mockComponentState（真实传输层每次全新对象）
  return { id, state: JSON.parse(JSON.stringify(data.state)), getters: JSON.parse(JSON.stringify(data.getters)) }
}

export function mockUpdatePiniaState(params: { id: string, key: string, value: unknown }): { ok: true, id: string, key: string } {
  const data = piniaStateById[params.id]
  if (data && params.key in data.state)
    data.state[params.key] = params.value
  return { ok: true, id: params.id, key: params.key }
}
