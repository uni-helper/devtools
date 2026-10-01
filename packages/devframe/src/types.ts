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
