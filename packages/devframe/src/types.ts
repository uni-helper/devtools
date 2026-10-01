/**
 * Frozen Wire Contracts for Uni-Helper DevTools
 *
 * Scope: `uni-helper-devtools`
 * RPCs:
 *   - `ping`: () => PingResult
 *   - `get-component-tree`: () => ComponentTreeResult
 *   - `get-component-state`: (args: { id: string }) => ComponentStateResult
 *   - `update-component-state`: (args: UpdateComponentStateParams) => UpdateComponentStateResult
 *   - `open-in-editor`: (args: OpenInEditorParams) => OpenInEditorResult
 *   - `get-registered-routes` / `get-router-info` / `navigate-to`（W5 路由栈，见 agy T-79c804）
 *   - `get-pinia-stores` / `get-pinia-state` / `update-pinia-state`（W4 Pinia inspector）
 *   - `get-registered-routes`: () => GetRegisteredRoutesResult
 *   - `get-router-info`: () => RouterInfoResult
 *   - `navigate-to`: (args: NavigateParams) => NavigateResult
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

export type ComponentStateFieldType = 'ref' | 'object' | 'value'

export interface ComponentStateField {
  type: ComponentStateFieldType
  value: unknown
}

export interface ComponentStateResult {
  id: string
  name: string
  data: Record<string, unknown>
  setup: Record<string, ComponentStateField>
}

export interface UpdateComponentStateParams {
  id: string
  key: string
  value: unknown
}

export interface UpdateComponentStateResult {
  ok: true
  key: string
  value: unknown
}

export interface PingResult {
  pong: number
  agentConnected: boolean
}

export interface ComponentTreeResult {
  fetchedAt: number
  pages: PageComponentTree[]
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
