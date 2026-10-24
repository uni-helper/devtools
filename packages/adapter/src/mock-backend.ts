/**
 * ProbeBackend mock 实现：fixtures 的内存分发，仅 `?mock` 调试模式加载。
 * 与真实探针的语义对齐点（读时深拷贝、编辑写回内存、键不存在抛错）见
 * fixtures.ts 各函数注释；方法面与 node 侧 RPC 一一对应（backend.ts ProbeMethod）。
 */
import type {
  ProbeBackend,
  ProbeMethod,
  ProbePushKey,
  ProbeSubscription,
} from './backend.ts'
import type {
  GetRegisteredRoutesResult,
  GetStorageEntriesParams,
  RouterInfoResult,
} from '@uni-helper/devtools-shared'
import { probeNotSupported } from './backend.ts'
import {
  mockClearNetworkRecords,
  mockComponentState,
  mockComponentTree,
  mockGetComponentRenderCode,
  mockNetworkRecords,
  mockPiniaState,
  mockPiniaStores,
  mockStorageEntries,
  mockStorageInfo,
  mockTickNetworkRecords,
  mockUpdateComponentState,
  mockUpdatePiniaState,
  mockUpdateVuexState,
  mockVuexState,
  mockVuexStores,
} from './fixtures.ts'

export interface MockBackendOptions {
  /** network 心跳间隔 ms；默认 1000，测试注入小值配合 vi.useFakeTimers */
  networkTickInterval?: number
}

/**
 * mock 注册路由（原 mockRouterSnapshot().routes）：router:snapshot / matchedRoutes
 * 的共享回落逻辑按此产出与旧 mock 早退分支等价的快照（name = path 去首斜杠）。
 */
