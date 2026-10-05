/**
 * Frozen Wire Contracts for Uni-Helper DevTools
 *
 * Scope: `uni-helper-devtools`
 * RPCs (18):
 *   - `ping`: () => PingResult
 *   - `get-component-tree`: () => ComponentTreeResult
 *   - `get-component-state`: (args: { id: string }) => ComponentStateResult
 *   - `update-component-state`: (args: UpdateComponentStateParams) => UpdateComponentStateResult
 *   - `recompute-component-state`: (args: RecomputeComponentStateParams) => RecomputeComponentStateResult
 *   - `get-component-render-code`: (args: GetComponentRenderCodeParams) => GetComponentRenderCodeResult
 *   - `open-in-editor`: (args: OpenInEditorParams) => OpenInEditorResult
 *   - `get-registered-routes`: () => GetRegisteredRoutesResult
 *   - `get-router-info`: () => RouterInfoResult
 *   - `navigate-to`: (args: NavigateParams) => NavigateResult
 *   - `get-pinia-stores` / `get-pinia-state` / `update-pinia-state`
 *   - `get-inspect-status`: () => GetInspectStatusResult（node 本地读盘，不经探针）
 *   - `get-network-records`: (args: GetNetworkRecordsParams) => GetNetworkRecordsResult
 *   - `push-network-records`: (args: PushNetworkRecordsParams) => PushNetworkRecordsResult（探针→node 推送）
 *   - `clear-network-records`: () => ClearNetworkRecordsResult（面板清空）
 *
 * Reactivity Graph 扩展（无新 RPC，字段搭既有快照的车）：
 *   - `get-component-state` 返回新增 `reactivityGraph?: ReactivityGraphSnapshot`
 *   - `get-component-tree` 返回新增 `vueVersion?: string`
 */

export interface ComponentTreeNode {
  id: string
  name: string
  type: 'page' | 'component'
  file?: string
  children?: ComponentTreeNode[]
}

export interface PageComponentTree {
  route: string
  components: ComponentTreeNode | null
}

export interface ComponentStateEntry {
  value?: unknown // JSON 安全值（function 绑定可省略）
  stateType?: 'ref' | 'computed' | 'reactive'
  readonly?: boolean
  raw?: string // computed getter 源码（tooltip），截断 ~500 字符
  fn?: boolean // function 绑定标记（Setup (other) 段）
  fnName?: string
  fnSource?: string
  editable?: boolean // 仅 options computed 用（有 setter 才可编辑）
}

export interface ComponentStateResult {
  id: string
  name: string
  props?: Record<string, unknown>
  data?: Record<string, unknown>
  setup?: Record<string, ComponentStateEntry>
  setupOther?: Record<string, ComponentStateEntry>
  computed?: Record<string, ComponentStateEntry> // Options API computed（经 proxy 求值）
  attrs?: Record<string, unknown>
  /** 响应式依赖图（随 state 快照搭车下发，官方 kit ComponentStateSnapshotMessage.reactivityGraph 桥） */
  reactivityGraph?: ReactivityGraphSnapshot
}

export interface UpdateComponentStateParams {
  id: string
  key?: string
  value?: unknown
  section?: 'props' | 'setup' | 'data' | 'computed'
  path?: string[]
  remove?: boolean
}

export interface UpdateComponentStateResult {
  ok: true
  key: string
  value: unknown
}

export interface RecomputeComponentStateParams {
  id: string
  section: string
  path: string[]
}

export interface RecomputeComponentStateResult {
  ok: boolean
}

export interface GetComponentRenderCodeParams {
  id: string
}

/** 运行时 render 函数源码（解插桩包装层；官方 components:getRenderCode 桥） */
export interface GetComponentRenderCodeResult {
  code?: string
}

export interface PingResult {
  pong: number
  agentConnected: boolean
}

export interface GetInspectStatusResult {
  /** vite-plugin-inspect 报告是否已产出（首次 buildEnd 前 false，面板隐藏 Inspect tab） */
  available: boolean
}

export interface ComponentTreeResult {
  fetchedAt: number
  pages: PageComponentTree[]
  /** 探针侧 Vue 运行时版本（app.version）；面板用它开 Reactivity Graph tab 门禁 */
  vueVersion?: string
}

// ---------------------------------------------------------------------------
// Reactivity Graph：镜像 vendored kit `protocol/messages.ts` 的同名类型。
// 对端在 vendored kit 内无法反向导入本仓，字面量契约两端冻结同步
// ---------------------------------------------------------------------------

export type ReactivityGraphNodeType =
  | 'ref'
  | 'computed'
  | 'reactive'
  | 'watch'
  | 'render'
  | 'effect'
  | 'unknown'

export interface ReactivityGraphNode {
  id: string
  type: ReactivityGraphNodeType
  label: string
  data: Record<string, unknown>
}

export interface ReactivityRelationship {
  id: string
  from: string
  to: string
}

