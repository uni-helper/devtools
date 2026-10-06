/**
 * 探针数据面接口：路由器（uni-devtools-rpc）唯一可见的后端抽象。
 * 真实实现 `devframe-backend.ts` 包住 devframe RPC；mock 实现 `mock-backend.ts`
 * wraps fixtures（仅 `?mock` 调试模式加载）。设计与取舍见
 * docs/MOCK_BACKEND_REFACTOR_PLAN.md §3。
 */

/**
 * 探针方法全表，与 node 侧 RPC 方法名一一对应。
 * node 侧新增方法时先加这里：方法名漂移在编译期暴露，MockBackend 另有
 * 运行时未知方法 throw 兜底（fail loud）。
 */
export type ProbeMethod =
  | 'get-component-tree'
  | 'get-component-state'
  | 'update-component-state'
  | 'get-component-render-code'
  | 'get-pinia-stores'
  | 'get-pinia-state'
  | 'update-pinia-state'
  | 'get-network-records'
  | 'clear-network-records'
  | 'get-registered-routes'
  | 'get-router-info'
  | 'navigate-to'
  | 'open-in-editor'
  | 'get-inspect-status'
  | 'recompute-component-state'

/** push 通道 key，与 node 侧 sharedState key 对应 */
export type ProbePushKey = 'component-tree' | 'network-records'

export type ProbeConnectionStatus = 'connected' | 'closed'

/**
 * 两段式订阅：消除"await 建立期间 dispose"竞态。退订是同步、幂等的，
 * 可在 ready settle 前后任意时刻调用。
 */
export interface ProbeSubscription {
  /** 订阅建立完成；reject = 建立失败，调用方按现有语义退化为主动拉取 */
  ready: Promise<void>
  /** 幂等；ready 前调用 = 标记待退订（建立后立即退订）；reject 后调用 = no-op */
  unsubscribe(): void
}

export interface ProbeBackend {
  /** 静态能力位：真实 = { openInEditor: true }；mock = false（官方 UI 自动隐藏入口） */
  capabilities: { openInEditor: boolean }
  /** 建立传输连接：resolve 即就绪；throw 即失败（错误文案原样透传 UI） */
  connect(authToken?: string): Promise<void>
  /**
   * connect() 之后的连接状态变更（服务端断开 / 底层重连成功）。
   * 首次就绪不经此回调（connect resolve 即就绪）；mock 实现永不触发。
   */
  onConnectionStatus(cb: (status: ProbeConnectionStatus) => void): () => void
  /** 探针方法面（拉取 + 写回）；未知方法实现方必须 throw */
  call(method: ProbeMethod, ...args: unknown[]): Promise<unknown>
  subscribe(key: ProbePushKey, cb: (snapshot: unknown) => void): ProbeSubscription
  /** 幂等；任何时刻可调用（含 connect / subscribe 尚未 settle 时） */
  dispose(): void
}

/** 面板可见的"暂不支持"错误文案，query/command 错误路径与 mock 后端统一使用。 */
export function probeNotSupported(what: string): string {
  return `uni-devtools 探针暂不支持：${what}`
}