const MOCK_ROUTES: GetRegisteredRoutesResult['routes'] = [
  {
    path: '/pages/index/index',
    name: 'pages/index/index',
    meta: { navigationStyle: 'custom', disableScroll: true },
  },
  {
    path: '/pages/home/index',
    name: 'pages/home/index',
    meta: {
      navigationStyle: 'custom',
      navigationBarTitleText: '首页',
      disableScroll: true,
    },
  },
  {
    path: '/pages/mine/index',
    name: 'pages/mine/index',
    meta: {
      navigationStyle: 'custom',
      navigationBarTitleText: '我的',
      disableScroll: true,
    },
  },
  {
    path: '/pages/common/webview/index',
    name: 'pages/common/webview/index',
    meta: { navigationBarTitleText: '网页' },
  },
  {
    path: '/pages/common/error/index',
    name: 'pages/common/error/index',
    meta: {},
  },
  {
    path: '/demo_sdk/index/index',
    name: 'demo_sdk/index/index',
    meta: { navigationBarTitleText: 'Demo SDK 授权' },
  },
  {
    path: '/pages/launch/index',
    name: 'pages/launch/index',
    meta: {},
  },
  {
    path: '/pages/upgrade/index',
    name: 'pages/upgrade/index',
    meta: {},
  },
  {
    path: '/pages/user/launch/index',
    name: 'pages/user/launch/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/bindPhone/index',
    name: 'pages/user/bindPhone/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/profile/index',
    name: 'pages/user/profile/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/verify/index',
    name: 'pages/user/verify/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/fillName/index',
    name: 'pages/user/fillName/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/fillKey/index',
    name: 'pages/user/fillKey/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/loginType/index',
    name: 'pages/user/loginType/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/basicInfo/index',
    name: 'pages/user/basicInfo/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/guide/index',
    name: 'pages/user/guide/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/policy/index',
    name: 'pages/user/policy/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/service/index',
    name: 'pages/user/service/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/agreement/index',
    name: 'pages/user/agreement/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/confirm/index',
    name: 'pages/user/confirm/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/checkCode/index',
    name: 'pages/user/checkCode/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/nickname/index',
    name: 'pages/user/nickname/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/phone/index',
    name: 'pages/user/phone/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/phoneCode/index',
    name: 'pages/user/phoneCode/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/logout/index',
    name: 'pages/user/logout/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/logout/reason/index',
    name: 'pages/user/logout/reason/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/user' },
  },
  {
    path: '/pages/user/logout/progress/index',
    name: 'pages/user/logout/progress/index',
    meta: { subPackage: 'pages/user' },
  },
  {
    path: '/pages/feed/article/index',
    name: 'pages/feed/article/index',
    meta: { subPackage: 'pages/feed' },
  },
  {
    path: '/pages/feed/topic/index',
    name: 'pages/feed/topic/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/feed' },
  },
  {
    path: '/pages/vip/vip/index',
    name: 'pages/vip/vip/index',
    meta: { subPackage: 'pages/vip' },
  },
  {
    path: '/pages/vip/highScore/index',
    name: 'pages/vip/highScore/index',
    meta: {
      backgroundTextStyle: 'light',
      navigationStyle: 'custom',
      subPackage: 'pages/vip',
    },
  },
  {
    path: '/pages/profile/ageLimit/index',
    name: 'pages/profile/ageLimit/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/contact/index',
    name: 'pages/profile/contact/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/invalidTel/index',
    name: 'pages/profile/invalidTel/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/joinGroup/index',
    name: 'pages/profile/joinGroup/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/playVideo/index',
    name: 'pages/profile/playVideo/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/security/index',
    name: 'pages/profile/security/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/auth/index',
    name: 'pages/profile/auth/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/card/index',
    name: 'pages/profile/card/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/cert/index',
    name: 'pages/profile/cert/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/credit/index',
    name: 'pages/profile/credit/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/growth/index',
    name: 'pages/profile/growth/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/invite/index',
    name: 'pages/profile/invite/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/level/index',
    name: 'pages/profile/level/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/medal/index',
    name: 'pages/profile/medal/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/points/index',
    name: 'pages/profile/points/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/record/index',
    name: 'pages/profile/record/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/profile/setting/index',
    name: 'pages/profile/setting/index',
    meta: { subPackage: 'pages/profile' },
  },
  {
    path: '/pages/module/addPublish/index',
    name: 'pages/module/addPublish/index',
    meta: { subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/addContact/index',
    name: 'pages/module/addContact/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/applySuccess/index',
    name: 'pages/module/applySuccess/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/blackList/index',
    name: 'pages/module/blackList/index',
    meta: { subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/contactService/index',
    name: 'pages/module/contactService/index',
    meta: { subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/detail/index',
    name: 'pages/module/detail/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/edit/index',
    name: 'pages/module/edit/index',
    meta: { subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/list/index',
    name: 'pages/module/list/index',
    meta: { subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/report/index',
    name: 'pages/module/report/index',
    meta: { navigationStyle: 'custom', subPackage: 'pages/module' },
  },
  {
    path: '/pages/module/search/index',
    name: 'pages/module/search/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/module' },
  },
  {
    path: '/pages/settings/about/index',
    name: 'pages/settings/about/index',
    meta: { subPackage: 'pages/settings' },
  },
  {
    path: '/pages/settings/feedback/index',
    name: 'pages/settings/feedback/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/settings' },
  },
  {
    path: '/pages/settings/notification/index',
    name: 'pages/settings/notification/index',
    meta: { subPackage: 'pages/settings' },
  },
  {
    path: '/pages/settings/privacy/index',
    name: 'pages/settings/privacy/index',
    meta: { subPackage: 'pages/settings' },
  },
  {
    path: '/pages/settings/theme/index',
    name: 'pages/settings/theme/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/settings' },
  },
  {
    path: '/pages/settings/language/index',
    name: 'pages/settings/language/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/settings' },
  },
  {
    path: '/pages/social/comment/index',
    name: 'pages/social/comment/index',
    meta: {
      backgroundTextStyle: 'light',
      navigationStyle: 'custom',
      subPackage: 'pages/social',
    },
  },
  {
    path: '/pages/social/detail/index',
    name: 'pages/social/detail/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/social' },
  },
  {
    path: '/pages/social/history/index',
    name: 'pages/social/history/index',
    meta: { subPackage: 'pages/social' },
  },
  {
    path: '/pages/social/like/index',
    name: 'pages/social/like/index',
    meta: {
      backgroundTextStyle: 'light',
      navigationStyle: 'custom',
      subPackage: 'pages/social',
    },
  },
  {
    path: '/pages/social/publish/index',
    name: 'pages/social/publish/index',
    meta: { subPackage: 'pages/social' },
  },
  {
    path: '/pages/activity/normal/index',
    name: 'pages/activity/normal/index',
    meta: { subPackage: 'pages/activity' },
  },
  {
    path: '/pages/activity/rules/index',
    name: 'pages/activity/rules/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/activity' },
  },
  {
    path: '/pages/upload/index',
    name: 'pages/upload/index',
    meta: { subPackage: 'pages/upload' },
  },
  {
    path: '/pages/verify/index/index',
    name: 'pages/verify/index/index',
    meta: { navigationBarTitleText: '详情', subPackage: 'pages/verify' },
  },
  {
    path: '/demo_sdk/protocol/eid/eid',
    name: 'demo_sdk/protocol/eid/eid',
    meta: { subPackage: 'demo_sdk/protocol' },
  },
  {
    path: '/demo_sdk/protocol/privacy/privacy',
    name: 'demo_sdk/protocol/privacy/privacy',
    meta: { navigationBarTitleText: '详情', subPackage: 'demo_sdk/protocol' },
  },
  {
    path: '/demo_sdk/protocol/service/service',
    name: 'demo_sdk/protocol/service/service',
    meta: {
      backgroundTextStyle: 'light',
      navigationStyle: 'custom',
      subPackage: 'demo_sdk/protocol',
    },
  },
  {
    path: '/demo_sdk/protocol/userAuth/userAuth',
    name: 'demo_sdk/protocol/userAuth/userAuth',
    meta: { subPackage: 'demo_sdk/protocol' },
  },
  {
    path: '/pages/misc/complaint/index',
    name: 'pages/misc/complaint/index',
    meta: { subPackage: 'pages/misc' },
  },
]

