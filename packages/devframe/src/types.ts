/**
 * Frozen Wire Contracts for Uni-Helper DevTools
 *
 * Scope: `uni-helper-devtools`
 * RPCs (14):
 *   - `ping`: () => PingResult
 *   - `get-component-tree`: () => ComponentTreeResult
 *   - `get-component-state`: (args: { id: string }) => ComponentStateResult
 *   - `update-component-state`: (args: UpdateComponentStateParams) => UpdateComponentStateResult
 *   - `recompute-component-state`: (args: RecomputeComponentStateParams) => RecomputeComponentStateResult
 *   - `open-in-editor`: (args: OpenInEditorParams) => OpenInEditorResult
 *   - `get-registered-routes` / `get-router-info` / `navigate-to`（W5 路由栈，见 agy T-79c804）
 *   - `get-pinia-stores` / `get-pinia-state` / `update-pinia-state`（W4 Pinia inspector）
 *   - `get-registered-routes`: () => GetRegisteredRoutesResult
 *   - `get-router-info`: () => RouterInfoResult
 *   - `navigate-to`: (args: NavigateParams) => NavigateResult
 *   - `get-inspect-status`: () => GetInspectStatusResult（W11 Vite Inspect，node 本地读盘）
 *
 * W10 Reactivity Graph 扩展（无新 RPC，字段搭既有快照的车）：
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
// Reactivity Graph（W10）：镜像 vendored kit `protocol/messages.ts` 的同名类型。
// 探针不 import devtools-kit（依赖纯净性），字面量契约两端冻结同步——
// 与 BINDINGS_PROP 同一约定（HANDOFF §4）
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
