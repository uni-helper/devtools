/**
 * 面板 ↔ devframe node 侧之间的 wire 契约。
 *
 * 与 `docs/DEVFRAME_MIGRATION_PLAN.md` 以及探针侧采集实现逐字对应。任何一方
 * 改动这里的形状，都必须同步改另外两方（node 侧 RPC handler、探针采集），
 * 因此这些类型集中放在一处，不要在组件里就地声明。
 */

/** 组件树节点。`type` 由探针判定：页面根为 `page`，其余为 `component`。 */
export interface ComponentTreeNode {
  id: string
  name: string
  type: 'page' | 'component'
  /** 组件源码路径（探针能拿到时才有）。 */
  file?: string
  children?: ComponentTreeNode[]
}

/** 一个已加载页面的组件树。`components` 为 null 表示该页采集失败。 */
export interface PageComponentTree {
  route: string
  components: ComponentTreeNode | null
}

export interface ComponentTreeResult {
  fetchedAt: number
  pages: PageComponentTree[]
}

export interface PingResult {
  pong: number
  /** node 侧是否已有一个已连接的探针。 */
  agentConnected: boolean
}

/**
 * setupState 绑定在探针侧被归成的三类。
 *
 * 注意：`value` 是探针读取时的形态——Vue 3 的 `setupState` 经 `proxyRefs`
 * 包装，读取 ref 会被自动解包成原始值，所以一个真正的 `ref` 若只读不写也会
 * 呈现为 `value`。这三类是**提示**，不是保证。
 */
export type StateFieldKind = 'ref' | 'object' | 'value'

export interface ComponentStateField {
  type: StateFieldKind
  value: unknown
}

export interface ComponentStateResult {
  id: string
  name: string
  /** Options API 的 `$data`。 */
  data: Record<string, unknown>
  /** Composition API 的 `setupState`。 */
  setup: Record<string, ComponentStateField>
}

export interface UpdateStateParams {
  id: string
  key: string
  value: unknown
}

export interface UpdateStateResult {
  ok: true
  key: string
  value: unknown
}
