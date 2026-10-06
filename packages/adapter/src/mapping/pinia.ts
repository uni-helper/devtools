import type { PiniaStateResult } from '@uni-helper/devtools-shared'
import type { ComponentStateSnapshotMessage, StateEntry } from '@vue/devtools-kit'
import { toStateEntry } from './state.ts'

/**
 * Pinia 检查器聚合根节点（官方 pinia devtools 插件同款常量：
 * pinia/dist `PINIA_ROOT_ID = '_root'` / `PINIA_ROOT_LABEL = '🍍 Pinia (root)'`）。
 * 根节点与各 store 平级（非父子嵌套），选中展示按 store id 聚合的 state/getters。
 */
export const PINIA_ROOT_ID = '_root'
export const PINIA_ROOT_LABEL = '🍍 Pinia (root)'

export function toPiniaStateSnapshot(result: PiniaStateResult, version: number): ComponentStateSnapshotMessage {
  // 官方编辑路由靠 entry.meta.inspectorId/nodeId 区分 inspector 条目（kit
  // createInspectorStateSnapshot 的 toInspectorLegacyStateEntries 同款注入；漏了
  // 会路由到 components:editState 且因 inspector 页无选中组件而静默无效）；
  // componentId 也对齐官方合成约定 `inspector:<id>:<nodeId>`
  const nodeId = `store:${result.id}`
  const withInspectorMeta = (entry: StateEntry): StateEntry => ({
    ...entry,
    meta: { ...entry.meta, inspectorId: 'pinia', nodeId, disableAdd: true },
  })
  const sections: ComponentStateSnapshotMessage['sections'] = []
  const stateEntries = Object.entries(result.state ?? {}).map(
    ([key, value]) => withInspectorMeta(toStateEntry('state', key, { value })),
  )
  if (stateEntries.length > 0)
    sections.push({ id: 'state', label: 'State', entries: stateEntries })
  // getters 是 computed 求值属性：探针侧编辑必然 Key not found，如实标记不可编辑
  const getterEntries = Object.entries(result.getters ?? {}).map(
    ([key, value]) => withInspectorMeta(toStateEntry('getters', key, { value, editable: false })),
  )
  if (getterEntries.length > 0)
    sections.push({ id: 'getters', label: 'Getters', entries: getterEntries })
  return {
    componentId: `inspector:pinia:${nodeId}`,
    version,
    sections,
  }
}

/**
 * Pinia 聚合根快照：选中 `🍍 Pinia (root)` 虚拟节点时的展示内容。
 * State 分区展示每个 store 的 state 对象，Getters 分区展示各 store 的 getters。
 */
export function toPiniaRootSnapshot(stores: PiniaStateResult[], version: number): ComponentStateSnapshotMessage {
  const nodeId = PINIA_ROOT_ID
  const withInspectorMeta = (entry: StateEntry): StateEntry => ({
    ...entry,
    meta: { ...entry.meta, inspectorId: 'pinia', nodeId, disableAdd: true },
  })
  const sections: ComponentStateSnapshotMessage['sections'] = []
  const stateEntries: StateEntry[] = []
  const getterEntries: StateEntry[] = []
  for (const s of stores) {
    stateEntries.push(
      withInspectorMeta(toStateEntry('state', s.id, { value: s.state ?? {}, editable: false })),
    )
    if (s.getters && Object.keys(s.getters).length > 0) {
      getterEntries.push(
        withInspectorMeta(toStateEntry('getters', s.id, { value: s.getters, editable: false })),
      )
    }
  }
  if (stateEntries.length > 0)
    sections.push({ id: 'state', label: 'State', entries: stateEntries })
  if (getterEntries.length > 0)
    sections.push({ id: 'getters', label: 'Getters', entries: getterEntries })
  return {
    componentId: `inspector:pinia:${nodeId}`,
    version,
    sections,
  }
}
