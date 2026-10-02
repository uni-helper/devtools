import type { ComponentStateResult, ComponentTreeResult, GetPiniaStoresResult, PiniaStateResult } from '@uni-helper/devtools-devframe/types'
import type { NetworkRecord } from '../types/network'

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
  // Graph tab 门禁依赖版本上报（对齐探针真实链路：vue 3.5.13 放宽后的门禁可见）
  vueVersion: '3.5.13',
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
    props: {
      title: '点击计数',
      step: 1,
    },
    attrs: {
      'data-testid': 'counter-card',
      'aria-label': 'counter',
    },
    data: {
      initialCount: 0,
    },
    setup: {
      count: { stateType: 'ref', value: 3 },
      isRunning: { value: true },
      config: {
        value: { step: 2, max: 99, labels: ['少', '中', '多'], nested: { deep: { flag: false } } },
      },
      items: {
        stateType: 'ref',
        value: [
          { id: 1, label: '第一项', done: true },
          { id: 2, label: '第二项', done: false },
        ],
      },
      ratio: { value: 0.42 },
      empty: { value: null },
      updatedAt: { value: '2026-09-30T12:00:00.000Z' },
    },
    computed: {
      doubleCount: { stateType: 'computed', value: 6, raw: '() => count.value * 2' },
    },
    setupOther: {
      onReset: { fn: true, fnName: 'onReset', fnSource: 'const onReset = () => { count.value = 0 }' },
    },
    // Graph tab 冒烟数据：count → render / count → doubleCount → render
    reactivityGraph: {
      nodes: [
        { id: 'reactivity-1', type: 'ref', label: 'count', data: { key: 'count', value: '3' } },
        { id: 'reactivity-2', type: 'computed', label: 'doubleCount', data: { key: 'doubleCount', value: '6' } },
        { id: 'reactivity-3', type: 'render', label: 'CounterCard render', data: { instanceName: 'CounterCard' } },
      ],
      relationships: [
        { id: 'reactivity-1->reactivity-3', from: 'reactivity-1', to: 'reactivity-3' },
        { id: 'reactivity-1->reactivity-2', from: 'reactivity-1', to: 'reactivity-2' },
        { id: 'reactivity-2->reactivity-3', from: 'reactivity-2', to: 'reactivity-3' },
      ],
    },
  },
  'pages/index/index#1': {
    id: 'pages/index/index#1',
    name: 'IndexPage',
    data: {},
    setup: {
      pageTitle: { value: '首页' },
      loading: { stateType: 'ref', value: false },
      list: { stateType: 'ref', value: [] },
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
    if (state.props && params.key in state.props)
      state.props[params.key] = params.value
    else if (state.data && params.key in state.data)
      state.data[params.key] = params.value
    else if (state.setup && params.key in state.setup)
      state.setup[params.key]!.value = params.value
    else if (state.computed && params.key in state.computed)
      state.computed[params.key]!.value = params.value
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
  // 语义对齐探针 updatePiniaState：键不存在抛错（getters 不是可写 state），
  // 不静默假装成功——mock 与真实链路行为不一致会掩盖面板侧 bug
  if (!data || !(params.key in data.state))
    throw new Error(`[updatePiniaState] Key "${params.key}" not found on store "${params.id}"`)
  data.state[params.key] = params.value
  return { ok: true, id: params.id, key: params.key }
}

/**
 * mock：编译后 render 源码样例（Show render code 的 ?mock 冒烟）。
 * 真实链路为探针 render.toString()（解插桩包装层），此处手造 uni mp 编译形态。
 */
export function mockGetComponentRenderCode(id: string): string | undefined {
  if (id !== 'pages/index/index#4')
    return undefined
  return [
    'import { resolveComponent as _resolveComponent, createVNode as _createVNode, toDisplayString as _toDisplayString, openBlock as _openBlock, createElementBlock as _createElementBlock } from "vue"',
    '',
    'export function render(_ctx, _cache) {',
    '  const _component_ActionButton = _resolveComponent("ActionButton")',
    '  return (_openBlock(), _createElementBlock("view", { class: "counter-card" }, [',
    '    _createVNode("text", { key: 0 }, _toDisplayString(_ctx.count), 1),',
    '    _createVNode(_component_ActionButton, {',
    '      key: 1,',
    '      step: _ctx.step,',
    '      "onUpdate:count": _ctx.onIncrement,',
    '    }, null, 8, ["step", "onUpdate:count"]),',
    '  ]))',
    '}',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Network (Task C): mock 网络请求记录（GET / POST / upload / download / fail / 截断）
// ---------------------------------------------------------------------------

function createInitialMockNetworkRecords(): NetworkRecord[] {
  const now = Date.now()
  return [
    {
      id: 1,
      type: 'request',
      method: 'GET',
      url: 'https://api.example.com/v1/user/profile?uid=42',
      page: 'pages/index/index',
      status: 200,
      statusText: 'OK',
      requestHeaders: {
        accept: 'application/json',
        authorization: 'Bearer token-abc-123',
      },
      responseHeaders: {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': 'req-001',
      },
      responseBody: {
        id: 42,
        username: 'uni_dev',
        nickname: 'Uni Dev',
        roles: ['admin', 'developer'],
      },
      responseSize: 88,
      startTime: now - 15000,
      duration: 42,
      ok: true,
    },
    {
      id: 2,
      type: 'request',
      method: 'POST',
      url: 'https://api.example.com/v1/orders',
      page: 'pages/index/index',
      status: 201,
      statusText: 'Created',
      requestHeaders: {
        'content-type': 'application/json',
        'authorization': 'Bearer token-abc-123',
      },
      responseHeaders: {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': 'req-002',
      },
      requestBody: {
        itemId: 'sku_998',
        quantity: 2,
        remark: 'fast delivery please',
      },
      responseBody: {
        orderId: 'ord_20261002_001',
        status: 'created',
        totalPrice: 199.9,
      },
      responseSize: 68,
      startTime: now - 12000,
      duration: 85,
      ok: true,
    },
    {
      id: 3,
      type: 'upload',
      method: 'POST',
      url: 'https://cdn.example.com/upload/avatar',
      page: 'pages/settings/settings',
      status: 200,
      requestHeaders: {
        authorization: 'Bearer token-abc-123',
      },
      responseHeaders: {
        'content-type': 'application/json',
      },
      requestBody: {
        filePath: 'wxfile://tmp_avatar.png',
        name: 'avatar',
        formData: { user: 'uni_dev' },
      },
      responseBody: {
        url: 'https://cdn.example.com/avatar/42.png',
        size: 45020,
      },
      responseSize: 58,
      startTime: now - 9000,
      duration: 230,
      ok: true,
    },
    {
      id: 4,
      type: 'download',
      method: 'GET',
      url: 'https://cdn.example.com/assets/report.pdf',
      page: 'pages/settings/settings',
      status: 200,
      responseHeaders: {
        'content-type': 'application/pdf',
        'content-length': '1048576',
      },
      responseBody: 'wxfile://tmp_report.pdf',
      responseSize: 1048576,
      startTime: now - 6000,
      duration: 512,
      ok: true,
    },
    {
      id: 5,
      type: 'request',
      method: 'GET',
      url: 'https://api.example.com/v1/health-check',
      page: 'pages/index/index',
      status: 0,
      requestHeaders: {
        accept: 'application/json',
      },
      error: 'request:fail timeout (connection timed out after 5000ms)',
      responseSize: 0,
      startTime: now - 3000,
      duration: 5003,
      ok: false,
    },
    {
      id: 6,
      type: 'request',
      method: 'POST',
      url: 'https://api.example.com/v1/logs/batch',
      page: 'pages/index/index',
      status: 200,
      requestHeaders: {
        'content-type': 'application/json',
      },
      responseHeaders: {
        'content-type': 'application/json',
      },
      requestBody: {
        batchId: 'batch_777',
        itemsCount: 500,
      },
      responseBody: '{"status":"ok","processed":500,"details":[{"line":0,"msg":"log snippet 0"},{"line":1,"msg":"log snippet 1"},"... [truncated]"]}',
      requestBodyTruncated: false,
      responseBodyTruncated: true,
      responseSize: 65536,
      startTime: now - 1000,
      duration: 115,
      ok: true,
    },
  ]
}

let mockNetworkStore: NetworkRecord[] = createInitialMockNetworkRecords()

export function mockNetworkRecords(): NetworkRecord[] {
  return JSON.parse(JSON.stringify(mockNetworkStore)) as NetworkRecord[]
}

export function mockClearNetworkRecords(): void {
  mockNetworkStore = []
}

export function mockResetNetworkRecords(): void {
  mockNetworkStore = createInitialMockNetworkRecords()
}

