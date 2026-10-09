export type BuiltinDevtoolsTabId =
  | 'overview'
  | 'components'
  | 'pages'
  | 'timeline'
  | 'graph'
  | 'network' // uni-devtools: network requests tab
  | 'inspect' // uni-devtools: vite inspect iframe tab
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
}

export type DevtoolsTab = DevtoolsTabDefinition
