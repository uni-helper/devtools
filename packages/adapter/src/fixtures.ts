import type {
  ComponentStateResult,
  ComponentTreeResult,
  GetPiniaStoresResult,
  GetStorageEntriesParams,
  PiniaStateResult,
  NetworkRecord,
  StorageEntriesResult,
  StorageEntry,
  StorageInfoResult,
  VuexStateResult,
} from '@uni-helper/devtools-shared'

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
              {
                id: 'pages/index/index#3',
                name: 'UserAvatar',
                type: 'component',
                file: '/src/components/UserAvatar.vue',
              },
            ],
          },
          {
            id: 'pages/index/index#4',
            name: 'CounterCard',
            type: 'component',
            file: '/src/components/CounterCard.vue',
            children: [
              {
                id: 'pages/index/index#5',
                name: 'ActionButton',
                type: 'component',
                file: '/src/components/ActionButton.vue',
              },
              {
                id: 'pages/index/index#6',
                name: 'Anonymous',
                type: 'component',
              },
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
          {
            id: 'pages/settings/settings#21',
            name: 'FormSwitch',
            type: 'component',
            file: '/src/components/FormSwitch.vue',
          },
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
        value: {
          step: 2,
          max: 99,
          labels: ['少', '中', '多'],
          nested: { deep: { flag: false } },
        },
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
      doubleCount: {
        stateType: 'computed',
        value: 6,
        raw: '() => count.value * 2',
      },
    },
    setupOther: {
      onReset: {
        fn: true,
        fnName: 'onReset',
        fnSource: 'const onReset = () => { count.value = 0 }',
      },
    },
    // Graph tab 冒烟数据：count → render / count → doubleCount → render
    reactivityGraph: {
      nodes: [
        {
          id: 'reactivity-1',
          type: 'ref',
          label: 'count',
          data: { key: 'count', value: '3' },
        },
        {
          id: 'reactivity-2',
          type: 'computed',
          label: 'doubleCount',
          data: { key: 'doubleCount', value: '6' },
        },
        {
          id: 'reactivity-3',
          type: 'render',
          label: 'CounterCard render',
          data: { instanceName: 'CounterCard' },
        },
      ],
      relationships: [
        {
          id: 'reactivity-1->reactivity-3',
          from: 'reactivity-1',
          to: 'reactivity-3',
        },
        {
          id: 'reactivity-1->reactivity-2',
          from: 'reactivity-1',
          to: 'reactivity-2',
        },
        {
          id: 'reactivity-2->reactivity-3',
          from: 'reactivity-2',
          to: 'reactivity-3',
        },
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
    ? (JSON.parse(JSON.stringify(state)) as ComponentStateResult)
    : { id, name: `Component#${id}`, data: {}, setup: {} }
}

/** mock 写回：改内存里的同一份状态，语义对齐探针（data 直写、setup 写 binding.value）。 */
export function mockUpdateComponentState(params: {
  id: string
  key: string
  value: unknown
}): { ok: true; key: string; value: unknown } {
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

const piniaStores = [{ id: 'counter' }, { id: 'user' }]

const piniaStateById: Record<
  string,
  { state: Record<string, unknown>; getters: Record<string, unknown> }
> = {
  counter: {
    state: { count: 0, step: 1, history: [] as unknown[] },
    getters: { double: 0, isZero: true },
  },
  user: {
    state: {
      name: 'uni-helper',
      tags: ['devtools', 'mp'],
      profile: { city: 'Shanghai' },
    },
    getters: { greeting: 'Hello, uni-helper' },
  },
}

export function mockPiniaStores(): GetPiniaStoresResult {
  return { stores: piniaStores.map((store) => ({ id: store.id })) }
}

export function mockPiniaState(id: string): PiniaStateResult {
  const data = piniaStateById[id]
  if (!data) return { id, state: {}, getters: {} }
  // 深拷贝语义同 mockComponentState（真实传输层每次全新对象）
  return {
    id,
    state: JSON.parse(JSON.stringify(data.state)),
    getters: JSON.parse(JSON.stringify(data.getters)),
  }
}

export function mockUpdatePiniaState(params: {
  id: string
  key: string
  value: unknown
}): { ok: true; id: string; key: string } {
  const data = piniaStateById[params.id]
  // 语义对齐探针 updatePiniaState：键不存在抛错（getters 不是可写 state），
  // 不静默假装成功——mock 与真实链路行为不一致会掩盖面板侧 bug
  if (!data || !(params.key in data.state))
    throw new Error(
      `[updatePiniaState] Key "${params.key}" not found on store "${params.id}"`,
    )
  data.state[params.key] = params.value
  return { ok: true, id: params.id, key: params.key }
}

// ---------------------------------------------------------------------------
// Vuex（对齐 Pinia 架构，Vue 2 探针专用）：root + 嵌套 namespaced module。
// 语义对齐 probes/runtime/vuex.ts：getVuexStores 返回含完整 state/getters 的
// VuexStateResult 数组（root 固定 id `_root`）；module 的 getters 是去
// `module/` 前缀后的本模块键（extractModuleGetters），root 的 getters 含全名。
// ---------------------------------------------------------------------------

function createInitialVuexState(): Record<
  string,
  {
    state: Record<string, unknown>
    getters: Record<string, unknown>
    namespaced: boolean
  }
> {
  return {
    _root: {
      state: { appVersion: '1.2.0', theme: 'light', launchCount: 3 },
      getters: { isDarkTheme: false, 'cart/itemCount': 2 },
      namespaced: false,
    },
    cart: {
      state: { items: [{ sku: 'p1', count: 2 }], coupon: null },
      getters: { itemCount: 2 },
      namespaced: true,
    },
    'cart/products': {
      state: { keyword: 'uni', list: ['devtools', 'uni-app', 'pinia'] },
      getters: { filtered: ['uni-app'] },
      namespaced: true,
    },
  }
}

let vuexStateById = createInitialVuexState()

export function mockVuexStores(): VuexStateResult[] {
  return Object.entries(vuexStateById).map(([id, data]) => ({
    id,
    state: JSON.parse(JSON.stringify(data.state)),
    getters: JSON.parse(JSON.stringify(data.getters)),
    namespaced: data.namespaced,
  }))
}

// 探针 getVuexState 对未知 id 返回 null（find 失败），不抛错——如实对齐
export function mockVuexState(id: string): VuexStateResult | null {
  const data = vuexStateById[id]
  if (!data) return null
  // 深拷贝语义同 mockPiniaState（真实传输层每次全新对象）
  return {
    id,
    state: JSON.parse(JSON.stringify(data.state)),
    getters: JSON.parse(JSON.stringify(data.getters)),
    namespaced: data.namespaced,
  }
}

export function mockUpdateVuexState(params: {
  id: string
  path: string[]
  value?: unknown
  remove?: boolean
}): { ok: true; id: string } {
  const data = vuexStateById[params.id]
  // 探针对未知 module 是静默写入临时对象（getModuleState 返回 {}，写完即丢）；
  // mock 选择 fail loud——静默丢失的编辑只会掩盖面板侧 bug
  if (!data)
    throw new Error(`[updateVuexState] Module "${params.id}" not found`)
  // 空 path 与探针 setValueByPath 同语义：no-op 成功
  if (params.path.length === 0) return { ok: true, id: params.id }
  let target: Record<string, unknown> = data.state
  for (let i = 0; i < params.path.length - 1; i++) {
    const key = params.path[i]!
    // 中间路径不存在时创建（对齐探针 setValueByPath）
    if (!(key in target)) target[key] = {}
    target = target[key] as Record<string, unknown>
  }
  const lastKey = params.path[params.path.length - 1]!
  if (params.remove) {
    // 数组元素删除走 splice、不留稀疏空洞（对齐探针 Vue.delete 的数组语义），
    // 对象键保持 delete
    const index = Number(lastKey)
    if (Array.isArray(target) && Number.isInteger(index))
      target.splice(index, 1)
    else delete target[lastKey]
  } else {
    target[lastKey] = params.value
  }
  return { ok: true, id: params.id }
}

/** 测试用：恢复 Vuex fixtures 初始值（编辑是模块级内存写回，会话内保持） */
export function mockResetVuexState(): void {
  vuexStateById = createInitialVuexState()
}

// ---------------------------------------------------------------------------
// Storage（微信小程序 storage 收集，MCP 优先暴露）：内存键值对，语义对齐
// probes/runtime/storage.ts 的 WechatStorageCapability——getInfo 只含元数据；
// getEntries 支持显式 keys / 正则过滤 / 分页 / 截断 / 字节大小 / 错误隔离。
// 探针侧 storage 只读（写操作仅发失效通知），mock 同样无写路径。
// ---------------------------------------------------------------------------

const storageData: Record<string, unknown> = {
  token: 'eyJhbGciOiJIUzI1NiJ9.mock-signed-token',
  user_profile: { name: 'uni-helper', city: 'Shanghai', vip: false },
  search_history: ['devtools', 'uni-app', 'pinia'],
  settings: { theme: 'dark', language: 'zh-CN', notifications: true },
  draft_content: '未提交的表单草稿：devtools mock 数据',
}

// TextEncoder 实例无状态，提升为模块单例避免每次调用重建
const utf8Encoder = new TextEncoder()

/** UTF-8 字节长度（includeSize 口径，与探针 getUtf8ByteLength 一致） */
function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).length
}

/** 值的序列化字节估算；不可序列化的值按 0 计（条目级错误隔离见 mockStorageEntries） */
function serializedByteLength(value: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(value) ?? '')
  } catch {
    return 0
  }
}