const MOCK_CURRENT_ROUTE: RouterInfoResult = {
  currentRoute: {
    path: '/pages/index/index',
    fullPath: '/pages/index/index',
  },
  stack: [],
}

type Payload = Record<string, unknown> | undefined

function idOf(payload: Payload): string {
  return (payload as { id?: string } | undefined)?.id ?? ''
}

const handlers: Record<ProbeMethod, (payload: Payload) => unknown> = {
  'get-component-tree': () => mockComponentTree(),
  'get-component-state': (payload) => mockComponentState(idOf(payload)),
  // 真实探针对深路径逐段解 ref 下钻、支持 remove；mock 数据是平铺顶层键，如实报不支持
  'update-component-state': (payload) => {
    const p = payload as {
      id?: string
      path?: string[]
      value?: unknown
      remove?: boolean
    }
    if (!p?.path || p.path.length !== 1 || p.remove)
      throw new Error(probeNotSupported('mock 平铺数据的嵌套路径/删除'))
    return mockUpdateComponentState({
      id: p.id ?? '',
      key: p.path[0]!,
      value: p.value,
    })
  },
  'get-component-render-code': (payload) => {
    // 真实探针返回 GetComponentRenderCodeResult { code? }；未知 id 如实为空
    const code = mockGetComponentRenderCode(idOf(payload))
    return code == null ? {} : { code }
  },
  'get-pinia-stores': () => mockPiniaStores(),
  'get-pinia-state': (payload) => mockPiniaState(idOf(payload)),
  // mockUpdatePiniaState 对键不存在/getters 抛错，语义对齐真实探针
  'update-pinia-state': (payload) => {
    const p = payload as { id?: string; key?: string; value?: unknown }
    return mockUpdatePiniaState({
      id: p?.id ?? '',
      key: p?.key ?? '',
      value: p?.value,
    })
  },
  // Vuex（Vue 2 探针）：getVuexState 未知 id 返回 null；编辑按嵌套 path 写回
  //（中间路径创建、支持 remove），未知 module fail loud——见 fixtures.ts 注释
  'get-vuex-stores': () => mockVuexStores(),
  'get-vuex-state': (payload) => mockVuexState(idOf(payload)),
  'update-vuex-state': (payload) => {
    const p = payload as {
      id?: string
      path?: string[]
      value?: unknown
      remove?: boolean
    }
    return mockUpdateVuexState({
      id: p?.id ?? '',
      path: Array.isArray(p?.path) ? p.path : [],
      value: p?.value,
      remove: p?.remove,
    })
  },
  // Storage 收集（微信 wx storage，只读查询；元数据与键值分两个方法）
  'get-storage-info': () => mockStorageInfo(),
  'get-storage-entries': (payload) =>
    mockStorageEntries((payload ?? {}) as GetStorageEntriesParams),
  // 真实探针返回 GetNetworkRecordsResult { records }；pull 侧按 res.records 读取
  'get-network-records': () => ({ records: mockNetworkRecords() }),
  'clear-network-records': () => {
    mockClearNetworkRecords()
    return { ok: true }
  },
  'get-registered-routes': () => ({ routes: MOCK_ROUTES }),
  'get-router-info': () => MOCK_CURRENT_ROUTE,
  'navigate-to': () => ({ ok: true }),
  'open-in-editor': () => {
    throw new Error(probeNotSupported('mock 模式不支持在编辑器中打开'))
  },
  'get-inspect-status': () => ({ available: false }),
  'recompute-component-state': () => ({}),
}