export interface ReactivityGraphSnapshot {
  nodes: ReactivityGraphNode[]
  relationships: ReactivityRelationship[]
}

export type PushComponentTreeParams = ComponentTreeResult

export interface PushComponentTreeResult {
  ok: boolean
}

export interface OpenInEditorParams {
  file: string
}

export interface OpenInEditorResult {
  ok: boolean
}

export interface RegisteredRouteRecord {
  path: string
  name?: string
  meta?: Record<string, unknown>
}

export interface GetRegisteredRoutesResult {
  routes: RegisteredRouteRecord[]
}

export interface RouteStackItem {
  path: string
  query?: Record<string, unknown>
  options?: Record<string, unknown>
}

export interface RouterInfoResult {
  currentRoute: {
    path: string
    fullPath?: string
    query?: Record<string, unknown>
  } | null
  stack: RouteStackItem[]
}

export interface NavigateParams {
  path: string
}

export interface NavigateResult {
  ok: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Pinia inspector（W4）：探针枚举 pinia._s，面板经 custom inspector 协议消费
// ---------------------------------------------------------------------------

export interface PiniaStoreSummary {
  id: string
}

export interface GetPiniaStoresResult {
  stores: PiniaStoreSummary[]
}

export interface PiniaStateResult {
  id: string
  state: Record<string, unknown>
  getters: Record<string, unknown>
}

export interface UpdatePiniaStateParams {
  id: string
  key: string
  value?: unknown
  path?: string[]
  remove?: boolean
}

export interface UpdatePiniaStateResult {
  ok: true
  id: string
  key: string
}

// ---------------------------------------------------------------------------
// Network：探针包装 uni.request/uploadFile/downloadFile 采集真实请求。
// 契约同时服务两条消费方：面板 Network tab（sharedState 增量推送）与后续
// Coding Agent（`get-network-records` 拉取）——字段名按 wire 冻结，两端不得单方改。
//
// 拦截层级的证据（勿凭感觉改）：
// uni mp 运行时在 vendor.js 求值期经 initUni(shims, protocols, wx) 把平台 API
// 按引用固化（initWx 拷贝 newWx[key] = wx[key]），探针注入晚于该时刻，补丁
// wx.request 拦不住 uni.request；而 uni 是 Proxy，uni.request = wrapper 落到
// target 自有属性且 get 优先命中——包装 uni 层是单点无双记的正确位置。
// ---------------------------------------------------------------------------

export type NetworkRecordType = 'request' | 'upload' | 'download'

export interface NetworkRecord {
  /** 探针侧进程内单调递增序号（跨重连不重置）；node merge 与面板增量都以它对齐 */
  id: number
  type: NetworkRecordType
  /** GET/POST/...；upload/download 无 method 参数，恒 'POST' */
  method: string
  url: string
  /** 发起时所在页面路由（getCurrentPages 栈顶，取不到省略） */
  page?: string
  /** HTTP 状态码；网络层失败（fail 回调）为 0 */
  status: number
  /** 预留：HTTP 状态文案。mp 运行时拿不到，探针不填；失败语义看 error 字段 */
  statusText?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  /** 请求体：request=data 原样；upload={filePath,name,formData}；download 无 */
  requestBody?: unknown
  /** 响应体：尝试 JSON.parse，失败保持 string；download 为 tempFilePath */
  responseBody?: unknown
  /** 超 MAX_NETWORK_BODY_CHARS 截断（见 agent/network.ts，字面量两端同步） */
  requestBodyTruncated?: boolean
  responseBodyTruncated?: boolean
  /** 估算字节数（string 长度 / JSON.stringify 长度）；download 为文件大小（拿不到省略） */
  responseSize?: number
  /** epoch ms（探针侧 Date.now()） */
  startTime: number
  /** ms（complete 时结算） */
  duration?: number
  /** success 回调触发且 statusCode < 400 */
  ok: boolean
  /** fail 回调的 errMsg 原文 */
  error?: string
  aborted?: boolean
}

export interface GetNetworkRecordsParams {
  /** 只返回 id > sinceId 的记录（增量拉取；缺省返回最近一窗） */
  sinceId?: number
  /** 默认 200，上限 500（与探针环形缓冲同容） */
  limit?: number
}

export interface GetNetworkRecordsResult {
  records: NetworkRecord[]
  /** 探针环形缓冲内最大 id（拉齐水位用；空缓冲为 0） */
  latestId: number
}

export interface PushNetworkRecordsParams {
  records: NetworkRecord[]
}

export interface PushNetworkRecordsResult {
  ok: boolean
}

export interface ClearNetworkRecordsResult {
  ok: boolean
}

/** sharedState('network-records') 的值形状（node 侧持有，面板订阅渲染） */
export interface NetworkSharedState {
  records: NetworkRecord[]
  latestId: number
  updatedAt: number
}
