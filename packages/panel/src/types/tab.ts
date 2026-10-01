export type BuiltinDevtoolsTabId =
  | 'overview'
  | 'components'
  | 'pages'
  | 'timeline'
  | 'plugins'
  | 'graph'
  | 'settings'

export type KnownInspectorDevtoolsTabId = 'router' | 'pinia'

export type DevtoolsTabId =
  | BuiltinDevtoolsTabId
  | KnownInspectorDevtoolsTabId
  | `inspector:${string}`

export interface DevtoolsTabDefinition {
  id: DevtoolsTabId
  title: string
  icon: string
  order: number
  description: string
  path?: string
  /** uni-devtools：探针尚未提供该页所需协议时禁用（置灰不可点，如实呈现能力边界）。 */
  disabled?: boolean
  disabledReason?: string
}

export type DevtoolsTab = DevtoolsTabDefinition