export function createMockBackend(
  options: MockBackendOptions = {},
): ProbeBackend {
  const tickInterval = options.networkTickInterval ?? 1000
  let tickTimer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  const networkListeners = new Set<(snapshot: unknown) => void>()

  /** 心跳推送：包装成 node 侧 sharedState 同款共享态形状，面板侧走同一套校验。 */
  function pushNetworkSnapshot(): void {
    if (networkListeners.size === 0) return
    const records = mockTickNetworkRecords()
    const snapshot = {
      records,
      latestId: records.reduce((max, r) => Math.max(max, r.id), 0),
      updatedAt: Date.now(),
    }
    for (const cb of [...networkListeners]) cb(snapshot)
  }

  return {
    capabilities: { openInEditor: false },

    async connect() {},

    onConnectionStatus() {
      return () => {}
    },

    async call(method, ...args) {
      const handler = handlers[method]
      if (!handler) throw new Error(`mock 后端暂不支持 ${method}`)
      return await handler(args[0] as Payload)
    },

    subscribe(
      key: ProbePushKey,
      cb: (snapshot: unknown) => void,
    ): ProbeSubscription {
      if (key === 'component-tree') {
        // 静态树：连接即推一次（对齐真实 sharedState 首推语义）
        cb(mockComponentTree())
        return { ready: Promise.resolve(), unsubscribe: () => {} }
      }
      if (key === 'rendered-components') {
        // fixtures 是静态数据，没有「端上改值」可模拟——订阅成功但永不推送
        return { ready: Promise.resolve(), unsubscribe: () => {} }
      }
      networkListeners.add(cb)
      if (!tickTimer && !disposed)
        tickTimer = setInterval(pushNetworkSnapshot, tickInterval)
      return {
        ready: Promise.resolve(),
        unsubscribe() {
          networkListeners.delete(cb)
          if (networkListeners.size === 0 && tickTimer) {
            clearInterval(tickTimer)
            tickTimer = undefined
          }
        },
      }
    },

    dispose() {
      disposed = true
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = undefined
      }
      networkListeners.clear()
    },
  }
}