export function mockStorageInfo(): StorageInfoResult {
  const keys = Object.keys(storageData)
  // currentSize 与微信 getStorageInfo 同为 KB 口径（空存储为 0）：
  // 按键 + 值的序列化字节估算向上取整
  const bytes = keys.reduce(
    (sum, key) =>
      sum + utf8ByteLength(key) + serializedByteLength(storageData[key]),
    0,
  )
  return {
    keys,
    currentSize: Math.ceil(bytes / 1024),
    limitSize: 10240,
    keyCount: keys.length,
    timestamp: Date.now(),
  }
}

export function mockStorageEntries(
  params: GetStorageEntriesParams = {},
): StorageEntriesResult {
  const storageKeys = Object.keys(storageData)
  const storageKeySet = new Set(storageKeys)

  // 目标 key 选择：显式 keys（不存在的保留为显式 miss 条目，对齐探针锁定行为）
  // > matchPattern 正则（无效正则抛错）> 全量
  let targetKeys: string[]
  if (Array.isArray(params.keys) && params.keys.length > 0) {
    targetKeys = Array.from(new Set(params.keys.map(String)))
  } else if (params.matchPattern) {
    let regex: RegExp
    try {
      regex = new RegExp(params.matchPattern)
    } catch (err) {
      throw new Error(
        `Invalid matchPattern "${params.matchPattern}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    targetKeys = storageKeys.filter((k) => regex.test(k))
  } else {
    targetKeys = storageKeys.slice()
  }

  const total = targetKeys.length
  let offset = params.offset !== undefined ? Number(params.offset) : 0
  if (Number.isNaN(offset) || offset < 0) offset = 0
  let limit = params.limit !== undefined ? Number(params.limit) : 50
  if (Number.isNaN(limit) || limit <= 0) limit = 50
  if (limit > 200) limit = 200

  const pagedKeys = targetKeys.slice(offset, offset + limit)
  const hasMore = offset + limit < total

  const maxValueChars =
    typeof params.maxValueChars === 'number' && params.maxValueChars > 0
      ? params.maxValueChars
      : 32768
  const includeSize = Boolean(params.includeSize)

  const entries: StorageEntry[] = pagedKeys.map((key) => {
    if (!storageKeySet.has(key))
      return { key, value: null, error: 'key not found' }
    // 序列化 → 反序列化得到全新副本（对齐探针 wx.getStorage 每次返回新对象，
    // 也避免调用方就地修改条目时污染模块级 fixtures）；错误隔离对齐探针
    // fetchEntry：单条失败不抛整体
    try {
      const serialized = JSON.stringify(storageData[key])
      if (serialized === undefined)
        return { key, value: null, error: 'Unserializable value (undefined)' }
      const entry: StorageEntry = { key, value: JSON.parse(serialized) }
      if (serialized.length > maxValueChars) {
        // 截断后的 value 是序列化字符串前缀（对齐探针 fetchEntry）
        entry.value = serialized.slice(0, maxValueChars)
        entry.truncated = true
      }
      if (includeSize) entry.size = utf8ByteLength(serialized)
      return entry
    } catch (err) {
      return {
        key,
        value: null,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to process storage entry',
      }
    }
  })

  return { entries, total, hasMore, timestamp: Date.now() }
}

/**
 * mock：编译后 render 源码样例（Show render code 的 ?mock 冒烟）。
 * 真实链路为探针 render.toString()（解插桩包装层），此处手造 uni mp 编译形态。
 */
export function mockGetComponentRenderCode(id: string): string | undefined {
  if (id !== 'pages/index/index#4') return undefined
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

/** 在途演示记录（id 7）的 id 与结算窗口：mock 心跳超时后就地结算，演示 pending → 终态原行更新 */
const MOCK_PENDING_RECORD_ID = 7
const MOCK_PENDING_SETTLES_AFTER_MS = 5000
let mockPendingCreatedAt = 0

function createInitialMockNetworkRecords(): NetworkRecord[] {
  const now = Date.now()
  mockPendingCreatedAt = now
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
        authorization: 'Bearer token-abc-123',
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
      responseBody:
        '{"status":"ok","processed":500,"details":[{"line":0,"msg":"log snippet 0"},{"line":1,"msg":"log snippet 1"},"... [truncated]"]}',
      requestBodyTruncated: false,
      responseBodyTruncated: true,
      responseSize: 65536,
      startTime: now - 1000,
      duration: 115,
      ok: true,
    },
    {
      // 在途记录（无 duration）：演示 (pending) 态与 Waterfall 条生长
      id: 7,
      type: 'request',
      method: 'GET',
      url: 'https://api.example.com/v1/stream/poll',
      page: 'pages/index/index',
      status: 0,
      requestHeaders: {
        accept: 'application/json',
      },
      responseSize: 0,
      startTime: now - 300,
      ok: false,
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

/** mock 心跳（1s 间隔由适配器驱动）：在途演示记录超时后就地结算并返回最新快照 */
export function mockTickNetworkRecords(): NetworkRecord[] {
  const pending = mockNetworkStore.find(
    (rec) => rec.id === MOCK_PENDING_RECORD_ID && rec.duration == null,
  )
  if (
    pending &&
    Date.now() - mockPendingCreatedAt >= MOCK_PENDING_SETTLES_AFTER_MS
  ) {
    pending.status = 200
    pending.ok = true
    pending.responseHeaders = { 'content-type': 'application/json' }
    pending.responseBody = { poll: 'settled-by-mock' }
    pending.responseSize = 27
    pending.duration = Math.max(0, Date.now() - pending.startTime)
  }
  return mockNetworkRecords()
}
